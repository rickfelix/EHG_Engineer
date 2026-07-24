/**
 * @vitest-environment jsdom
 *
 * Unit + integration tests for the session-view mockup-2 render completion
 * (SD-LEO-INFRA-LEO-APP-RENDERED-001-B). Covers PRD test_scenarios TS-1..TS-7.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadModule() {
  vi.resetModules();
  return import('./session-view.js');
}

function setLocation(pathAndQuery) {
  window.history.pushState({}, '', pathAndQuery);
}

function mountRoot() {
  document.body.innerHTML = '<main id="session-view"></main>';
}

// -------------------------------------------------------------------------
// Pure helpers (no DOM needed) -- TS-2/TS-4/TS-5
// -------------------------------------------------------------------------

describe('pure helpers', () => {
  it('formatTimeAgo: seconds/minutes/hours buckets, and — for missing/unparseable input', async () => {
    const { formatTimeAgo } = await loadModule();
    const now = Date.parse('2026-01-01T00:10:00Z');
    expect(formatTimeAgo(null, now)).toBe('—');
    expect(formatTimeAgo('not-a-date', now)).toBe('—');
    expect(formatTimeAgo('2026-01-01T00:09:57Z', now)).toBe('3s ago');
    expect(formatTimeAgo('2026-01-01T00:07:00Z', now)).toBe('3m ago');
    expect(formatTimeAgo('2025-12-31T22:10:00Z', now)).toBe('2h ago');
  });

  it("formatWakeupLabel: 'none' for missing/past, 'armed HH:MM' for a future silent-until", async () => {
    const { formatWakeupLabel } = await loadModule();
    const now = Date.parse('2026-01-01T14:00:00Z');
    expect(formatWakeupLabel(null, now)).toBe('none');
    expect(formatWakeupLabel('2026-01-01T13:00:00Z', now)).toBe('none'); // in the past
    const future = new Date(now + 26 * 60 * 1000).toISOString();
    const label = formatWakeupLabel(future, now);
    expect(label).toMatch(/^armed \d{2}:\d{2}$/);
  });

  it('TS-2: buildNarrationLines derives numbered lines 1:1 from real events, empty array when none', async () => {
    const { buildNarrationLines } = await loadModule();
    expect(buildNarrationLines(null)).toEqual([]);
    expect(buildNarrationLines([])).toEqual([]);
    const events = [
      { event_type: 'browser_takeover', created_at: '2026-01-01T00:00:00Z' },
      { event_type: 'browser_handback', created_at: '2026-01-01T00:05:00Z' },
      { event_type: 'unknown_event', created_at: '2026-01-01T00:06:00Z' },
    ];
    const lines = buildNarrationLines(events);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('1. Human took control (2026-01-01T00:00:00Z)');
    expect(lines[1]).toBe('2. Control returned to agent (2026-01-01T00:05:00Z)');
    expect(lines[2]).toBe('3. unknown_event (2026-01-01T00:06:00Z)');
  });

  it('TS-4: resolveKeyAction maps F/B/A (case-insensitive) to their semantic actions, others to null', async () => {
    const { resolveKeyAction } = await loadModule();
    expect(resolveKeyAction('f')).toBe('fleet-view');
    expect(resolveKeyAction('F')).toBe('fleet-view');
    expect(resolveKeyAction('b')).toBe('toggle-browser');
    expect(resolveKeyAction('B')).toBe('toggle-browser');
    expect(resolveKeyAction('a')).toBe('toggle-account');
    expect(resolveKeyAction('A')).toBe('toggle-account');
    expect(resolveKeyAction('x')).toBeNull();
    expect(resolveKeyAction('Enter')).toBeNull();
    expect(resolveKeyAction(null)).toBeNull();
  });

  it('TS-5: isEditableTarget recognizes input/textarea/contenteditable, rejects everything else', async () => {
    const { isEditableTarget } = await loadModule();
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
    expect(isEditableTarget({ tagName: 'BODY' })).toBe(false);
  });

  it('normalizeBadge falls back to — for any value outside the canonical 7-label vocabulary', async () => {
    const { normalizeBadge } = await loadModule();
    expect(normalizeBadge('WORKING')).toBe('WORKING');
    expect(normalizeBadge('OFF')).toBe('OFF');
    expect(normalizeBadge('bogus')).toBe('—');
    expect(normalizeBadge(undefined)).toBe('—');
  });

  it('attachStyleFor: resting/ok/degraded reasons map to distinct styles', async () => {
    const { attachStyleFor } = await loadModule();
    expect(attachStyleFor(null).label).toBe('Attach: unknown');
    expect(attachStyleFor({ ok: true }).label).toBe('Attached');
    expect(attachStyleFor({ ok: false, reason: 'stale_handle' }).label).toBe('Window handle stale');
    expect(attachStyleFor({ ok: false, reason: 'not_found' }).label).toBe('Could not resolve target');
  });
});

// -------------------------------------------------------------------------
// Integration (stubbed fetch, real jsdom render) -- TS-1/TS-3/TS-6
// -------------------------------------------------------------------------

describe('integration (rendered DOM)', () => {
  beforeEach(() => {
    mountRoot();
    setLocation('/fleet-ui/session-view.html?id=sess-1');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetchSequence({ view, browserLog, viewOk = true, logOk = true }) {
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('/browser-log')) {
        return Promise.resolve({
          ok: logOk,
          status: logOk ? 200 : 500,
          json: () => Promise.resolve(browserLog),
        });
      }
      return Promise.resolve({
        ok: viewOk,
        status: viewOk ? 200 : 500,
        json: () => Promise.resolve(view),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('TS-1: happy-path render shows header, TTY footer, and empty-state narration', async () => {
    stubFetchSequence({
      view: {
        ctxPercent: 41, lastTool: 'Read', lastToolAt: '2026-01-01T00:09:57Z',
        lastActivityKind: 'tool', silentUntil: null, attachState: { ok: null },
        paused: false, browserMcpEnabled: true,
        badge: 'WORKING', role: 'advisor', model: 'sonnet', effort: 'high', callsign: 'Alpha-5',
      },
      browserLog: { ok: true, events: [] },
    });

    await loadModule();
    // Flush the two chained fetch()/json() promise ticks inside refresh().
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    const header = document.querySelector('.sv-appheader');
    expect(header).not.toBeNull();
    expect(header.textContent).toContain('[F] Fleet view · [B] toggle browser · [A] account');
    expect(document.querySelector('.sv-status-pill').textContent).toBe('WORKING');
    expect(document.querySelector('.sv-tty-footer').textContent).toContain('ctx 41%');
    expect(document.querySelector('.sv-narration-list').textContent).toContain('No agent actions recorded yet.');
  });

  it('TS-3: narration renders numbered lines matching real browser-log events, 1:1', async () => {
    stubFetchSequence({
      view: {
        ctxPercent: 10, lastToolAt: null, silentUntil: null, attachState: { ok: null },
        paused: false, browserMcpEnabled: true, badge: 'WORKING',
      },
      browserLog: {
        ok: true,
        events: [
          { event_type: 'browser_takeover', created_at: '2026-01-01T00:00:00Z' },
          { event_type: 'browser_handback', created_at: '2026-01-01T00:05:00Z' },
        ],
      },
    });

    await loadModule();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    const items = document.querySelectorAll('.sv-narration-line');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('1. Human took control (2026-01-01T00:00:00Z)');
    expect(items[1].textContent).toBe('2. Control returned to agent (2026-01-01T00:05:00Z)');
  });

  it('TS-6: graceful degradation when the session-detail fetch fails', async () => {
    stubFetchSequence({ view: null, viewOk: false, browserLog: { ok: true, events: [] } });

    await loadModule();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    expect(document.querySelector('.sv-attach-message').textContent).toBe('Unable to load session state.');
    // No thrown exception reached here means the catch path held; status pill stays at its safe default.
    expect(document.querySelector('.sv-status-pill').textContent).toBe('—');
  });

  it('B toggles the agent-browser pane visibility; A toggles the account panel; guarded while typing', async () => {
    stubFetchSequence({
      view: { ctxPercent: 0, attachState: { ok: null }, paused: false, browserMcpEnabled: true, badge: 'WORKING' },
      browserLog: { ok: true, events: [] },
    });
    await loadModule();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    const browserPane = document.querySelector('.sv-browser-pane');
    const accountPanel = document.querySelector('.sv-account-panel');
    expect(browserPane.classList.contains('sv-hidden')).toBe(true);
    expect(accountPanel.classList.contains('sv-hidden')).toBe(true);

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    expect(browserPane.classList.contains('sv-hidden')).toBe(false);

    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(accountPanel.classList.contains('sv-hidden')).toBe(false);

    // Guard: typing 'b' inside an input must not toggle anything back.
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    expect(browserPane.classList.contains('sv-hidden')).toBe(false); // unchanged
  });
});

// -------------------------------------------------------------------------
// TS-7: no fabricated mockup dialogue ships in the source.
// -------------------------------------------------------------------------

describe('TS-7: no fabricated mockup dialogue', () => {
  it('the shipped source never contains the mockup-illustrative dialogue literals', () => {
    const source = readFileSync(path.join(__dirname, 'session-view.js'), 'utf8');
    const forbidden = [
      'Help me visualize the launcher layer',
      'Superforecasters',
      'forecastbench.org',
      'Ran 2 shell commands',
      'MOCK_LIVE drive.google.com',
    ];
    for (const literal of forbidden) {
      expect(source).not.toContain(literal);
    }
  });
});
