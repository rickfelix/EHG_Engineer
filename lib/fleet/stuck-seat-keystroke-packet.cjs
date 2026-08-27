/**
 * KEYSTROKE-PACKET RENDERER — SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 FR-4.
 *
 * Turns one STUCK seat record (session_id, silent minutes, window_handle, fleet_identity — the
 * shape fleet-health.cjs's fetch() now produces per FR-3) into a chairman-ready, NUMBERED recovery
 * line. Numbered exact steps, not prose — the chairman has stated a standing preference for
 * numbered exact keystrokes over narrative instructions.
 *
 * FIELD NAMES ARE LOAD-BEARING. TESTING sub-agent (PLAN, prospective) censused 9 live
 * active/idle claude_sessions rows: the originally-scoped fields terminal_identity/callsign are
 * present on 0/9 real rows. The real fields are window_handle (6/9) and fleet_identity (6/9). A
 * renderer built against the wrong names would read undefined on every real seat while a
 * hand-built unit test using those same wrong names stayed green — this module and its test both
 * use window_handle/fleet_identity exclusively.
 *
 * PURE. No I/O, no wall clock — same discipline as stuck-seat-predicate.cjs's classify().
 */

'use strict';

const { extractFleetIdentityLabel } = require('./fleet-identity-label.cjs');

/** Exact fallback string, pinned by FR-4's acceptance criteria (~3/9 real rows lack identity). */
const NO_WINDOW_HANDLE_FALLBACK = 'no window handle available';

/**
 * @param {object} seat - one entry from fleet-health.cjs's `state.stuck[]`:
 *   {session_id, silent, window_handle, fleet_identity}. window_handle/fleet_identity may be
 *   null/undefined — that is the documented ~3/9 case, not an error.
 * @returns {string} a numbered, chairman-ready recovery line.
 */
function renderKeystrokePacket(seat) {
  const sessionId = (seat && seat.session_id) || null;
  const sessionShort = sessionId ? sessionId.slice(0, 8) : 'unknown';
  // D1 fix (EXEC-phase non-prospective TESTING review): fleet_identity is an OBJECT on a live
  // census (28/28 non-null rows: {role, color, callsign, assigned_at, accountUuid8,
  // display_name}), never a bare string — extract .callsign, don't interpolate the object raw.
  const identity = extractFleetIdentityLabel(seat && seat.fleet_identity) || sessionShort;
  // window_handle is real-world a NUMBER (20/20 live rows) — `!= null`, not a truthy check, so a
  // window_handle of 0 is not silently treated as absent.
  const window = (seat && seat.window_handle != null) ? seat.window_handle : NO_WINDOW_HANDLE_FALLBACK;
  const silent = seat && Number.isFinite(seat.silent) ? seat.silent : '?';

  // Step 3's literal keystroke is documented, not guessed, across two pages (corrected citation,
  // EXEC-phase non-prospective TESTING re-review): code.claude.com/docs/en/permissions ("Add a
  // comment when you answer a permission prompt") states "Enter: submits your answer" — Enter is
  // the only confirm keystroke Anthropic's docs confirm. code.claude.com/docs/en/accessibility
  // separately documents that permission prompts are arrow-key-navigable menus. No number-key
  // (1/2/3) behavior is documented on either page, so this does not assert one.
  return [
    `Stuck seat ${identity} (session ${sessionShort}, tool-silent ${silent}m):`,
    `1. Locate window: ${window}`,
    '2. Check for a blocked interactive permission prompt (an expected-prompt-shape: a highlighted Yes/No-style list waiting on input)',
    '3. If a prompt is visible: use arrow keys to highlight "Yes", then press Enter to approve',
    '4. If no prompt is visible and the seat is still silent, terminate the process — it is wedged with nothing to approve'
  ].join('\n');
}

module.exports = { renderKeystrokePacket, NO_WINDOW_HANDLE_FALLBACK };
