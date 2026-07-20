/**
 * Canonical America/New_York wall-clock helpers for chairman-channel scheduling.
 * SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A (Solomon Pin #1: sleep-window at release time).
 *
 * Ported verbatim from scripts/cron/chairman-morning-review-sweep.mjs (the DST-correct
 * double-pass etWallClockUtc arithmetic) so this SD's new SMS retry-release gate reuses the
 * already-proven implementation instead of a fourth ad-hoc copy. That script now imports from
 * here instead of holding its own local definitions (consolidation, not just addition).
 */
const TZ = 'America/New_York';
// SMS sleep-window: 10PM-6AM ET (distinct from resend-adapter.js's 11PM-5AM EMAIL quiet window
// — a deliberately different, less-intrusive boundary for a different channel, left untouched).
const SMS_QUIET_START_HOUR = 22;
const SMS_QUIET_END_HOUR = 6;

function etParts(instant) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const x of dtf.formatToParts(instant)) p[x.type] = x.value;
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === '24' ? 0 : Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
}
export function etLocalHour(now) { return etParts(now).hour; }
export function etDateStr(now) { const p = etParts(now); return `${p.year}-${p.month}-${p.day}`; }
/** ms the ET zone is ahead of UTC at `instant` (negative — ET is behind UTC). */
function tzOffsetMs(instant) {
  const p = etParts(instant);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), p.hour, p.minute, p.second) - instant.getTime();
}
/** The UTC instant for a given ET wall-clock time on today's ET calendar date. */
function etWallClockUtc(now, hour, minute = 0) {
  const p = etParts(now);
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, minute, 0);
  let t = wall - tzOffsetMs(new Date(wall));
  t = wall - tzOffsetMs(new Date(t)); // second pass converges near a DST edge
  return new Date(t);
}
export function et6amIso(now) { return etWallClockUtc(now, 6).toISOString(); }
/** The prior 5:45 AM ET instant (~24h back) as the "what moved yesterday" window start. */
export function etPrior545Iso(now) { return new Date(etWallClockUtc(now, 5, 45).getTime() - 24 * 60 * 60 * 1000).toISOString(); }

/** True inside the 10PM-6AM ET SMS sleep window. */
export function isSmsQuietHour(now) {
  const hour = etLocalHour(now);
  return hour >= SMS_QUIET_START_HOUR || hour < SMS_QUIET_END_HOUR;
}

/**
 * Solomon Pin #1 (sleep-window AT RELEASE TIME, not just at enqueue): the not_before an
 * obligation should carry when it is being RE-ARMED to 'owed' right now. Returns null when
 * `now` is outside the quiet window (immediate release, no deferral) or the next 6AM ET ISO
 * instant when `now` falls inside it — a message re-armed at 9:58PM ET must not fire at a
 * 10:15PM sweep; morning release is the correct degradation.
 *
 * MIDNIGHT ROLLOVER: et6amIso always computes 6AM on `now`'s OWN ET calendar date. For the
 * 00:00-05:59 ET half of the window that instant is still upcoming (correct as-is). For the
 * 22:00-23:59 ET half, today's 6AM has ALREADY passed — the real next occurrence is tomorrow's
 * 6AM, so the base instant is advanced by a day before computing it.
 * @param {Date|number} now
 * @returns {string|null}
 */
export function smsQuietWindowReleaseIso(now) {
  const d = now instanceof Date ? now : new Date(now);
  if (!isSmsQuietHour(d)) return null;
  const hour = etLocalHour(d);
  const base = hour >= SMS_QUIET_START_HOUR ? new Date(d.getTime() + 24 * 60 * 60 * 1000) : d;
  return et6amIso(base);
}
