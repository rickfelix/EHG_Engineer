#!/usr/bin/env node
/**
 * PLAN decomposition payload for SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001.
 *
 * WHY THIS SCRIPT EXISTS: lib/sd-creation/source-adapters/child.js:104-106 writes a STUB
 * description ("Child SD of <parent>: <title>") and inherits only category/success_metrics/
 * strategic_objectives/key_principles. Every mechanism detail, file:line root cause and
 * acceptance criterion LEAD confirmed would otherwise be dropped on the floor — which is
 * precisely the defect this SD exists to fix. So the spec is written here, explicitly.
 *
 * Binding LEAD conditions honored:
 *   C1 DECOMPOSE BY MECHANISM — five mechanically disjoint children, no shared code path,
 *      and therefore NO dependencies between them (full parallel claimability).
 *   C2 EVERY ACCEPTANCE CRITERION IS A DETERMINISTIC DB/API ASSERTION — no criterion may
 *      require interviewing a live agent, and none may be an unfalsifiable negative.
 *   C3 INSTANCE 3 PINNED OR DEFERRED EXPLICITLY — pinned as child -E with a binding
 *      out-of-scope list so it cannot become unbounded.
 *
 * Idempotent: re-running overwrites the same fields with the same values.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve .env from the main checkout — this script also runs from a worktree.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '..', '.env') });

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PARENT = 'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001';

const CHILDREN = [
  {
    key: `${PARENT}-A`,
    priority: 'critical',
    mechanism: 'lib/coordinator/signal-router.cjs — inbound aggregation-to-feedback hop',
    description: `INSTANCE 4 — THE CORRECTION ITSELF WAS THE PAYLOAD DESTROYED IN TRANSIT. The purest form of the parent thesis.

=== WHAT HAPPENED (measured, re-verified independently by VALIDATION with zero discrepancies) ===
QF-20260726-425 is literally titled "CORRECTION 2 of 2 TO THE release_sd FIX". Its source signal
(session_coordination id 03236dd9-7706-454c-b988-2751b5696eb3, from session 2b39d318,
2026-07-26T04:54:15Z) is 3145 characters and contains three concrete items with file:line fixes.
The signal-to-feedback-to-QF promoter carried 611 characters of it. It cut off MID-WORD —
"...there happens to be no feature br" — losing every actionable detail, while still stamping the
row CRITICAL and dispatching it. A worker triaging on the row alone can only do one of two wrong
things: build the wrong thing from a fragment, or discard a genuinely critical item as unworkable.

THE FULL TEXT WAS RECOVERABLE THE WHOLE TIME, one table away. The row did not link its source
signal id; it linked a feedback row that was itself already truncated.

=== CONFIRMED ROOT CAUSE — file:line, do not re-derive ===
1. TRUNCATION: lib/coordinator/signal-router.cjs:102-104 reimplements a silent .slice(0, 500)
   with no word-boundary logic. Observed 611 = ~111-char prose prefix + a 500-char slice.
   THE CORRECT POLICY ALREADY EXISTS IN THIS CODEBASE AND WAS NEVER PROPAGATED ONE HOP INWARD:
   scripts/worker-signal.cjs:41-54 (BODY_HARD_CAP=4096, capBody) was fixed by QF-20260710-560 to
   HARD-ERROR instead of silently truncating. Its own comment states the policy: "Hard-error
   instead: caller must split the message, never lose the tail silently." adam-advisory.cjs,
   solomon-advisory.cjs and coordinator-reply.cjs all route through that guard.
   signal-router.cjs DOES NOT IMPORT IT. This is not "we never thought about truncation" — it is
   "we fixed truncation and the fix did not travel", i.e. this SD's thesis applied to itself.
2. NO FORWARD LINK: feedback.metadata (signal-router.cjs:116-128) carries fingerprint, callsigns
   and counts but NO session_coordination row ids. The full text is reachable only in REVERSE via
   payload.routed_to_feedback_id written by stampRouted (:135-149). A reader holding the truncated
   feedback row cannot walk FORWARD to the source.

=== FIX SHAPE ===
(a) Route the inbound hop through the SAME capBody policy that the outbound hop already uses —
    never silently lose the tail. Reuse the existing guard; do not reimplement it.
(b) Write the contributing session_coordination row id(s) into feedback.metadata so a holder of
    the row recovers the full body in ONE query.

=== EXPLICITLY OUT OF SCOPE — the downstream hop is ALREADY CORRECT, do not touch it ===
feedback-fingerprint-promoter.mjs:87-107 embeds source feedback ids, and create-quick-fix.js:334
writes the body verbatim. The defect is entirely in the inbound aggregation hop.

=== ACCEPTANCE (deterministic, per LEAD Condition 2) ===
AC-1 Promote a synthetic CRITICAL signal whose body exceeds 3000 characters. Assert EITHER the
     persisted feedback body length equals the source body length (unclamped), OR feedback.metadata
     contains a source signal id that dereferences to the full source row.
AC-2 Assert no mid-word truncation: the persisted body must not end mid-token relative to source.
AC-3 Assert a reader holding ONLY the promoted row can recover the full original body in one query
     (forward walk), without relying on payload.routed_to_feedback_id (the reverse walk).
AC-4 Regression: a normal short signal still promotes unchanged.`,
  },
  {
    key: `${PARENT}-B`,
    priority: 'critical',
    mechanism: 'lib/fleet/claim-eligibility.cjs — fitnessAxes / isSdExecutableHere extension slot',
    description: `INSTANCE 5 — A CORRECTION THAT WAS DELIVERED, READ, AND STILL DID NOT REACH THE ACTOR THAT
NEEDED IT. Worse than instances 1-3: nothing was lost or refused. The routing worked and the
outcome was still wrong.

=== WHAT HAPPENED (measured; VALIDATION re-verified against live DB and GitHub) ===
The coordinator sent a worker session a message containing the literal sentence "QF-20260726-425
(correction 2 of 2) IS LIVE WITH ALPHA-4 RIGHT NOW". The worker READ it. Later in the same session,
/checkin offered QF-20260726-425 as an unclaimed CRITICAL priority-jump; the worker claimed it and
began implementing — because THE DISPATCHER DOES NOT READ COORDINATOR PROSE. Alpha-4 had already
built both items and had an OPEN PR (#6540, branch qf/QF-20260726-425 at 4fad43f9fea). The
duplicate was discarded rather than pushed.

=== THE GENERALISATION — the sharpest version of the parent thesis ===
A CORRECTION DELIVERED ONLY AS PROSE TO A HUMAN-EQUIVALENT READER IS NOT DELIVERED TO THE MACHINERY
THAT ACTS. Claim eligibility reads claiming_session_id and nothing else — not the coordinator's
message, not the pushed branch, not the open PR. The authoritative correction ("this is taken")
existed in three places the dispatcher cannot see. Corrections that change DISPATCHABILITY must
land in the field dispatch actually reads.

=== CONFIRMED ROOT CAUSE — file:line, do not re-derive ===
There are ZERO git or GitHub references in lib/fleet/claim-eligibility.cjs, claim-guard.mjs, or the
eligibility path of worker-checkin.cjs. Eligibility consults SD columns/metadata, ctx reservations/
tier fields and roadmap_wave_items only.
INSERTION POINT: the fitnessAxes / isSdExecutableHere slot, lib/fleet/claim-eligibility.cjs:375-382
— the designed ctx-gated extension point, which already fails open on fault.

=== A COLUMN-ONLY FIX STILL MISSES IT — this is the detail that decides the design ===
VALIDATION measured that quick_fixes.pr_url and branch_name are NULL even though a real PR exists.
So populating a stored field would NOT have prevented this. The new axis MUST query LIVE git/GitHub
state: a remote branch matching the item id, and an open PR whose head is that branch. Either one
means in-flight, regardless of the claim column.

=== ACCEPTANCE (deterministic, per LEAD Condition 2) ===
AC-1 Stage a QF with a pushed remote branch AND an open PR whose head is that branch, with
     claiming_session_id NULL. Assert eligibility/dispatch EXCLUDES it.
AC-2 Assert exclusion holds when quick_fixes.pr_url and branch_name are both NULL (the measured
     real-world shape) — i.e. the verdict comes from live git/GitHub, not a stored column.
AC-3 FAIL-OPEN: with git/GitHub unreachable or gh unauthenticated, assert the axis does not block
     dispatch fleet-wide (matching the existing fail-open contract at the insertion point).
AC-4 Regression: an item with no branch and no PR remains claimable.`,
  },
  {
    key: `${PARENT}-C`,
    priority: 'high',
    mechanism: 'lib/coordinator/reply-class.cjs alreadyAnswered + scripts/solomon-advisory.cjs buildAdvisoryPayload',
    description: `INSTANCE 2 — REPLY-DEDUP REFUSES A RETRACTION ON THE CORRELATION THAT CARRIED THE ERROR.
HIGHEST LEVERAGE OF THE FIVE: fixing it also retires a documented reader-side workaround.

=== WHAT HAPPENED ===
Solomon published a vitest analysis, then needed to RETRACT it because the prescription would have
run db-class suites against live credentials — a SAFETY retraction — and could NOT post it in the
thread where the error lived. It minted a fresh correlation and named the old ids by hand. Two
agents had independently endorsed the withdrawn prescription; it was pulled minutes before anyone
implemented it, by a human-speed correction racing a machine-speed original.

=== CONFIRMED ROOT CAUSE — file:line, do not re-derive ===
1. THE GATE: scripts/solomon-advisory.cjs:856-863 calls alreadyAnswered
   (lib/coordinator/reply-class.cjs:80-92), which matches ANY row with payload.reply_to =
   correlationId AND payload.kind = ADAM_ADVISORY. Any second message on a correlation is refused
   as "already answered".
2. NO ESCAPE HATCH EXISTS: there is NO retraction / amend / supersede kind in PAYLOAD_KINDS, and
   buildAdvisoryPayload (scripts/solomon-advisory.cjs:109-121) FORCES kind=ADAM_ADVISORY whenever
   replyTo is set, IGNORING --kind. So a sender cannot opt out even deliberately.
3. THE SAME GATE BREAKS THE DOCUMENTED MULTI-PART CONTRACT: CLAUDE_SOLOMON.md:222 promises ordered
   parts (1/2, 2/2) on ONE correlation. lib/coordinator/multi-part-reply.cjs:1-13 records
   (ground-truthed against live rows 2026-07-17) that part 2 must mint a FRESH correlation_id to
   survive dedup, and is reassembled only by a subject-line N/M regex — a reader-side workaround
   for a sender-side bug. A long reply silently loses everything after part 1 unless the sender
   reads the send result.

=== FIX SHAPE ===
(a) Add a retraction/amend/supersede kind to PAYLOAD_KINDS.
(b) Make alreadyAnswered KIND-AWARE so a retraction is never deduped against the answer it retracts.
(c) Stop buildAdvisoryPayload force-overriding kind when replyTo is set — honor an explicit --kind.
Consequence worth stating: parts may then legitimately share one correlation_id, retiring the
subject-regex reassembly workaround CLAUDE_SOLOMON.md:222 already promised was unnecessary.

=== ACCEPTANCE (deterministic, per LEAD Condition 2) ===
AC-1 Post a retraction on a correlation that ALREADY carries an answered ADAM_ADVISORY reply.
     Assert the row is inserted and readable by the same audience as the original.
AC-2 Assert ordered multi-part replies (1/2, 2/2) on ONE correlation_id BOTH persist and are
     retrievable in order without the subject-line N/M regex.
AC-3 Regression: ordinary duplicate-answer dedup still refuses a second plain ADAM_ADVISORY on an
     answered correlation (the guard must narrow, not disappear).
AC-4 Assert an explicit --kind is honored when replyTo is set.`,
  },
  {
    key: `${PARENT}-D`,
    priority: 'high',
    mechanism: 'plan-to-exec/gates/sd-prd-drift.js + the PRD-as-primary read path in EXEC',
    description: `INSTANCE 1 — A SCOPE EDIT AFTER THE PRD EXISTS DOES NOT REACH EXEC. The original flows; the
correction stalls one hop short, silently, with no error and no signal to the author.

=== WHAT HAPPENED ===
A finding reaches a worker via consult -> SD scope -> PRD -> EXEC. Once the PRD exists, editing SD
scope changes nothing the worker will read: the worker builds to the PRD it already holds. Adam hit
this amending SD-LEO-INFRA-DISPATCH-DELIVERY-INTEGRITY-001 mid-EXEC and had to ask the coordinator
to send a directed message instead. The coordinator confirmed it would otherwise have hit the same
wall. The author gets no indication the amendment landed nowhere.

=== CONFIRMED ROOT CAUSE — file:line, do not re-derive ===
1. EXEC reads the PRD as PRIMARY (CLAUDE_EXEC.md:60-69). The SD is consulted only on ambiguity, and
   only for strategic_objectives — never description/scope. So a description/scope amendment is
   invisible to the consumer by construction.
2. The single content-comparison gate, plan-to-exec/gates/sd-prd-drift.js, runs ONCE at
   PLAN-TO-EXEC and is ADVISORY by default (enforcing only when SD_PRD_DRIFT_ENFORCING === 'true').
   An amendment made AFTER that gate has run is never compared against anything again.

=== FIX SHAPE ===
An SD amendment made while a PRD exists must produce a MACHINE-READABLE consequence — not prose to
a human. Either:
  (a) mark the PRD stale/invalidated in a durable field a re-run of the drift gate reads as
      blocking, or
  (b) emit a directed session_coordination row addressed to the SD's claiming_session_id.
Whichever is chosen, the amendment must be detectable by a machine consumer.

=== ACCEPTANCE (deterministic, per LEAD Condition 2) ===
NOTE: the criterion as originally filed ("ask the assigned worker what it is building to") is
NOT acceptable — it requires interviewing a live agent. Substituted with:
AC-1 Amend SD scope/description while the SD is in EXEC with an existing PRD. Assert EITHER a
     durable drift/invalidation marker is written to the PRD row that a re-run of sd-prd-drift.js
     reads as BLOCKING, OR a directed session_coordination row targeting the SD's
     claiming_session_id is created.
AC-2 Assert the amendment is detectable by querying DB state alone — no agent interview, no prose.
AC-3 Assert the author receives a non-silent result: an amendment that reaches no consumer must
     surface an error or warning rather than succeeding quietly.
AC-4 Regression: an SD amended BEFORE any PRD exists still flows normally with no false blocker.`,
  },
  {
    key: `${PARENT}-E`,
    priority: 'medium',
    mechanism: 'lib/eva/feedback-premise-adapter.js checkFeedbackPremiseLiveness (EXTEND, do not invent)',
    description: `INSTANCE 3 — MEASUREMENTS CARRY NO PROVENANCE, so a stale premise keeps flowing after its author
knows better. PINNED per binding LEAD Condition 3 (pin or defer explicitly) WITH A BINDING SCOPE
BOUNDARY, because this was the least specified of the five and the likeliest to become unbounded.

=== WHAT HAPPENED ===
Adam reported PR 778 as CONFLICTING and editing a file the code had moved out of, and argued from
it that an SD must stay open. TRUE WHEN MEASURED. The branch was rebased and merged ~25 minutes
later. The coordinator fenced an SD and drafted a rescope on the strength of the original; the
correction reached it only because Adam happened to re-verify. Nothing marks a measurement as
perishable or notifies its consumers when it expires. A duplicate SD was nearly commissioned
against work already merged.

=== THE SHAPE — four measurement errors in one evening, four parties, one root ===
Each was an unstated assumption about the MEASUREMENT rather than the mechanism:
  - untimestamped counts of a volatile population (the same predicate read 7, then 0, then 1
    within an hour);
  - file:line coordinates published from a checkout 18 commits behind;
  - a bare created_at parsed as local time, shifting every quoted age by four hours;
  - a prescription verified only at its diagnosis, never re-verified before prescription.
A claim carrying WHEN it was taken, from WHICH ref, and in WHAT timezone would have made each of
these self-correcting on arrival rather than requiring a retraction at all. It is cheaper to stamp
provenance than to build retraction plumbing, and the two compose.

=== EXTEND EXISTING MACHINERY — do not invent a subsystem ===
lib/eva/feedback-premise-adapter.js checkFeedbackPremiseLiveness already returns STALE/LIVE and is
already consumed at create-quick-fix.js:236-257. That is the extension point.

=== BINDING SCOPE BOUNDARY (this is what "pinned" means here) ===
IN SCOPE: stamp provenance — measured_at (UTC, explicit offset), the git ref/sha the measurement
was taken from, and timezone — on claims at the point they are RECORDED; surface perishability
through the EXISTING liveness adapter.
EXPLICITLY OUT OF SCOPE, and a PR touching these should be rejected as scope creep: a general
notification or subscription system for measurement consumers; new tables; new TTL configuration
surfaces; any change to retraction delivery (that is children -A through -D).

=== ACCEPTANCE (deterministic, per LEAD Condition 2) ===
AC-1 Record a claim carrying measured_at + ref. Advance the underlying state so the measurement is
     no longer true. Assert checkFeedbackPremiseLiveness returns STALE for it.
AC-2 Assert create-quick-fix.js surfaces that STALE verdict at its existing consumption point.
AC-3 Assert a timestamp is stored with an explicit UTC offset such that age computed from it is
     timezone-independent (the four-hour-shift failure cannot recur).
AC-4 Regression: a fresh measurement still reads LIVE and is not falsely flagged.`,
  },
];

async function main() {
  const { data: parent } = await sb
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type')
    .eq('sd_key', PARENT)
    .maybeSingle();

  if (!parent) throw new Error(`parent not found: ${PARENT}`);
  console.log(`parent ${parent.sd_key} sd_type=${parent.sd_type}`);

  for (const c of CHILDREN) {
    const successCriteria = c.description
      .split('\n')
      .filter((l) => /^AC-\d/.test(l.trim()))
      .map((l) => l.trim());

    const patch = {
      description: c.description,
      scope: c.description,
      priority: c.priority,
      success_criteria: successCriteria.map((s) => ({
        criterion: s.replace(/^AC-\d+\s*/, '').slice(0, 160),
        measure: 'Deterministic DB/API assertion — LEAD Condition 2 (no agent interview, no unfalsifiable negative)',
      })),
    };

    const { error } = await sb
      .from('strategic_directives_v2')
      .update(patch)
      .eq('sd_key', c.key);

    if (error) {
      console.error(`  ✗ ${c.key}: ${error.message}`);
      continue;
    }

    // Mechanism + provenance stamps live in metadata, merged not clobbered.
    const { data: row } = await sb
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('sd_key', c.key)
      .maybeSingle();

    await sb
      .from('strategic_directives_v2')
      .update({
        metadata: {
          ...(row?.metadata || {}),
          mechanism: c.mechanism,
          decomposed_by: 'PLAN (Alpha-2)',
          decomposition_rule: 'LEAD Condition 1 — one child per disjoint mechanism',
          lead_conditions_honored: ['C1-decompose-by-mechanism', 'C2-deterministic-acceptance', 'C3-instance-3-pinned'],
          // Disjoint mechanisms: deliberately NO sibling dependencies, so all five are
          // claimable in parallel (minimal-real-dependency rule).
          sibling_dependencies: 'none — mechanisms are disjoint by construction',
        },
      })
      .eq('sd_key', c.key);

    console.log(`  ✓ ${c.key}  [${c.priority}]  ACs=${successCriteria.length}  desc=${c.description.length}c`);
  }
}

main().catch((e) => {
  console.error('fatal:', e.message);
  process.exit(1);
});
