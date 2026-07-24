/**
 * Fleet Panel view (SD-LEO-INFRA-LEO-APP-RENDERED-001-A) -- framework-free vanilla JS,
 * matching session-view.js's conventions (IIFE, textContent-only DOM builder, no innerHTML).
 *
 * Renders GET /api/fleet-panel's {sessions[], accountChips[], attentionStrip[]} and drives the
 * 4 action routes under /api/fleet-actions (respawn-fleet, relaunch-under-profile, add-session,
 * snapshot-manifest).
 *
 * AUTH: GET /api/fleet-panel is optionalAuth (server/index.js:220); /api/fleet-actions/* is
 * requireAuth (server/index.js:223). requireAuth's only non-bearer-token option is
 * x-internal-api-key -- the SAME app-wide admin-bypass secret used across ~15 unrelated route
 * groups (server/index.js:189-228), not something scoped to fleet-actions. Since /fleet-ui is
 * itself served with no auth (server/index.js:167, plain express.static), soliciting that key
 * into a form on this page and persisting it in Web Storage would let any XSS found ANYWHERE
 * on this origin read it and fully bypass auth app-wide -- a materially worse outcome than not
 * gating these 4 buttons at all (adversarial PR review, agent a4d0de1d). So this page matches
 * session-view.js's disclosed, already-accepted gap instead: action calls carry no auth header
 * and fail closed (401) until a properly SCOPED credential mechanism exists (tracked as a
 * follow-up, not invented here -- out of scope for a presentation-only child SD).
 */
