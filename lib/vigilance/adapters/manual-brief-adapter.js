/**
 * Manual chairman/analyst-brief adapter — SD-LEO-ORCH-OPERATING-COMPANY-SPINE-001-F FR-2.
 *
 * The Phase-0 design doc's option (c): the chairman/analyst supplies the exact same fact a
 * future automated source would fetch, just manually. Carved IN-SCOPE and UNGATED (it chooses
 * no automated source), making it the concrete, testable acceptance vehicle for the watcher
 * framework — ships a real, demonstrable watcher rather than an empty adapter shell.
 *
 * Adapter shape mirrors lib/creative/providers/runway.js: isConfigured() + submit(input).
 * A manual brief always has an attesting human, never a URL to fetch — its provenance kind is
 * always ATTESTED (see lib/vigilance/provenance.js).
 */

/** Always available — no credential/config required for a human-supplied brief. */
export function isManualBriefConfigured() {
  return true;
}

/**
 * Submit a manual competitor/market brief.
 * @param {object} input
 * @param {string} input.subjectType - e.g. 'competitor', 'market_thesis'
 * @param {string} input.subjectId - the watched subject's identifier/name
 * @param {string} [input.thesis] - the thesis this observation bears on
 * @param {string} input.summary - the brief content (required — no empty briefs)
 * @param {string} input.attestedBy - identity of the chairman/analyst attesting this fact
 * @param {string} [input.capturedAt] - ISO timestamp; defaults to now
 * @param {string|null} [input.ventureId]
 * @param {object} [input.payload] - additional structured fields to carry through
 * @returns {Promise<object>} normalized observation (consumed by watcher-framework.js)
 */
async function submit(input = {}) {
  if (!input.subjectType || !input.subjectId) {
    throw new Error('manual-brief-adapter.submit requires subjectType and subjectId');
  }
  if (!input.summary) {
    throw new Error('manual-brief-adapter.submit requires a non-empty summary');
  }
  if (!input.attestedBy) {
    throw new Error('manual-brief-adapter.submit requires attestedBy (the chairman/analyst identity)');
  }
  return {
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    thesis: input.thesis ?? null,
    summary: input.summary,
    ventureId: input.ventureId ?? null,
    provenanceKind: 'ATTESTED',
    attestedBy: input.attestedBy,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    payload: input.payload ?? {},
  };
}

export const manualBriefAdapter = Object.freeze({
  isConfigured: isManualBriefConfigured,
  submit,
});
