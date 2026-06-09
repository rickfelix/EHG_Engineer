// adam-exec-summary v2 — chairman-lens exec summary (Adam-owned). Dual focus (chairman 2026-06-08): pilot
// (DataDistill, issue-discovery VEHICLE) + venture-process improvement (the real deliverable). Pilot pace =
// "advancing as the process fixes land", not "stalled". Value section classifies shipped SDs into
// capabilities / enablers / problems-solved. Trends on every line. Reuses coordinator fleet card verbatim.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

const EM = '—', UP = ' ↑', DN = ' ↓';
const I = { star: '\u{1F3AF}', flag: '⛳', tools: '\u{1F6E0}', loop: '\u{1F501}', siren: '\u{1F6A8}' };
const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const t = Date.now();
const DRY = !!process.env.ADAM_EMAIL_DRYRUN;
const SNAP = resolve('.adam-email-last.json');
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const arrow = (cur, prev) => (typeof prev !== 'number' || cur === prev) ? '' : (cur > prev ? UP : DN);
let snap = {}; try { snap = JSON.parse(readFileSync(SNAP, 'utf8')); } catch { snap = {}; }
const TERMINAL = "(completed,cancelled,archived,deferred)";
const PROCESS_RX = /LIFECYCLE|STAGE|VENTURE|GROWTH|LAUNCH|DISTRIBUTION|OPERATIONS|POST-BUILD|S2[0-6]|VISUAL|PLAYBOOK/i;

let cardText = '(fleet card unavailable)', cardSubject = 'Fleet';
try {
  const out = execSync('node --env-file=.env scripts/coordinator-email-summary.mjs', { encoding: 'utf8', env: { ...process.env, COORD_EMAIL_DRYRUN: '1' } });
  const sm = out.match(/SUBJECT:\s*(.+)/); if (sm) cardSubject = sm[1].trim();
  const parts = out.split('---'); if (parts.length >= 2) cardText = parts[1].trim();
} catch (e) { cardText = '(fleet card error)'; }

let pilotStage = 0;
try {
  const { data: v } = await db.from('ventures').select('id').ilike('name', '%datadistill%').limit(1);
  if (v && v[0]) { const { data: a } = await db.from('venture_artifacts').select('lifecycle_stage').eq('venture_id', v[0].id).order('lifecycle_stage', { ascending: false }).limit(1); pilotStage = (a && a[0]) ? (a[0].lifecycle_stage || 0) : 0; }
} catch {}
let procInFlight = 0;
try { const { data: open } = await db.from('strategic_directives_v2').select('sd_key,scope,title').not('status', 'in', TERMINAL); procInFlight = (open || []).filter(r => PROCESS_RX.test(String(r.sd_key) + ' ' + String(r.title) + ' ' + String(r.scope))).length; } catch {}
const northStar = 'Pilot DataDistill S' + pilotStage + '/26' + (arrow(pilotStage, snap.pilotStage) || ' (steady)') + ' ' + EM + ' advancing as the process fixes it surfaced land. ' + procInFlight + ' process SDs in flight (stages 20-26 + ops).';

let needs = []; try { needs = JSON.parse(readFileSync(resolve('.adam-chairman-decisions.json'), 'utf8')) || []; } catch {}

