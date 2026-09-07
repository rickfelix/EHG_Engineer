// lib/michael/render-brief.js — spec §6 HTML renderer + self-verification.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-E (FR-3).
//
// The source scripts/render-brief-artifact.py and templates/morning-brief-rebuild-template.html
// are not in this repository (confirmed absent from git history during LEAD exploration), so the
// port is reconstructed from the spec §6 schema-2 data contract and the artifact the spec describes
// — template inlined, the dead clipboard script dropped. Correctness is bounded to exactly what
// verifyRender can check (never claim more than landed — see the brief-model.mjs file header for
// the same discipline applied to the data side): doctype present, closing </html> present, today's
// long date present, zero {{TOKEN}} residues, zero NUL bytes. verified is set true ONLY when all
// five pass.

const MONTH_NAMES = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);

/** Pure: 'YYYY-MM-DD' -> 'Month D, YYYY'; '' when malformed. Fixed month names — no locale dependency. */
export function formatLongDate(etDate) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(etDate || ''));
  if (!m) return '';
  const [, y, mo, d] = m;
  const idx = Number(mo) - 1;
  if (idx < 0 || idx > 11) return '';
  return `${MONTH_NAMES[idx]} ${Number(d)}, ${y}`;
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Pure: schema-2 data_json -> HTML string. No I/O, no model. */
export function renderBrief(data = {}, { etDate } = {}) {
  const date = etDate || data.date;
  const longDate = formatLongDate(date);
  const fp = data.frontPage || {};
  const today = fp.today || {};
  const gmail = fp.gmail || {};
  const todoist = fp.todoist || {};
  const ehg = fp.ehg || {};
  const claudeCode = fp.claudeCode || {};
  const enrichment = data.enrichment || {};
  const signals = Array.isArray(enrichment.signals) ? enrichment.signals : [];
  const headsUp = Array.isArray(data.headsUp) ? data.headsUp : [];

  const needsYouHtml = (gmail.needsYou || []).map((n) => `<li>${esc(n.thread_id)}${n.reason ? ` — ${esc(n.reason)}` : ''}</li>`).join('');
  const todoistWindowHtml = (todoist.window || []).map((t) => `<li>${esc(t.task_id)} (${esc(t.effort_grade)})</li>`).join('');
  const headsUpHtml = headsUp.map((h) => `<li>${esc(h)}</li>`).join('');
  const signalsHtml = signals.map((s) => `<li>${esc(typeof s === 'string' ? s : JSON.stringify(s))}</li>`).join('');

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>' + esc(`Michael's Brief — ${longDate}`) + '</title></head>',
    '<body>',
    `<header><h1>${esc(longDate)}</h1><p class="lede">${esc(data.lede || '')}</p></header>`,
    headsUpHtml ? `<section class="heads-up"><h2>Heads up</h2><ul>${headsUpHtml}</ul></section>` : '',
    `<section class="today"><h2>Today</h2><p>${today.event_count || 0} event(s), ${today.coded_count || 0} coded, ${today.optional_open || 0} optional open, ${today.overlap_count || 0} overlap group(s).</p></section>`,
    `<section class="gmail"><h2>Gmail</h2><p>${gmail.handled || 0} handled, ${gmail.unclassifiedCount || 0} unclassified.</p><p>${esc(gmail.call || '')}</p>${needsYouHtml ? `<ul>${needsYouHtml}</ul>` : ''}</section>`,
    `<section class="todoist"><h2>Todoist</h2><p>${esc(todoist.state || '')} — ${esc(todoist.note || '')}</p>${todoistWindowHtml ? `<ul>${todoistWindowHtml}</ul>` : ''}</section>`,
    ehg.shown ? `<section class="ehg"><p>${esc(ehg.pointer || '')}: ${ehg.handedCount || 0}</p></section>` : '',
    `<section class="claude-code"><h2>Pipeline</h2><p>${claudeCode.feeders_ok || 0} ok, ${claudeCode.feeders_degraded || 0} degraded, ${(claudeCode.feeders_missing || []).length} missing.</p></section>`,
    signalsHtml ? `<section class="enrichment"><h2>Signals</h2><ul>${signalsHtml}</ul></section>` : '',
    '</body>',
    '</html>',
  ].filter((line) => line !== '').join('\n');
}

/**
 * Pure: the five self-checks. verified is true ONLY when all five pass. verify_notes is a string
 * (michael_brief_runs.verify_notes is TEXT) naming every failing check, comma-separated; '' when clean.
 */
export function verifyRender(html, { etDate } = {}) {
  const s = String(html || '');
  const trimmed = s.trim();
  const notes = [];
  if (!/^<!doctype html>/i.test(trimmed)) notes.push('doctype');
  if (!/<\/html>\s*$/i.test(trimmed)) notes.push('closing_tag');
  const longDate = formatLongDate(etDate);
  if (!longDate || !s.includes(longDate)) notes.push('date');
  if (/\{\{[^}]*\}\}/.test(s)) notes.push('template_token');
  if (s.indexOf(String.fromCharCode(0)) !== -1) notes.push('nul_byte');
  return { verified: notes.length === 0, verify_notes: notes.join(', ') };
}
