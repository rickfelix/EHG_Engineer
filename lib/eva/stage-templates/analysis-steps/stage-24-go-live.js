/**
 * Stage 24 Analysis Step — Go Live & Announce
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-E
 *
 * Chairman triggers launch. Records launch timestamp and channel activation.
 *
 * SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-4: Entry-precondition verification.
 * Mirrors the preflightUpstream pattern from stage-23-launch-readiness.js but
 * applies it to the IMMEDIATE upstream verdict (not source artifacts) — Stage 24
 * must refuse if Stage 23's launch_readiness_checklist did not pass.
 *
 * VERDICT NOMENCLATURE NOTE (PRD ↔ code reconciliation):
 *   PRD FR-4 specifies PASS/FAIL/HOLD verdict values; production stage-23-launch-readiness.js
 *   emits READY/NOT_READY/HOLD/SKIPPED. We accept BOTH 'PASS' (PRD literal) AND 'READY'
 *   (production reality) as the success verdict to honor both contracts. Documented in
 *   PRD.metadata.implementation_notes for SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001. Future
 *   parity work (S23 emitting 'PASS' OR S24 PRD updated to 'READY') tracked separately.
 */

const SUCCESS_VERDICTS = new Set(['PASS', 'READY']);

export async function analyzeStage24GoLive(params) {
  const { stage23Data, stage22Data, ventureName, logger = console } = params;

  logger.info?.(`[S24-GoLive] Processing go-live for ${ventureName || 'unknown'}`);

  // FR-4: refuse if upstream Stage 23 verdict is not PASS/READY (or HOLD with chairman override)
  const verdict = stage23Data?.verdict;
  const chairmanOverride = stage23Data?.chairman_override === true;
  const successVerdict = SUCCESS_VERDICTS.has(verdict);
  const allowedHold = verdict === 'HOLD' && chairmanOverride;
  if (!successVerdict && !allowedHold) {
    throw new Error(
      `[S24-GoLive] Refused — Stage 23 launch_readiness_checklist verdict='${verdict ?? 'MISSING'}' ` +
      'does not satisfy go-live precondition (required: \'PASS\'/\'READY\', or \'HOLD\' with chairman_override=true).'
    );
  }

  const channels = (stage22Data?.channels || []).filter(c => c.status === 'active');

  return {
    launch_status: 'ready_to_launch',
    readiness_verdict: verdict,
    chairman_override_applied: allowedHold,
    venture_name: ventureName,
    channels_to_activate: channels.map(c => ({
      channel: c.channel,
      ad_copy_ready: !!c.ad_copy?.headline,
      targeting_ready: !!c.targeting?.audience,
    })),
    total_channels: channels.length,
    launched_at: null, // Set by chairman decision
    launch_notes: '',
  };
}
