#!/usr/bin/env node
/**
 * Apply validation-agent PRD-prospective corrections (id 1d3d1c5b).
 * P1: claim_version doesn't exist (Option B compare-and-set), FR-3 column rename, cut TR-3(c).
 * Plus 3 AC coverage gaps + 2 risk additions (R-6 dropped — no migration under Option B).
 */
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001';

const { data: cur } = await sb.from('product_requirements_v2').select('*').eq('id', PRD_ID).single();
if (!cur) { console.error('PRD not found'); process.exit(1); }

// FR-1: Option B (compare-and-set on existing columns, no claim_version)
const fr1 = cur.functional_requirements.find(f => f.id === 'FR-1');
fr1.description = 'Hook a release call into the canonical /ship PR-creation path (scripts/modules/shipping/ShippingExecutor.js after gh pr create succeeds, before returning PR URL). Releases the claim on the SD whose branch the PR is opened against. Implementation lives in lib/claim-lifecycle-release.mjs::releaseClaimOnPROpen. Calls release_sd RPC with WHERE-pinned UPDATE on (claiming_session_id, claimed_at, heartbeat_at) — captured pre-PR-create — so a same-session re-assert AFTER PR-open mutates claimed_at/heartbeat_at and the captured-version UPDATE returns 0 affected rows (testing-agent drift catch (b) — version-skew protection via compare-and-set on existing columns; NO new claim_version column required per validation-agent P1 finding). Sources: feedback 7e4cce6f-90e9-4ee0-9181-bd1d09e91faf [high], 8ddfe2e8-f0e5-453e-87e5-95e1b39b4e54 [medium].';
fr1.acceptance_criteria = [
  'AC-1.1: When session A opens a PR for SD-X via ShippingExecutor.js, releaseClaimOnPROpen() is invoked exactly once after the gh pr create returns successfully and before the PR URL is returned to the caller.',
  'AC-1.2: When releaseClaimOnPROpen() is called for an SD already released (idempotent re-entry), it exits with no error and no DB write — testing-agent drift catch (a).',
  'AC-1.3: When session A re-asserts the claim AFTER PR-open (claimed_at or heartbeat_at mutated post-capture), releaseClaimOnPROpen() captured at the pre-PR claimed_at/heartbeat_at values MUST NOT release the claim — WHERE-pinned UPDATE returns 0 affected rows and the call exits cleanly. Implementation: capture {claiming_session_id, claimed_at, heartbeat_at} BEFORE gh pr create, use those exact values in the UPDATE WHERE clause.',
  'AC-1.4: When gh pr create fails (non-zero exit), releaseClaimOnPROpen() is NOT invoked — the claim remains held by session A.',
  'AC-1.5: Static guard test pins the post-pr-create release call site in ShippingExecutor.js via regex, mirroring file-claim-detection.test.js closure pattern.',
  'AC-1.6: Partial failure path (gh succeeds + releaseClaimOnPROpen throws): the error is logged at warn-level via the ShippingExecutor logger, BUT the PR URL is still returned to the caller — claim-release failure does NOT block /ship pipeline. (validation-agent coverage gap fill).',
];

// FR-3: target_sd + message_type top-level columns (NOT subject + payload.event_type)
const fr3 = cur.functional_requirements.find(f => f.id === 'FR-3');
fr3.description = 'In sd-start.js claim path (and any sibling path used by /coordinator workers), poll session_coordination for messages with message_type=\'CLAIM_RELEASED\' AND target_sd=SD-being-claimed AND created_at >= now() - INTERVAL 5 minutes. If a recent message exists, abort the claim attempt with a clear "peer is releasing" message. **CRITICAL**: This poll MUST be READ-ONLY — do NOT mark messages read (testing-agent drift catch (d) — FR-1/FR-3 race). If FR-3 marks read, a session retrying after the original consumer dies will not see the message and claim collision reopens. The TTL window naturally retires the message; no consumer-side flagging needed. **Schema correction (validation-agent P1)**: filter is `target_sd` column (NOT `subject`) and `message_type` is top-level column (NOT `payload.event_type`). Sources: feedback 8ddfe2e8-f0e5-453e-87e5-95e1b39b4e54 [medium].';
fr3.acceptance_criteria = [
  'AC-3.1: When session_coordination has a row with message_type=\'CLAIM_RELEASED\' AND target_sd=SD-X AND created_at <5min old, sd-start.js SD-X aborts with exit code 1 and message "Peer is releasing claim for SD-X (received Nm Ns ago); retry in <TTL_remaining>s".',
  'AC-3.2: hasRecentClaimReleased() helper performs a SELECT-only query — NEVER UPDATE/INSERT/DELETE. Static guard test greps the helper source for any non-SELECT operation against session_coordination.',
  'AC-3.3: Boundary test: 4:55s before now → returns true; 5:05s before now → returns false. CLAIM_RELEASED_TTL_MS=300000 externalized as named constant with docstring.',
  'AC-3.4: When NO matching CLAIM_RELEASED message exists, the claim attempt proceeds normally (regression check).',
  'AC-3.5: After abort, the inbox row remains visible (read-only contract) so a subsequent retry from another session also sees it. Integration test confirms.',
  'AC-3.6: TTL_remaining computation: `Math.max(0, CLAIM_RELEASED_TTL_MS - (Date.now() - new Date(msg.created_at).getTime()))` formatted as integer seconds. Defined in helper, exported for test (validation-agent coverage gap fill).',
];

