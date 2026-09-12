#!/usr/bin/env node
/**
 * LEAD scope correction for SD-LEO-INFRA-WIRE-MODEL-POLICY-001, informed by validation-agent
 * (bbe5505d-8970-42f1-9924-eed669607b9c) and risk-agent (1c58d649-f511-4563-a548-10cfd387f650)
 * LEAD-phase evidence. The original description (written by QF-20260911-878's own author, this
 * same worker, at filing time) assumed a naive wire of lib/fleet/model-policy.cjs's seatClassFor
 * directly into the SessionStart hook. Both sub-agents independently found and measured that this
 * false-positives on the live coordinator seat (is_coordinator:true, no role string -- collapses
 * to 'worker', flags a legitimately Fable-pinned seat). Correcting BEFORE PRD authoring.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-WIRE-MODEL-POLICY-001';

const description = `CORRECTED at LEAD (2026-09-11) by validation-agent + risk-agent evidence -- the original filing assumed a naive wire that both sub-agents independently measured as producing false positives. Read this version, not the filing-time one.

Follow-up to QF-20260911-878 (merged), which shipped lib/fleet/model-policy.cjs (seatClassFor/policyModelFor/checkModelMismatch/recipeLine -- pure, tested, zero runtime consumers today beyond build-session-launch.cjs's spawn-time --model flag) and pinned worker seats to claude-opus-5, role seats to claude-fable-5-1 at spawn.

FR-1 -- SessionStart mismatch SIGNAL (scripts/hooks/capture-session-id.cjs). MUST NOT use model-policy.cjs's seatClassFor directly for classification: it collapses an unknown/absent role to 'worker', which false-positives on the live coordinator seat (metadata.is_coordinator=true, no metadata.role string -- measured live). Use lib/fleet/role-status-identity.cjs's roleVerdictFor({sessionId, supabase}) instead -- the existing three-state ('role'|'worker'|'unknown') classifier built by SD-LEO-INFRA-ROLE-BLIND-SESSION-001 for exactly this ambiguity, DB-first with a file fallback for hook contexts. Signal ONLY on a definitive 'role' or 'worker' verdict; NEVER on 'unknown' (measured: 4 of 10 live seats would fire under the naive approach, only 1 is a genuine true positive).
  - Map the verdict to an expected model via model-policy.cjs's policyModelFor(); compare via coarseModelAlias().
  - On mismatch, write via lib/governance/emit-feedback.js's emitFeedback() (day-salted dedup_hash, insert-or-noop) -- NEVER an UPDATE-based dedup. public.feedback's append-only trigger (SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E) is confirmed LIVE (a live PATCH probe returned P0001) despite its migration header still reading unverified; every UPDATE fails, INSERT is unaffected.
  - Insert as the LAST statement in main(), after upsertSessionRow() and the tick-spawn block, immediately before resolve() -- wrapped in try/catch (mirror the file's existing fail-open idioms: resolveRepoRoot's cwd fallback, findLiveTickPid's null fallback, the marker block's non-fatal catch). A throw here must never block or delay the existing env-file write, identity markers, /current pointer, claude_sessions upsert, or tick-daemon spawn.
  - Time-bounded: the hook's worst-case path already runs ~22s against a 13.5s self-resolve / 15s registered timeout (measured). The new check must add near-zero latency -- a short abort (~1500ms) around the DB round-trip, matching the DEDUP_LOOKUP_TIMEOUT_MS idiom already used in scripts/gauge-runner.mjs.
  - Kill switch: an env var (e.g. LEO_MODEL_POLICY_SIGNAL=0) disables the signal entirely; honor the hook's existing dry-run convention if one exists.
  - Ship as its own revertible commit, separate from FR-2.

FR-2 -- fleet-dashboard "seats off policy" count (scripts/fleet-dashboard.cjs), INDEPENDENT of FR-1 (no shared dependency, can ship separately/first). CORRECTED: 'fleet_health' as a table does NOT exist (PGRST205, confirmed via a real select -- a head+count probe on this same missing table returns count=null with NO error, a known false-"exists" trap, so a real select is the only reliable check). scripts/fleet-dashboard.cjs (3457 lines, npm run fleet:dashboard, actively maintained) already projects session metadata including model per session (~line 338-362 per validation-agent) and needs no new DB read for this -- add role/is_coordinator/non_fleet to the existing metadata projection, classify each session the same way FR-1 does (role-status-identity's verdictFromMetadata, synchronous, no DB round trip needed here since metadata is already in hand), and add one summary line: count of seats currently off their seat-class policy.

Minor/non-blocking, noted for a future DRY pass: model-policy.cjs's coarseModelAlias claims to mirror capture-session-id.cjs's own coarseModelAlias "exactly" -- the no-match fallback differs (null vs raw passthrough) but is behaviorally equivalent on every path reachable through tier-ladder.cjs's normalizeModel today. Not part of this SD's scope.

Verify the premise (roleVerdictFor's exact signature, emitFeedback's exact signature, fleet-dashboard.cjs's current line numbers) against current main before implementing -- line numbers above are a 2026-09-11 snapshot.`;

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update({ description, scope: description })
    .eq('sd_key', SD_KEY)
    .select('id, sd_key');
  if (error) throw new Error(`update failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`no row matched sd_key=${SD_KEY}`);
  console.log(`Corrected ${data[0].sd_key} (${data[0].id}) with validated LEAD-phase scope.`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}
