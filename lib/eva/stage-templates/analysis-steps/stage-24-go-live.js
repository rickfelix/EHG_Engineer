/**
 * Stage 24 Analysis Step — Go Live & Announce
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-E
 *
 * Chairman triggers launch. Records launch timestamp and channel activation.
 */

export async function analyzeStage24GoLive(params) {
  const { stage23Data, stage22Data, ventureName, logger = console } = params;

  logger.info?.(`[S24-GoLive] Processing go-live for ${ventureName || 'unknown'}`);

  const launchReadiness = stage23Data?.verdict || 'UNKNOWN';
  const channels = (stage22Data?.channels || []).filter(c => c.status === 'active');

  return {
    launch_status: launchReadiness === 'READY' ? 'ready_to_launch' : 'blocked',
    readiness_verdict: launchReadiness,
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
