/**
 * Audit-writer for the Protocol Consistency Linter.
 *
 * Responsibilities:
 *   - startRun: open a row in leo_lint_run_history
 *   - recordRun: upsert the rule registry, bulk-insert violations, finalise
 *     the run row
 *   - checkBypassRateLimit: enforce 3-bypasses-per-7-days budget (queries
 *     leo_lint_run_history for trigger='bypass')
 *   - promoteRule: flip a rule from warn -> block if the last 2 regen runs
 *     produced zero violations for it
 *   - reviewRetirementCandidates: list rules that have fired zero times in
 *     the last N days (default 90)
 *
 * All writes are through the service role client passed in — this module is
 * cloud-agnostic beyond the `.from().insert/update/select()` Supabase shape.
 *
 * SD-PROTOCOL-LINTER-001, slice 4/n.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_BYPASS_BUDGET = 3;

/**
 * Open a run row and return its run_id.
 * @param {{supabase:object, trigger:'regen'|'audit'|'bypass'|'precommit', initiator?:string}} params
 */
export async function startRun({ supabase, trigger, initiator }) {
  const { data, error } = await supabase
    .from('leo_lint_run_history')
    .insert({
      trigger,
      passed: true, // finalised below
      started_at: new Date().toISOString(),
      total_violations: 0,
      critical_count: 0,
      initiator: initiator ?? null,
      metadata: {}
    })
    .select('run_id')
    .single();
  if (error) throw new Error(`startRun failed: ${error.message}`);
  return data.run_id;
}

/**
 * Persist the result of a lint run.
 * Upserts the rule registry first so violations pass the FK constraint.
 * @param {{supabase:object, runId:string, rules:Array, result:object, bypassReason?:string}} params
 */
export async function recordRun({ supabase, runId, rules, result, bypassReason }) {
  // 1. Upsert the active rule registry (idempotent on rule_id PK)
  if (rules.length > 0) {
    const upserts = rules.map(r => ({
      rule_id: r.id,
      severity: r.severity,
      description: r.description || '',
      source_path: r.source_path || 'unknown',
      enabled: r.enabled !== false
    }));
    const { error: ruleErr } = await supabase
      .from('leo_lint_rules')
      .upsert(upserts, { onConflict: 'rule_id' });
    if (ruleErr) throw new Error(`rule upsert failed: ${ruleErr.message}`);
  }

  // 2. Bulk insert violations (if any)
  if (result.violations.length > 0) {
    const rows = result.violations.map(v => ({
      run_id: runId,
      rule_id: v.rule_id,
      // section_id is TEXT (post-corrective-migration) — coerce any int/UUID to string.
      section_id: v.section_id == null ? null : String(v.section_id),
      file_path: v.file_path || null,
      severity: v.severity,
      message: v.message,
      context: v.context || {}
    }));
    const { error: vErr } = await supabase.from('leo_lint_violations').insert(rows);
    if (vErr) {
      // Tolerate the known-in-flight schema drift where section_id is still
      // UUID pre-corrective-migration. Log loudly; do not abort — the
      // in-memory result remains useful to callers. Remove this shim once
      // 20260422_protocol_linter_section_id_type_fix.sql has been applied
      // to every environment.
      if (/invalid input syntax for type uuid/i.test(vErr.message)) {
        console.warn('[audit-writer] violation persistence skipped — corrective migration 20260422_protocol_linter_section_id_type_fix.sql not yet applied. Error:', vErr.message);
      } else {
        throw new Error(`violation insert failed: ${vErr.message}`);
      }
    }
  }

  // 3. Finalise the run row
  const { error: runErr } = await supabase
    .from('leo_lint_run_history')
    .update({
      total_violations: result.violations.length,
      critical_count: result.critical_count,
      passed: result.passed,
      ended_at: new Date().toISOString(),
      duration_ms: result.duration_ms,
      bypass_reason: bypassReason ?? null,
      metadata: { mode: result.mode, rules_evaluated: result.rules_evaluated }
    })
    .eq('run_id', runId);
  if (runErr) throw new Error(`run finalise failed: ${runErr.message}`);
}

