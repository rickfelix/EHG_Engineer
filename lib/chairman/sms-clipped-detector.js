/**
 * QF-20260830-874: 14 inbound chairman SMS specimens over 8 days landed at EXACTLY
 * 1600 characters, every one ending mid-sentence/mid-word (e.g. 08277ba3, "...waiting pre").
 * A ceiling exactly this many rows touch and none exceed is a cap, not coincidence -- 1600
 * is the standard Twilio concatenated-SMS Body length (10 segments x 160 GSM-7 chars), a
 * known platform-side limit on the inbound webhook payload, not our ingest write path (no
 * sms_relay_staging write site in this repo truncates/substrings body_raw before insert).
 *
 * No DB migration (a new `clipped` column would need chairman-gated DDL apply, out of scope
 * for a worker-authored QF) -- instead, every consumer derives "possibly clipped" from the
 * same length-1600 tell at READ time, so a truncated message can never again read as complete.
 */
const TWILIO_CONCATENATED_SMS_CAP = 1600;

export function isPossiblyClippedSmsBody(body) {
  return typeof body === 'string' && body.length === TWILIO_CONCATENATED_SMS_CAP;
}

export function withClippedMarker(body) {
  return isPossiblyClippedSmsBody(body) ? `[POSSIBLY CLIPPED at ${TWILIO_CONCATENATED_SMS_CAP} chars] ${body}` : body;
}
