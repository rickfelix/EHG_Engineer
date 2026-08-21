/**
 * @vitest-environment jsdom
 *
 * SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 / FR-1, AC-3: proves the spawn panel renders the
 * server-computed amber stale-holder label for a genuinely stale holder. A live click-through
 * screenshot is not practical here: the "Add session" flow drives native window.prompt() dialogs,
 * and this repo's browser-automation guidance explicitly avoids triggering those (they block
 * automation from receiving any further commands). A rendered-DOM assertion is the EQUIVALENT
 * CAPTURE the AC allows for -- reproducible in CI, unlike a one-off manual screenshot, and
 * following the exact jsdom pattern already established for this panel's sibling, session-view.js
 * (see session-view.test.js).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function mountRoot() {
  document.body.innerHTML = '<main id="fleet-panel"></main>';
}

async function loadModule() {
  vi.resetModules();
  return import('./fleet-panel.js');
}

function stubFetchSequence({ addSessionResponse, addSessionOk = true }) {
  const fetchMock = vi.fn((url) => {
    if (String(url).endsWith('/api/fleet-actions/add-session')) {
      return Promise.resolve({
        ok: addSessionOk,
        status: addSessionOk ? 200 : 400,
        json: () => Promise.resolve(addSessionResponse),
      });
    }
    // GET /api/fleet-panel's initial + post-action refresh -- empty manifest is fine, not under test.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sessions: [], accountChips: [], attentionStrip: [] }),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('FR-1, AC-3: the amber stale-holder line renders in the panel', () => {
  beforeEach(() => {
    mountRoot();
    vi.stubGlobal('FleetPanelFormat', {
      badgeClassFor: () => '',
      formatChipPct: () => '',
      fallbackText: (v) => v ?? '—',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a genuinely stale Adam holder: the server uiLabel ("Replace the stale Adam") reaches the rendered status line', async () => {
    stubFetchSequence({
      addSessionResponse: {
        live: false,
        invocation: { role: 'adam', callsign: 'adam' },
        callsign: 'adam',
        callsign_minted: false,
        uiLabel: 'Replace the stale Adam',
        uiEnabled: true,
        holderIsFresh: false,
      },
    });
    vi.stubGlobal('prompt', vi.fn().mockReturnValueOnce('adam').mockReturnValueOnce('adam'));

    await loadModule();
    await Promise.resolve(); await Promise.resolve(); // flush the initial refresh() fetch

    const addButton = Array.from(document.querySelectorAll('.fp-button')).find((b) => b.textContent === 'Add session');
    expect(addButton).toBeTruthy();
    addButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    // Flush: prompt() (sync) -> callAction's fetch -> .json() -> refresh()'s own fetch -> .json()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    const statusLine = document.querySelector('.fp-status-line');
    expect(statusLine.textContent).toBe('Session added. (Replace the stale Adam)');
  });

  it('a plain worker spawn (no singleton label of interest): the generic done-message renders unchanged', async () => {
    stubFetchSequence({
      addSessionResponse: {
        live: false,
        invocation: { role: 'worker', callsign: 'Hotel-1' },
        callsign: 'Hotel-1',
        callsign_minted: false,
        uiLabel: 'Start a worker',
        uiEnabled: true,
        holderIsFresh: false,
      },
    });
    vi.stubGlobal('prompt', vi.fn().mockReturnValueOnce('Hotel-1').mockReturnValueOnce('worker'));

    await loadModule();
    await Promise.resolve(); await Promise.resolve();

    const addButton = Array.from(document.querySelectorAll('.fp-button')).find((b) => b.textContent === 'Add session');
    addButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    const statusLine = document.querySelector('.fp-status-line');
    // Still plain-data rendering (not suppressed by role) -- proves this is NOT a client-side
    // singleton check, just "was a uiLabel present in the response".
    expect(statusLine.textContent).toBe('Session added. (Start a worker)');
  });

  it('a refused (400) spawn: the reason renders exactly as before -- this FR does not touch the refusal path', async () => {
    stubFetchSequence({
      addSessionResponse: {
        ok: false,
        reason: 'a live Adam already holds this role (session fresh-ad, last heartbeat 3s ago); spawning a second one would be refused at registration',
        uiLabel: 'Adam is live',
        uiEnabled: false,
        holderIsFresh: true,
      },
      addSessionOk: false,
    });
    vi.stubGlobal('prompt', vi.fn().mockReturnValueOnce('adam').mockReturnValueOnce('adam'));

    await loadModule();
    await Promise.resolve(); await Promise.resolve();

    const addButton = Array.from(document.querySelectorAll('.fp-button')).find((b) => b.textContent === 'Add session');
    addButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    const statusLine = document.querySelector('.fp-status-line');
    expect(statusLine.textContent).toContain('Action failed:');
    expect(statusLine.textContent).toContain('already holds this role');
  });
});
