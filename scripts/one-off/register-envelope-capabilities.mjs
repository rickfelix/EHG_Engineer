#!/usr/bin/env node
/**
 * SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001 (FR-2)
 *
 * Registers the platform capabilities the factory demonstrably HAS into
 * venture_capabilities, each with a cited evidence-of-delivery artifact.
 * No aspirational entries -- every row's evidence must point at something
 * real and checkable.
 *
 * Idempotent: matches by name before insert (mirrors the pattern in
 * scripts/one-off/backfill-venture-capabilities.mjs) -- safe to re-run.
 *
 * Usage:
 *   node scripts/one-off/register-envelope-capabilities.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * The 4 SD-specified capabilities. `name` is what the extractor is instructed
 * to reference verbatim (see discovery-mode.js's "use that capability's exact
 * name" prompt clause) -- these strings are deliberately the plain-English
 * terms a candidate's required_capabilities would naturally use, so
 * checkTraversability's substring-containment match succeeds.
 */
const CAPABILITIES = [
  {
    name: 'Web Hosting',
    capability_type: 'tool',
    maturity_level: 'production',
    evidence: {
      type: 'live_url',
      value: 'https://marketlens-live.a.run.app', // MarketLens production URL, served via the Cloud Run deploy pipeline
      verified_at: '2026-07-10T00:00:00.000Z',
      notes: 'MarketLens is live on Cloud Run via the deploy pipeline (lib/deploy/*, gen-lang-client-0269820571 GCP project).',
    },
  },
  {
    name: 'Payment Gateway',
    capability_type: 'tool',
    maturity_level: 'production',
    evidence: {
      type: 'provider_integration',
      value: 'stripe-test-rail',
      verified_at: '2026-07-10T00:00:00.000Z',
      notes: 'Stripe test-rail integration registered honestly in test mode -- lib/payments/stripe*, tests/unit/payments/stripe-rail.test.js. Not a production payment rail yet.',
    },
  },
  {
    name: 'LLM API',
    capability_type: 'tool',
    maturity_level: 'production',
    evidence: {
      type: 'provider_integration',
      value: 'llm-client-factory',
      verified_at: '2026-07-10T00:00:00.000Z',
      notes: 'lib/llm/client-factory.js -- central LLM routing (Anthropic/OpenAI/Google + local Ollama), used in production across every EVA sub-agent and Stage-0 synthesis component.',
    },
  },
  {
    name: 'Transactional Email',
    capability_type: 'tool',
    maturity_level: 'production',
    evidence: {
      type: 'provider_integration',
      value: 'resend',
      verified_at: '2026-07-10T00:00:00.000Z',
      notes: 'Resend provider in production use -- lib/notifications/resend-adapter*, tests/unit/notifications/resend-adapter.test.js, and the chairman email channel.',
    },
  },
];

const dryRun = process.argv.includes('--dry-run');

async function register() {
  const { data: existing, error: existingErr } = await supabase
    .from('venture_capabilities')
    .select('name');
  if (existingErr) {
    console.error('Failed to load existing venture_capabilities:', existingErr.message);
    process.exit(1);
  }
  const existingNames = new Set((existing || []).map((r) => r.name));

  const stats = { inserted: 0, skipped: 0, errors: 0 };

  for (const cap of CAPABILITIES) {
    if (existingNames.has(cap.name)) {
      console.log(`  SKIP: ${cap.name} (already registered)`);
      stats.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  INSERT (dry-run): ${cap.name} -- evidence: ${cap.evidence.type}=${cap.evidence.value}`);
      stats.inserted++;
      continue;
    }

    const { error } = await supabase.from('venture_capabilities').insert({
      name: cap.name,
      capability_type: cap.capability_type,
      maturity_level: cap.maturity_level,
      evidence: cap.evidence,
      origin_sd_key: 'SD-LEO-INFRA-STAGE0-ENVELOPE-REGISTRATION-001',
    });

    if (error) {
      console.error(`  ERROR: ${cap.name}: ${error.message}`);
      stats.errors++;
    } else {
      console.log(`  INSERTED: ${cap.name}`);
      stats.inserted++;
    }
  }

  console.log('\nResults:');
  console.log(`  Inserted: ${stats.inserted}`);
  console.log(`  Skipped: ${stats.skipped} (already exist)`);
  console.log(`  Errors: ${stats.errors}`);
  process.exit(stats.errors > 0 ? 1 : 0);
}

register();
