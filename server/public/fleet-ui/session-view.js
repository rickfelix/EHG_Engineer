/**
 * Session View pane (SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-B, completed by
 * SD-LEO-INFRA-LEO-APP-RENDERED-001-B) -- framework-free vanilla JS.
 *
 * Renders lib/fleet/session-detail-view.js's buildSessionDetailView()/mapAttachState() shape
 * (served via GET /api/fleet/sessions/:id, now additionally carrying badge/model/effort/role/
 * callsign per SD-LEO-INFRA-LEO-APP-RENDERED-001-B TR-1) and drives the 4 action routes (attach,
 * browser-session, takeover, hand-back). All server-sourced text is set via textContent, never
 * innerHTML, so no HTML-escaping helper is needed here for XSS safety.
 *
 * Matches docs/design/mockup-2-session-view-terminal-agent-browser.png: an app header (identity
 * chips + status pill + F/B/A key legend), a left TTY/terminal pane with a ctx/last-tool/wakeup
 * footer, and a right agent-browser pane (URL bar + AGENT badge + narration stream + the existing
 * sandboxed-browser controls + browser action log).
 *
 * SCOPE NOTE (honest placeholders, no fabrication -- VALIDATION sub-agent, LEAD phase): no
 * narration/transcript backend data source exists anywhere in the fleet namespace. The narration
 * stream below is synthesized from the REAL, already-recorded browser-log events (takeover/
 * hand-back), never fabricated dialogue -- see buildNarrationLines(). Likewise this fragment
 * renders the sandbox pane's frame and controls only; actually connecting a live CDP viewport
 * requires a host that can embed a real browser process, which is out of scope here (same
 * boundary browser-control.js itself draws: "return launch options, never launch a browser here").
 *
 * KNOWN INTEGRATION GAP (adversarial review, pre-merge, carried over from LAUNCHER-SHELL-001-B):
 * the fetch() calls below carry no Authorization/x-internal-api-key header, so every action 401s
 * (fails closed) when this fragment is loaded standalone. Tracked as an open dependency on the
 * parent shell's integration work, not fixable from this child alone.
 *
 * TESTABLE SEAM (TESTING sub-agent, PLAN-TO-EXEC): pure, DOM-free helpers are exported via a
 * UMD-style guard so unit tests can exercise them directly under Node/vitest without a DOM. The
 * DOM-building/fetch/event-wiring code only runs when `window`+`document` are present (a real
 * browser, or a jsdom-environment test that wants full integration coverage).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Pure helpers (no DOM, no fetch) -- exported for unit testing.
  // ---------------------------------------------------------------------

  /** FR-2: "last tool N ago" footer field. Returns '—' for missing/unparseable input. */
  function formatTimeAgo(isoString, nowMs) {
    if (!isoString) return '—';
    const then = Date.parse(isoString);
    if (!Number.isFinite(then)) return '—';
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    const deltaSec = Math.max(0, Math.round((now - then) / 1000));
    if (deltaSec < 60) return `${deltaSec}s ago`;
    const deltaMin = Math.round(deltaSec / 60);
    if (deltaMin < 60) return `${deltaMin}m ago`;
    const deltaHr = Math.round(deltaMin / 60);
    return `${deltaHr}h ago`;
  }

  /** FR-2: "wakeup armed HH:MM" footer field, 'none' when there's no future silent-until. */
  function formatWakeupLabel(silentUntil, nowMs) {
    if (!silentUntil) return 'none';
    const endMs = Date.parse(silentUntil);
    const now = typeof nowMs === 'number' ? nowMs : Date.now();
    if (!Number.isFinite(endMs) || endMs <= now) return 'none';
    const d = new Date(endMs);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `armed ${hh}:${mm}`;
  }

  /** FR-3/TR-2: friendly narration labels, extending the existing LOG_EVENT_LABELS convention. */
  const NARRATION_EVENT_LABELS = Object.freeze({
    browser_takeover: 'Human took control',
    browser_handback: 'Control returned to agent',
  });

  /**
   * FR-3: numbered narration lines derived 1:1 from real browser-log events. Never fabricates
   * content beyond a friendly label + the event's own timestamp (TS-2/TS-7).
   * @param {Array<{event_type:string, created_at:string}>|null|undefined} events
   * @returns {string[]}
   */
  function buildNarrationLines(events) {
    if (!events || events.length === 0) return [];
    return events.map((ev, i) => {
      const label = NARRATION_EVENT_LABELS[ev.event_type] || ev.event_type;
      return `${i + 1}. ${label} (${ev.created_at})`;
    });
  }

  const ATTACH_STYLES = {
    ok: { cls: 'sv-chip--ok', label: 'Attached' },
    not_resolved: { cls: 'sv-chip--not-resolved', label: 'Could not resolve target' },
    no_captured_handle: { cls: 'sv-chip--no-handle', label: 'No window handle captured' },
    stale_handle: { cls: 'sv-chip--stale', label: 'Window handle stale' },
    other: { cls: 'sv-chip--not-resolved', label: 'Attach failed' },
    resting: { cls: 'sv-chip--resting', label: 'Attach: unknown' },
  };
  const RESOLUTION_REASONS = new Set(['no_key', 'not_found', 'ambiguous']);

  function attachStyleFor(attachState) {
    if (!attachState || attachState.ok === null) return ATTACH_STYLES.resting;
    if (attachState.ok) return ATTACH_STYLES.ok;
    if (attachState.reason === 'no_captured_handle') return ATTACH_STYLES.no_captured_handle;
    if (attachState.reason === 'stale_handle') return ATTACH_STYLES.stale_handle;
    if (RESOLUTION_REASONS.has(attachState.reason)) return ATTACH_STYLES.not_resolved;
    return ATTACH_STYLES.other;
  }

  /** FR-5: header legend key -> semantic action. Case-insensitive, unmapped keys return null. */
  const KEY_ACTIONS = Object.freeze({ f: 'fleet-view', b: 'toggle-browser', a: 'toggle-account' });
  function resolveKeyAction(key) {
    if (typeof key !== 'string' || key.length !== 1) return null;
    return KEY_ACTIONS[key.toLowerCase()] || null;
  }

  /** FR-5: true when the given element is a text-entry target (keydown nav must no-op). */
  function isEditableTarget(target) {
    if (!target) return false;
    const tag = typeof target.tagName === 'string' ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return true;
    return !!target.isContentEditable;
  }

  const STATUS_BADGE_LABELS = new Set([
    'WORKING', 'AWAITING INPUT', 'DEEP WORK', 'IDLE', 'MECHANICAL', 'PILOT WK1', 'OFF',
  ]);

  /** FR-1: falls back to a safe '—' for any badge value outside the canonical 7-label vocabulary. */
  function normalizeBadge(badge) {
    return STATUS_BADGE_LABELS.has(badge) ? badge : '—';
  }

  // ---------------------------------------------------------------------
  // Browser-only init: DOM building, fetch, event wiring.
  // ---------------------------------------------------------------------

  function initBrowser() {
    const API_BASE = '/api/fleet/sessions';
    const sessionId = new URLSearchParams(location.search).get('id');
    const root = document.getElementById('session-view');
    if (!root) return;

    if (!sessionId) {
      root.textContent = 'No session id provided (?id=<session_id>).';
      return;
    }

    const els = {};
    let paused = false;

    function el(tag, className, text) {
      const e = document.createElement(tag);
      if (className) e.className = className;
      if (text != null) e.textContent = text;
      return e;
    }

    function buildLayout() {
      root.textContent = '';
      root.dataset.sessionId = sessionId;

      // FR-1: app header -- identity chips, status pill, F/B/A key legend.
      const appHeader = el('header', 'sv-appheader');
      els.identityChips = el('div', 'sv-identity-chips');
      els.statusPill = el('span', 'sv-status-pill sv-status-pill--off', '—');
      els.keyLegend = el('span', 'sv-key-legend', '[F] Fleet view · [B] toggle browser · [A] account');
      appHeader.append(els.identityChips, els.statusPill, els.keyLegend);
      root.appendChild(appHeader);

      els.accountPanel = el('div', 'sv-account-panel sv-hidden');
      els.accountPanel.setAttribute('aria-label', 'Account details');
      root.appendChild(els.accountPanel);

      const shell = el('div', 'sv-shell');
      root.appendChild(shell);

      // FR-2: TTY pane (left).
      const ttyPane = el('section', 'sv-tty');
      ttyPane.setAttribute('aria-label', 'Live terminal');
      const ttyHeader = el('div', 'sv-tty-header', 'TERMINAL — live TTY (attach to type)');
      els.ttyScrollback = el('div', 'sv-tty-scrollback');
      els.ttyScrollback.appendChild(el('p', 'sv-tty-placeholder', 'Attach to begin.'));

      const attachRow = el('div', 'sv-attach-row');
      els.attachChip = el('span', 'sv-chip sv-chip--resting', 'Attach: unknown');
      els.pauseChip = el('span', 'sv-chip sv-chip--resting', 'Agent active');
      attachRow.append(els.attachChip, els.pauseChip);

      els.attachButton = el('button', 'sv-button', 'Attach-focus');
      els.attachButton.type = 'button';
      els.attachMessage = el('p', 'sv-attach-message', '');
      els.attachMessage.setAttribute('aria-live', 'polite');

      els.pausedBanner = el('div', 'sv-paused-banner sv-hidden', 'HUMAN IN CONTROL');
      els.pausedBanner.setAttribute('role', 'status');
      els.pausedBanner.setAttribute('aria-live', 'assertive');

      els.ttyFooter = el('div', 'sv-tty-footer', 'ctx — % · last tool — · wakeup none');

      ttyPane.append(ttyHeader, els.ttyScrollback, attachRow, els.attachButton, els.attachMessage, els.pausedBanner, els.ttyFooter);
      shell.appendChild(ttyPane);

      // FR-3/FR-4: agent-browser pane (right).
      const browserSection = el('section', 'sv-agent-browser');
      browserSection.setAttribute('aria-label', 'Agent-controlled browser');

      const urlBar = el('div', 'sv-url-bar');
      const dots = el('span', 'sv-url-dots');
      els.urlText = el('span', 'sv-url-text', 'about:blank');
      const agentBadge = el('span', 'sv-agent-badge', 'AGENT ⚡');
      urlBar.append(dots, els.urlText, agentBadge);

      els.browserButton = el('button', 'sv-button', 'Open sandboxed browser');
      els.browserButton.type = 'button';
      els.browserGateNote = el('p', 'sv-browser-gate sv-hidden',
        'Browser control is disabled for this session (browser_mcp_enabled is not set).');

      els.browserPane = el('div', 'sv-browser-pane sv-hidden');
      els.browserPane.setAttribute('role', 'region');
      els.browserPane.setAttribute('aria-label', 'Sandboxed browser pane (isolated profile)');
      const ribbon = el('div', 'sv-browser-ribbon', 'SANDBOXED — isolated profile, never your real browser');
      els.browserPaneBody = el('p', 'sv-browser-pane-body',
        'No live viewport is embedded here — connect a CDP client to the reported launch options.');

      const narrationBox = el('div', 'sv-narration');
      narrationBox.setAttribute('role', 'status');
      const narrationHeading = el('p', 'sv-narration-heading', 'AGENT DRIVING THIS PAGE (MCP browser control)');
      els.narrationList = el('ul', 'sv-narration-list');
      els.narrationList.setAttribute('aria-label', 'Agent narration stream');
      const narrationHint = el('p', 'sv-narration-hint', 'You can take over anytime — agent yields on your first click.');
      narrationBox.append(narrationHeading, els.narrationList, narrationHint);

      els.takeoverButton = el('button', 'sv-button sv-button--takeover', 'Take control');
      els.takeoverButton.type = 'button';
      els.handBackButton = el('button', 'sv-button sv-button--handback sv-hidden', 'Return control to agent');
      els.handBackButton.type = 'button';

      const logHeading = el('p', 'sv-log-heading', 'BROWSER ACTION LOG (auditable)');
      els.browserLog = el('ul', 'sv-log-list');
      els.browserLog.setAttribute('aria-label', 'Auditable take-over / hand-back log');

      els.browserPane.append(ribbon, els.browserPaneBody, narrationBox, els.takeoverButton, els.handBackButton, logHeading, els.browserLog);
      browserSection.append(urlBar, els.browserButton, els.browserGateNote, els.browserPane);
      shell.appendChild(browserSection);

      els.agentBrowserPane = els.browserPane;
    }

    function renderAttachState(attachState) {
      const style = attachStyleFor(attachState);
      els.attachChip.className = 'sv-chip ' + style.cls;
      els.attachChip.textContent = style.label;
      els.attachMessage.textContent = (attachState && attachState.message) || '';
    }

    function renderPaused(nextPaused) {
      paused = !!nextPaused;
      els.pauseChip.textContent = paused ? 'Human in control' : 'Agent active';
      els.pauseChip.className = 'sv-chip ' + (paused ? 'sv-chip--paused' : 'sv-chip--resting');
      els.pausedBanner.classList.toggle('sv-hidden', !paused);
      els.takeoverButton.classList.toggle('sv-hidden', paused);
      els.handBackButton.classList.toggle('sv-hidden', !paused);
    }

    function renderGate(browserMcpEnabled) {
      els.browserButton.disabled = !browserMcpEnabled;
      els.browserButton.setAttribute('aria-disabled', String(!browserMcpEnabled));
      els.browserGateNote.classList.toggle('sv-hidden', browserMcpEnabled);
    }

    function renderIdentity(view) {
      els.identityChips.textContent = '';
      const parts = [view.role, view.callsign, view.model, view.effort].filter(Boolean);
      parts.forEach((p) => els.identityChips.appendChild(el('span', 'sv-id-chip', String(p))));
      const badge = normalizeBadge(view.badge);
      els.statusPill.textContent = badge;
      els.statusPill.className = 'sv-status-pill sv-status-pill--' + badge.toLowerCase().replace(/\s+/g, '-');

      els.accountPanel.textContent = '';
      els.accountPanel.appendChild(el('p', 'sv-account-field', 'Callsign: ' + (view.callsign || '—')));
      els.accountPanel.appendChild(el('p', 'sv-account-field', 'Model: ' + (view.model || '—') + ' · Effort: ' + (view.effort || '—')));
    }

    function renderView(view) {
      els.ttyFooter.textContent =
        `ctx ${view.ctxPercent == null ? '—' : view.ctxPercent + '%'} · ` +
        `last tool ${formatTimeAgo(view.lastToolAt)} · ` +
        `wakeup ${formatWakeupLabel(view.silentUntil)}`;
      renderAttachState(view.attachState);
      renderPaused(!!view.paused);
      renderGate(!!view.browserMcpEnabled);
      renderIdentity(view);
    }

    function renderNarration(events, errored) {
      els.narrationList.textContent = '';
      if (errored) {
        els.narrationList.appendChild(el('li', 'sv-log-empty', 'Unable to load agent narration.'));
        return;
      }
      const lines = buildNarrationLines(events);
      if (lines.length === 0) {
        els.narrationList.appendChild(el('li', 'sv-log-empty', 'No agent actions recorded yet.'));
        return;
      }
      lines.forEach((line) => els.narrationList.appendChild(el('li', 'sv-narration-line', line)));
    }

    const LOG_EVENT_LABELS = { browser_takeover: 'Human took control', browser_handback: 'Control returned to agent' };

    function renderBrowserLog(events, errored) {
      els.browserLog.textContent = '';
      if (errored) {
        els.browserLog.appendChild(el('li', 'sv-log-empty', 'Unable to load browser action log.'));
        return;
      }
      if (!events || events.length === 0) {
        els.browserLog.appendChild(el('li', 'sv-log-empty', 'No take-over/hand-back events recorded yet.'));
        return;
      }
      for (const ev of events) {
        const label = LOG_EVENT_LABELS[ev.event_type] || ev.event_type;
        els.browserLog.appendChild(el('li', 'sv-log-entry', `${ev.created_at} — ${label}`));
      }
    }

    async function fetchView() {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}`, { method: 'GET' });
      if (!res.ok) throw new Error(`view fetch failed: ${res.status}`);
      return res.json();
    }

    async function fetchBrowserLog() {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}/browser-log`, { method: 'GET' });
      if (!res.ok) throw new Error(`browser-log fetch failed: ${res.status}`);
      return res.json();
    }

    async function refresh() {
      try {
        renderView(await fetchView());
      } catch {
        els.attachMessage.textContent = 'Unable to load session state.';
      }
      try {
        const log = await fetchBrowserLog();
        renderBrowserLog(log.events, false);
        renderNarration(log.events, false);
      } catch {
        renderBrowserLog(null, true);
        renderNarration(null, true);
      }
    }

    buildLayout();

    els.attachButton.addEventListener('click', async () => {
      els.attachButton.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}/attach`, { method: 'POST' });
        renderAttachState(await res.json());
      } finally {
        els.attachButton.disabled = false;
      }
    });

    els.browserButton.addEventListener('click', async () => {
      els.browserButton.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}/browser-session`, { method: 'POST' });
        const body = await res.json();
        if (body.ok) {
          els.browserPane.classList.remove('sv-hidden');
          els.browserGateNote.classList.add('sv-hidden');
        } else {
          els.browserGateNote.textContent = 'Browser session unavailable: ' + (body.reason || 'unknown');
          els.browserGateNote.classList.remove('sv-hidden');
        }
      } finally {
        els.browserButton.disabled = false;
      }
    });

    els.takeoverButton.addEventListener('click', async () => {
      await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}/takeover`, { method: 'POST' });
      await refresh();
    });

    els.handBackButton.addEventListener('click', async () => {
      await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}/hand-back`, { method: 'POST' });
      await refresh();
    });

    // FR-4: take-over-on-first-click -- any click inside the browser pane while the agent is
    // driving yields control, mirroring the explicit "Take control" button. Excludes the
    // take-over/hand-back buttons themselves (they already have dedicated handlers above; without
    // this exclusion a click on "Take control" would fire the POST twice).
    els.agentBrowserPane.addEventListener('click', async (evt) => {
      if (paused) return;
      if (els.takeoverButton.contains(evt.target) || els.handBackButton.contains(evt.target)) return;
      await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}/takeover`, { method: 'POST' });
      await refresh();
    });

    // FR-5: F/B/A keyboard navigation, suppressed while a form field has focus.
    document.addEventListener('keydown', (evt) => {
      if (isEditableTarget(document.activeElement)) return;
      const action = resolveKeyAction(evt.key);
      if (!action) return;
      if (action === 'fleet-view') {
        location.href = '/fleet-ui/fleet-panel.html';
      } else if (action === 'toggle-browser') {
        els.agentBrowserPane.classList.toggle('sv-hidden');
      } else if (action === 'toggle-account') {
        els.accountPanel.classList.toggle('sv-hidden');
      }
    });

    refresh();
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    initBrowser();
  }

  return {
    formatTimeAgo,
    formatWakeupLabel,
    buildNarrationLines,
    attachStyleFor,
    resolveKeyAction,
    isEditableTarget,
    normalizeBadge,
  };
});
