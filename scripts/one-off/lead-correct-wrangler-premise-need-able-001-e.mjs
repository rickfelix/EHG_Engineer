// LEAD-phase self-correction for SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E.
//
// The SD's original description claimed the Cloudflare Worker secret handoff "is NOT fixable
// within this fleet's current tooling -- wrangler is unauthenticated in this environment and
// AltifyAI's only CI workflow has no deploy/wrangler step (a sibling SD already measured this
// exact limitation)." Direct inspection of altifyai/.github/workflows/deploy.yml during this
// SD's own LEAD investigation found that claim false: deploy.yml is real, runs on every push to
// main, and already uses authenticated CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID repo secrets to
// run `wrangler d1 migrations apply` and `wrangler deploy`. A sibling SD
// (SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001, docs/stripe-secret-provisioning.md in the altifyai
// repo) had already independently corrected the identical misconception for Stripe secrets and
// documented a working "Option B" (a one-shot workflow_dispatch CI job reusing deploy.yml's
// already-authenticated wrangler access) -- this SD's "sibling SD already measured this exact
// limitation" citation was pointing at a claim that had itself already been superseded.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-E';

const description = `Points AltifyAI's existing recordUsageEvent (altifyai/lib/events/track.js:173) at Child A's fn_submit_venture_usage_event RPC as a DUAL-WRITE (preserving the existing D1 write unchanged so the live, previously-incident-prone UsageDashboard.jsx read path -- GET /api/events -> listUsageEventsForUser -- is never regressed; see SD-ALTIFYAI-MAN-FIX-USAGE-PANEL-500-001, completed).

CROSS-REPO CONSTRAINT, CORRECTED DURING THIS SD'S OWN LEAD PHASE (a self-correction, not the original text): the original description claimed the Cloudflare Worker secret handoff "is NOT fixable within this fleet's current tooling -- wrangler is unauthenticated in this environment and AltifyAI's only CI workflow has no deploy/wrangler step." Direct inspection of altifyai/.github/workflows/deploy.yml found this false: deploy.yml is real, runs on every push to main, and already uses authenticated CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID repo secrets to run wrangler d1 migrations apply + wrangler deploy. A sibling SD (SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001) had already independently corrected the identical misconception for Stripe secrets (altifyai/docs/stripe-secret-provisioning.md) and documented a working CI-based option -- the cited "sibling SD already measured this exact limitation" was itself pointing at an already-superseded claim. Neither VENTURE_ID nor EHG_ENGINEER_INGEST_SECRET appears in wrangler.toml today, meaning the two sibling features that already read these same bindings (error-capture, feedback submit) are ALSO currently dormant/no-op in production -- this SD's dual-write joining them in that dormant-until-provisioned state is the established pattern for this whole family, not a novel gap.

The real, narrower human-required step: (1) mint this venture's ingest key via Child A's fn_provision_venture_ingest_key RPC once Child A ships (out of this SD's scope), and (2) get that value into the Worker via local wrangler secret put OR a one-shot CI workflow mirroring the already-documented Stripe precedent -- see altifyai/docs/usage-event-ingest-secret-provisioning.md (this SD's own runbook, both options documented). This child's EXEC scope is CODE + TESTS + that documented runbook -- do NOT claim success_criteria #2 ("AltifyAI signals queryable") as fully met by mocked-fetch unit tests alone; mark it explicitly UNMET pending the human follow-up if live verification cannot be completed in-session.

Depends on Child A (ingest-key provisioning + RPC must exist) and Child D (coordinates on which repo location the witness call lands in, for the stack-scan check to observe it).`;

async function main() {
  const { data: sd, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr || !sd) {
    console.error('SD_FETCH_FAILED', fetchErr);
    process.exit(1);
  }

  const metadata = {
    ...sd.metadata,
    lead_self_correction: {
      corrected_at: new Date().toISOString(),
      finding:
        "Original description's 'wrangler unauthenticated / no CI deploy step' claim was false -- altifyai/.github/workflows/deploy.yml already runs authenticated wrangler deploy + D1 migrations on every push to main. A sibling SD (SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001) had already documented the correct CI-based provisioning option for the identical class of secret (Stripe). Cited evidence: altifyai/.github/workflows/deploy.yml, altifyai/docs/stripe-secret-provisioning.md.",
      corrected_by: 'LEAD phase, session c29c1952-8d10-4a11-a71e-5ca637c41106',
    },
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ description, metadata })
    .eq('sd_key', SD_KEY);
  if (updateErr) {
    console.error('SD_UPDATE_FAILED', updateErr);
    process.exit(1);
  }
  console.log('SD_CORRECTED');
}

if (isMainModule(import.meta.url)) {
  main();
}
