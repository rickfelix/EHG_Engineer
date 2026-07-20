#!/usr/bin/env node
/**
 * Write EXEC-phase TESTING + SECURITY evidence for SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B
 * ahead of EXEC-TO-PLAN. Both are RETROSPECTIVE reviews of the real, already-fixed implementation:
 * an adversarial testing-agent pass found a real prototype-chain lookup bug (reason strings like
 * 'toString'/'constructor'/'__proto__' would return an inherited function/object instead of the
 * promised string) and an unclamped ctxPercent (NaN/negative/>100 could pass through) -- both fixed
 * in lib/fleet/session-detail-view.js with 3 new regression tests (14/14 passing total). A
 * security-agent pass then reviewed the fixed module and confirmed PASS-WITH-NOTES: no live
 * vulnerability (pure function, no DB/IO/auth), but added consumer-facing HTML-escape / auth-at-
 * caller documentation notes, now baked into the module's header comment.
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict +
 * lib/sub-agent-executor/results-storage.js storeSubAgentResults) — no hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'adaa690d-8950-4bd3-9e35-3d8c95bcbfdc';
const SD_KEY = 'SD-LEO-INFRA-SESSION-VIEW-BROWSER-001-B';

async function writeTesting(supabase) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });
  let results = {
    verdict: 'PASS',
    confidence: 92,
    findings: [
      { id: 'F1-prototype-chain-bug-fixed', severity: 'WARNING', summary: "Adversarial review found ATTACH_REASON_MESSAGES[reason] was a plain-object lookup walking the prototype chain -- a reason of 'toString'/'constructor'/'__proto__'/'valueOf'/'hasOwnProperty' returned an inherited FUNCTION/OBJECT instead of the promised string fallback, violating mapAttachState's own defensive contract. Fixed with an Object.hasOwn() + typeof own-property guard; regression test parametrized over all 5 prototype-key names now asserts typeof message === 'string' for each." },
      { id: 'F2-ctx-percent-unclamped-fixed', severity: 'INFO', summary: 'ctxPercent accepted NaN (typeof NaN === "number" passes a naive check) and unclamped out-of-range values (-5, 150). Fixed with Number.isFinite() rejection + Math.max(0,Math.min(100,v)) clamp; 3 new assertions cover NaN->null, -5->0, 150->100.' },
      { id: 'F3-all-11-original-scenarios-hold', severity: 'INFO', summary: 'All 11 originally-specified test scenarios (TS-1..TS-7 plus the 4 prospective-review additions) continue to pass unchanged after the fixes -- no regression to the correct happy-path/defensive behavior already covered.' },
      { id: 'F4-full-suite-status', severity: 'INFO', summary: '14/14 tests passing (tests/unit/fleet/session-detail-view.test.js: 11 original + 3 new regression tests for the 2 adversarial-review findings). eslint clean.' },
    ],
    warnings: [],
    recommendations: ['PROCEED to PLAN_VERIFICATION -- implementation is fixed, tested, and lint-clean; no further test authoring required for this SD\'s scope.'],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      adversarial_review_type: 'code-exists retrospective review, not prospective',
      fixes_applied: ['Object.hasOwn own-property-only lookup in mapAttachState', 'Number.isFinite + [0,100] clamp for ctxPercent in buildSessionDetailView'],
      unit_test_count: 14,
      unit_test_result: '14/14 passing',
      eslint: 'clean',
    }),
    metadata: { files_identified: ['lib/fleet/session-detail-view.js', 'tests/unit/fleet/session-detail-view.test.js'] },
    phase: 'EXEC',
    validation_mode: 'retrospective',
    summary: 'PASS (confidence 92). Adversarial retrospective review of the real implementation found and closed 1 real defect (prototype-chain lookup returning a non-string message for reason names like toString/constructor/__proto__) and 1 robustness gap (unclamped ctxPercent). Both fixed with regression tests; 14/14 total passing, eslint clean.',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('TESTING', SD_ID, { name: 'QA Engineering Director (testing-agent)' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
}

async function writeSecurity(supabase) {
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'SECURITY', supabase });
  let results = {
    verdict: 'PASS',
    confidence: 90,
    findings: [
      { id: 'F1-no-live-vulnerability', severity: 'INFO', summary: 'lib/fleet/session-detail-view.js is a pure function (no DB/IO/network/auth/credential handling). Traced every view-model field to its writer: ctxPercent (SMALLINT-constrained + clamped), lastToolAt/silentUntil (ISO timestamps), lastActivityKind (DB CHECK-constrained enum), attachState.reason (fixed lowercase enum from attach()/session-registry.js, never reflects the attacker-supplied `target` value), attachState.message (author-controlled hardcoded literals, no interpolation). None carry free-text end-user input.' },
      { id: 'F2-no-info-disclosure', severity: 'INFO', summary: 'attachState.message strings are generic, disclose no file paths/credentials/stack traces/session identifiers. mapAttachState deliberately drops session_id from its returned shape.' },
      { id: 'F3-prototype-pollution-fix-confirmed-sufficient', severity: 'INFO', summary: "Confirmed the Object.hasOwn() lookup fix fully closes the prototype-chain vector; also confirmed a non-string `reason` (if ever fed by a malformed caller) causes no downstream issue since the module performs zero string-interpolation or property-access on `reason` beyond the already-guarded lookup." },
      { id: 'F4-consumer-facing-notes-documented', severity: 'INFO', summary: "Added a SECURITY NOTE block to the module's header JSDoc: future consumer must HTML-escape lastTool/lastActivityKind/attachState.reason at the render boundary (lastTool/current_tool has no DB CHECK constraint, least-constrained field) and must enforce its own authorization before calling buildSessionDetailView -- this module has no auth/RLS logic by design." },
    ],
    warnings: [],
    recommendations: ['No code changes required to pass this gate. The documented consumer-facing notes (HTML-escape at render, auth-at-caller) should be honored by whichever future SD wires this module into a live UI route.'],
    detailed_analysis: JSON.stringify({
      sd_key: SD_KEY,
      review_type: 'PASS-WITH-NOTES -- defense-in-depth documentation added, no vulnerability found',
      writers_verified: ['scripts/hooks/pre-tool-enforce.cjs', 'scripts/hooks/post-tool-clear-telemetry.cjs', 'scripts/sync-context-usage.js', 'lib/fleet/spawn-control.js', 'lib/fleet/session-registry.js'],
    }),
    metadata: { files_identified: ['lib/fleet/session-detail-view.js'] },
    phase: 'EXEC',
    validation_mode: 'retrospective',
    summary: 'PASS-WITH-NOTES (confidence 90). No live vulnerability in this pure, IO-free view-model module. Traced every field to its telemetry source and confirmed none carry attacker-controllable free text. Confirmed the prototype-chain lookup fix is sufficient. Added consumer-facing HTML-escape and auth-at-caller notes to the module header for the future SD that wires this into a live UI route.',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('SECURITY', SD_ID, { name: 'Security Architect (security-agent)' }, results, { sdKey: SD_KEY, phase: 'EXEC' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const testing = await writeTesting(supabase);
  const security = await writeSecurity(supabase);
  console.log('TESTING:', testing.id, testing.verdict, testing.confidence);
  console.log('SECURITY:', security.id, security.verdict, security.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
