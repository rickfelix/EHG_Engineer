#!/usr/bin/env node
/**
 * Re-scope SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 after VALIDATION (evidence bfd1beef,
 * phase=LEAD) found FR-1 as originally written (automated Cloud Run teardown) is not
 * executable from this repo/session: gcloud CLI is not on PATH, no GCP admin credentials
 * exist (only a Drive-folder-scoped Google service account), and the existing CREATE-side
 * deploy pipeline (promote.js/publish.js) has NEVER actually run in production -- the
 * MarketLens Cloud Run service was deployed by a credential this repo doesn't hold.
 * Shipping an executing teardown now would reproduce a dead-by-construction defect class
 * this repo has already been burned by twice.
 *
 * Re-scoped: FR-1 becomes a visible teardown-INTENT disposition (not a silent-forever gap,
 * not an infeasible direct execution) that a chairman/credentialed process later actuates.
 * FR-2 reuses the existing venture-ops-actuals-sweep.mjs / venture-uptime-probe.js rather
 * than rebuilding. FR-3 records the explicit disposition for MarketLens (the only zombie of
 * the 2 non-demo terminal+deployed ventures that is actually on Cloud Run -- CronGenius is
 * replit.dev, AltifyAI is Cloudflare Workers) rather than attempting infeasible execution.
 * FR-4 adds the is_demo=false filter VALIDATION found necessary (unfiltered: 62 cancelled
 * rows vs 20 real; unfiltered active: 88 vs 2 real) and drops the incorrect
 * "duplicate rows share a deployment_url" framing (measured: they don't -- one is null).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-VENTURE-KILL-CANCEL-001';

const update = {
  scope:
    "IN SCOPE (re-scoped after VALIDATION found FR-1's original 'automated Cloud Run teardown' "
    + "infeasible -- no gcloud CLI, no GCP admin credentials in this repo/session): "
    + "(1) a visible teardown-INTENT disposition, not silent-forever and not an infeasible direct "
    + "execution -- when a venture transitions to a terminal status AND deployment_url is set, "
    + "record an explicit disposition (pending_teardown | retained) with a reason, so the gap "
    + "becomes chairman-reviewable instead of silently unhandled; (2) a zombie-classification "
    + "sweep that REUSES the existing scripts/cron/venture-ops-actuals-sweep.mjs + "
    + "lib/ops/venture-uptime-probe.js (already probes deployment_url IS NOT NULL, already "
    + "excludes is_demo where relevant) rather than rebuilding probe infrastructure, adding "
    + "terminal-status classification + a report on top; (3) record the explicit disposition for "
    + "the one real Cloud Run zombie (MarketLens, id=ecbba50e) with pre-probe evidence stamped -- "
    + "actual gcloud execution is deferred to a chairman-gated follow-up once GCP admin "
    + "credentials for project 429436826471 exist (out of scope here, credential provisioning is "
    + "its own decision); (4) sweep report surfaces duplicate venture names sharing terminal "
    + "status (not 'shares a deployment_url' -- measured false: one of the two MarketLens rows "
    + "has deployment_url=NULL) and applications/registry.json divergence in both directions, "
    + "filtered to is_demo=false (unfiltered predicates are ~85-98% demo-fixture noise: 62 "
    + "cancelled rows vs 20 real, 88 active vs 2 real). OUT OF SCOPE (VALIDATION-confirmed: these "
    + "codes match no existing SD, so this is a genuine scope boundary, not a deferral to already-"
    + "owned work): actual GCP service-account credential provisioning and live gcloud teardown "
    + "execution; stage-machinery/lifecycle writer consolidation; ventures UPDATE RLS narrowing; "
    + "deploy-scaffolding-as-code; non-Cloud-Run deployment families (Cloudflare Workers, Replit) "
    + "-- this SD's disposition/sweep logic is platform-agnostic (keys on deployment_url + "
    + "terminal status) but only Cloud Run teardown intent is scoped with a concrete action.",
  key_changes: [
    { change: 'FR-1 (re-scoped): record an explicit teardown_disposition on terminal-status ventures with a deployment_url (pending_teardown|retained + reason + timestamp) -- a visible, reviewable gap-closer, not an infeasible direct Cloud Run delete (no gcloud CLI / no GCP admin credentials exist in this repo)', type: 'feature' },
    { change: 'FR-2 (re-scoped): add terminal-status zombie classification on top of the EXISTING scripts/cron/venture-ops-actuals-sweep.mjs + lib/ops/venture-uptime-probe.js (already probes deployment_url IS NOT NULL) rather than rebuilding a new probe script from scratch', type: 'feature' },
    { change: 'FR-3 (re-scoped): record the explicit teardown_disposition for the real MarketLens zombie (id=ecbba50e, the only one of the 2 non-demo terminal+deployed ventures actually on Cloud Run) with pre-probe evidence stamped; live gcloud execution deferred to a credentialed follow-up', type: 'fix' },
    { change: 'FR-4 (corrected): sweep report surfaces duplicate venture NAMES sharing terminal status (not deployment_url -- measured false) and applications/registry.json divergence in both directions, filtered to is_demo=false to avoid ~85-98% demo-fixture noise', type: 'feature' }
  ],
  strategic_objectives: [
    'Make the kill/cancel-to-deployment gap VISIBLE and chairman-reviewable instead of silently unhandled -- without pretending this repo/session can safely execute an infeasible, credential-less, irreversible Cloud Run deletion',
    'Give the chairman a recurring, is_demo-filtered sweep (reusing existing probe infrastructure) so this defect class cannot silently recur',
    'Surface registry/data-hygiene divergence (dead-but-registered, live-but-unregistered, duplicate venture names) without auto-merging or auto-correcting'
  ],
  risks: [
    {
      risk: 'The original FR-1 (direct, automated Cloud Run service deletion) is not executable from this repo/session: gcloud CLI is not on PATH, only a Drive-folder-scoped Google service account exists (no Cloud Run admin), and the CREATE-side deploy pipeline (promote.js/publish.js) has never actually run in production per VALIDATION (zero real importers, MarketLens was deployed by an out-of-band credential).',
      impact: 'high', likelihood: 'high',
      mitigation: 'Re-scoped FR-1/FR-3 from direct execution to an explicit, chairman-reviewable disposition record. Actual teardown execution is deferred to a follow-up SD once GCP admin credentials are chairman-provisioned -- this SD closes the visibility gap, not the credential gap.'
    },
    {
      risk: 'FR-4s sweep predicates, if unfiltered, emit ~85-98% demo-fixture noise (130 of 152 ventures are is_demo=true; unfiltered cancelled=62 vs real=20, unfiltered active=88 vs real=2).',
      impact: 'medium', likelihood: 'high',
      mitigation: 'Every FR-4 query explicitly filters is_demo=false, per VALIDATIONs live measurement.'
    },
    {
      risk: 'Only 1 of the 2 real (non-demo) deployed-and-terminal ventures is on Cloud Run (MarketLens); the other real zombie candidates use Cloudflare Workers/Replit, which this SDs concrete teardown-intent action does not cover.',
      impact: 'low', likelihood: 'medium',
      mitigation: 'Scope explicitly states this SDs concrete disposition action is Cloud-Run-specific; the classification/sweep logic itself is platform-agnostic (keys on deployment_url + terminal status) so extending disposition actions to other platforms is a natural, explicitly-flagged follow-up, not silently assumed covered.'
    },
    {
      risk: 'A trigger-level integration point (mirroring the sync_ventures_to_eva_ventures_update() precedent) would miss disposition paths that DELETE venture rows outright (e.g. master_reset_portfolio()) rather than UPDATE status, and would hold a DB transaction open across a network probe under lock contention.',
      impact: 'medium', likelihood: 'low',
      mitigation: 'FR-1s disposition write is an in-DB row flip (not a network call) so no transaction-hold-across-network-call risk; FR-2s sweep (the row-flip-consuming/probing side) runs OUTSIDE any transaction as its own scheduled process, per VALIDATIONs recommended safer integration point.'
    }
  ],
  success_metrics: [
    { metric: 'Kill/cancel-to-deployment gap made visible', target: 'A terminal-status venture with deployment_url set always has an explicit teardown_disposition row (pending_teardown or retained) -- never silently absent', actual: 'N/A' },
    { metric: 'MarketLens disposition recorded', target: 'The real Cloud Run zombie (id=ecbba50e) has an explicit teardown_disposition with pre-probe evidence stamped as SD evidence', actual: 'N/A' },
    { metric: 'Sweep noise-filtered', target: 'Sweep report and its underlying queries filter is_demo=false on every predicate (0 demo-fixture rows in the report)', actual: 'N/A' }
  ]
};

const { error } = await supabase.from('strategic_directives_v2').update(update).eq('sd_key', SD_KEY);
if (error) { console.error('ERROR:', error.message); process.exit(1); }
console.log('SD re-scoped per VALIDATION findings:', SD_KEY);
