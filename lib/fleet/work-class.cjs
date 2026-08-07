/**
 * work-class.cjs — the orthogonal work-class capability axis
 * (SD-LEO-INFRA-WORK-CLASS-CLAIM-001).
 *
 * min_tier_rank is a linear FLOOR ("at least this strong"); it cannot express
 * "Fable-only" or "Fable must not take general work" — Fable is an orthogonal
 * capability (creative/design/authoring), not a bigger number. This module is
 * the SSOT for that second axis.
 *
 * ONE-DISCRIMINANT contract (the G1 dual-flag lesson): only
 * metadata.work_class_override is ever STORED; the effective class is always
 * DERIVED on read via deriveWorkClass(). No computed copy is persisted
 * anywhere. Likewise modelWorkClasses() is the only model→classes accessor:
 * today a static doctrine map; when model_capability_reference carries
 * trusted_for_routing=true graded rows (SD-LEO-INFRA-MODEL-CAPABILITY-EVAL-001)
 * this function is where they take over — callers never change.
 */

// C-ENUM: metadata has no DB enum, so the allow-list lives here. Anything else
// stored in work_class_override is treated as unclassified (loud via breadcrumbs).
const WORK_CLASSES = Object.freeze(['creative_design', 'general_harness', 'any']);

// Recall-tuned signals (C-STARVE): creative detection errs toward ADMITTING
// plausibly-creative work for Fable; only clearly-general work is hard-denied.
const CREATIVE_RE = /\b(design|creative|brand|branding|ux|ui\s|visual|aesthetic|copywrit|narrative|author(?:ing)?|storytell|landing\s+page|hero\s|logo|palette|typograph|art\s?direction|vision|architect(?:ure)?\s+(?:review|design)|pre-?mortem|adversarial\s+review|taste)\b/i;
const GENERAL_RE = /\b(fix|bug|harness|migration|lint|cleanup|refactor|pipeline|cron|gate|dispatch|claim|sweep|retention|telemetry|logging|ci\b|test\s+fail|flaky|dependency|upgrade|schema|rls|backfill|reaper|heartbeat|checkin|worktree)\b/i;

/**
 * Pure: effective work class for a claimable item (SD row or quick_fixes row).
 * Returns 'creative_design' | 'general_harness' | 'any' | 'unclassified'.
 * Precedence: validated explicit override > signal derivation > unclassified.
 */
function deriveWorkClass(row) {
  if (!row) return 'unclassified';
  const md = row.metadata || {};
  if (WORK_CLASSES.includes(md.work_class_override)) return md.work_class_override;

  const text = [row.title, row.description, row.sd_type, row.category]
    .filter((v) => typeof v === 'string').join(' \n ');
  if (!text.trim()) return 'unclassified';

  const creative = CREATIVE_RE.test(text);
  const general = GENERAL_RE.test(text);
  if (creative && !general) return 'creative_design';
  if (general && !creative) return 'general_harness';
  // Mixed signals: recall-tuned toward creative admission (C-STARVE) — a
  // design-heavy harness SD is legitimate Fable territory; hard-deny is
  // reserved for unambiguously-general work.
  if (creative && general) return 'creative_design';
  return 'unclassified';
}

/**
 * Model → admissible work classes. Returns null for "unrestricted" (every
 * class admissible) — which is every non-Fable model and any unknown/absent
 * model string, so the fence is a no-op wherever model identity is uncertain
 * (C-AC5: non-Fable behavior byte-identical).
 *
 * Upgrade path (do NOT add a parallel map): when model_capability_reference
 * has trusted_for_routing=true rows for a model, derive its lanes from those
 * graded shapes here.
 */
function modelWorkClasses(model) {
  if (typeof model !== 'string') return null;
  if (/fable/i.test(model)) return ['creative_design', 'any'];
  return null;
}

/**
 * Pure fence predicate shared by the SD axis and the QF filter.
 * Returns null (admissible) or a reason string:
 *   'work_class_mismatch'     — item is a class this model must not take
 *
 * QF-20260807-195 (feedback 8740004e / signal 8cf4545b): 'unclassified' NO LONGER FENCES.
 *
 * This module stated one policy and implemented its opposite. C-STARVE above says creative
 * detection "errs toward ADMITTING plausibly-creative work for Fable; only clearly-general work
 * is hard-denied" — but text matching NEITHER regex returned 'unclassified', and this function
 * turned that into a NON-NULL reason, which IS a fence. So the default for no-signal text was
 * DENY: the exact inverse of the stated policy, and the recall-tuning only ever reached rows that
 * had ALREADY matched CREATIVE_RE. The doc line here used to say "fail-closed", so the module
 * carried two contradictory statements of intent and the deny half won silently.
 *
 * Measured: a Fable seat idled repeatedly against a 21-item belt while 3 rows sat
 * work_class_unclassified. Two-sided controls confirmed the classifier itself is sound
 * (clearly-creative -> creative_design, clearly-general -> general_harness), so this was purely
 * the no-signal default polarity.
 *
 * ADMIT-OR-SURFACE, NEVER SILENT-FENCE: unclassified is admissible, and
 * workClassAdmissionNote() below exists so a caller can SAY it was admitted-without-signal.
 * Admitting silently would trade one invisible behaviour for another.
 *
 * SCOPE: the classifier only. requires_human_action / chairman-axis holds are an INDEPENDENT
 * fence — this change neither clears nor weakens them, by construction: it returns a work-class
 * verdict and nothing else.
 */
function workClassIneligibilityReason(row, sessionModel) {
  const admissible = modelWorkClasses(sessionModel);
  if (!admissible) return null; // unrestricted model (or unknown) — no fence
  const cls = deriveWorkClass(row);
  if (cls === 'any' || admissible.includes(cls)) return null;
  // Only a POSITIVE mismatch fences. No-signal text is not evidence of a wrong class.
  if (cls === 'unclassified') return null;
  return 'work_class_mismatch';
}

/**
 * QF-20260807-195: the SURFACE half of admit-or-surface. Returns 'admitted_unclassified' when a
 * restricted model is being handed an item whose class could not be derived, else null.
 *
 * Deliberately a SEPARATE function rather than a second return value from the fence predicate:
 * that predicate is a first-truthy-wins ladder where the return channel IS control flow, so
 * smuggling a non-fencing note through it would make the note indistinguishable from a fence.
 */
function workClassAdmissionNote(row, sessionModel) {
  if (!modelWorkClasses(sessionModel)) return null;
  return deriveWorkClass(row) === 'unclassified' ? 'admitted_unclassified' : null;
}

module.exports = {
  WORK_CLASSES, CREATIVE_RE, GENERAL_RE,
  deriveWorkClass, modelWorkClasses, workClassIneligibilityReason, workClassAdmissionNote,
};
