/**
 * Canonical wall-clock helpers for chairman-channel scheduling, zone-parameterized (default
 * America/New_York). SD-LEO-INFRA-SMS-DELIVERY-TRUTH-001-A (Solomon Pin #1: sleep-window at
 * release time).
 *
 * Ported verbatim from scripts/cron/chairman-morning-review-sweep.mjs (the DST-correct
 * double-pass etWallClockUtc arithmetic) so this SD's new SMS retry-release gate reuses the
 * already-proven implementation instead of a fourth ad-hoc copy. That script now imports from
 * here instead of holding its own local definitions (consolidation, not just addition).
 *
 * SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (FR-4, TR-2): every exported function takes an
 * optional trailing `zone` (IANA string, default 'America/New_York') threaded through the
 * private etParts/etWallClockUtc helpers below. Still pure functions of (now, zone) — zero I/O.
 * Callers resolve the chairman's zone (FR-2's resolveChairmanZone) ONCE per invocation and pass
 * it in; omitting `zone` is byte-identical to the pre-FR-4 ET-only behavior.
 */
const TZ = 'America/New_York';
// SMS sleep-window: 10PM-6AM local (distinct from resend-adapter.js's 11PM-5AM EMAIL quiet
// window — a deliberately different, less-intrusive boundary for a different channel, untouched).
const SMS_QUIET_START_HOUR = 22;
const SMS_QUIET_END_HOUR = 6;

function etParts(instant, zone = TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const x of dtf.formatToParts(instant)) p[x.type] = x.value;
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === '24' ? 0 : Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
}
export function etLocalHour(now, zone = TZ) { return etParts(now, zone).hour; }
export function etLocalMinute(now, zone = TZ) { return etParts(now, zone).minute; }
export function etDateStr(now, zone = TZ) { const p = etParts(now, zone); return `${p.year}-${p.month}-${p.day}`; }
/** ms the target zone is ahead of UTC at `instant` (negative when behind UTC). */
function tzOffsetMs(instant, zone = TZ) {
  const p = etParts(instant, zone);
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), p.hour, p.minute, p.second) - instant.getTime();
}
/** The UTC instant for a given local wall-clock time on today's calendar date in `zone`. */
function etWallClockUtc(now, hour, minute = 0, zone = TZ) {
  const p = etParts(now, zone);
  const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), hour, minute, 0);
  let t = wall - tzOffsetMs(new Date(wall), zone);
  t = wall - tzOffsetMs(new Date(t), zone); // second pass converges near a DST edge
  return new Date(t);
}
export function et6amIso(now, zone = TZ) { return etWallClockUtc(now, 6, 0, zone).toISOString(); }

/**
 * SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001: the current zone-local hour bucket as a
 * [startIso, endIso) UTC pair, plus a stable string key (YYYY-MM-DDTHH, zone-local) for
 * dedupe-key construction. Exported per the PLAN-phase TESTING sub-agent finding (G8): reuse
 * this module's DST-correct etWallClockUtc arithmetic rather than forking a second copy in the
 * new hourly-heartbeat-backstop sweep. Approximate-width bucket (not perfectly exact across a
 * DST spring-forward/fall-back edge) -- adequate for "was anything sent in roughly the last
 * chairman-local hour", not a precision clock.
 * @param {Date} now
 * @param {string} [zone] IANA zone, default 'America/New_York'
 * @returns {{startIso: string, endIso: string, hourKey: string}}
 */
export function etHourWindowUtc(now, zone = TZ) {
  const p = etParts(now, zone);
  const start = etWallClockUtc(now, p.hour, 0, zone);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const hourKey = `${p.year}-${p.month}-${p.day}T${String(p.hour).padStart(2, '0')}`;
  return { startIso: start.toISOString(), endIso: end.toISOString(), hourKey };
}
/** The prior 5:45 AM local instant (~24h back) as the "what moved yesterday" window start. */
export function etPrior545Iso(now, zone = TZ) { return new Date(etWallClockUtc(now, 5, 45, zone).getTime() - 24 * 60 * 60 * 1000).toISOString(); }

/** True inside the 10PM-6AM local SMS sleep window. */
export function isSmsQuietHour(now, zone = TZ) {
  const hour = etLocalHour(now, zone);
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
 * @param {string} [zone] IANA zone, default 'America/New_York' (FR-4)
 * @returns {string|null}
 */
export function smsQuietWindowReleaseIso(now, zone = TZ) {
  const d = now instanceof Date ? now : new Date(now);
  if (!isSmsQuietHour(d, zone)) return null;
  const hour = etLocalHour(d, zone);
  const base = hour >= SMS_QUIET_START_HOUR ? new Date(d.getTime() + 24 * 60 * 60 * 1000) : d;
  return et6amIso(base, zone);
}

/**
 * A canonical IANA zone round-trips identically through Intl's resolvedOptions(). Rejects the
 * whole Etc/GMT* family explicitly: Etc/GMT+5 resolves without throwing but has INVERTED sign
 * semantics (it means UTC-5, the opposite of what "+5" suggests to a human reader) -- Intl
 * alone cannot distinguish "deliberately Etc/GMT" from "a mistake". Also rejects non-canonical
 * casing and legacy aliases ICU silently canonicalizes backward (e.g. Asia/Kolkata ->
 * Asia/Calcutta, Europe/Kyiv -> Europe/Kiev) -- confirmed reproducible.
 *
 * SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 (SEC-QW-02): this is the ONE shared canonical-zone
 * check for both write-time (chairman-preference-store.js's KNOWN_KEY_VALIDATORS) and
 * read-time (quiet-hours-extension.js's deriveChairmanZone) validation. Before this fix the
 * two had independently drifted: the write-time validator only checked the zone didn't
 * throw, so it silently ACCEPTED a legacy-alias zone that the read-time resolver silently
 * REJECTED -- a write that reports success but is discarded at read, the exact
 * write-succeeds/read-disagrees defect class FR-1 exists to eliminate, recurring here.
 * lib/time/chairman-et-wall-clock.js has zero imports/dependencies, so both consumers can
 * share this without a circular import.
 * @param {*} value
 * @returns {boolean}
 */
export function isValidCanonicalZone(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  if (/^Etc\/GMT/i.test(value)) return false;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone === value;
  } catch {
    return false;
  }
}