/**
 * Record a bypass (--skip-lint) and enforce the weekly budget.
 * Returns {allowed, used, remaining, budget}. Writes a row to the history
 * table IF allowed, so the next call sees the incremented count.
 */
export async function checkBypassRateLimit({ supabase, reason, budget = DEFAULT_BYPASS_BUDGET, initiator }) {
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  const { count, error: cErr } = await supabase
    .from('leo_lint_run_history')
    .select('*', { count: 'exact', head: true })
    .eq('trigger', 'bypass')
    .gte('started_at', since);
  if (cErr) throw new Error(`bypass count query failed: ${cErr.message}`);

  const used = count ?? 0;
  if (used >= budget) {
    return { allowed: false, used, remaining: 0, budget };
  }

  // Record the bypass
  const { error: iErr } = await supabase.from('leo_lint_run_history').insert({
    trigger: 'bypass',
    passed: true,
    started_at: new Date().toISOString(),
    ended_at: new Date().toISOString(),
    duration_ms: 0,
    total_violations: 0,
    critical_count: 0,
    bypass_reason: reason,
    initiator: initiator ?? null,
    metadata: {}
  });
  if (iErr) throw new Error(`bypass insert failed: ${iErr.message}`);

  return { allowed: true, used: used + 1, remaining: budget - used - 1, budget };
}

/**
 * Promote a rule from warn -> block. Preconditions:
 *   1. leo_lint_run_history has at least 2 regen runs on record
 *   2. No violation references this rule_id within those 2 runs
 * @returns {Promise<{promoted:boolean, reason?:string}>}
 */
export async function promoteRule({ supabase, ruleId }) {
  const { data: rule, error: rErr } = await supabase
    .from('leo_lint_rules')
    .select('rule_id, severity')
    .eq('rule_id', ruleId)
    .maybeSingle();
  if (rErr) throw new Error(`rule lookup failed: ${rErr.message}`);
  if (!rule) return { promoted: false, reason: `rule ${ruleId} not found in leo_lint_rules` };
  if (rule.severity === 'block') return { promoted: false, reason: `${ruleId} already severity=block` };

  const { data: recent, error: hErr } = await supabase
    .from('leo_lint_run_history')
    .select('run_id, started_at')
    .eq('trigger', 'regen')
    .order('started_at', { ascending: false })
    .limit(2);
  if (hErr) throw new Error(`history query failed: ${hErr.message}`);
  if (!recent || recent.length < 2) {
    return { promoted: false, reason: 'need 2 regen runs on record before promotion is eligible' };
  }

  const runIds = recent.map(r => r.run_id);
  const { count, error: vErr } = await supabase
    .from('leo_lint_violations')
    .select('*', { count: 'exact', head: true })
    .eq('rule_id', ruleId)
    .in('run_id', runIds);
  if (vErr) throw new Error(`violation count failed: ${vErr.message}`);

  if ((count ?? 0) > 0) {
    return { promoted: false, reason: `${ruleId} had ${count} violation(s) in the last 2 regen runs` };
  }

  const { error: uErr } = await supabase
    .from('leo_lint_rules')
    .update({ severity: 'block', promoted_from_warn_at: new Date().toISOString() })
    .eq('rule_id', ruleId);
  if (uErr) throw new Error(`promotion update failed: ${uErr.message}`);
  return { promoted: true };
}

/**
 * Retirement candidates: rules with zero violations in the last `days` days.
 */
export async function reviewRetirementCandidates({ supabase, days = 90 }) {
  const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: rules, error: rErr } = await supabase
    .from('leo_lint_rules')
    .select('rule_id, severity, description, created_at');
  if (rErr) throw new Error(`rule list failed: ${rErr.message}`);

  const candidates = [];
  for (const r of rules || []) {
    if (new Date(r.created_at) > new Date(threshold)) continue; // too new to retire
    const { count } = await supabase
      .from('leo_lint_violations')
      .select('*', { count: 'exact', head: true })
      .eq('rule_id', r.rule_id)
      .gte('detected_at', threshold);
    if ((count ?? 0) === 0) candidates.push({ ...r, days_quiet: days });
  }
  return candidates;
}
