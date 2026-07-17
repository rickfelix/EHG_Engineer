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
 *   'work_class_unclassified' — fail-closed: unknown class on a restricted model
 */
function workClassIneligibilityReason(row, sessionModel) {
  const admissible = modelWorkClasses(sessionModel);
  if (!admissible) return null; // unrestricted model (or unknown) — no fence
  const cls = deriveWorkClass(row);
  if (cls === 'any' || admissible.includes(cls)) return null;
  return cls === 'unclassified' ? 'work_class_unclassified' : 'work_class_mismatch';
}

module.exports = { WORK_CLASSES, deriveWorkClass, modelWorkClasses, workClassIneligibilityReason };
