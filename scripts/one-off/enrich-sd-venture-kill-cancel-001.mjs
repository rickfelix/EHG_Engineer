#!/usr/bin/env node
/**
 * Populate SD-LEO-INFRA-VENTURE-KILL-CANCEL-001's key_changes/strategic_objectives/risks
 * from its own already-detailed plan_content (chairman-commissioned via Solomon architecture
 * eval finding S5-1 / repair R4) -- the auto-created boilerplate placeholders don't reflect
 * the real, specific FRs already spelled out in metadata.plan_content.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-VENTURE-KILL-CANCEL-001';

const update = {
  key_changes: [
    { change: 'FR-1: Wire a teardown step into the kill/cancel disposition path -- a terminal-status transition (cancelled/killed) either tears down the deployment (Cloud Run service delete or documented per-platform equivalent) or records an explicit chairman-visible RETAIN decision (named reason + review date). Silent retention is the defect this closes.', type: 'feature' },
    { change: 'FR-2: Idempotent, read-probe-first zombie sweep script: enumerate ventures where status is terminal AND deployment_url IS NOT NULL, probe each URL, emit a report row per live zombie (venture id, url, kill date, days serving). Wire as a recurring check via periodic_process_registry conventions.', type: 'feature' },
    { change: 'FR-3: First execution against the measured backlog -- MarketLens (probed live HTTP 200, 46 days after its 2026-07-08 kill) torn down or explicitly RETAIN-ruled, with a post-teardown probe re-run as proof (expect non-200).', type: 'fix' },
    { change: 'FR-4: Sweep report surfaces duplicate venture rows sharing a deployment_url (specimen: two MarketLens rows, stage 19 + 24, both cancelled) as a data-hygiene line -- surface only, no auto-merge. Also cross-checks terminal-status ventures against applications/registry.json for both directions: dead-but-registered (MarketLens) and live-but-unregistered (ApexNiche).', type: 'feature' }
  ],
  strategic_objectives: [
    'Bind kill/cancel disposition to deployment machinery in both directions so a terminal-status venture cannot keep serving paid infrastructure silently (the MarketLens class: 46 days of unattended Cloud Run spend after kill)',
    'Give the chairman a recurring, automated sweep (not a one-off probe) so this defect class cannot silently recur',
    'Surface registry/data-hygiene divergence (dead-but-registered, live-but-unregistered, duplicate venture rows) without auto-merging or auto-correcting -- human decision stays in the loop for ambiguous cases'
  ],
  risks: [
    {
      risk: 'Teardown automation (Cloud Run service delete) is a genuinely destructive, hard-to-reverse action -- an incorrect match (wrong service) or a race with an in-flight redeploy could tear down a live venture.',
      impact: 'high', likelihood: 'low',
      mitigation: 'Read-probe-first design (FR-2): the sweep only reports; FR-1s teardown step only fires on an actual terminal-status DB transition (not a standalone sweep action), and the explicit RETAIN path is the safety valve for any case requiring human judgment before an irreversible delete.'
    },
    {
      risk: 'Out-of-scope boundary items (stage-machinery/lifecycle writer consolidation, ventures UPDATE RLS narrowing, deploy-scaffolding-as-code) are adjacent and could tempt scope creep during EXEC.',
      impact: 'medium', likelihood: 'medium',
      mitigation: 'SD explicitly excludes these (owned by separate T-minus P2/P3+R5, R2, and R9 efforts respectively) -- PRD must preserve this boundary.'
    },
    {
      risk: 'Duplicate MarketLens rows (stage 19 + stage 24) mean the sweep must key on deployment_url, not venture name/id, or it could miss/double-count the zombie.',
      impact: 'medium', likelihood: 'low',
      mitigation: 'FR-2 explicitly specifies keying the enumeration on deployment_url; FR-4 makes the duplicate-row condition a first-class, surfaced report line rather than silently merged.'
    }
  ],
  success_metrics: [
    { metric: 'Teardown-or-retain enforcement', target: 'A terminal-status transition cannot complete with a live deployment and no explicit retain decision (verified via negative fixture test)', actual: 'N/A' },
    { metric: 'MarketLens zombie closed', target: 'MarketLens URL returns non-200 post-fix, or a documented RETAIN row exists, with probe output stamped as SD evidence', actual: 'N/A' },
    { metric: 'Sweep finds zero unexplained zombies post-fix', target: 'A live sweep run against production data reports 0 unexplained live-deployment-on-terminal-status ventures after FR-1..FR-4 ship', actual: 'N/A' }
  ]
};

const { error } = await supabase.from('strategic_directives_v2').update(update).eq('sd_key', SD_KEY);
if (error) { console.error('ERROR:', error.message); process.exit(1); }
console.log('SD enriched from plan_content:', SD_KEY);
