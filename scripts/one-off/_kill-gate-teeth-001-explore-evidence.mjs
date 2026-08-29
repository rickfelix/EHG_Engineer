#!/usr/bin/env node
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-KILL-GATE-TEETH-001';

const findings = [
  {
    id: 'governing-spec-doc',
    severity: 'INFO',
    summary: 'docs/design/kill-gate-teeth-proof-spec.md (author Solomon, 2026-07-11) is the governing spec for this regime, containing the sealed-prediction hash-commit design and pre-registered ALPHA/BETA SHA-256 seal hashes. PLAN must read this before authoring the PRD.',
  },
  {
    id: 'live-seam-already-exists',
    severity: 'INFO',
    summary: 'lib/eva/lifecycle/thesis-kill-gate.js is the live seam this regime proves against; it already cites the governing spec. It ships LEO_THESIS_KILL_GATE=observe by default (evaluate+log+mint decision, never blocks advancement) -- PLAN must define whether teeth-proof records the verdict-emitted state, advancement-blocked state, or both, and persist the flag state on every record.',
  },
  {
    id: 'no-duplicate-deliverables',
    severity: 'INFO',
    summary: 'Grep census for sealed-prediction/teeth-proof/firing-fence turned up only 2 non-archive hits, both references to the spec doc -- none of the three ALPHA-leg deliverables (sealed-prediction registry, firing-verification harness, teeth-proof report) currently exist in the repo. Greenfield build, no duplicate-work risk.',
  },
  {
    id: 'gate-type-vs-work-type-tension',
    severity: 'WARNING',
    summary: 'scripts/modules/architectural-prevention/stage-gate-type-canonicalize-invariant.js (from a prior SD) declares gate_type a lossy mirror and work_type canonical. Measured live: work_type=decision_gate covers BOTH the 4 kill stages AND 3 promotion stages -- it cannot express the kill/promotion distinction the harness needs. gate_type is correct for SC4 (kill-set derivation) and should be documented as such in the PRD so a future auditor does not silently widen the kill set to 8 stages by migrating to work_type.',
  },
];

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'Explore', supabase });
  let results = {
    verdict: 'PASS',
    confidence_score: 88,
    findings,
    warnings: [],
    recommendations: [],
    summary: 'Explore-phase discovery for SD-LEO-INFRA-KILL-GATE-TEETH-001 confirmed a governing spec doc exists, the live kill-gate seam this regime proves against ships observe-only by default, no duplicate ALPHA-leg deliverables exist yet, and a prior SD introduced a gate_type-vs-work_type canonicalization tension that resolves in favor of gate_type for this SD\'s kill-set-derivation requirement.',
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: ['docs/design/kill-gate-teeth-proof-spec.md', 'lib/eva/lifecycle/thesis-kill-gate.js', 'scripts/modules/architectural-prevention/stage-gate-type-canonicalize-invariant.js'],
    },
    phase: 'LEAD_TO_PLAN',
  };
  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('Explore', SD_KEY, { name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' });
  console.log('EXPLORE EVIDENCE WRITTEN:', stored.id, stored.verdict, stored.confidence);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message, e.stack); process.exit(1); });
}
