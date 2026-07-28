#!/usr/bin/env node
/**
 * One-off: LEAD scope correction for SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001.
 *
 * Closes the two BLOCKING conditions on the VALIDATION LEAD evidence row
 * (817946d3-14ac-4c40-bb97-83cbbe3ce68d, CONDITIONAL_PASS):
 *   1. two COMPLETED SDs already ship remedies for instances 1 and 6 — add to do-not-duplicate
 *   2. the population must not be swept mechanically — name the exemption categories
 *
 * Original description is PRESERVED below the correction. The point of a correction is to stop the
 * next reader inheriting a stale premise, not to erase the evidence trail that produced it.
 */
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001';

const CORRECTION = `*** LEAD SCOPE CORRECTION 2026-07-28 (Alpha-4, worker 39aa8a1e). READ BEFORE PLANNING. TWO OF THE TEN INSTANCES ARE ALREADY FIXED, AND THE POPULATION MUST NOT BE SWEPT MECHANICALLY. ***

=== A. ALREADY SHIPPED — ADD TO do-not-duplicate BEFORE SCOPING ANYTHING ===
Found by querying for overlap rather than assuming the instance list was current:
  - SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 (status=COMPLETED) already ships exact-head-count,
    paginated bulk read, and count-null-fail-loud. THAT IS THE REMEDY FOR INSTANCE 6 (the PostgREST
    1000-row cap). Do not re-scope it.
  - SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A (status=COMPLETED) already ships the capBody
    propagation fix for INSTANCE 1 (mid-word promotion-pipeline truncation, QF-20260726-425).
    lib/shared/body-cap.cjs credits this SD in its own header.
  - QF-20260727-709 (status=COMPLETED) added an addressee to buildPreSendConsultBody — but as an
    OPTIONAL bolt-on parameter, NOT the typed constructor this SD proposes. The Class B half of this
    SD therefore remains genuinely non-redundant. Verified in code.
  - SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (status=DRAFT, not started) IS this SD's own fourth
    named Class B instance, already living as an independent sibling row. Two rows, one defect, and
    the relationship was unstated. PLAN must decide: fold, depend on, or explicitly divide.

=== B. THE POPULATION IS HETEROGENEOUS. A MECHANICAL SWEEP WOULD BREAK WORKING CODE. ===
Measured across lib/, scripts/, server/ (non-test). Raw regex counts range 114-438 depending on
tightness, and that spread is itself the argument: this cannot be sorted by pattern-match alone.

  KIND 1 — GENUINE HAZARD (~43 live, ~50 before excluding archived duplicates). An EXISTING
    identifier shortened for display and re-consumable as input. THIS IS THE ONLY FIX SET.
  KIND 2 — MINTING, NOT TRUNCATING (17 sites). randomUUID().slice(0,8) CONSTRUCTS a new short id.
    No full value is hidden. "Fixing" these BREAKS ID GENERATION.
  KIND 3 — DELIBERATE DERIVED LABEL (9 sites). sim/<8> git branch names (lib/genesis/
    branch-lifecycle.js), PAT-<category>-<8> pattern ids (lib/sub-agents/rca.js:487). These are keys
    in their own right, not abbreviations of a value anyone reconstructs.
  KIND 4 — GIT COMMIT SHA PREFIXES (~19 sites). EXEMPT BY DESIGN, and this one is subtle enough to
    state explicitly: a short SHA structurally matches the hazard definition, BUT GIT ITSELF resolves
    an unambiguous prefix to the correct object, or refuses on ambiguity. No guessing occurs, so no
    fabrication is possible. Session and correlation ids have NO prefix-resolve — an exact string
    match against a UUID column is the only lookup — which is precisely WHY they fabricate and SHAs
    do not. Name this exemption or 19 call sites get re-litigated individually.
  FALSE POSITIVE — ARRAY CAP, NOT STRING TRUNCATION. lib/coordinator/detectors.cjs:71 and :95 do
    .map(c => c.session_id).filter(Boolean).slice(0, 10) — the slice caps the ARRAY to 10 elements
    and every session_id inside is FULL LENGTH. Filter these before trusting any count.

=== C. FIVE KIND-1 SITES ARE ALREADY COMPLIANT — DO NOT OVER-COUNT THE FIX SET ===
scripts/coordinator-reply.cjs:53, lib/npm-install-lock.cjs:75, server/routes/fleet-panel.js:108,
scripts/worker-signal.cjs:403 and :571. Each already keeps the full value where it matters.

=== D. CORRECTION TO THIS SD'S OWN PRESCRIPTION — THE LITERAL FORMAT HAS NO PRECEDENT ===
The SD mandates printing id=<full> (short: abcd1234). NOTHING in this codebase does that verbatim.
The pattern that demonstrably WORKS, in all five compliant sites above, is different and better:
THE FULL VALUE GOES IN THE MACHINE-CONSUMED FIELD (payload, DB column, API response) AND THE SHORT
FORM APPEARS ONLY IN A HUMAN LABEL THAT NOTHING PARSES.
coordinator-reply.cjs is the model: the subject line carries a short correlation prefix for
legibility, while buildReplyPayload stamps the FULL correlationId into payload.reply_to and
payload.correlation_id — and payload.reply_to is what worker-signal.cjs:318 actually matches on. The
short form is decorative and never re-consumed. PLAN should adopt this observed pattern rather than a
literal output format, or it churns ~43 call sites into a shape with no precedent.

=== E. DECOMPOSITION IS REQUIRED, WITH A NATURAL SPLIT ===
Kind 1 alone is ~43 live sites across ~25 files with materially different call shapes (CLI table
renderers, coordination-message bodies, log lines, a session hook) — past the <=100 LOC target.
  CHILD 1 (highest value, smallest): the fleet identity roster family.
    scripts/assign-fleet-identities.cjs :648 :674 :737 (roster rows, w.session_id.substring(0,12)
    followed by "...") plus sibling diagnostics :523 :575 :712 :732. The roster title prints at :643.
    This is the exact producer the SD blames for the coordinator's fabricated-id
    DISPATCH_TARGET_UNKNOWN.
    INCLUDE TWO MORE, both matching the incident narrative directly:
      scripts/hooks/session-role-orient.cjs:82 — prints "coordinator session=<8 chars>" into the
        [ROLE] orientation line delivered to EVERY WORKER AT SESSION START, with no full id anywhere
        in the hook. A worker addressing the coordinator from that string reproduces the
        printed-success-threaded-to-nothing failure exactly.
      scripts/coordinator-hourly-review.cjs:326 — prints correlation=<8 chars> in the Solomon leg of
        the hourly review; the most likely literal source of the copied --reply-to prefix.
        scripts/fleet-dashboard.cjs:2236 is a byte-identical duplicate.
  CHILD 2: the scripts/stale-session-sweep.cjs cluster — ~20 sites, one file, mechanically uniform.
  CHILD 3+: the remaining ~20 scattered single/double-site files, batchable by directory.

=== F. NOT SWEPT, STATED SO IT IS NOT MISTAKEN FOR ZERO ===
The triage covered session_id, correlation_id, sha/commit, uuid/randomUUID, PAT-, sim/ and
accountUuid8. It did NOT sweep feedback c.id, qf_id, sd_key, worktree hash, or token/key families — a
plausible further ~15-20 kind-1/kind-3 sites. Absence of a finding there is absence of a look.

=== ORIGINAL DESCRIPTION AS FILED (PRESERVED; INSTANCES 1 AND 6 SUPERSEDED PER SECTION A) ===

`;

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error: readErr } = await supabase
    .from('strategic_directives_v2').select('id, description, metadata').eq('sd_key', SD_KEY).maybeSingle();
  if (readErr) throw new Error(`read failed: ${readErr.message}`);
  if (!row) throw new Error('SD not found');

  if (String(row.description || '').includes('LEAD SCOPE CORRECTION 2026-07-28')) {
    console.log('Already corrected (idempotent no-op).');
    return;
  }

  const metadata = {
    ...(row.metadata || {}),
    lead_scope_correction_20260728: {
      at: new Date().toISOString(),
      by: 'Alpha-4 (worker 39aa8a1e)',
      closes: 'VALIDATION LEAD evidence 817946d3-14ac-4c40-bb97-83cbbe3ce68d (CONDITIONAL_PASS) — both blocking conditions',
      already_shipped_do_not_duplicate: [
        'SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 (completed) — covers instance 6, PostgREST 1000-row cap',
        'SD-LEO-INFRA-CORRECTION-DELIVERY-PATH-001-A (completed) — covers instance 1, mid-word promotion truncation',
        'QF-20260727-709 (completed) — addressee added as OPTIONAL bolt-on; Class B typed constructor still non-redundant',
        'SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (draft) — sibling row IS this SD 4th Class B instance; PLAN must fold/depend/divide',
      ],
      triage_counts: { kind1_hazard_live: 43, kind2_minting: 17, kind3_derived_label: 9, kind4_git_sha_exempt: 19, already_compliant: 5 },
      exempt_categories: 'KIND 2 minting, KIND 3 derived labels, KIND 4 git SHA prefixes (git resolves unambiguous prefixes; session ids have no prefix-resolve), and array-cap false positives (detectors.cjs:71,95).',
      prescription_correction: 'The literal id=<full> (short: abcd1234) form has NO precedent. Observed working pattern: full value in the machine-consumed field, short only in an unparsed human label. Model: coordinator-reply.cjs:53 + buildReplyPayload.',
      decomposition: 'REQUIRED. Child 1 = fleet identity roster family + session-role-orient.cjs:82 + coordinator-hourly-review.cjs:326. Child 2 = stale-session-sweep.cjs cluster. Child 3+ = scattered remainder.',
      evidence_rows: ['817946d3-14ac-4c40-bb97-83cbbe3ce68d (VALIDATION)', '3254fd2c-257d-4139-9cbc-05f72d910053 (Explore)'],
    },
  };

  const { error: updErr } = await supabase.from('strategic_directives_v2')
    .update({ description: CORRECTION + String(row.description || ''), metadata })
    .eq('sd_key', SD_KEY);
  if (updErr) throw new Error(`update failed: ${updErr.message}`);
  console.log('LEAD scope correction applied to', SD_KEY);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
