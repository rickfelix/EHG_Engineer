/**
 * Parked-chairman-SMS STALE escalation — SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001 / FR-3.
 *
 * scripts/adam-quiet-tick.mjs's surfaceParkedChairmanSms already logs a QUIET_TICK_SMS_PARKED
 * line for EVERY parked row on EVERY quiet tick, with zero age-based distinction — confirmed
 * by direct code read (ageMin is computed but only used for display). That is exactly how 356
 * rows accumulated silently: the alarm exists, but every row looks the same regardless of
 * whether it is 2 minutes or 6 days old, so it reads as routine noise, not an escalation.
 *
 * This module supplies the missing TIME axis, mirroring lib/governance/real-build-stall-alarm.mjs's
 * pure tiered-clock pattern: a parked row that has sat unresolved for longer than
 * DEFAULT_STALE_PARKED_MINUTES gets a DISTINCT, grep-able tag (QUIET_TICK_SMS_PARKED_STALE) so
 * it cannot be lost among fresh, still-routine parked rows. Additive only — the existing
 * QUIET_TICK_SMS_PARKED line and surfaceParkedChairmanSms's own query/sort are unchanged.
 *
 * Pure (data-in / verdict-out): zero I/O, zero DB, never throws.
 */

/**
 * DEFAULT_STALE_PARKED_MINUTES — 24 hours. The chairman's channel must not be able to silently
 * strand his words; 24h is the outside bound for "someone should have looked at this by now"
 * without being so tight that a routine few-hour parked row false-alarms.
 * @type {number}
 */
export const DEFAULT_STALE_PARKED_MINUTES = 24 * 60;

/**
 * Has a parked SMS row been unresolved long enough to warrant the distinct STALE escalation?
 * Inclusive at the threshold — exactly 24h counts as stale, matching "must not sit >24h" read
 * as "must not still be silent AT 24h", not "must wait until 24h + 1 minute".
 * @param {number} ageMin - minutes since parked_at (surfaceParkedChairmanSms's own ageMin field)
 * @param {number} [thresholdMin=DEFAULT_STALE_PARKED_MINUTES]
 * @returns {boolean}
 */
export function isStaleParkedSms(ageMin, thresholdMin = DEFAULT_STALE_PARKED_MINUTES) {
  return Number.isFinite(ageMin) && Number.isFinite(thresholdMin) && ageMin >= thresholdMin;
}
