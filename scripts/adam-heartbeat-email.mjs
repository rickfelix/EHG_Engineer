// adam-heartbeat-email.mjs — QF-20260702-433
//
// Chairman directive 2026-07-02: Adam sends a half-hourly reassurance email whose SUBJECT
// alone signals all-is-well ("All good - Adam heartbeat <time> ET"), so silence never reads
// as stuck. Caller (the recurring tick prompt) composes ONE fresh, honest status line and
// passes it via --body; this script never fabricates a status of its own. If something is
// actually wrong, the caller sends the decision/alert email instead (adam-decision-email.mjs)
// rather than invoking this script — this script itself does no "is everything ok" judgment.
//
// Fail-soft; --dry-run prints only. No emojis (chairman directive, mirrors adam-decision-email.mjs).
import 'dotenv/config';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const DRY = !!process.env.ADAM_EMAIL_DRYRUN || process.argv.includes('--dry-run');
const EM = '—';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const body = argValue('--body');

if (!body || !body.trim()) {
  console.warn('[adam-heartbeat-email] --body "<line>" is required — nothing sent');
  process.exit(0);
}

const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
// Chairman Gmail-filter contract (2026-07-03): heartbeat subjects ALWAYS start with the exact
// token "[ALL GOOD - ADAM]"; decision/action emails ALWAYS start with "[ACTION NEEDED - ADAM]"
// (lib/chairman/decision-layman.mjs). His Gmail alerting keys on these literal strings —
// never change either token without chairman sign-off.
const subject = `[ALL GOOD - ADAM] heartbeat ${when} ET`;
const text = `${body.trim()}\n\nas of ${when} ET ${EM} Adam ${EM} LEO Fleet Advisor`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = '<div style="font-family:system-ui,Arial,sans-serif;max-width:640px">' +
  `<p style="font-size:14px;margin:0 0 8px">${esc(body.trim())}</p>` +
  `<p style="font-size:11px;color:#999;margin:14px 0 0">as of ${when} ET ${EM} Adam ${EM} LEO Fleet Advisor</p></div>`;

if (DRY) {
  console.log('=== [ADAM HEARTBEAT EMAIL — DRY RUN] no email sent ===\nSUBJECT: ' + subject + '\n---\n' + text + '\n---');
} else {
  try {
    const mod = await import(pathToFileURL(resolve('lib/notifications/resend-adapter.js')).href);
    const r = await mod.sendEmail({ from: 'Adam ' + EM + ' LEO Fleet Advisor <onboarding@resend.dev>', to: process.env.CLAUDE_NOTIFY_EMAIL, subject, html, text });
    console.log('ADAM-HEARTBEAT-EMAIL', JSON.stringify(r));
  } catch (e) {
    console.warn('[adam-heartbeat-email] send failed (fail-soft): ' + (e?.message || e));
  }
}
