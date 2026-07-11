/**
 * Gauge-trust map C6 (SD-LEO-INFRA-CHAIRMAN-GAUGE-FABRICATIONS-FIX4-001).
 *
 * A single source of truth for the "all clear" claim in scripts/adam-exec-summary.mjs's
 * subject/plaintext/HTML renders. nActions===0 covers two distinct cases the caller must not
 * conflate: "the chairman_pending_decisions read returned zero rows" versus "the read failed
 * and rows fell back to []" -- the two must never render identically. Rendering "all clear" on
 * a read failure is exactly the FABRICATED-on-failure class this audit exists to close.
 */

/**
 * @param {{nActions: number, decisionsReadFailed: boolean}} params
 * @returns {{subject: string, plaintext: string, html: string}}
 */
export function resolveActionsStatusLabel({ nActions, decisionsReadFailed }) {
  if (nActions) {
    const word = nActions === 1 ? 'action' : 'actions';
    return {
      subject: `${nActions} ${word} for you`,
      plaintext: `${nActions} ${word} for you`,
      html: `${nActions} ${word} for you`,
    };
  }
  if (decisionsReadFailed) {
    return {
      subject: 'decisions status unknown',
      plaintext: 'Decisions status unknown (read failed this run — will retry).',
      html: 'Decisions status unknown (read failed this run — will retry).',
    };
  }
  return {
    subject: 'all clear',
    plaintext: 'No decisions need you right now.',
    html: 'No decisions need you right now.',
  };
}
