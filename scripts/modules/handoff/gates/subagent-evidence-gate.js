/**
 * Sub-Agent Evidence Gate (SD-LEO-INFRA-OPUS-MODULE-SUB-001)
 *
 * DB-enforced blocking gate that queries `sub_agent_execution_results` for fresh
 * rows matching the required set per handoff type. Closes the enforcement gap
 * left by SD-LEO-FIX-PLAN-OPUS-HARNESS-001 which updated protocol text (Module A2)
 * but shipped no gate code.
 *
 * Distinct from `executors/exec-to-plan/gates/subagent-enforcement-validation.js`:
 *   - This gate: keyed on handoffType, required:true (blocking), freshness-aware
 *   - That gate: keyed on sd_type, required:false (advisory), no freshness
 *
 * Emergency bypass: set LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1 (writes audit_log warning).
 */

/**
 * Required sub-agents per handoff type.
 * Initial map matches current Plan-approved agents per CLAUDE_LEAD.md.
 * Exported so /claim and /leo settings can surface the requirement visually.
 */
export const REQUIRED_SUBAGENTS = {
  'LEAD-TO-PLAN': ['VALIDATION', 'Explore'],
  'PLAN-TO-EXEC': ['TESTING'],
  'EXEC-TO-PLAN': ['TESTING', 'SECURITY'],
  'PLAN-TO-LEAD': ['RETRO'],
  'LEAD-FINAL-APPROVAL': []
};

/**
 * Resolve the current-phase start timestamp for freshness comparison.
 * Order:
 *   1) sd_phase_handoffs.accepted_at for most recent accepted handoff INTO current phase
 *   2) strategic_directives_v2.created_at (fallback for LEAD-TO-PLAN at SD birth)
 *
 * Cached on ctx._phaseStartedAt per precheck run.
 *
 * @param {Object} ctx - Handoff ctx {sd, handoffType, supabase, sdId}
 * @param {Object} supabase - Supabase client (when ctx.supabase absent)
 * @returns {Promise<Date>} Phase start timestamp
 */
async function resolveCurrentPhaseStartedAt(ctx, supabase) {
  if (ctx._phaseStartedAt instanceof Date) return ctx._phaseStartedAt;
  if (typeof ctx._phaseStartedAt === 'string') {
    ctx._phaseStartedAt = new Date(ctx._phaseStartedAt);
    return ctx._phaseStartedAt;
  }

  const db = supabase || ctx.supabase;
  const sdUuid = ctx.sd?.id || ctx.sdId;
  const handoffType = ctx.handoffType;
  if (!db || !sdUuid || !handoffType) {
    // No way to resolve; treat as epoch so any evidence row passes freshness
    ctx._phaseStartedAt = new Date(0);
    return ctx._phaseStartedAt;
  }

  // currentPhase = the destination of the most recent completed handoff
  // For LEAD-TO-PLAN, current phase IS still LEAD (that's the SD's state);
  // for PLAN-TO-EXEC, current phase is PLAN (just entered via LEAD-TO-PLAN).
  const toPhaseMap = {
    'LEAD-TO-PLAN': 'LEAD',
    'PLAN-TO-EXEC': 'PLAN',
    'EXEC-TO-PLAN': 'EXEC',
    'PLAN-TO-LEAD': 'PLAN',
    'LEAD-FINAL-APPROVAL': 'LEAD'
  };
  const currentPhase = toPhaseMap[handoffType] || 'LEAD';

  // Try most recent accepted handoff INTO the current phase
  try {
    const { data } = await db
      .from('sd_phase_handoffs')
      .select('accepted_at')
      .eq('sd_id', sdUuid)
      .eq('to_phase', currentPhase)
      .eq('status', 'accepted')
      .not('accepted_at', 'is', null)
      .order('accepted_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0 && data[0].accepted_at) {
      ctx._phaseStartedAt = new Date(data[0].accepted_at);
      return ctx._phaseStartedAt;
    }
  } catch (_) {
    // fall through to SD created_at fallback
  }

  // LEAD fallback: SD creation timestamp
  try {
    const { data } = await db
      .from('strategic_directives_v2')
      .select('created_at')
      .eq('id', sdUuid)
      .single();
    if (data?.created_at) {
      ctx._phaseStartedAt = new Date(data.created_at);
      return ctx._phaseStartedAt;
    }
  } catch (_) { /* noop */ }

  // Last-resort fallback
  ctx._phaseStartedAt = new Date(0);
  return ctx._phaseStartedAt;
}

/**
 * Check the emergency kill-switch env var.
 * @returns {boolean}
 */
function killSwitchActive() {
  const v = process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE;
  return v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');
}

/**
 * Write a non-blocking audit_log row documenting the bypass.
 */
async function writeKillSwitchAudit(db, sdUuid, handoffType) {
  if (!db) return;
  try {
    await db.from('audit_log').insert({
      severity: 'warning',
      action: 'gate_bypass',
      metadata: {
        gate: 'GATE_SUBAGENT_EVIDENCE',
        sd_id: sdUuid,
        handoff_type: handoffType,
        reason: 'LEO_DISABLE_SUBAGENT_EVIDENCE_GATE env var set'
      }
    });
  } catch (e) {
    // Non-blocking: auditability is secondary to correctness
    console.warn(`   ⚠️  audit_log insert suppressed: ${e?.message || e}`);
  }
}

