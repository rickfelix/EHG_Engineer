/**
 * Operator Contract — harness adapter (FR-5 enforcement point).
 * (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001)
 *
 * Assembles the DB/git inputs for the pure core validator and produces a gate
 * verdict for the handoff final-gate. This is the DB-reading layer; all decision
 * logic lives in ./index.js so the harness gate and the venture seam (FR-7) share
 * ONE validator with zero duplicated logic.
 *
 * FAIL-OPEN CONTRACT: this gate binds the SHARED PLAN-TO-LEAD pipeline that every
 * session hits. Any execution error (git unavailable, DB read failure, parse
 * error) resolves to PASS with a warning — never a false block. Only an
 * unambiguous CREATOR-without-triple-and-no-valid-waiver produces a hard block.
 */
import { execSync } from 'node:child_process';
import { evaluateOperatorContract, detectCreator, validateConsumer, validateCadence, validateReaper } from './index.js';
import { RETENTION_POLICIES, SOAK_ENTRIES } from '../../retention/policies.js';

/**
 * Collect changed files (with added-line text) and migration SQL for an SD branch
 * by diffing the branch tip against origin/main. Pure-ish: only shells out to git.
 *
 * @param {Object} opts
 * @param {string} opts.appPath - repo root to run git in
 * @param {string} [opts.baseRef='origin/main']
 * @returns {{changedFiles: Array<{path,added}>, migrations: Array<{path,sql}>, createdTables: string[]}}
 */
export function collectSdDiff({ appPath, baseRef = 'origin/main' } = {}) {
  const run = (cmd) => execSync(cmd, { cwd: appPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  // merge-base diff so we only see the SD's own changes
  const nameOnly = run(`git diff --name-only ${baseRef}...HEAD`).split('\n').map((s) => s.trim()).filter(Boolean);
  const changedFiles = [];
  const migrations = [];
  const createdTables = [];

  for (const path of nameOnly) {
    let added = '';
    try {
      // only the added lines (leading '+', excluding the +++ header)
      const patch = run(`git diff ${baseRef}...HEAD -- "${path}"`);
      added = patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
    } catch { /* fail-open per-file */ }

    if (/\.sql$/i.test(path)) {
      migrations.push({ path, sql: added });
      const m = added.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([a-z0-9_]+)/gi) || [];
      for (const stmt of m) {
        const name = stmt.replace(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?/i, '').trim();
        if (name) createdTables.push(name);
      }
    } else {
      changedFiles.push({ path, added });
    }
  }
  return { changedFiles, migrations, createdTables: [...new Set(createdTables)] };
}

/**
 * Resolve the full operator-contract verdict for an SD.
 *
 * @param {Object} opts
 * @param {Object} opts.sd - strategic_directives_v2 row (metadata may hold operator_contract_waiver + capability keys)
 * @param {string} opts.appPath
 * @param {Object} opts.supabase
 * @param {Date} [opts.now]
 * @returns {Promise<{verdict, reason, missing, creator, waiver_audit}>}
 */
export async function resolveOperatorContract({ sd, appPath, supabase, now = new Date() }) {
  const { changedFiles, migrations, createdTables } = collectSdDiff({ appPath });
  const creator = detectCreator({ changedFiles, migrations });

  // Short-circuit: non-CREATOR → no-op pass (no DB reads needed).
  if (!creator.is_creator) {
    return evaluateOperatorContract({ creator, triple: {}, now });
  }

  const consumer = validateConsumer({ changedFiles, createdTables });

  // Capability keys for the cadence lookup: explicit metadata list, else derived from created tables.
  const meta = sd?.metadata || {};
  const capabilityKeys = Array.isArray(meta.operator_capability_keys) && meta.operator_capability_keys.length
    ? meta.operator_capability_keys
    : createdTables.flatMap((t) => [t, `${t}-sweep`, `${t}-reaper`, t.replace(/_/g, '-')]);

  let registryRows = [];
  try {
    const { data } = await supabase
      .from('periodic_process_registry')
      .select('process_key, currently_expected_active, expected_interval_seconds, last_fired_at');
    registryRows = data || [];
  } catch { /* fail-open: no rows → cadence fails, but still a real verdict */ }
  const cadence = validateCadence({ registryRows, capabilityKeys });

  const reaper = validateReaper({ retentionPolicies: [...RETENTION_POLICIES, ...SOAK_ENTRIES], createdTables });

  return evaluateOperatorContract({
    creator,
    triple: {
      consumer_present: consumer.consumer_present,
      cadence_armed: cadence.cadence_armed,
      reaper_present: reaper.reaper_present,
    },
    waiver: meta.operator_contract_waiver || null,
    now,
  });
}

/**
 * PLAN-TO-LEAD gate factory (FR-5). Additive, fail-open.
 * @param {Object} supabase
 * @param {Object} sd
 * @param {string} appPath
 */
export function createOperatorContractGate(supabase, sd, appPath) {
  return {
    name: 'OPERATOR_CONTRACT',
    required: true,
    validator: async (ctx) => {
      console.log('\n🔗 OPERATOR CONTRACT GATE (D8 build-vs-run)');
      console.log('-'.repeat(50));
      const targetSd = ctx?.sd || sd || {};
      const repoPath = appPath || process.cwd();

      let audited = false;
      try {
        const result = await resolveOperatorContract({ sd: targetSd, appPath: repoPath, supabase });

        // Audit-log a valid waiver application (FR-6) — best-effort, non-blocking.
        if (result.waiver_audit) {
          try {
            await supabase.from('audit_log').insert({
              event: result.waiver_audit.event,
              metadata: { sd_key: targetSd.sd_key, ...result.waiver_audit },
            });
            audited = true;
          } catch { /* audit is best-effort */ }
        }

        if (result.verdict === 'pass') {
          console.log(`   ✅ ${result.reason}`);
          return {
            passed: true, score: 100, max_score: 100, issues: [],
            warnings: result.missing?.length ? [`waived missing: ${result.missing.join(', ')}`] : [],
            details: { reason: result.reason, missing: result.missing, waiver_audited: audited },
          };
        }

        console.log(`   ❌ ${result.reason}`);
        console.log('   A CREATOR (new table/writer/flag/detector) must ship its OPERATOR TRIPLE:');
        console.log('     • CONSUMER — code that acts on the created output');
        console.log('     • ARMED CADENCE — a periodic_process_registry cron (not a bare CLI / off-by-default flag)');
        console.log('     • REAPER — a lib/retention/policies.js entry');
        console.log('   Or attach a dated waiver: metadata.operator_contract_waiver {owner, expiry, reason}');
        return {
          passed: false, score: 0, max_score: 100,
          issues: [result.reason],
          warnings: [],
          details: { reason: result.reason, missing: result.missing, creator_kinds: result.creator?.creator_kinds },
        };
      } catch (err) {
        // FAIL-OPEN: never false-block the shared pipeline on an execution error.
        console.log(`   ⚠️  fail-open (execution error): ${err.message}`);
        return {
          passed: true, score: 100, max_score: 100, issues: [],
          warnings: [`operator-contract gate fail-open: ${err.message}`],
          details: { fail_open: true, error: err.message },
        };
      }
    },
  };
}
