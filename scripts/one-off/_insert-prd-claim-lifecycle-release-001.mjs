#!/usr/bin/env node
/**
 * One-off: insert PRD for SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001.
 * Schema: per PAT-PLAN-PRD-INSERT-SHAPE-001 (sd_id is UUID, document_type='prd' lowercase,
 * sd_key/target_application in metadata, FRs >= 3, AC non-empty, user_stories.id is UUID).
 * Incorporates testing-agent LEAD-prospective drift catches (id 916b7a76).
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_UUID = '2a017ba5-ad88-4746-b2a8-0a8016c13835';
const SD_KEY = 'SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001';
const PRD_ID = `PRD-${SD_KEY}`;

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'CLAIM RELEASE ON PR-OPEN',
    description: 'Hook a release call into the canonical /ship PR-creation path (scripts/modules/shipping/ShippingExecutor.js after gh pr create succeeds, before returning PR URL). Releases the claim on the SD whose branch the PR is opened against. Implementation lives in lib/claim-lifecycle-release.mjs::releaseClaimOnPROpen. Calls release_sd RPC with WHERE-pinned UPDATE on (claiming_session_id, claim_version) so a same-session re-assert at version=N+1 after PR-open does not get released by a captured-at-N call (testing-agent drift catch (b) — version-skew protection). Sources: feedback 7e4cce6f-90e9-4ee0-9181-bd1d09e91faf [high], 8ddfe2e8-f0e5-453e-87e5-95e1b39b4e54 [medium].',
    acceptance_criteria: [
      'AC-1.1: When session A opens a PR for SD-X via ShippingExecutor.js, releaseClaimOnPROpen() is invoked exactly once after the gh pr create returns successfully and before the PR URL is returned to the caller.',
      'AC-1.2: When releaseClaimOnPROpen() is called for an SD already released (idempotent re-entry), it exits with no error and no DB write — testing-agent drift catch (a).',
      'AC-1.3: When session A re-asserts the claim AFTER PR-open (claim_version increments from N to N+1), releaseClaimOnPROpen() captured at version=N MUST NOT release the claim — WHERE-pinned UPDATE on (claiming_session_id, claim_version=N) returns 0 affected rows and the call exits cleanly.',
      'AC-1.4: When gh pr create fails (non-zero exit), releaseClaimOnPROpen() is NOT invoked — the claim remains held by session A.',
      'AC-1.5: Static guard test pins the post-pr-create release call site in ShippingExecutor.js via regex, mirroring file-claim-detection.test.js closure pattern.',
    ],
    priority: 'high',
    dependencies: [],
  },
  {
    id: 'FR-2',
    title: 'FORCE-RECLAIM HONORS sd_key DRIFT',
    description: 'Extend sd-start.js force-reclaim path + lib/claim-validity-gate.js consumer to detect sd_key drift (target SD does not match current claimer\'s claude_sessions.sd_key — sd_key tag is source-of-truth, NOT claiming_session_id). When drift detected, treat as same-class as stale-heartbeat: --force-reclaim succeeds without 15min TTL wait. REUSES existing detectSdKeyDrift helper at scripts/session-check-concurrency.js:68 (shipped by SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 FR-7) by re-exporting from lib/claim-lifecycle-release.mjs — no new implementation. Sources: feedback b3653308-2879-4ef3-a06d-cdb04b97b842 [high].',
    acceptance_criteria: [
      'AC-2.1: When session B runs sd-start.js SD-X --force-reclaim and SD-X.claiming_session_id=A but A.claude_sessions.sd_key=SD-Y (drifted), the force-reclaim succeeds and B becomes the new owner.',
      'AC-2.2: claim-validity-gate emits sd_key_drift error type (NOT foreign_claim) when drift is detected — distinct telemetry channel.',
      'AC-2.3: detectSdKeyDrift is RE-EXPORTED from lib/claim-lifecycle-release.mjs (not re-implemented). Static guard test asserts the re-export resolves to the canonical scripts/session-check-concurrency.js implementation (prevents accidental fork).',
      'AC-2.4: When sd_key matches (no drift), --force-reclaim still requires the existing stale-heartbeat condition or returns foreign_claim — backward compat preserved.',
      'AC-2.5: Boundary test: aligned / drifted / sd_key=null cases (CROSS-HOST FR-7 incident-root-cause coverage).',
    ],
    priority: 'high',
    dependencies: ['FR-1'],
  },
  {
    id: 'FR-3',
    title: 'INBOX MESSAGE HONORED BEFORE RE-CLAIM (READ-ONLY POLL)',
    description: 'In sd-start.js claim path (and any sibling path used by /coordinator workers), poll session_coordination for CLAIM_RELEASED messages with subject = SD claim being attempted, in the last 5 minutes. If a recent message exists, abort the claim attempt with a clear "peer is releasing" message. **CRITICAL**: This poll MUST be READ-ONLY — do NOT mark messages read (testing-agent drift catch (d) — FR-1/FR-3 race). If FR-3 marks read, a session retrying after the original consumer dies will not see the message and claim collision reopens. The TTL window naturally retires the message; no consumer-side flagging needed. Sources: feedback 8ddfe2e8-f0e5-453e-87e5-95e1b39b4e54 [medium].',
    acceptance_criteria: [
      'AC-3.1: When session_coordination has a CLAIM_RELEASED message for subject=SD-X with timestamp <5min old, sd-start.js SD-X aborts with exit code 1 and message "Peer is releasing claim for SD-X (received Nm Ns ago); retry in <TTL_remaining>s".',
      'AC-3.2: hasRecentClaimReleased() helper performs a SELECT-only query — NEVER UPDATE/INSERT/DELETE. Static guard test greps the helper source for any non-SELECT operation against session_coordination.',
      'AC-3.3: Boundary test: 4:55s before now → returns true; 5:05s before now → returns false. CLAIM_RELEASED_TTL_MS=300000 externalized as named constant with docstring.',
      'AC-3.4: When NO CLAIM_RELEASED message exists, the claim attempt proceeds normally (regression check).',
      'AC-3.5: After abort, the inbox message remains visible (read-only contract) so a subsequent retry from another session also sees it. Integration test confirms.',
    ],
    priority: 'high',
    dependencies: ['FR-1'],
  },
  {
    id: 'FR-4',
    title: 'IDEMPOTENCY CONTRACT FOR releaseClaimOnPROpen',
    description: 'releaseClaimOnPROpen exit-fast-no-error semantics: if claim is already released by anyone (PG-side release_sd RPC returns success-no-op or 0 rows affected), the JS wrapper logs at debug-level and returns success. Documented + tested. Maps to testing-agent drift catch (a).',
    acceptance_criteria: [
      'AC-4.1: When release_sd RPC returns 0 rows affected, releaseClaimOnPROpen logs "[CLAIM-RELEASE] noop: already released" at debug level and returns { released: false, reason: "already_released" }.',
      'AC-4.2: When release_sd RPC throws, releaseClaimOnPROpen surfaces the error to the caller (no swallow).',
      'AC-4.3: When release succeeds, returns { released: true, sd_id, claim_version, released_by }.',
    ],
    priority: 'medium',
    dependencies: ['FR-1'],
  },
  {
    id: 'FR-5',
    title: 'EXTERNALIZE CLAIM_RELEASED_TTL_MS CONSTANT',
    description: 'TTL window of 5min for FR-3 inbox poll is extracted as `export const CLAIM_RELEASED_TTL_MS = 300000;` in lib/claim-lifecycle-release.mjs with docstring referencing source feedback 8ddfe2e8 + worker-tick-budget rationale. Avoids magic-number drift across consumers.',
    acceptance_criteria: [
      'AC-5.1: Named export CLAIM_RELEASED_TTL_MS exists in lib/claim-lifecycle-release.mjs with value 300000.',
      'AC-5.2: hasRecentClaimReleased() uses the named constant — static guard test grep verifies (no inline 300000 literal in helper).',
      'AC-5.3: Docstring above the constant cites source feedback 8ddfe2e8 + the 5min worker-tick-budget rationale.',
    ],
    priority: 'low',
    dependencies: ['FR-3'],
  },
];

const acceptance_criteria = functional_requirements.flatMap((fr) =>
  fr.acceptance_criteria.map((ac) => ({ requirement_id: fr.id, criterion: ac }))
);

const technical_requirements = [
  {
    id: 'TR-1',
    title: 'New module lib/claim-lifecycle-release.mjs',
    description: 'Exports: releaseClaimOnPROpen(sdId, sessionId, claimVersion), detectSdKeyDrift (re-export from scripts/session-check-concurrency.js), hasRecentClaimReleased(sdId), CLAIM_RELEASED_TTL_MS constant. ~70-90 LOC. Pure async fns, no side-effects beyond DB. NO new top-level state.',
  },
  {
    id: 'TR-2',
    title: 'Modify scripts/modules/shipping/ShippingExecutor.js',
    description: 'After successful gh pr create at line ~108, invoke releaseClaimOnPROpen(sdId, sessionId, claimVersion). ~5-10 LOC. NO change to PR-creation logic itself. NOTE: lib/ship/pr-create.mjs does NOT exist — that subtree is reserved for ship-pipeline gate logic (auto-merge.mjs / qf-detector.mjs / review-gate.js) per testing-agent drift catch (e/f).',
  },
  {
    id: 'TR-3',
    title: 'Modify scripts/sd-start.js (3 insertion points)',
    description: '(a) Force-reclaim sd_key drift fallthrough — call detectSdKeyDrift, treat positive result as stale-heartbeat-equivalent. (b) Claim-attempt CLAIM_RELEASED inbox poll — call hasRecentClaimReleased before sd-claim-write, abort if positive. (c) Own sd_key drift early-detect during heartbeat reconciliation. ~20-30 LOC across 3 sites. CONCURRENCY: 5 parallel CC sessions actively use this file — batch all 3 edits in single commit.',
  },
  {
    id: 'TR-4',
    title: 'Modify lib/claim-validity-gate.js',
    description: 'Add sd_key drift fallthrough mirroring same-host stale-heartbeat parity. When detectSdKeyDrift(claimer.sd_key, target_sd) is true, return { valid: false, reason: "sd_key_drift" } instead of "foreign_claim" — distinct telemetry. ~10-15 LOC. NOTE: actual path is lib/claim-validity-gate.js, NOT scripts/modules/lib/claim-validity-gate.js (path drift in original SD scope corrected).',
  },
  {
    id: 'TR-5',
    title: 'Vitest coverage + integration test',
    description: 'Test files: tests/unit/claim-lifecycle-release.test.js (FR-1+4+5 unit), tests/unit/claim-validity-gate-sd-key-drift.test.js (FR-2 unit), tests/unit/sd-start-inbox-poll.test.js (FR-3 unit), tests/integration/claim-lifecycle-3-stack.test.js (FR-1+2+3 integration scenario). ~280 test LOC. Closure-pattern reference: lib/eva/__tests__/file-claim-detection.test.js (FR-7 from SD-CROSS-HOST).',
  },
];

const test_scenarios = [
  {
    id: 'TS-1',
    name: 'Happy path: 3-claim-stack scenario',
    description: 'Session A claims SD-X, opens PR, runs FR-1 release, then claims SD-Y. Session B claims SD-X (no force-reclaim, no TTL wait) — succeeds.',
  },
  {
    id: 'TS-2',
    name: 'sd_key drift force-reclaim',
    description: 'Session A.claude_sessions.sd_key flipped to SD-Y while A still holds SD-X claim. Session B sd-start --force-reclaim SD-X — succeeds with sd_key_drift telemetry.',
  },
  {
    id: 'TS-3',
    name: 'CLAIM_RELEASED inbox honoring (read-only)',
    description: 'Insert CLAIM_RELEASED row for SD-X with 2min-old timestamp. Session B sd-start SD-X — aborts with peer-releasing message. Inbox row remains visible. Session C sd-start SD-X 1min later — also sees the message and aborts.',
  },
  {
    id: 'TS-4',
    name: 'TTL boundary: 4:55s vs 5:05s',
    description: '4:55s message → hasRecentClaimReleased true, claim aborts. 5:05s message → false, claim proceeds. Defends CLAIM_RELEASED_TTL_MS=300000 constant.',
  },
  {
    id: 'TS-5',
    name: 'Idempotency: double-release no-op',
    description: 'releaseClaimOnPROpen called twice for already-released SD — second call exits at debug-log without error. Returns { released: false, reason: "already_released" }.',
  },
  {
    id: 'TS-6',
    name: 'Version-skew: re-assert post-release',
    description: 'Session A captures claim at v=N, opens PR, FR-1 captures version=N for release. Session A re-asserts claim at v=N+1 (post-merge cleanup). FR-1 release executes WHERE-pinned UPDATE — 0 rows affected. Claim stays held at v=N+1.',
  },
];

const risks = [
  {
    id: 'R-1',
    description: 'Concurrency collision editing scripts/sd-start.js while 5 parallel CC sessions actively use it',
    mitigation: 'Worktree isolation pre-merge. Batch all 3 sd-start.js insertion-point edits in single commit. Run npm run session:check-concurrency before Write/Edit. Merge-time fetch covered by QF-20260509-779 B1 (analyzeGitDiff git fetch origin main).',
  },
  {
    id: 'R-2',
    description: 'FR-1/FR-3 race condition: Session A releases on PR-open, Session B aborts on inbox check, Session A dies before B retries — if FR-3 marks read, B\'s retry no longer sees message → claim collision reopens',
    mitigation: 'CRITICAL design constraint: FR-3 is READ-ONLY (no UPDATE/mark-read). TTL window naturally retires the message. Static guard test (AC-3.2) greps helper source for non-SELECT operations against session_coordination.',
  },
  {
    id: 'R-3',
    description: 'Same-session re-assert post-release version-skew: FR-1 captures version=N, then session re-asserts at N+1, then FR-1 release executes — could falsely release new owner',
    mitigation: 'WHERE-pinned UPDATE on (claiming_session_id, claim_version=N) returns 0 affected rows. AC-1.3 + TS-6 cover this.',
  },
];

const user_stories = [
  {
    id: randomUUID(),
    title: 'As a CC session opening a PR, my claim on the source SD is released atomically',
    acceptance: 'After ShippingExecutor.js gh pr create succeeds, releaseClaimOnPROpen fires before PR URL returns; another session can immediately claim the SD without 15min TTL wait.',
  },
  {
    id: randomUUID(),
    title: 'As a CC session running --force-reclaim, sd_key drift on the current owner unblocks me',
    acceptance: 'When the existing owner\'s sd_key has drifted away from target SD, --force-reclaim succeeds with sd_key_drift telemetry.',
  },
  {
    id: randomUUID(),
    title: 'As a CC session attempting a claim, recent CLAIM_RELEASED messages from a peer cause me to defer',
    acceptance: 'sd-start aborts with peer-releasing message when CLAIM_RELEASED <5min old exists for target SD; inbox stays visible to subsequent retries.',
  },
];

const prd = {
  id: PRD_ID,
  directive_id: SD_UUID,
  sd_id: SD_UUID,
  title: 'PRD — Claim lifecycle release on PR-open and sd_key drift and CLAIM_RELEASED message honoring',
  document_type: 'prd',
  status: 'in_progress',
  category: 'infrastructure',
  priority: 'medium',
  executive_summary: 'Tier-2 infrastructure SD closing 3 sibling feedback rows in CLAIM-LIFECYCLE/SESSION-IDENTITY harness backlog. 5 FRs: PR-open release, sd_key drift in --force-reclaim, READ-ONLY CLAIM_RELEASED inbox poll, idempotency contract, externalized TTL constant. Reuses existing detectSdKeyDrift from SD-CROSS-HOST FR-7. Net ~150 src + ~280 test LOC. 13th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.',
  functional_requirements,
  technical_requirements,
  acceptance_criteria,
  test_scenarios,
  risks,
  metadata: {
    user_stories,
    sd_key: SD_KEY,
    target_application: 'EHG_Engineer',
    tier: 'Tier-2',
    loc_estimate: { src: 150, test: 280 },
    sub_agent_evidence: {
      lead_prospective_testing: '916b7a76-ad39-4440-b2e7-80da7fb19828',
    },
    drift_corrections_from_lead: [
      'lib/ship/pr-create.mjs DOES NOT EXIST → use scripts/modules/shipping/ShippingExecutor.js + new lib/claim-lifecycle-release.mjs',
      'scripts/modules/lib/claim-validity-gate.js → lib/claim-validity-gate.js (no scripts/modules/lib/ subtree)',
      'detectSdKeyDrift exists at scripts/session-check-concurrency.js:68 → REUSE via re-export, do not re-implement (-25 LOC)',
      'Reserve lib/ship/ subtree for ship-pipeline gate logic (auto-merge.mjs/qf-detector.mjs/review-gate.js); do not put lifecycle hook there',
    ],
  }
};

const { data, error } = await sb.from('product_requirements_v2').upsert(prd, { onConflict: 'id' }).select('id,sd_id,document_type,status,functional_requirements').single();
if (error) {
  console.error('PRD INSERT FAILED:', error);
  process.exit(1);
}
console.log('PRD upserted:', data.id, '| sd_id:', data.sd_id, '| document_type:', data.document_type, '| FRs:', (data.functional_requirements || []).length);