const since = new Date(t - 24 * 3600 * 1000).toISOString(); // value section = rolling 24h (substantive), not the 30-min cadence
let buckets = { cap: [], enab: [], prob: [] }, shippedN = 0, completedNow = snap.completedCount;
try {
  const r = await db.from('strategic_directives_v2').select('sd_key', { count: 'exact', head: true }).eq('status', 'completed'); completedNow = r.count;
  const { data: done } = await db.from('strategic_directives_v2').select('sd_key,title,sd_type').eq('status', 'completed').gte('updated_at', since).order('updated_at', { ascending: false }).limit(40);
  shippedN = (done || []).length;
  const clean = (s) => String(s || '').replace(/^(SD-[A-Z0-9-]+:?\s*)/i, '').replace(/\s+/g, ' ').trim();
  const trunc = (s, n) => { s = clean(s); if (s.length <= n) return s; const cut = s.slice(0, n); const sp = cut.lastIndexOf(' '); return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.:;—-]+$/, '') + '…'; };
  for (const r2 of (done || [])) {
    const k = String(r2.sd_key || '').toUpperCase(); const ty = String(r2.sd_type || '').toLowerCase();
    const label = trunc(r2.title, 50);
    if (ty === 'bugfix' || ty === 'fix' || /\b(FIX|GUARD|BUG|HANG|DRIFT|REPAIR|RESIDUAL|VALIDATE)\b/.test(k)) buckets.prob.push(label);
    else if (ty === 'feature' || /(FEAT|GATE|LIFECYCLE|CONVERT|HARDEN)/.test(k)) buckets.cap.push(label);
    else buckets.enab.push(label);
  }
} catch {}
const bucketLine = (arr, n) => arr.length ? (arr.slice(0, n).join(' · ') + (arr.length > n ? ' · +' + (arr.length - n) + ' more' : '')) : 'none';

let selfLabel = 'pending', selfScore = snap.selfScore, coordRev = 'pending';
try {
  const { data: a } = await db.from('feedback').select('description').eq('category', 'adam_self_assessment').order('created_at', { ascending: false }).limit(1);
  const { data: c } = await db.from('feedback').select('description').eq('category', 'coordinator_review').order('created_at', { ascending: false }).limit(1);
  try { const o = JSON.parse((a && a[0] && a[0].description) || '{}'); selfLabel = o.overall || 'pending'; const m = String(selfLabel).match(/(\d+)\s*\/\s*40/); if (m) selfScore = parseInt(m[1], 10); } catch {}
  try { const co = JSON.parse((c && c[0] && c[0].description) || '{}'); coordRev = co.overall || ((c && c[0]) ? 'on file' : 'pending'); } catch { coordRev = (c && c[0]) ? 'on file' : 'pending'; }
} catch {}
const selfLine = 'Adam self-score ' + selfLabel + arrow(selfScore, snap.selfScore) + '; coordinator self-score ' + coordRev;

let canaryN = 0; try { const r = await db.from('feedback').select('id', { count: 'exact', head: true }).eq('status', 'new').eq('severity', 'high').in('category', ['harness_backlog', 'ci_failure', 'corrective_finding']); canaryN = r.count || 0; } catch {}
const canaryLine = canaryN ? (canaryN + ' high-sev open' + (arrow(canaryN, snap.canaryCount) || ' (steady)')) : 'no high-sev flags';

// QF-20260609-024: skip-if-unchanged. Now this is the chairman's default-on ~30min channel, only
// email when something MATERIAL changed since the last send — keyed on the decision-relevant content
// (RAG headline, needs, pilot stage, 24h value buckets, self-scores, canary), deliberately EXCLUDING
// the timestamp. ADAM_EMAIL_FORCE=1 overrides (manual sends always go). DRY runs always print.
const sig = JSON.stringify({
  needs: needs.map(d => d.priority + ':' + d.label), pilotStage, procInFlight, shippedN,
  cap: buckets.cap, enab: buckets.enab, prob: buckets.prob, selfLabel, coordRev, canaryN, cardSubject,
});

