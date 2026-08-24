#!/usr/bin/env node
// LEAD-phase Explore evidence for SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001. This SD was promoted
// directly from a bare-title roadmap item (fbd6b295-579d-4d04-8775-2dfb29cd20f5, priority_rank
// 4 of the same W3 GO decision e1da09a3 that produced the just-completed
// SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 -- item 2 of that sequence) with NO real
// description/scope content (metadata.needs_enrichment: ["description","scope"]). This
// evidence enriches it from the actual roadmap record and measured codebase state.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '96219580-132e-4594-a61c-62da9b3eed6d';
const SD_KEY = 'SD-LEO-GEN-ALTIFYAI-DEMAND-LOOP-001';

async function run() {
  const supabase = createSupabaseServiceClient();

  let results = {
    sub_agent_name: 'Explore (roadmap enrichment + premise verification)',
    verdict: 'CONDITIONAL_PASS',
    confidence: 85,
    critical_issues: [],
    warnings: [
      'SD was promoted with essentially no real content -- title only, needs_enrichment flagged. Enriched here from the roadmap_wave_items record and its W3 siblings.',
    ],
    recommendations: [
      'Scope to a referral/invite loop: the most proportionate, code-buildable, genuinely "repeatable" acquisition mechanism given zero existing marketing/analytics/attribution infrastructure -- not a sprawling growth-marketing platform.',
    ],
    detailed_analysis:
      'MEASURED against the roadmap_wave_items table and the real AltifyAI repo (C:/Users/rickf/Projects/_EHG/altifyai, ' +
      'separate Cloudflare Worker app). (a) roadmap_wave_items id fbd6b295-579d-4d04-8775-2dfb29cd20f5 is priority_rank 4 ' +
      'of wave_id 6cda1cf8-a41b-45d0-ae72-9d00fabe41a7 -- the SAME W3 GO decision (decision_id e1da09a3, chairman A ' +
      '"Go and ratify" 16:41-16:46Z 08-24) that produced item 1 (SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001, ' +
      'promoted) and item 2 (SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001, just completed this session). Item 3 ' +
      '(SD-LEO-GEN-ALTIFYAI-FIRST-CUSTOMER-001, "AltifyAI first customer acquisition: initial outreach/demand test to a ' +
      'paying user") is CURRENTLY claimed and in LEAD by a peer session (1a553cdb-...) -- item 3 is a one-off, ' +
      'human-outreach-flavored item; item 4 (this SD) is explicitly the REPEATABLE, code-buildable follow-on, so there ' +
      'is no hard sequencing dependency blocking this SD on item 3s completion (both were dispatched as concurrently ' +
      'workable "now-wave-remainder" items). (b) "Demand-E unpark": searched the codebase for this exact term -- one ' +
      'match, docs/design/s20-26-simulated-run-harness-spec.md H5#7, describing a "Demand-E gate" as an EVA venture ' +
      'lifecycle execution_gate requiring the coordinator to confirm demand posture for a live-URL venture. A related, ' +
      'concretely-coded mechanism exists at lib/eva/stage-templates/stage-05.js (Kill Gate/Financial): a cost-only pass ' +
      'is DOWNGRADED to conditional_pass unless the organic-acquisition assumption is validated by either explicit ' +
      'demand evidence (hasEvidence===true) or a CAC-stress-surviving LTV/CAC ratio. This SDs deliverable (a real, ' +
      'functioning repeatable-acquisition mechanism producing attributable referred signups) is the kind of artifact ' +
      'that would constitute demand evidence for that class of gate -- "feeds Demand-E unpark" is a plausible, ' +
      'directionally-consistent reading, though no single hardcoded "Demand-E" constant exists in code today (it ' +
      'appears to be chairman/coordinator shorthand for a lifecycle checkpoint class, not yet a formally named code ' +
      'constant). (c) MEASURED, not assumed: zero existing acquisition/marketing infrastructure in the AltifyAI repo. ' +
      'grep for referral|waitlist|utm_|share.*link|invite.*code across src/ returns NO matches. LandingPage.jsx (read ' +
      'in full) is a single static hero + CTA to /register with zero attribution tracking of signup source, zero ' +
      'sharing mechanism. The only existing telemetry is the events API shipped for in-app usage tracking (unrelated ' +
      'to acquisition-source attribution). No new field on users tracks how a user arrived. CONCLUSION: this is ' +
      'genuinely greenfield -- there is nothing to "wire up," matching the now-familiar pattern this session has ' +
      'measured twice already for other AltifyAI SDs. (d) Recommended proportionate scope: a referral/invite loop -- ' +
      'every authenticated user gets a stable referral code; /register accepts an optional referral code and persists ' +
      'referred_by on the new user row (new additive D1 migration, safe NULL default); a minimal visibility surface ' +
      '(extend GET /api/me, already shipped this session via QF-20260824-309, with a referral code + referred-count) ' +
      'closes the loop by letting a user see their own referral activity. This is small, buildable without external ' +
      'services/paid spend/human sales action, and is a genuine "channel" in the sense the roadmap item names (repeatable, ' +
      'self-serve, not a one-off outreach like item 3).',
    execution_time: 0,
    validation_mode: 'prospective',
    justification:
      'SD was promoted from a bare-title roadmap item with zero real content. Enriched from the actual roadmap_wave_items ' +
      'record, its W3 sibling sequence, and measured AltifyAI repo state (zero existing acquisition infrastructure) before ' +
      'any PLAN work proceeds, matching this sessions established discipline of grounding scope in measured reality rather ' +
      'than an unenriched title.',
  };

  const resolution = await resolveSubAgentRepo({
    sdId: SD_UUID,
    subAgentCode: 'EXPLORE',
    targetApplication: 'EHG_Engineer',
  });
  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'EXPLORE',
    SD_UUID,
    { name: 'Explore (roadmap enrichment + premise verification)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('\nEvidence row written:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
