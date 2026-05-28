const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SD_UUID = '74108dbf-766e-4f4c-958f-786ff1bc16fb';
const SD_KEY = 'SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001';
const PRD_ID = 'PRD-SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001';

// Canonical user_stories shape per RCA-USER-STORIES-INSERT-CONSTRAINTS-2026-05-27.md:
//   story_key regex: ^[A-Z0-9-]+:US-[0-9]{3,}$
//   status CHECK: draft|ready|in_progress|testing|completed|blocked
//   priority CHECK: critical|high|medium|low|minimal
//   NOT NULL: id, story_key, title, user_role, user_want, user_benefit
//   implementation_context: TEXT (not JSONB), length > 10, not '{}' not 'null' not ''

const ctx = (frs, acs, tests, complexity, loc, notes) => `## Implementation Guidance

**SD**: ${SD_KEY}
**Mapped FRs**: ${frs.join(', ')}
**Mapped ACs**: ${acs.join(', ')}
**Mapped Tests**: ${tests.length ? tests.join(', ') : 'none'}
**Complexity**: ${complexity}
**Estimated LOC**: ${loc}

${notes}`;

const STORIES = [
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    story_key: `${SD_KEY}:US-001`,
    title: 'Auto-cascade L2 vision approval to claim-ready orchestrator SD',
    user_role: 'chairman',
    user_want: 'my approved L2 vision to auto-cascade to a claim-ready orchestrator SD within 60s',
    user_benefit: 'I never type archplan-command.mjs upsert or create-orchestrator-from-plan.js --auto-children for venture work',
    acceptance_criteria: ['Vision approval -> orchestrator readiness in <90s (AC-1)', 'No manual chairman action between approval and LEAD claim availability', 'Manual CLI fallback continues to work unchanged'],
    priority: 'critical',
    status: 'draft',
    story_points: 8,
    implementation_context: ctx(['FR-A','FR-B'], ['AC-1','AC-A1','AC-A2','AC-B1'], ['TS-1'], 'high', 260,
      'Refactor scripts/create-orchestrator-from-plan.js into lib/eva/create-orchestrator-from-plan.js (3 pure functions per DESIGN agent C4). Build cascade-watcher.mjs one-shot script polling at chairman_approved=true predicate. Mirrors lib/eva/lifecycle-sd-bridge.js:181-235 refusal-gate pattern. PG advisory lock keyed on hash(vision_key||arch_key) closes TOCTOU race.')
  },
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    story_key: `${SD_KEY}:US-002`,
    title: 'Refused cascades visible with remediation_command',
    user_role: 'chairman',
    user_want: 'refused cascades to be visible with exact remediation_command steps',
    user_benefit: 'I can unblock stuck cascades without digging through logs',
    acceptance_criteria: ['Every refusal row has remediation_command populated (AC-B4)', 'cascade:status CLI surfaces unresolved refusals (AC-C3)', 'Daily summary delivered via existing harness-backlog channel (AC-C4)'],
    priority: 'high',
    status: 'draft',
    story_points: 3,
    implementation_context: ctx(['FR-B','FR-C'], ['AC-B4','AC-C3','AC-C4'], ['TS-2','TS-10'], 'medium', 80,
      'Mirrors lib/eva/lifecycle-sd-bridge.js:213 pattern: embed exact CLI invocation in remediation_command column. cascade:status CLI exits 1 when unresolved errors > 0 OR heartbeat stale >5min. Daily summary writes to feedback table via log-harness-bug.js when refusal_count > 0 (first run after midnight UTC).')
  },
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    story_key: `${SD_KEY}:US-003`,
    title: 'Watcher refuses to clobber chairman manual edits',
    user_role: 'chairman with in-flight CronGenius work',
    user_want: 'my manual edits to never be clobbered by the cron watcher',
    user_benefit: 'SD-CRONGENIUS-M1-LAUNCH-ORCHESTRATOR-ORCH-001 PLAN_VERIFICATION work stays intact when auto-cascade ships',
    acceptance_criteria: ['Watcher checks metadata.auto_generated on existing downstream artifacts (AC-B3)', 'CronGenius records remain untouched on first watcher run', 'Snapshot regression test guarantees byte-identical structure (AC-2)'],
    priority: 'critical',
    status: 'draft',
    story_points: 5,
    implementation_context: ctx(['FR-A','FR-B'], ['AC-2','AC-A3','AC-B3'], ['TS-4','TS-6'], 'high', 60,
      'Per RISK agent Risk-7 HIGH and COND-2: watcher reads existing downstream metadata.auto_generated. If FALSE (chairman manually created), watcher writes MANUAL_OVERRIDE_DETECTED row and skips. Existing CRONGENIUS-M1 records have metadata.auto_generated implicit-NULL or explicit-true depending on creation path — confirm via DB query before watcher Phase 5 validation run.')
  },
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    story_key: `${SD_KEY}:US-004`,
    title: 'Watcher runs reliably under external scheduling with absence-based liveness',
    user_role: 'operator',
    user_want: 'cascade-watcher to run reliably under Task Scheduler / cron with absence-based liveness signal',
    user_benefit: 'crashes self-recover at next tick; stuck runs are detectable via heartbeat absence',
    acceptance_criteria: ['One-shot script semantics; no daemon (AC-B1, TR-1)', 'Heartbeat row at start + update at end (AC-C5)', 'Exit codes encode health state', 'Operator runbook in scope-notes'],
    priority: 'high',
    status: 'draft',
    story_points: 3,
    implementation_context: ctx(['FR-B','FR-C'], ['AC-B1','AC-C5'], ['TS-3','TS-5'], 'medium', 70,
      'Per DESIGN agent C5: NO daemon. One-shot script registered via package.json (cascade:watch:cron). External scheduler is operator-managed (Windows Task Scheduler / *nix cron / systemd timer). cascade_watcher_heartbeats row inserted at start (started_at, exit_code NULL) and updated at exit (finished_at, exit_code, refusal_count, success_count). Crashed runs leave finished_at NULL = stuck signal.')
  },
  {
    sd_id: SD_UUID,
    prd_id: PRD_ID,
    story_key: `${SD_KEY}:US-005`,
    title: 'Canonical pipeline discoverable from package.json + JSDoc (P-FAIL-3 minimum)',
    user_role: 'future venture LEAD',
    user_want: 'the canonical pipeline to be discoverable from package.json and library JSDoc',
    user_benefit: 'P-FAIL-3 invisibility gap closes for the cascade path (full doc-fix tracked in separate QF)',
    acceptance_criteria: ['npm run cascade:status discoverable (AC-D1)', 'JSDoc PUBLIC LIBRARY ENTRY block (AC-D2)', 'README +1 line pointer (AC-D3)'],
    priority: 'low',
    status: 'draft',
    story_points: 1,
    implementation_context: ctx(['FR-D'], ['AC-D1','AC-D2','AC-D3'], [], 'low', 10,
      'Minimum discoverability hooks only. Full P-FAIL-3 doc-fix (CLAUDE_LEAD.md mentions, sd-start output, etc.) deferred to a separate QF (already filed: RCA-ENF-SD-CREATE-SKILL-DOC-DRIFT-2026-05-27 + sibling). Both fixes touch leo_protocol_sections DB rows; full fix can batch them.')
  }
];

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let ok = 0, fail = 0;
  for (const s of STORIES) {
    const { data, error } = await supabase.from('user_stories').upsert(s, { onConflict: 'story_key' }).select('story_key, title, status').single();
    if (error) { console.error('FAIL', s.story_key, ':', error.message); fail++; } else { console.log('OK ', data.story_key, '|', data.status, '|', data.title); ok++; }
  }
  console.log(`\nDONE. ok=${ok} fail=${fail}`);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
