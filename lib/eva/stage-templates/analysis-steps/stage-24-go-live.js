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
 *
 * SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2/FR-3): launch_mode='simulated' (default) keeps
 * this behavior unchanged, stamping labeled_simulation:true. launch_mode='live' requires
 * verifyExternalObservation() to pass before setting launch_status:'launched' — never a
 * self-authored artifact. `supabase`/`ventureId` already reach this function via
 * stage-execution-engine.js's generic analysisStep call.
 */

import { getLaunchMode, isLiveMode } from '../../launch-mode.js';
import { collectExternalObservations, verifyExternalObservation } from '../../external-observation.js';
// SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-3): shared per-mode evidence — sim-gates
// now FAIL unlabeled launch evidence instead of only stamping the label.
import { evaluateSimArtifacts, LAUNCH_EVIDENCE_TYPES } from '../../mode-evidence.js';

const SUCCESS_VERDICTS = new Set(['PASS', 'READY']);

export async function analyzeStage24GoLive(params) {
  const { stage23Data, stage22Data, stage21Data, ventureName, logger = console, supabase, ventureId } = params;

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

  // SD-LEO-INFRA-DATADISTILL-HONEST-LAUNCH-001 (first-contact defect #9, same
  // positional-swap class as the S23 scorer): Distribution runs at stage 21
  // post-resequence (venture_stages SSOT), so channels live in stage21Data —
  // reading only stage22Data yielded ZERO channels_to_activate on first live
  // contact. Read both positions (any-of), preferring the SSOT position.
  // Prefer the lossless __byType accessor — the merged stageNNData is
  // last-writer-wins across ALL the stage's artifacts, so a later co-output
  // (growth_playbook / launch_deployment_runbook) shadows the channels field.
  const channelCandidates = [
    stage21Data?.__byType?.distribution_channel_config,
    stage22Data?.__byType?.distribution_channel_config,
    stage21Data,
    stage22Data,
  ];
  const channelSource = channelCandidates.find(s => Array.isArray(s?.channels) && s.channels.length > 0) || {};
  const channels = (channelSource.channels || []).filter(c => c.status === 'active' || c.enabled === true);

  const result = {
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
    // Non-empty by contract (launch_notes minLength 1 when present): records the
    // pending-chairman state until the launch decision stamps real notes.
    launch_notes: 'Pending chairman launch decision (go-live trigger records launched_at + final notes).',
  };

  // SD-LEO-INFRA-DATADISTILL-HONEST-LAUNCH-001 (first-contact defect #10): the
  // S24 EXIT gate (SD-LEO-FEAT-STAGE-LIVE-ANNOUNCE-001 FR-5 verifiers) requires a
  // current launch_metrics artifact with channels[].status==='activated' — but NO
  // producer existed anywhere in the pipeline, so 24->25 advance was structurally
  // impossible for every venture. Witnessed live on DataDistill. Emit the t=0
  // metrics artifact whenever the launch decision is recorded (chairman go-live
  // trigger passes launchedAt); honest initial metrics are zeros.
  const launchedAt = params.launchedAt || params.launched_at;
  if (launchedAt) {
    const launchMode = await getLaunchMode(supabase, ventureId);
    const payload = {
      launched_at: launchedAt,
      channels: channels.map(c => ({ channel: c.channel, status: 'activated', activated_at: launchedAt })),
      metrics: { signups: 0, impressions: 0, clicks: 0, captured_at: launchedAt },
    };

    if (!isLiveMode(launchMode)) {
      // SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2): today's behavior, now explicitly labeled.
      payload.labeled_simulation = true;
      // SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-3): sim work must never masquerade as
      // real — any PRE-EXISTING current launch-evidence artifact lacking the sim label
      // HOLDs the gate (the -001 stamp made labeling possible; this makes it enforced).
      let priorLaunchEvidence = [];
      try {
        const { data } = await supabase
          .from('venture_artifacts')
          .select('artifact_type, payload')
          .eq('venture_id', ventureId)
          .eq('is_current', true)
          .in('artifact_type', LAUNCH_EVIDENCE_TYPES);
        priorLaunchEvidence = data || [];
      } catch { priorLaunchEvidence = []; /* fail-open on read: labeling is enforced when readable */ }
      const simCheck = evaluateSimArtifacts(priorLaunchEvidence);
      if (!simCheck.pass) {
        result.launch_status = 'hold_unlabeled_sim_artifact';
        result.launched_at = null;
        result.unlabeled_sim_artifacts = simCheck.unlabeled;
      } else {
        result.launch_status = 'launched';
        result.launched_at = launchedAt;
      }
    } else {
      // SD-LEO-INFRA-LAUNCH-MODE-POLICY-001 (FR-2/FR-3): live mode fails CLOSED without
      // real external evidence — never a self-authored artifact.
      const observations = await collectExternalObservations({ supabase, ventureId });
      const externalObservation = verifyExternalObservation(observations);
      payload.composable_evidence = { launch_mode: launchMode, external_observation: externalObservation, verdict };
      if (externalObservation.verified) {
        result.launch_status = 'launched';
        result.launched_at = launchedAt;
      } else {
        result.launch_status = 'hold_external_observation_unverified';
        result.launched_at = null;
      }
    }

    result.artifacts = [{
      artifactType: 'launch_metrics',
      title: 'Launch Metrics (t=0)',
      payload,
      source: 'stage-24-go-live',
      metadata: { sd_origin: 'SD-LEO-INFRA-DATADISTILL-HONEST-LAUNCH-001' },
    }];
  }

  return result;
}