const when = new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
const subject = '[Chairman] Pilot S' + pilotStage + '/26 ' + EM + ' ' + needs.length + ' need you ' + EM + ' ' + procInFlight + ' process SDs ' + EM + ' ' + cardSubject;
const text = [
  'STRATEGIC ' + EM + ' chairman lens (two focuses: drive the pilot + improve the venture process)', '',
  'NORTH STAR: ' + northStar, '',
  'NEEDS YOU (' + needs.length + '):', ...needs.map(d => '  - [' + d.priority + '] ' + d.label), '',
  'VALUE DELIVERED (last 24h, ' + shippedN + ' SDs):',
  '  Capabilities added (' + buckets.cap.length + '): ' + bucketLine(buckets.cap, 3),
  '  Enablers added (' + buckets.enab.length + '): ' + bucketLine(buckets.enab, 3),
  '  Problems solved (' + buckets.prob.length + '): ' + bucketLine(buckets.prob, 3), '',
  'SELF-IMPROVEMENT (tri-party): ' + selfLine, '',
  'CANARY: ' + canaryLine, '',
  '--- FLEET HEALTH ---', cardText
].join('\n');
const needsHtml = needs.length ? '<ul style="margin:2px 0 0;padding-left:16px;font-size:13px">' + needs.map(d => '<li style="margin:0 0 3px"><b>[' + esc(d.priority) + ']</b> ' + esc(d.label) + '</li>').join('') + '</ul>' : '<span style="font-size:13px">nothing pending</span>';
const valHtml = '<ul style="margin:2px 0 0;padding-left:16px;font-size:13px">' +
  '<li style="margin:0 0 3px"><b>Capabilities added (' + buckets.cap.length + '):</b> ' + esc(bucketLine(buckets.cap, 3)) + '</li>' +
  '<li style="margin:0 0 3px"><b>Enablers added (' + buckets.enab.length + '):</b> ' + esc(bucketLine(buckets.enab, 3)) + '</li>' +
  '<li style="margin:0 0 3px"><b>Problems solved (' + buckets.prob.length + '):</b> ' + esc(bucketLine(buckets.prob, 3)) + '</li></ul>';
const html = '<div style="font-family:system-ui,Arial,sans-serif;max-width:640px">' +
  '<p style="font-size:16px;font-weight:600;margin:0 0 2px">Strategic ' + EM + ' chairman lens</p>' +
  '<p style="font-size:12px;color:#777;margin:0 0 10px">Two focuses: drive the pilot (issue-discovery vehicle) + improve the venture-management process</p>' +
  '<p style="font-size:14px;margin:0 0 8px">' + I.star + ' <b>North star:</b> ' + esc(northStar) + '</p>' +
  '<p style="font-size:14px;margin:0 0 2px">' + I.flag + ' <b>Needs you (' + needs.length + '):</b></p>' + needsHtml +
  '<p style="font-size:14px;margin:10px 0 2px">' + I.tools + ' <b>Value delivered (last 24h, ' + shippedN + ' SDs):</b></p>' + valHtml +
  '<p style="font-size:14px;margin:10px 0 2px">' + I.loop + ' <b>Self-improvement:</b> ' + esc(selfLine) + '</p>' +
  '<p style="font-size:14px;margin:0 0 12px">' + I.siren + ' <b>Canary:</b> ' + esc(canaryLine) + '</p>' +
  '<p style="font-size:13px;font-weight:600;color:#555;margin:0 0 4px">Fleet health</p>' +
  '<pre style="font-size:13px;background:#f6f8fa;border-radius:4px;padding:10px;white-space:pre-wrap;margin:0">' + esc(cardText) + '</pre>' +
  '<p style="font-size:11px;color:#999;margin:12px 0 0">' + when + ' ET ' + EM + ' Adam ' + EM + ' LEO Fleet Advisor</p></div>';

if (DRY) { console.log('=== [ADAM DRY RUN] no email sent ===\nSUBJECT: ' + subject + '\n---\n' + text + '\n---'); }
else if (!process.env.ADAM_EMAIL_FORCE && snap.sig === sig) {
  // QF-20260609-024: nothing material changed since the last send → skip (don't spam the chairman on
  // every 30-min tick). Leave the snapshot untouched so trend arrows still compare against the last SENT
  // state and the signature persists for the next comparison.
  console.log('ADAM-EMAIL skipped (unchanged since last send)');
}
else {
  const mod = await import(pathToFileURL(resolve('lib/notifications/resend-adapter.js')).href);
  const r = await mod.sendEmail({ from: 'Adam ' + EM + ' LEO Fleet Advisor <onboarding@resend.dev>', to: process.env.CLAUDE_NOTIFY_EMAIL, subject, html, text });
  console.log('ADAM-EMAIL', JSON.stringify(r));
  try { writeFileSync(SNAP, JSON.stringify({ lastTs: t, pilotStage, completedCount: completedNow, selfScore, canaryCount: canaryN, sig })); } catch {}
}