// FR-2: AC-2.6 add return shape pin
const fr2 = cur.functional_requirements.find(f => f.id === 'FR-2');
fr2.acceptance_criteria.push(
  'AC-2.6: claim-validity-gate sd_key drift return shape is `{ ownership: \'unclaimed\', reason: \'sd_key_drift\', released_owner_session: <prev_session>, released_owner_sd_key: <drifted_sd_key> }` — mirrors existing stale-heartbeat auto-release path at lib/claim-validity-gate.js:250-277. (validation-agent coverage gap fill).'
);

// TR-3: cut (c) "own sd_key drift early-detect" — covered by CROSS-HOST FR-7
const tr3 = cur.technical_requirements.find(t => t.id === 'TR-3');
tr3.description = 'Modify scripts/sd-start.js with TWO insertion points (validation-agent P1: original (c) cut as out-of-scope — CROSS-HOST FR-7 already provides this): (a) Force-reclaim sd_key drift fallthrough — call detectSdKeyDrift, treat positive result as stale-heartbeat-equivalent. (b) Claim-attempt CLAIM_RELEASED inbox poll — call hasRecentClaimReleased before sd-claim-write, abort if positive. ~15-20 LOC across 2 sites (down from 3). CONCURRENCY: 5 parallel CC sessions actively use this file — batch all 2 edits in single commit.';

// TS-6: rewrite for compare-and-set version-skew (no claim_version)
const ts6 = cur.test_scenarios.find(t => t.id === 'TS-6');
ts6.description = 'Session A captures claim at heartbeat_at=T0, opens PR. FR-1 captures (claiming_session_id, claimed_at, heartbeat_at=T0) before gh pr create. Session A heartbeat updates to T1>T0 (post-merge cleanup). FR-1 release executes WHERE-pinned UPDATE on heartbeat_at=T0 — 0 rows affected (T1 mismatch). Claim stays held. (Compare-and-set on existing columns, no claim_version migration.)';

// R-3: rewrite mitigation
const r3 = cur.risks.find(r => r.id === 'R-3');
r3.mitigation = 'Compare-and-set: capture {claiming_session_id, claimed_at, heartbeat_at} BEFORE gh pr create; UPDATE uses those captured values in WHERE clause. Re-assert post-capture mutates heartbeat_at → 0 affected rows. AC-1.3 + TS-6 cover this. NO new column / migration needed (validation-agent P1 fix — Option B).';

// Add R-4, R-5 (R-6 dropped under Option B)
cur.risks.push(
  {
    id: 'R-4',
    description: 'ShippingExecutor.js (430 LOC) is moderate-traffic and used by all parallel CC sessions; merge-time conflict risk beyond R-1.',
    mitigation: 'Worktree pre-merge isolation. Single-line addition (one releaseClaimOnPROpen call) at known line ~108-122 has low conflict surface. QF-779 B1 git fetch fix in analyzeGitDiff covers stale-base-ref inflation if merge-time origin/main has advanced.',
  },
  {
    id: 'R-5',
    description: 'Test scenario TS-3 inserts into shared session_coordination table; fixture leakage to other parallel sessions\' /coordinator polls.',
    mitigation: 'Use TEST-CLAIM-LIFECYCLE-* sentinel target_sd prefix for test rows + afterEach cleanup mirroring QF-FIXTURE-LEAK pattern. blocked-state-detector beforeAll self-heal already sweeps TEST-* orphans >1h old (per memory).',
  }
);

// Update metadata: add validation-agent evidence + P1 corrections summary
cur.metadata.sub_agent_evidence.plan_prd_prospective_validation = '1d3d1c5b-da6f-4917-ac45-4921ea546d2e';
cur.metadata.validation_agent_corrections = [
  'P1: rescoped FR-1 version-skew off claim_version (column does not exist) → compare-and-set on (claiming_session_id, claimed_at, heartbeat_at)',
  'P1: FR-3 column corrections — subject → target_sd; payload.event_type → message_type top-level',
  'P1: cut TR-3(c) own-sd_key-early-detect — out of scope, CROSS-HOST FR-7 covers it',
  'Coverage: added AC-1.6 partial-failure, AC-2.6 sd_key_drift return shape, AC-3.6 TTL_remaining formula',
  'Risks: added R-4 ShippingExecutor.js merge surface, R-5 session_coordination fixture leakage; R-6 dropped (no migration under Option B)',
];

const { data, error } = await sb.from('product_requirements_v2')
  .update({
    functional_requirements: cur.functional_requirements,
    technical_requirements: cur.technical_requirements,
    test_scenarios: cur.test_scenarios,
    risks: cur.risks,
    metadata: cur.metadata,
  })
  .eq('id', PRD_ID)
  .select('id,functional_requirements,risks')
  .single();

if (error) { console.error(error); process.exit(1); }
console.log('PRD updated:', data.id, '| FRs:', data.functional_requirements.length, '| risks:', data.risks.length);
