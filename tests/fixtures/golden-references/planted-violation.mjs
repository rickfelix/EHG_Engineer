// Planted MISS-direction fixture for the golden-references isolation law
// (TS-1). This file deliberately violates the import boundary; the isolation
// test must FLAG it when pointed here, and the live scan of golden-references/
// must never include fixtures. Do not "fix" these imports — they are the test
// subject.
import { createSupabaseServiceClient } from '../../../lib/supabase-client.cjs';
import something from '../../../scripts/gauge-runner.mjs';

const dynamicTarget = './somewhere-' + Date.now();
const lazy = await import(dynamicTarget); // non-literal: must be conservatively flagged

export { createSupabaseServiceClient, something, lazy };
