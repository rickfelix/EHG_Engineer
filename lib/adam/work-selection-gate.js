/**
 * SD-LEO-INFRA-ADAM-WORK-SELECTION-001 / FR-3 — WORK SELECTION AT A MECHANICAL CHOKE.
 *
 * WHY THIS EXISTS. Adam is contractually a plan-driven PM whose every "what next" opens from the
 * ratified LEO Roadmap, with leeway to inject higher-priority work. The rubric for that leeway
 * EXISTS (lib/adam/rationale-bar.js) and is sound — and it had ZERO production callers outside its
 * own module: evaluateCandidate and waveAlignmentTerm were reachable only from tests, and
 * selectAdvisory ran once an hour in a cron that emits an ADVISORY. Nothing evaluated "what should
 * Adam do next" against the plan.
 *
 * The contrast that settles the design is in this same codebase, on the same night: the Adam
 * outbound gate BLOCKED two sends because it sits at a mechanical choke that cannot be routed
 * around, while the wave rubric fired zero times because work selection passes through no choke.
 * Adam's own contract already states the principle for the Solomon pre-send consult — "enforced as
 * a gate at the send choke, not left to willpower". Work selection was left to willpower.
 *
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT. It NAMES WHAT INJECTION DISPLACES. It does not
 * block, reorder or veto: ranking authority stays where it is. Injecting higher-priority work is
 * legitimate and explicitly permitted — what was missing is that the displacement was invisible, so
 * "we are working the plan" could never be falsified. A gate that refuses work would be the wrong
 * instrument; a gate that makes the trade legible is the right one.
 *
 * CONTRACT COPIED FROM lib/coordinator/adam-outbound-gate.js (the proven choke):
 *   - a PURE classifier here in lib/, returning { verdict, reasons, checks }
 *   - per-check severity driving warn-vs-pass
 *   - FAIL OPEN at the call site: a gate bug must never block work selection
 * The one departure is deliberate: the outbound gate can 'block' because a bad send is
 * unrecoverable. A mis-ranked SD is recoverable on the next 15-minute tick, so the worst verdict
 * here is 'warn'.
 */

/** Roadmap-evidence markers, single-sourced so the gate and the reason-band cannot drift apart. */
export const ROADMAP_MARKERS = Object.freeze([
  'wave_id', 'roadmap_item_id', 'promoted_from_roadmap', 'plan_key', 'wave_disposition',
]);

/** True when the row carries roadmap evidence ON THE ROW — never inferred from a self-assertion. */
export function isPlanLinked(item) {
  const md = (item && item.metadata) || {};
  if (ROADMAP_MARKERS.some((k) => md[k])) return true;
  return ['plan', 'roadmap_item'].includes(String(md.source || ''));
}

/**
 * The legitimate reasons to inject work ahead of the plan. These are NOT violations — naming them
 * is the point, so a reader can tell "deliberately prioritised" from "nobody checked".
 */
export function injectionKind(item) {
  const md = (item && item.metadata) || {};
  const prov = [md.provenance, md.source, md.sourced_by, md.created_via]
    .filter(Boolean).join(' ').toLowerCase();
  if (md.chairman_directed === true || prov.includes('chairman')) return 'chairman-directed';
  if (/^SD-FDBK-/.test(String(item?.sd_key || '')) || /\bfeedback\b/.test(prov)) return 'feedback';
  if (/incident|\brca\b|corrective|postmortem/.test(prov)) return 'incident';
  return null; // unexplained: injected ahead of the plan with no stated reason
}

/**
 * Evaluate one RANK-ORDERED list of claimable work items against the roadmap.
 *
 * @param {Array<object>} rankedItems  items in the order they will be ranked (index 0 = rank 1)
 * @returns {{ verdict:'pass'|'warn', reasons:string[], checks:object, evaluations:Array<object> }}
 */
export function evaluateWorkSelection(rankedItems) {
  const items = Array.isArray(rankedItems) ? rankedItems : [];
  const evaluations = [];
  let planLinkedTotal = 0;
  let unexplainedInjections = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const linked = isPlanLinked(it);
    if (linked) planLinkedTotal++;
    const kind = linked ? null : injectionKind(it);

    // THE DISPLACEMENT MEASUREMENT: how many plan-linked items does this unlinked item outrank?
    // Counted over items BELOW it, because rank order is the selection decision. An unlinked item
    // at the bottom of the belt displaces nothing; the same item at rank 1 displaces everything
    // plan-linked beneath it, and that is the number worth reading.
    let displaces = 0;
    const displacedKeys = [];
    if (!linked) {
      for (let j = i + 1; j < items.length; j++) {
        if (isPlanLinked(items[j])) {
          displaces++;
          if (displacedKeys.length < 5) displacedKeys.push(items[j].sd_key);
        }
      }
      if (!kind) unexplainedInjections++;
    }

    evaluations.push({
      sd_key: it && it.sd_key,
      rank: i + 1,
      plan_linked: linked,
      injection_kind: kind,
      displaces,
      displaced_sample: displacedKeys,
    });
  }

  const checks = {
    total: items.length,
    plan_linked: planLinkedTotal,
    injected: items.length - planLinkedTotal,
    unexplained_injections: unexplainedInjections,
    plan_linked_share: items.length ? planLinkedTotal / items.length : null,
  };

  const reasons = [];
  // An unexplained injection that displaces NOTHING is not worth a reason line — it sits below the
  // plan work and costs nothing. Only displacement is reportable.
  const displacingUnexplained = evaluations.filter((e) => !e.plan_linked && !e.injection_kind && e.displaces > 0);
  for (const e of displacingUnexplained) {
    reasons.push(`${e.sd_key} ranked #${e.rank} is not plan-linked and carries no stated injection reason, displacing ${e.displaces} plan-linked item(s)`);
  }
  if (items.length && planLinkedTotal === 0) {
    // The measured state on 2026-07-28: 0 of 18 admissions were wave-linked. Said plainly rather
    // than left to be inferred from a share of zero.
    reasons.push(`NO plan-linked work on the belt at all (${items.length} item(s), 0 linked) — every admission is an injection`);
  }

  return { verdict: reasons.length ? 'warn' : 'pass', reasons, checks, evaluations };
}
