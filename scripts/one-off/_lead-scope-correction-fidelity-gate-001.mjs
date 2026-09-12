import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-FIX-IMPLEMENTATION-FIDELITY-GATE-001';

const scopeNote = `LEAD scope correction (2026-09-11, verified via direct code inspection of scripts/modules/handoff/gates/fr-delivery-classifier.js + fr-delivery-traceability-gate.js + git history, plus a re-read of scripts/modules/implementation-fidelity/preflight/index.js's checkAmbiguityResolution -- this SD was escalated from QF-20260903-881 whose "VERIFY-FIRST" pre-implementation check applies to a full SD exactly as it does to a quick-fix):

CORRECTED DEFECT 1 (GATE2_IMPLEMENTATION_FIDELITY / preflight ambiguity check "word-matches PRD text while claiming to scan code"): NOT LIVE against current code. checkAmbiguityResolution() resolves the SD's implementing repo, runs \`git log --all --grep=<SD UUID|sd_key>\` to find the commit, then \`git show <hash>\` and scans only ADDED lines (addedLinesForAmbiguityScan) against the ambiguity-marker regex list -- it genuinely reads a code diff, not PRD text. The specific defect the QF's proof pointed at (gate-reported count of 1 matched the PRD's occurrence count, not the 3 occurrences in scripts/adam-quiet-tick.mjs) was a real but DIFFERENT bug, already fixed under SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 (merged 2026-09-05, before this QF's re-verification today). No further code change needed for this half; closed here as verified-superseded rather than silently dropped from the original ticket.

CORRECTED DEFECT 2 (FR_DELIVERY_TRACEABILITY "cannot see code-level delivery, so every code-only requirement reads Undelivered" -- the QF's explicit, unresolved ask: "establish what it reads before proposing a fix; do not assume"): CONFIRMED LIVE, but narrower than the QF's framing suggested. classifyFrDelivery() already reads two signals per FR -- a validated/completed user_story whose text references the FR id, OR a structurally FR-id-matched TESTING sub_agent_execution_results.metadata.fr_coverage entry -- and when NEITHER exists anywhere in the SD (has_work_product=false: zero validated stories, zero matched testing_evidence), it deliberately and correctly reports UNDELIVERED rather than laundering the SD into a non-blocking UNVERIFIABLE state (this is documented, intentional, and pinned by an existing hard-fail test). That per-FR classification, and its "nothing was built or validated against this FR" evidence text, are already accurate.

The REAL, remaining, narrow gap is one layer up: projectGateResult()'s AGGREGATE warning/issue message (fr-delivery-classifier.js, the undeliveredList line) is a single hardcoded string -- "<gate>: N/T FR(s) UNDELIVERED -- this SD does use the FR-reference convention (sibling FRs are referenced), so these are genuinely missing" -- emitted identically whether has_work_product is true (a real gap: the SD demonstrably uses the convention and this FR just was not linked) or FALSE (the SD has zero delivery-tracking signal at all -- typical of pure code-only / infrastructure SDs -- so nothing about "genuinely missing" or "sibling FRs are referenced" is actually true there). This conflation is precisely the QF's ask: the deliverables check should state, as its own distinguishable finding with a count, when it could not observe code-level delivery at all, rather than reusing language that implies a confirmed gap.

CORRECTED FIX (narrow, ~30-50 LOC, reporting-accuracy only -- no change to enforcement/blocking semantics, still governed by LEO_FR_TRACEABILITY_ENFORCE, still warn-only by default): branch the aggregate UNDELIVERED message in projectGateResult() on classification.has_work_product -- when false, emit a distinct, honest message and count ("N/T FR(s) could not be measured for code-level delivery at all -- no validated story and no matched TESTING evidence exist for this SD, so nothing here is confirmed missing or confirmed delivered") instead of the current always-"genuinely missing" phrasing; keep the existing message verbatim for the has_work_product=true case, which is correct and already covered by tests. Add regression tests pinning both message branches (tests/unit/handoff/gates/fr-delivery-traceability-gate.test.js and/or fr-delivery-classifier.test.js) so the distinction cannot regress silently.

Net: of the QF's 2 stated defects, 1 was verified not reproducible against current code (superseded by prior work), and the other survives but is corrected from an open-ended "establish what it reads" investigation (already well-instrumented) down to a specific, narrow reporting-accuracy fix at one call site.`;

const newDescription = `Expected: FR_DELIVERY_TRACEABILITY's aggregate UNDELIVERED reporting distinguishes a genuinely-missing FR (this SD demonstrably uses the FR-reference convention via sibling FRs, but this one was not linked) from a code-only SD with zero delivery-tracking signal at all (no validated story, no matched TESTING fr_coverage evidence anywhere in the SD) -- the latter is stated as its own honest finding, with its own count, rather than reusing "sibling FRs are referenced, so these are genuinely missing" language that is false in that case.
Actual: scripts/modules/handoff/gates/fr-delivery-classifier.js's projectGateResult() emits one hardcoded message for both cases, falsely claiming "this SD does use the FR-reference convention (sibling FRs are referenced)" even when has_work_product is false and no such convention or sibling reference exists anywhere in the SD.

NOTE (LEAD scope correction -- see metadata.lead_scope_correction for the full derivation): the ORIGINAL ticket's first defect (GATE2_IMPLEMENTATION_FIDELITY word-matching PRD text while claiming to scan code) was verified NOT reproducible against current code -- it genuinely reads git-diff ADDED lines, and the real underlying bug the ticket's proof pointed at was already fixed under SD-LEO-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 (merged 2026-09-05). This SD's scope is corrected to cover only the second, confirmed-still-live defect, itself narrowed from an open-ended "establish what it reads" investigation down to the specific aggregate-message conflation described above.`;

const { error: descErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    description: newDescription,
    scope_reduction_percentage: 40,
  })
  .eq('sd_key', SD_KEY);
if (descErr) { console.error('description update error:', descErr); process.exit(1); }

const { data: row, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();
if (fetchErr) { console.error('fetch error:', fetchErr); process.exit(1); }

const newMetadata = { ...(row.metadata || {}), lead_scope_correction: scopeNote };
const { error: metaErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata })
  .eq('sd_key', SD_KEY);
if (metaErr) { console.error('metadata update error:', metaErr); process.exit(1); }

console.log('OK: description corrected, scope_reduction_percentage=40, metadata.lead_scope_correction recorded for', SD_KEY);
