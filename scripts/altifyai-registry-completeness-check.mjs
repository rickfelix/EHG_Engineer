#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 FR-12.
 *
 * Hard CI gate: every authenticated step_id in AltifyAI's live fourteen-journey
 * specification (venture_artifacts, artifact_type='blueprint_user_journey') must have a
 * registered stepOverride in lib/apa/venture-step-executors.js's ALTIFYAI registration, OR
 * be named on the dated ALLOWLIST below. Wired as a non-continue-on-error step in
 * .github/workflows/altifyai-uat-drift-check-cron.yml (real secrets, daily + workflow_dispatch)
 * -- NOT the vitest 'db' project, whose tests/helpers/db-target.js designates no safe ref and
 * whose sole CI invocation (unit-tier.yml) is informational-only. A db-project test here would
 * skip forever and could never fail the build; this script actually gates it.
 *
 * The allowlist lives ONLY in this file, never as a runtime allowlist inside
 * venture-step-executors.js -- that would silently weaken the :689 fail-closed default for
 * exactly the steps this check exists to protect.
 *
 * Reuses the SAME canonical artifact reader the orchestrator SD-creation path already uses
 * (lib/eva/lifecycle-sd-bridge.js's fetchCurrentJourneyArtifact + deriveJourneySteps), rather
 * than a hardcoded venture_artifacts row id -- robust to the artifact regenerating with a new
 * row (Stage 15 re-run), which a fixed-id read would silently miss.
 *
 * Run via: npm run altifyai:registry-completeness-check
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchCurrentJourneyArtifact } from '../lib/eva/lifecycle-sd-bridge.js';
import { deriveJourneySteps } from '../lib/eva/bridge/orchestrator-journey-steps.js';
import { getVentureRegistration } from '../lib/apa/venture-step-executors.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

// AltifyAI's live venture_id, corrected during this SD's LEAD investigation -- the stale
// 809ec7e7-f688-4a0c-b9f8-c8a8291cf94d in venture-step-executors.js's file-header comment now
// belongs to a different venture ("ApexNiche AI").
export const ALTIFYAI_VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

/**
 * Dated allowlist: step_ids present in the live spec but not yet registered.
 * MUST shrink to empty as FR-1..FR-11 merge; a stale entry (a step_id that IS already
 * registered) is a build-breaking error via the disjointness check below, not a warning.
 * Entries removed as of 2026-09-05: all 11 target step_ids -- SD-ALTIFYAI-LEO-FEAT-STAGE-
 * BUILD-ELEVEN-001's 5 children (A-E) are all status=completed, so no surface is unshipped.
 */
export const ALLOWLIST = Object.freeze([]);

/**
 * Pure logic, DB-free and browser-free -- unit-testable without live credentials.
 * @param {{specStepIds: string[], registryKeys: string[], allowlist?: string[]}} input
 * @returns {{ok: boolean, missing: string[], staleAllowlist: string[]}}
 */
export function checkCompleteness({ specStepIds, registryKeys, allowlist = [] }) {
  const registrySet = new Set(registryKeys);
  const allowSet = new Set(allowlist);

  const missing = specStepIds.filter((id) => !registrySet.has(id) && !allowSet.has(id));
  // Disjointness: an allowlist entry that IS registered is stale and must be removed --
  // otherwise it permanently masks whether that step is genuinely covered.
  const staleAllowlist = allowlist.filter((id) => registrySet.has(id));

  return { ok: missing.length === 0 && staleAllowlist.length === 0, missing, staleAllowlist };
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const journeyArtifactContent = await fetchCurrentJourneyArtifact(supabase, ALTIFYAI_VENTURE_ID);
  const steps = deriveJourneySteps(journeyArtifactContent);
  if (!steps) {
    console.error('::error::altifyai-registry-completeness-check: FAIL CLOSED -- the live blueprint_user_journey artifact for AltifyAI is missing, unreadable, or has zero steps. This is a hard failure, never a silent pass.');
    process.exitCode = 1;
    return;
  }

  const specStepIds = steps.map((s) => s.step_id);
  const { stepOverrides } = getVentureRegistration('ALTIFYAI');
  const registryKeys = Object.keys(stepOverrides);

  const result = checkCompleteness({ specStepIds, registryKeys, allowlist: ALLOWLIST });

  console.log(`Spec step_ids: ${specStepIds.length}`);
  console.log(`Registered overrides: ${registryKeys.length}`);
  console.log(`Allowlist: ${ALLOWLIST.length} ${JSON.stringify(ALLOWLIST)}`);

  if (result.missing.length > 0) {
    console.error(`::error::altifyai-registry-completeness-check: ${result.missing.length} authenticated step_id(s) have NO registered override and are NOT on the allowlist: ${JSON.stringify(result.missing)}`);
  }
  if (result.staleAllowlist.length > 0) {
    console.error(`::error::altifyai-registry-completeness-check: STALE ALLOWLIST -- ${JSON.stringify(result.staleAllowlist)} already has a registered override; remove from ALLOWLIST.`);
  }

  if (!result.ok) {
    process.exitCode = 1;
    return;
  }
  console.log('✅ Registry completeness check passed: every spec step_id is registered or on a non-stale allowlist entry.');
}

// SEC-60 convention (scripts/regen-fr7-source-material-fixture.mjs): process.exitCode, never
// process.exit(), so the Supabase client's open handle drains naturally instead of tripping the
// Windows-only libuv teardown assertion on a mid-flight exit().
if (isMainModule(import.meta.url)) {
  main();
}
