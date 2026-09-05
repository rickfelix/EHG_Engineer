import fs from 'node:fs';
import { attemptAutoMerge, fetchStatusCheckRollup } from '../../lib/ship/auto-merge.mjs';
import { createVentureTrustGate } from '../../lib/ship/venture-trust-gate.mjs';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const { owner, name } = JSON.parse(fs.readFileSync('.claude-work/ship-repo-resolved.json', 'utf8'));
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const isTrustedRepo = createVentureTrustGate({ supabase, fetchStatusCheckRollup });
const result = await attemptAutoMerge({
  prNumber: 8236, repoOwner: owner, repoName: name,
  isTrustedRepo, witnessSupabase: supabase, workKey: 'QF-20260903-315',
  branch: 'qf/QF-20260903-315',
});
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(result.exitCode || 1);
