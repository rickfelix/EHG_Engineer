#!/usr/bin/env node
/**
 * One-time (idempotent) activation: instantiate the 4 EHG_SHARED_OPERATORS at
 * the holdco level, for real, in production. SD-LEO-INFRA-ORG-TEMPLATE-ARMING-001.
 *
 * The e2e test (tests/e2e/agents/shared-operators-arming.spec.ts) verifies the
 * function's behavior and tears down whatever it creates, to stay CI-repeatable.
 * This script is the deliberate, separate action that actually turns the shared
 * layer on and leaves it on -- run once by a human/coordinator, safe to re-run
 * (idempotent: already-armed operators are reported, not duplicated).
 *
 * Usage: node scripts/arm-shared-operators.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { VentureFactory } from '../lib/agents/venture-ceo-factory.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

export async function armSharedOperators(supabase) {
  const factory = new VentureFactory(supabase);
  return factory.instantiateSharedOperators();
}

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[arm-shared-operators] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const supabase = createClient(url, key);
  const result = await armSharedOperators(supabase);
  console.log(JSON.stringify(result, null, 2));
  if (result.created.length > 0) {
    console.log(`Armed ${result.created.length} new shared operator(s): ${result.created.join(', ')}`);
  }
  if (result.already_existed.length > 0) {
    console.log(`Already armed (no-op): ${result.already_existed.join(', ')}`);
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`[arm-shared-operators] FATAL: ${e.message}`);
    process.exit(1);
  });
}