/**
 * Validate that fresh sub-agent evidence exists for the required set.
 *
 * @param {Object} ctx - Handoff ctx {sd, handoffType, supabase, sdId}
 * @param {Object} supabase - Supabase client (when not on ctx)
 * @returns {Promise<Object>} Gate result
 */
export async function validateSubagentEvidence(ctx, supabase) {
  const db = supabase || ctx.supabase;
  const sdUuid = ctx.sd?.id || ctx.sdId;
  const sdKey = ctx.sd?.sd_key || sdUuid;
  const handoffType = ctx.handoffType;

  console.log('\n🔍 GATE: Sub-Agent Evidence (DB-enforced)');
  console.log(`   Handoff: ${handoffType || 'unknown'} | SD: ${sdKey || 'unknown'}`);
  console.log('-'.repeat(50));

  const required = REQUIRED_SUBAGENTS[handoffType] || [];

  // Empty required set → pass
  if (required.length === 0) {
    console.log(`   ℹ️  No required sub-agents for ${handoffType} — gate passes`);
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: { required: [], missing: [] }
    };
  }

  // Kill-switch
  if (killSwitchActive()) {
    console.log('   ⚠️  LEO_DISABLE_SUBAGENT_EVIDENCE_GATE active — bypassing');
    await writeKillSwitchAudit(db, sdUuid, handoffType);
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: ['SUBAGENT_EVIDENCE_GATE BYPASSED via LEO_DISABLE_SUBAGENT_EVIDENCE_GATE'],
      details: { bypassed: true, required, reason: 'env_var' }
    };
  }

  if (!db || !sdUuid) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: ['Supabase client or SD UUID unavailable'],
      warnings: [],
      details: { reason: 'MISSING_CONTEXT' },
      remediation: 'Ensure handoff precheck passes supabase client and SD UUID in ctx.'
    };
  }

  const phaseStartedAt = await resolveCurrentPhaseStartedAt(ctx, db);
  console.log(`   Phase-start: ${phaseStartedAt.toISOString()}`);
  console.log(`   Required agents: ${required.join(', ')}`);

  // Query evidence
  let rows;
  try {
    const { data, error } = await db
      .from('sub_agent_execution_results')
      .select('sub_agent_code, created_at, verdict')
      .eq('sd_id', sdUuid)
      .gte('created_at', phaseStartedAt.toISOString());
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    return {
      passed: false,
      score: 0,
      max_score: 100,
      issues: [`sub_agent_execution_results query failed: ${e?.message || e}`],
      warnings: [],
      details: { reason: 'DB_ERROR' },
      remediation: 'Verify Supabase connectivity; re-run handoff precheck.'
    };
  }

  // Normalize: group by sub_agent_code, keep MAX(created_at)
  const present = new Set();
  for (const r of rows) {
    if (r?.sub_agent_code) present.add(r.sub_agent_code);
  }

  // Compare (case-insensitive) — required may be "VALIDATION" while rows write "validation-agent"
  // Match by normalized prefix: uppercase and strip "-agent"
  const norm = s => String(s || '').toUpperCase().replace(/-AGENT$/, '').replace(/-+/g, '_');
  const presentNorm = new Set([...present].map(norm));

  const missing = required.filter(r => !presentNorm.has(norm(r)));

  if (missing.length === 0) {
    console.log(`   ✅ All required sub-agents have fresh evidence (${required.length}/${required.length})`);
    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: {
        required,
        present: [...present],
        missing: [],
        phase_started_at: phaseStartedAt.toISOString()
      }
    };
  }

  console.log(`   ❌ SUBAGENT_EVIDENCE_MISSING: ${missing.join(', ')}`);
  return {
    passed: false,
    score: 0,
    max_score: 100,
    issues: [`SUBAGENT_EVIDENCE_MISSING: ${missing.join(', ')}`],
    warnings: [],
    details: {
      reason: 'SUBAGENT_EVIDENCE_MISSING',
      required,
      present: [...present],
      missing,
      phase_started_at: phaseStartedAt.toISOString()
    },
    remediation: `Invoke the missing sub-agent(s) via Task tool for SD ${sdKey} before re-running the ${handoffType} handoff, OR set LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1 as an emergency bypass.`
  };
}

/**
 * Factory: create the gate definition for registration in a handoff executor.
 *
 * @param {Object} supabase
 * @returns {Object}
 */
export function createSubagentEvidenceGate(supabase) {
  return {
    name: 'GATE_SUBAGENT_EVIDENCE',
    validator: async (ctx) => validateSubagentEvidence(ctx, supabase),
    required: true,
    remediation:
      'Invoke the missing sub-agent(s) via Task tool for this SD before re-running the handoff. ' +
      'Emergency bypass: LEO_DISABLE_SUBAGENT_EVIDENCE_GATE=1 (logs audit_log warning).'
  };
}

// Internal helpers exported for test access
export const _internals = { resolveCurrentPhaseStartedAt, killSwitchActive };
