#!/usr/bin/env node
/**
 * QF-20260705-614 — deviation-documentation sweep for MarketLens's 14 strategy-layer
 * verdicts (cluster CL-7, SD-LEO-INFRA-MARKETLENS-REMEDIATION-TRIAGE-001).
 *
 * Every listed post_build_verdicts row is a keyword-heuristic false positive: the
 * underlying artifact exists in venture_artifacts with substantial content, is out of
 * adherence-rubric scope, and its PARTIAL/MISSING label came from a single-token
 * comment/fixture collision (e.g. engine_exit_strategy matched process.exit()).
 *
 * Per the coordinator's pack amendment (2026-07-05T16:56Z, Bravo HIGH finding): the
 * verdict engine short-circuits WEAK evidence to PARTIAL before its deviation branch
 * (post-build-verdict-engine.js:317-325 — deviation lookup only fires at
 * evidenceConfidence=NONE), so a deviation record can never flip a PARTIAL back. The
 * deliverable is therefore the ledger row itself (recordDeviation, deviation-ledger.js),
 * NOT deviation_artifact_id linkage on the verdict row — dispositions legally stay
 * PARTIAL/MISSING. Zero product-repo (EHG venture) changes.
 */
import { recordDeviation } from '../../lib/eva/deviation-ledger.js';

export const VENTURE_ID = 'ecbba50e-3c98-4493-9e77-1719cf6b6f00';
export const WHY = 'strategy/launch-layer artifact, not product-wired by design — keyword-heuristic false positive (verdict engine short-circuits WEAK evidence to PARTIAL before its deviation branch; ledger row is the documented-deviation deliverable, not a disposition flip). SD-LEO-INFRA-MARKETLENS-REMEDIATION-TRIAGE-001 cluster CL-7.';

// claim_ref -> optional per-artifact "instead" note. marketing_tagline gets a
// content-refresh note per the ticket ("genuinely minimal at 99 chars") — a note only,
// no product-repo content edit (zero product-repo changes is a hard constraint).
export const CLAIM_REFS = [
  'truth_idea_brief',
  'truth_ai_critique',
  'truth_competitive_analysis',
  'truth_financial_model',
  'engine_business_model_canvas',
  'engine_exit_strategy',
  'identity_gtm_sales_strategy',
  'blueprint_financial_projection',
  'system_devils_advocate_review',
  'build_mvp_build',
  'wireframe_screens',
  'marketing_blog_draft',
  'marketing_social_posts',
  'marketing_tagline',
];

export const INSTEAD_NOTES = {
  marketing_tagline: 'Content-refresh note: tagline artifact content is genuinely minimal (99 chars, "Uncover Market Truths. Price with Precision."). Flagged for a future content pass — not a product-wired gap.',
};

export async function main(supabase) {
  const results = [];
  for (const claimRef of CLAIM_REFS) {
    const id = await recordDeviation(supabase, {
      ventureId: VENTURE_ID,
      artifactRef: claimRef,
      instead: INSTEAD_NOTES[claimRef] ?? null,
      why: WHY,
      decidedBy: 'QF-20260705-614',
      weight: 'declared-descope',
    });
    results.push({ claimRef, deviationRowId: id });
    console.log(`recorded: ${claimRef} -> ${id}`);
  }
  console.log(`\nDone. ${results.length}/${CLAIM_REFS.length} deviation ledger rows recorded.`);
  return results;
}

const isDirectRun = process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;
if (isDirectRun) {
  const { default: dotenv } = await import('dotenv');
  dotenv.config();
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  main(supabase).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
