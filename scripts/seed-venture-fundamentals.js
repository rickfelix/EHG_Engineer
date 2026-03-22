#!/usr/bin/env node
/**
 * Seed venture_fundamentals with baseline SLO targets for EHG venture.
 * SD: SD-LEO-INFRA-EHG-VENTURE-FUNDAMENTALS-001
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SLO_TIER_0 = {
  uptime_pct: 99.5,
  api_p95_ms: 500,
  db_availability_pct: 99.9,
  error_rate_pct: 1.0,
  backup_frequency: 'daily'
};

const SLO_TIER_1 = {
  lcp_s: 2.5,
  cls: 0.1,
  fid_ms: 100,
  tti_s: 3.5,
  bundle_size_kb: 200,
  lighthouse_perf: 80,
  auth_refresh_s: 1.0
};

async function seed() {
  // Get EHG venture ID from ventures table (or use a placeholder)
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name')
    .limit(5);

  if (!ventures || ventures.length === 0) {
    console.log('No ventures found. Creating default EHG entry with placeholder venture_id.');
    const { data, error } = await supabase
      .from('venture_fundamentals')
      .upsert({
        venture_id: '00000000-0000-0000-0000-000000000001',
        venture_name: 'EHG Platform',
        tech_stack_version: '1.0.0',
        slo_tier: 'tier_1_mvp',
        slo_targets: {
          tier_0_infrastructure: SLO_TIER_0,
          tier_1_mvp: SLO_TIER_1,
          tier_2_post_pmf: {}
        },
        isolation_tier: 'pool',
        shared_packages: [
          { name: '@ehg/design-tokens', version: '1.0.0' },
          { name: '@ehg/tailwind-preset', version: '1.0.0' },
          { name: '@ehg/lint-config', version: '1.0.0' }
        ],
        conformance_score: 100,
        last_conformance_check: new Date().toISOString()
      }, { onConflict: 'venture_id' })
      .select();

    if (error) {
      console.error('Error seeding:', error.message);
      process.exit(1);
    }
    console.log('Seeded EHG Platform venture_fundamentals:', data[0]?.id);
    return;
  }

  // Seed each discovered venture
  for (const venture of ventures) {
    const { data, error } = await supabase
      .from('venture_fundamentals')
      .upsert({
        venture_id: venture.id,
        venture_name: venture.name,
        tech_stack_version: '1.0.0',
        slo_tier: 'tier_0_infrastructure',
        slo_targets: {
          tier_0_infrastructure: SLO_TIER_0,
          tier_1_mvp: SLO_TIER_1,
          tier_2_post_pmf: {}
        },
        isolation_tier: 'pool',
        shared_packages: [
          { name: '@ehg/design-tokens', version: '1.0.0' },
          { name: '@ehg/tailwind-preset', version: '1.0.0' },
          { name: '@ehg/lint-config', version: '1.0.0' }
        ],
        conformance_score: 0,
        last_conformance_check: null
      }, { onConflict: 'venture_id' })
      .select();

    if (error) {
      console.error(`Error seeding ${venture.name}:`, error.message);
    } else {
      console.log(`Seeded ${venture.name}: slo_tier=tier_0_infrastructure`);
    }
  }

  console.log('Done. Venture fundamentals seeded.');
}

seed().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
