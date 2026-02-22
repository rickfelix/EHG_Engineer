#!/usr/bin/env node
/**
 * Seed Venture Capabilities
 * SD: SD-LEO-FEAT-CAPABILITY-LATTICE-001 | US-006
 *
 * Registers 5+ venture capabilities as seed data based on existing ventures.
 * Idempotent: skips already-existing capabilities.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SEED_CAPABILITIES = [
  {
    name: 'payment-processing-api',
    venture_name: 'FinTrack',
    capability_type: 'api_endpoint',
    reusability_score: 8,
    maturity_level: 'production',
    origin_sd_key: 'SD-FINTRACK-PAYMENTS-001',
  },
  {
    name: 'curriculum-recommendation-agent',
    venture_name: 'EduPath',
    capability_type: 'agent',
    reusability_score: 7,
    maturity_level: 'stable',
    origin_sd_key: 'SD-EDUPATH-REC-001',
  },
  {
    name: 'patient-data-schema',
    venture_name: 'MedSync',
    capability_type: 'database_schema',
    reusability_score: 6,
    maturity_level: 'production',
    origin_sd_key: 'SD-MEDSYNC-SCHEMA-001',
  },
  {
    name: 'route-optimization-service',
    venture_name: 'LogiFlow',
    capability_type: 'service',
    reusability_score: 9,
    maturity_level: 'stable',
    origin_sd_key: 'SD-LOGIFLOW-ROUTING-001',
  },
  {
    name: 'energy-monitoring-webhook',
    venture_name: 'Solara Energy',
    capability_type: 'webhook',
    reusability_score: 7,
    maturity_level: 'experimental',
    origin_sd_key: 'SD-SOLARA-MONITOR-001',
  },
  {
    name: 'financial-reporting-component',
    venture_name: 'FinTrack',
    capability_type: 'component',
    reusability_score: 6,
    maturity_level: 'stable',
    origin_sd_key: 'SD-FINTRACK-REPORTS-001',
  },
  {
    name: 'logistics-data-pipeline',
    venture_name: 'LogiFlow',
    capability_type: 'workflow',
    reusability_score: 8,
    maturity_level: 'production',
    origin_sd_key: 'SD-LOGIFLOW-PIPELINE-001',
  },
];

async function main() {
  // Resolve venture names to IDs
  const { data: ventures, error: vError } = await supabase
    .from('ventures')
    .select('id, name');

  if (vError) {
    console.error('Error querying ventures:', vError.message);
    process.exit(1);
  }

  const ventureMap = new Map(ventures.map(v => [v.name, v.id]));

  let created = 0;
  let skipped = 0;

  for (const seed of SEED_CAPABILITIES) {
    const ventureId = ventureMap.get(seed.venture_name);
    if (!ventureId) {
      console.log(`  Skipped: Venture "${seed.venture_name}" not found`);
      skipped++;
      continue;
    }

    // Check if already exists (idempotent)
    const { data: existing } = await supabase
      .from('venture_capabilities')
      .select('id')
      .eq('name', seed.name)
      .eq('origin_venture_id', ventureId)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`  Exists: ${seed.name} (${seed.venture_name})`);
      skipped++;
      continue;
    }

    const { error: insertError } = await supabase
      .from('venture_capabilities')
      .insert({
        name: seed.name,
        origin_venture_id: ventureId,
        origin_sd_key: seed.origin_sd_key,
        capability_type: seed.capability_type,
        reusability_score: seed.reusability_score,
        maturity_level: seed.maturity_level,
      });

    if (insertError) {
      console.error(`  Error: ${seed.name} - ${insertError.message}`);
    } else {
      console.log(`  Created: ${seed.name} (${seed.venture_name}) [${seed.capability_type}]`);
      created++;
    }
  }

  console.log(`\n  Summary: ${created} created, ${skipped} skipped`);

  // Verify count
  const { count } = await supabase
    .from('venture_capabilities')
    .select('id', { count: 'exact', head: true });
  console.log(`  Total in venture_capabilities: ${count}\n`);
}

main();