(function () {
  const PANEL_URL = '/api/fleet-panel';
  const ACTIONS_BASE = '/api/fleet-actions';
  const root = document.getElementById('fleet-panel');

  const { badgeClassFor, formatChipPct, fallbackText } = window.FleetPanelFormat;

  const els = {};

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function buildLayout() {
    root.textContent = '';

    const topbar = el('header', 'fp-topbar');
    const titleWrap = el('div');
    titleWrap.append(
      el('h1', 'fp-title', 'EHG Fleet Launcher'),
      el('p', 'fp-subtitle', 'thin layer over Windows Terminal · DB is the truth plane'),
    );
    els.accountChips = el('div', 'fp-account-chips');
    topbar.append(titleWrap, els.accountChips);
    root.appendChild(topbar);

    root.appendChild(el('p', 'fp-manifest-heading', 'FLEET MANIFEST'));

    const tableWrap = el('div', 'fp-table-wrap');
    const table = el('table', 'fp-table');
    const thead = el('thead');
    const headRow = el('tr');
    ['Session', 'Role', 'Account', 'Model · Effort', 'Status', 'Worktree / Task', 'Last Beat']
      .forEach((label) => headRow.appendChild(el('th', null, label)));
    thead.appendChild(headRow);
    els.tbody = el('tbody');
    table.append(thead, els.tbody);
    tableWrap.appendChild(table);
    root.appendChild(tableWrap);

    els.attention = el('section', 'fp-attention fp-hidden');
    els.attention.setAttribute('role', 'status');
    els.attentionHeading = el('p', 'fp-attention-heading', 'ATTENTION');
    els.attentionList = el('ul', 'fp-attention-list');
    els.attention.append(els.attentionHeading, els.attentionList);
    root.appendChild(els.attention);

    const actions = el('section', 'fp-actions');
    els.respawnButton = el('button', 'fp-button', 'Respawn fleet from manifest');
    els.relaunchButton = el('button', 'fp-button', 'Relaunch session under other account');
    els.addSessionButton = el('button', 'fp-button', 'Add session');
    els.snapshotButton = el('button', 'fp-button', 'Snapshot manifest');
    [els.respawnButton, els.relaunchButton, els.addSessionButton, els.snapshotButton]
      .forEach((b) => { b.type = 'button'; actions.appendChild(b); });
    root.appendChild(actions);

    els.statusLine = el('p', 'fp-status-line', '');
    els.statusLine.setAttribute('aria-live', 'polite');
    root.appendChild(els.statusLine);
  }

  function renderSessionRow(row) {
    const tr = el('tr');

    const sessionCell = el('td');
    const dot = el('span', 'fp-session-dot');
    if (row.color) dot.style.background = row.color;
    sessionCell.appendChild(dot);
    sessionCell.appendChild(document.createTextNode(fallbackText(row.callsign)));
    tr.appendChild(sessionCell);

    tr.appendChild(el('td', null, fallbackText(row.role)));
    tr.appendChild(el('td', null, fallbackText(row.account)));
    tr.appendChild(el('td', null, fallbackText(row.model_effort)));

    const statusCell = el('td');
    statusCell.appendChild(el('span', `fp-badge ${badgeClassFor(row.badge)}`, row.badge || 'OFF'));
    tr.appendChild(statusCell);

    tr.appendChild(el('td', null, fallbackText(row.sd_key)));
    tr.appendChild(el('td', null, fallbackText(row.heartbeat_age_human)));

    return tr;
  }

  function renderManifest(sessions) {
    els.tbody.textContent = '';
    if (!sessions || sessions.length === 0) {
      const emptyRow = el('tr', 'fp-empty-row');
      const cell = el('td', null, 'No active sessions.');
      cell.colSpan = 7;
      emptyRow.appendChild(cell);
      els.tbody.appendChild(emptyRow);
      return;
    }
    sessions.forEach((row) => els.tbody.appendChild(renderSessionRow(row)));
  }

  function renderAccountChips(chips) {
    els.accountChips.textContent = '';
    (chips || []).forEach((chip) => {
      const el1 = el('div', 'fp-chip');
      el1.appendChild(el('div', 'fp-chip-name', chip.name));
      el1.appendChild(el('div', 'fp-chip-pct', formatChipPct(chip.wkPct)));
      els.accountChips.appendChild(el1);
    });
  }

  function renderAttentionStrip(items) {
    const hasItems = Array.isArray(items) && items.length > 0;
    els.attention.classList.toggle('fp-hidden', !hasItems);
    if (!hasItems) return;
    els.attentionHeading.textContent = `ATTENTION (${items.length})`;
    els.attentionList.textContent = '';
    items.forEach((item) => {
      const text = typeof item === 'string' ? item : JSON.stringify(item);
      els.attentionList.appendChild(el('li', null, text));
    });
  }

  async function fetchPanel() {
    const res = await fetch(PANEL_URL, { method: 'GET' });
    if (!res.ok) throw new Error(`fleet-panel fetch failed: ${res.status}`);
    return res.json();
  }

  async function refresh() {
    let data;
    try {
      data = await fetchPanel();
    } catch (err) {
      console.error('[fleet-panel] fetch failed:', err);
      els.statusLine.textContent = 'Unable to load fleet manifest.';
      return;
    }
    // Each render runs independently so one failing region never silently blanks the others.
    try {
      renderManifest(data.sessions);
    } catch (err) {
      console.error('[fleet-panel] renderManifest failed:', err);
    }
    try {
      renderAccountChips(data.accountChips);
    } catch (err) {
      console.error('[fleet-panel] renderAccountChips failed:', err);
    }
    try {
      renderAttentionStrip(data.attentionStrip);
    } catch (err) {
      console.error('[fleet-panel] renderAttentionStrip failed:', err);
    }
  }

  async function callAction(path, { method = 'POST', body } = {}) {
    const headers = {};
    if (body) headers['content-type'] = 'application/json';
    const res = await fetch(`${ACTIONS_BASE}/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = payload.message || payload.reason || `HTTP ${res.status}`;
      throw new Error(reason);
    }
    return payload;
  }

  function wireAction(button, run, doneMessage) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      els.statusLine.textContent = 'Working…';
      try {
        await run();
        els.statusLine.textContent = doneMessage;
        await refresh();
      } catch (err) {
        els.statusLine.textContent = `Action failed: ${err.message}`;
      } finally {
        button.disabled = false;
      }
    });
  }

  buildLayout();

  wireAction(els.respawnButton, () => callAction('respawn-fleet'), 'Fleet respawned from manifest.');
  wireAction(
    els.addSessionButton,
    () => {
      const callsign = prompt('Callsign for the new session?');
      if (!callsign) throw new Error('cancelled');
      const role = prompt('Role (e.g. worker)?', 'worker') || 'worker';
      return callAction('add-session', { body: { role, callsign } });
    },
    'Session added.',
  );
  wireAction(
    els.relaunchButton,
    () => {
      const target = prompt('Session id/callsign to relaunch?');
      if (!target) throw new Error('cancelled');
      const accountProfile = prompt('Account profile to relaunch under?');
      if (!accountProfile) throw new Error('cancelled');
      return callAction('relaunch-under-profile', { body: { target, accountProfile } });
    },
    'Session relaunched under the requested profile.',
  );
  wireAction(
    els.snapshotButton,
    () => callAction('snapshot-manifest', { method: 'GET' }),
    'Manifest snapshot captured.',
  );

  refresh();
})();
