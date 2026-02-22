#!/usr/bin/env node
/**
 * List Venture Capabilities CLI
 * SD: SD-LEO-FEAT-CAPABILITY-LATTICE-001 | US-002
 *
 * Queries venture_capabilities table and displays all registered capabilities
 * in a formatted table.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: capabilities, error } = await supabase
    .from('venture_capabilities')
    .select(`
      id, name, origin_venture_id, origin_sd_key, capability_type,
      reusability_score, maturity_level, consumers, created_at,
      ventures!origin_venture_id (name)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error querying venture_capabilities:', error.message);
    process.exit(1);
  }

  if (!capabilities || capabilities.length === 0) {
    console.log('\n  No capabilities registered yet.\n');
    console.log('  To register a new capability:');
    console.log('    node scripts/capabilities/add-capability.js --venture <name> --name <cap-name> --type <type>\n');
    console.log('  To seed initial data:');
    console.log('    node scripts/capabilities/seed-venture-capabilities.js\n');
    return;
  }

  // Header
  console.log('\n' + '='.repeat(110));
  console.log('  VENTURE CAPABILITIES REGISTRY');
  console.log('='.repeat(110));

  // Column headers
  const hName = 'Name'.padEnd(25);
  const hVenture = 'Venture'.padEnd(18);
  const hType = 'Type'.padEnd(22);
  const hReuse = 'Reuse';
  const hMaturity = 'Maturity'.padEnd(14);
  const hConsumers = 'Consumers';
  console.log(`  ${hName} ${hVenture} ${hType} ${hReuse}  ${hMaturity} ${hConsumers}`);
  console.log('  ' + '-'.repeat(106));

  for (const cap of capabilities) {
    const name = cap.name.substring(0, 24).padEnd(25);
    const venture = (cap.ventures?.name || 'Unknown').substring(0, 17).padEnd(18);
    const type = cap.capability_type.substring(0, 21).padEnd(22);
    const reuse = String(cap.reusability_score || 0).padStart(3) + '/10';
    const maturity = (cap.maturity_level || 'experimental').padEnd(14);
    const consumerCount = Array.isArray(cap.consumers) ? cap.consumers.length : 0;
    console.log(`  ${name} ${venture} ${type} ${reuse} ${maturity} ${consumerCount}`);
  }

  console.log('  ' + '-'.repeat(106));
  console.log(`  Total: ${capabilities.length} capability(ies)\n`);
}

main();
