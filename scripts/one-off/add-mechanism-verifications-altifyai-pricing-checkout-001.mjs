#!/usr/bin/env node
// SD-LEO-INFRA-ALTIFYAI-PRICING-CHECKOUT-001 -- GATE_MECHANISM_CLAIM_VERIFIER requires a named
// verifier for file-path mechanism claims. Citing the LEAD-phase Explore investigation.
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_UUID = '8529c112-3280-4d2b-9620-c3b6a848c55f';

async function run() {
  const supabase = createSupabaseServiceClient();
  const { data: current, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('id', SD_UUID)
    .single();
  if (fetchErr) throw new Error(`fetch failed: ${fetchErr.message}`);

  const newMetadata = {
    ...current.metadata,
    mechanism_verifications: [
      ...(current.metadata?.mechanism_verifications || []),
      {
        claim: 'src/auth/clerk.js exists in the AltifyAI repo and implements real Clerk auth (jose-based JWT verification) -- confirming the "site, auth" live premise',
        verified_by: 'Explore (premise verification)',
        verified_at: 'src/auth/clerk.js:12',
      },
      {
        claim: 'api/webhooks/stripe.js does NOT exist anywhere in the portfolio -- the SD\'s original citation of it as an existing pattern to follow is fabricated. The only webhook route that actually exists in the main ehg platform repo is a GitHub webhook, not Stripe.',
        verified_by: 'Explore (premise verification)',
        verified_at: 'app/api/webhooks/github/route.ts:1',
      },
    ],
  };

  const { error: updateErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: newMetadata })
    .eq('id', SD_UUID);
  if (updateErr) throw new Error(`update failed: ${updateErr.message}`);
  console.log('mechanism_verifications added.');
}

if (isMainModule(import.meta.url)) {
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
