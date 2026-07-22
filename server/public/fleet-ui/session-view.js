/**
 * Session View pane (SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-B) -- framework-free vanilla JS.
 *
 * Renders lib/fleet/session-detail-view.js's buildSessionDetailView()/mapAttachState() shape
 * (served via GET /api/fleet/sessions/:id) and drives the 4 action routes (attach,
 * browser-session, takeover, hand-back). All server-sourced text is set via textContent, never
 * innerHTML, so no HTML-escaping helper is needed here for XSS safety.
 *
 * SCOPE NOTE: this fragment renders the sandbox pane's frame and controls only. Actually
 * connecting a live CDP viewport to the returned launchOptions requires a host that can embed
 * a real browser process (e.g. the parent shell's native/Electron layer) -- browser-control.js's
 * own contract is "return launch options, never launch a browser here", and this fragment
 * honors that same boundary rather than attempting to spawn anything client-side.
 *
 * KNOWN INTEGRATION GAP (adversarial review, pre-merge): the fetch() calls below carry no
 * Authorization/x-internal-api-key header, so every action 401s (fails closed) when this
 * fragment is loaded standalone. Fresh-fails-closed is safe, but the credential-passthrough
 * mechanism is genuinely undecided -- it depends on how the parent SD's assembly shell hosts
 * this fragment (e.g. relaying its own session token). Tracked as an open dependency on the
 * parent shell's integration work, not fixable from this child alone.
 */
(function () {
  const API_BASE = '/api/fleet/sessions';
  const sessionId = new URLSearchParams(location.search).get('id');
  const root = document.getElementById('session-view');

  if (!sessionId) {
    root.textContent = 'No session id provided (?id=<session_id>).';
    return;
  }

  const els = {};

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function buildLayout() {
    root.textContent = '';
    root.dataset.sessionId = sessionId;

    const header = el('header', 'sv-header');
    els.attachChip = el('span', 'sv-chip sv-chip--resting', 'Attach: unknown');
    els.pauseChip = el('span', 'sv-chip sv-chip--resting', 'Agent active');
    header.append(els.attachChip, els.pauseChip);
    root.appendChild(header);

    els.pausedBanner = el('div', 'sv-paused-banner sv-hidden', 'HUMAN IN CONTROL');
    els.pausedBanner.setAttribute('role', 'status');
    els.pausedBanner.setAttribute('aria-live', 'assertive');
    root.appendChild(els.pausedBanner);

    const telemetry = el('section', 'sv-telemetry');
    telemetry.setAttribute('aria-label', 'Session telemetry');
    els.ctxBarFill = el('div', 'sv-ctx-fill');
    const ctxBar = el('div', 'sv-ctx-bar');
    ctxBar.appendChild(els.ctxBarFill);
    els.ctxLabel = el('span', 'sv-ctx-label', 'Context: unknown');
    telemetry.append(els.ctxLabel, ctxBar);
    els.lastTool = el('p', 'sv-field', 'Last tool: —');
    els.lastActivity = el('p', 'sv-field', 'Activity: —');
    els.silentUntil = el('p', 'sv-field', 'Silent until: —');
    telemetry.append(els.lastTool, els.lastActivity, els.silentUntil);
    root.appendChild(telemetry);

    const attachSection = el('section', 'sv-attach');
    attachSection.setAttribute('aria-label', 'Attach focus');
    els.attachButton = el('button', 'sv-button', 'Attach-focus');
    els.attachButton.type = 'button';
    els.attachMessage = el('p', 'sv-attach-message', '');
    els.attachMessage.setAttribute('aria-live', 'polite');
    attachSection.append(els.attachButton, els.attachMessage);
    root.appendChild(attachSection);

    const browserSection = el('section', 'sv-browser');
    browserSection.setAttribute('aria-label', 'Sandboxed browser');
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
    els.takeoverButton = el('button', 'sv-button sv-button--takeover', 'Take control');
    els.takeoverButton.type = 'button';
    els.handBackButton = el('button', 'sv-button sv-button--handback sv-hidden', 'Return control to agent');
    els.handBackButton.type = 'button';
    els.browserPane.append(ribbon, els.browserPaneBody, els.takeoverButton, els.handBackButton);
    browserSection.append(els.browserButton, els.browserGateNote, els.browserPane);
    root.appendChild(browserSection);
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

  function renderAttachState(attachState) {
    const style = attachStyleFor(attachState);
    els.attachChip.className = 'sv-chip ' + style.cls;
    els.attachChip.textContent = style.label;
    els.attachMessage.textContent = (attachState && attachState.message) || '';
  }

  function renderPaused(paused) {
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

  function renderView(view) {
    els.ctxLabel.textContent = view.ctxPercent == null ? 'Context: unknown' : `Context: ${view.ctxPercent}%`;
    els.ctxBarFill.style.width = (view.ctxPercent == null ? 0 : view.ctxPercent) + '%';
    els.lastTool.textContent = 'Last tool: ' + (view.lastTool || '—');
    els.lastActivity.textContent = 'Activity: ' + (view.lastActivityKind || '—');
    els.silentUntil.textContent = 'Silent until: ' + (view.silentUntil || '—');
    renderAttachState(view.attachState);
    renderPaused(!!view.paused);
    renderGate(!!view.browserMcpEnabled);
  }

  async function fetchView() {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(sessionId)}`, { method: 'GET' });
    if (!res.ok) throw new Error(`view fetch failed: ${res.status}`);
    return res.json();
  }

  async function refresh() {
    try {
      renderView(await fetchView());
    } catch {
      els.attachMessage.textContent = 'Unable to load session state.';
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

  refresh();
})();
