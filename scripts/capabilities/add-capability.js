#!/usr/bin/env node
/**
 * Add Venture Capability CLI
 * SD: SD-LEO-FEAT-CAPABILITY-LATTICE-001 | US-003
 *
 * Registers a new venture capability via CLI with validation.
 */
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { CAPABILITY_TYPES, isValidCapabilityType } from '../../lib/capabilities/capability-taxonomy.js';

const require = createRequire(import.meta.url);
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const VALID_TYPES = Object.keys(CAPABILITY_TYPES);
const MATURITY_LEVELS = ['experimental', 'stable', 'production', 'deprecated'];

function showUsage() {
  console.log(`
  Usage: node scripts/capabilities/add-capability.js [options]

  Required:
    --venture <name>     Origin venture name (e.g., FinTrack, EduPath)
    --name <name>        Capability name (e.g., payment-api)
    --type <type>        Capability type from taxonomy

  Optional:
    --reusability <0-10> Reusability score (default: 5)
    --maturity <level>   Maturity level: ${MATURITY_LEVELS.join(', ')} (default: experimental)
    --sd-key <key>       Origin SD key (e.g., SD-CAP-LEDGER-001)

  Valid types: ${VALID_TYPES.join(', ')}
  `);
}

async function main() {
  let args;
  try {
    args = parseArgs({
      options: {
        venture: { type: 'string' },
        name: { type: 'string' },
        type: { type: 'string' },
        reusability: { type: 'string' },
        maturity: { type: 'string' },
        'sd-key': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: false,
    });
  } catch {
    showUsage();
    process.exit(1);
  }

  if (args.values.help || !args.values.venture || !args.values.name || !args.values.type) {
    showUsage();
    process.exit(args.values.help ? 0 : 1);
  }

  const { venture, name, type } = args.values;
  const reusability = args.values.reusability ? parseInt(args.values.reusability, 10) : 5;
  const maturity = args.values.maturity || 'experimental';
  const sdKey = args.values['sd-key'] || null;

  // Validate capability type
  if (!isValidCapabilityType(type)) {
    console.error(`\n  Error: Invalid capability type "${type}"\n`);
    console.error('  Valid types:');
    for (const [key, val] of Object.entries(CAPABILITY_TYPES)) {
      console.error(`    ${key.padEnd(22)} (${val.category})`);
    }
    process.exit(1);
  }

  // Validate reusability score
  if (isNaN(reusability) || reusability < 0 || reusability > 10) {
    console.error('\n  Error: --reusability must be between 0 and 10\n');
    process.exit(1);
  }

  // Validate maturity level
  if (!MATURITY_LEVELS.includes(maturity)) {
    console.error(`\n  Error: Invalid maturity level "${maturity}"`);
    console.error(`  Valid levels: ${MATURITY_LEVELS.join(', ')}\n`);
    process.exit(1);
  }

  // Resolve venture name to ID
  const { data: ventures, error: ventureError } = await supabase
    .from('ventures')
    .select('id, name')
    .ilike('name', venture);

  if (ventureError) {
    console.error('Error querying ventures:', ventureError.message);
    process.exit(1);
  }

  if (!ventures || ventures.length === 0) {
    console.error(`\n  Error: Venture "${venture}" not found\n`);
    const { data: all } = await supabase.from('ventures').select('name');
    if (all) {
      console.error('  Available ventures:');
      all.forEach(v => console.error('    ' + v.name));
    }
    process.exit(1);
  }

  const ventureId = ventures[0].id;
  const ventureName = ventures[0].name;

  // Insert capability
  const { data: inserted, error: insertError } = await supabase
    .from('venture_capabilities')
    .insert({
      name,
      origin_venture_id: ventureId,
      origin_sd_key: sdKey,
      capability_type: type,
      reusability_score: reusability,
      maturity_level: maturity,
    })
    .select('id, name, capability_type, reusability_score, maturity_level, created_at')
    .single();

  if (insertError) {
    if (insertError.message.includes('duplicate') || insertError.code === '23505') {
      console.error(`\n  Error: Capability "${name}" already exists for venture "${ventureName}"\n`);
      const { data: existing } = await supabase
        .from('venture_capabilities')
        .select('id, name, capability_type, reusability_score, maturity_level')
        .eq('name', name)
        .eq('origin_venture_id', ventureId)
        .single();
      if (existing) {
        console.error('  Existing capability:');
        console.error(`    Name: ${existing.name}`);
        console.error(`    Type: ${existing.capability_type}`);
        console.error(`    Reusability: ${existing.reusability_score}/10`);
        console.error(`    Maturity: ${existing.maturity_level}`);
      }
      process.exit(1);
    }
    console.error('Error inserting capability:', insertError.message);
    process.exit(1);
  }

  console.log('\n  Capability registered successfully!\n');
  console.log(`  Name:        ${inserted.name}`);
  console.log(`  Venture:     ${ventureName}`);
  console.log(`  Type:        ${inserted.capability_type} (${CAPABILITY_TYPES[type].category})`);
  console.log(`  Reusability: ${inserted.reusability_score}/10`);
  console.log(`  Maturity:    ${inserted.maturity_level}`);
  console.log(`  ID:          ${inserted.id}`);
  console.log(`  Created:     ${inserted.created_at}\n`);
}

main();
