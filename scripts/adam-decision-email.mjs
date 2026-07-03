// adam-decision-email.mjs — SD-LEO-INFRA-LEAN-DECISION-EMAIL-001
//
// The LEAN, on-demand chairman DECISION email. The chairman disabled the hourly exec-summary and now
// relies on on-demand decision emails as his assurance + action channel — so this email carries the
// DECISION (its real title/context/recommendation, rendered by the decision's ACTUAL type), NOT the
// hourly status block (workers / build-% / rung / meta-ratio / distance-to-quit / in-progress SDs).
//
// It reads the BASE chairman_decisions table (the chairman_pending_decisions VIEW hardcodes
// decision_type='chairman_approval', titles it 'Stage N Chairman Approval', and drops brief_data —
// so a session_question is mis-rendered as a venture sign-off). Spawned by escalateChairmanDecision
// (lib/chairman/record-pending-decision.mjs) with --decision <id>. Fail-soft; --dry-run prints only.
// No emojis (chairman directive).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { renderLeanDecisionEmail, filterStaleLeanDecisions, DEAD_VENTURE_STATUSES } from '../lib/chairman/decision-layman.mjs';

const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const DRY = !!process.env.ADAM_EMAIL_DRYRUN || process.argv.includes('--dry-run');
const EM = '—';

// --decision <id>: the escalated decision to lead with (and include other pending decisions too).
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const primaryId = argValue('--decision');

// ── Read the BASE chairman_decisions table (real decision_type + brief_data) ──
const COLS = 'id,decision_type,summary,brief_data,lifecycle_stage,blocking,venture_id,recommendation,status,created_at';
let rows = [];
try {
  const { data, error } = await db.from('chairman_decisions')
    .select(COLS).eq('status', 'pending').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  rows = data || [];
  // Ensure the escalated decision is present even if a race left it just outside the pending window.
  if (primaryId && !rows.some((r) => r.id === primaryId)) {
    const { data: one } = await db.from('chairman_decisions').select(COLS).eq('id', primaryId).maybeSingle();
    if (one) rows = [one, ...rows];
  }
} catch (e) {
  console.warn('[adam-decision-email] base read failed (fail-soft): ' + (e?.message || e));
}

if (rows.length === 0) {
  console.log('[adam-decision-email] no pending decisions — nothing to send');
  process.exit(0);
}

// QF-20260702-241: drop stale/superseded venture-linked rows (cancelled/killed/archived venture, or
// an earlier stage superseded by a later stage on the same venture) before rendering — verified live
// 2026-07-02: 9 of 12 pending rows were such noise. Fail-soft: a venture-status lookup error simply
// skips the filter (show all), mirroring adam-exec-summary.mjs's dead-venture pattern.
let deadVentureIds = new Set();
try {
  const vids = [...new Set(rows.filter((r) => r.venture_id).map((r) => r.venture_id))];
  if (vids.length) {
    const { data: vrows, error: vErr } = await db.from('ventures').select('id, status').in('id', vids);
    if (!vErr) {
      const found = new Set((vrows || []).map((v) => v.id));
      deadVentureIds = new Set(vids.filter((id) => !found.has(id) || (vrows || []).some((v) => v.id === id && DEAD_VENTURE_STATUSES.has(String(v.status || '').toLowerCase()))));
    }
  }
} catch (e) { console.warn('[adam-decision-email] venture-status filter skipped (fail-soft): ' + (e?.message || e)); }
const { kept, excludedCount } = filterStaleLeanDecisions(rows, { deadVentureIds, primaryId });

const { subject, lines } = renderLeanDecisionEmail(kept, new Date(), { primaryId });

// ── Body: the DECISION content + the copy-paste-to-Claude-Code action block. NO status block. ──
const LEAD_IN = "I have received the following executive decision(s) via email and I'm ready to address them:";
const numbered = lines.map((l, i) => `${i + 1}. ${l}`);
const copyBlock = [LEAD_IN, '', ...numbered].join('\n');
const n = lines.length;
const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
const footer = `as of ${when} ET ${EM} Adam ${EM} LEO Fleet Advisor` + (excludedCount > 0 ? ` ${EM} ${excludedCount} stale suppressed` : '');

const text = [
  `${n} decision${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} you.`,
  '   Press and hold the text below, Select All, Copy — then paste it into Claude Code.',
  '──────────────────────────────────────────────',
  '',
  copyBlock,
  '',
  footer,
].join('\n');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = '<div style="font-family:system-ui,Arial,sans-serif;max-width:640px">' +
  `<p style="font-size:14px;margin:0 0 2px"><b>${n} decision${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} you.</b></p>` +
  `<p style="font-size:12px;color:#888;margin:0 0 6px">On your phone, press and hold the box below, tap "Select All", then "Copy" — then paste it into Claude Code.</p>` +
  `<pre style="font-size:13px;background:#f6f8fa;border:1px solid #e1e4e8;border-radius:4px;padding:12px;white-space:pre-wrap;margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;-webkit-user-select:all;user-select:all">${esc(copyBlock)}</pre>` +
  `<p style="font-size:11px;color:#999;margin:14px 0 0">${esc(footer)}</p></div>`;

if (DRY) {
  console.log('=== [ADAM DECISION EMAIL — DRY RUN] no email sent ===\nSUBJECT: ' + subject + '\n---\n' + text + '\n---');
} else {
  try {
    const mod = await import(pathToFileURL(resolve('lib/notifications/resend-adapter.js')).href);
    const r = await mod.sendEmail({ from: 'Adam ' + EM + ' LEO Fleet Advisor <onboarding@resend.dev>', to: process.env.CLAUDE_NOTIFY_EMAIL, subject, html, text });
    console.log('ADAM-DECISION-EMAIL', JSON.stringify(r));
  } catch (e) {
    console.warn('[adam-decision-email] send failed (fail-soft): ' + (e?.message || e));
  }
}
