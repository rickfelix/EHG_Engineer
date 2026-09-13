import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = 'a281d3a9-c69a-456c-b514-2de7790ea6a7';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('id', SD_ID)
  .single();
if (readErr) throw readErr;

const mechanism_verifications = [
  {
    claim: 'recordPublishOutcome is defined and exported in lib/marketing/autonomy-gate.js with no external caller on main',
    verified_by: 'LEAD direct read',
    verified_at: 'lib/marketing/autonomy-gate.js:469'
  },
  {
    claim: 'evaluateGraduation is defined in lib/marketing/autonomy-gate.js and is called only from recordPublishOutcome, never independently',
    verified_by: 'LEAD direct read',
    verified_at: 'lib/marketing/autonomy-gate.js:497'
  },
  {
    claim: 'evaluateGraduation reads execution_mode defensively via a 42703-code probe-and-degrade because the column migration is chairman-gated and not yet applied live',
    verified_by: 'LEAD direct read',
    verified_at: 'lib/marketing/autonomy-gate.js:509,516,534'
  },
  {
    claim: 'publisher/index.js already returns ledgerCorrelationId on every publish() result (success and failure paths), and idempotency_key is written to the ledger row at publish time',
    verified_by: 'LEAD direct read',
    verified_at: 'lib/marketing/publisher/index.js:146,179'
  },
  {
    claim: 'lib/marketing/ai/metrics-ingestor.js does not read or derive per-post publish outcome state -- it normalizes inbound webhook/aggregate engagement metrics only (normalizeMetric), no ledger/outcome read or write',
    verified_by: 'LEAD direct read',
    verified_at: 'lib/marketing/ai/metrics-ingestor.js:31,201'
  },
  {
    claim: 'lib/marketing/ai/variant-outcome-derivation.js derives A/B variant success/failure from daily_rollups impression/conversion aggregates, not from any single post outcome or the publish ledger -- a different mechanism than what this SD needs',
    verified_by: 'LEAD direct read',
    verified_at: 'lib/marketing/ai/variant-outcome-derivation.js:25'
  }
];

const newMetadata = { ...sd.metadata, mechanism_verifications };

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: newMetadata })
  .eq('id', SD_ID);
if (writeErr) throw writeErr;

console.log('mechanism_verifications written:', mechanism_verifications.length, 'entries');
