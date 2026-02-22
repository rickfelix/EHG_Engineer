#!/usr/bin/env node
/**
 * Show Capability Graph CLI
 * SD: SD-LEO-FEAT-CAPABILITY-LATTICE-001 | US-004
 *
 * Displays cross-venture capability analytics:
 * 1. Cross-venture reuse index
 * 2. Capability centrality scores
 * 3. Orphan capabilities
 * 4. Gap analysis
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
import { CAPABILITY_CATEGORIES, CAPABILITY_TYPES } from '../../lib/capabilities/capability-taxonomy.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: capabilities, error } = await supabase
    .from('venture_capabilities')
    .select(`
      id, name, origin_venture_id, capability_type,
      reusability_score, maturity_level, consumers,
      integration_dependencies,
      ventures!origin_venture_id (name)
    `);

  if (error) {
    console.error('Error querying venture_capabilities:', error.message);
    process.exit(1);
  }

  if (!capabilities || capabilities.length === 0) {
    console.log('\n  No capabilities registered. Run seed-venture-capabilities.js first.\n');
    return;
  }

  const { data: ventures } = await supabase.from('ventures').select('id, name');
  const ventureMap = new Map((ventures || []).map(v => [v.id, v.name]));

  console.log('\n' + '='.repeat(80));
  console.log('  CAPABILITY GRAPH ANALYTICS');
  console.log('='.repeat(80));

  showReuseIndex(capabilities, ventureMap);
  showCentralityScores(capabilities);
  showOrphanCapabilities(capabilities);
  showGapAnalysis(capabilities, ventureMap);

  console.log('='.repeat(80) + '\n');
}

function showReuseIndex(capabilities, ventureMap) {
  console.log('\n  [1/4] CROSS-VENTURE REUSE INDEX');
  console.log('  ' + '-'.repeat(60));

  // Group by capability_type and count distinct ventures
  const typeVentures = new Map();
  for (const cap of capabilities) {
    if (!typeVentures.has(cap.capability_type)) {
      typeVentures.set(cap.capability_type, new Set());
    }
    typeVentures.get(cap.capability_type).add(cap.origin_venture_id);
  }

  const sharedTypes = [...typeVentures.entries()]
    .filter(([, ventures]) => ventures.size >= 2)
    .sort((a, b) => b[1].size - a[1].size);

  if (sharedTypes.length === 0) {
    console.log('  No capabilities shared across 2+ ventures.\n');
    return;
  }

  const totalVentures = ventureMap.size;
  for (const [type, ventureSet] of sharedTypes) {
    const pct = Math.round((ventureSet.size / totalVentures) * 100);
    const ventureNames = [...ventureSet].map(id => ventureMap.get(id) || 'Unknown').join(', ');
    console.log(`  ${type.padEnd(22)} ${ventureSet.size} ventures (${pct}% reuse)  [${ventureNames}]`);
  }
  console.log();
}

function showCentralityScores(capabilities) {
  console.log('  [2/4] CAPABILITY CENTRALITY SCORES');
  console.log('  ' + '-'.repeat(60));

  // Score = reusability_score * consumer_count
  const scored = capabilities.map(cap => {
    const consumerCount = Array.isArray(cap.consumers) ? cap.consumers.length : 0;
    const centrality = (cap.reusability_score || 0) * (1 + consumerCount);
    return { ...cap, centrality, consumerCount };
  }).sort((a, b) => b.centrality - a.centrality);

  const top = scored.slice(0, 10);
  for (const cap of top) {
    const name = cap.name.substring(0, 24).padEnd(25);
    const venture = (cap.ventures?.name || 'Unknown').substring(0, 15).padEnd(16);
    console.log(`  ${name} ${venture} centrality: ${cap.centrality.toFixed(1)}  (reuse: ${cap.reusability_score}/10, consumers: ${cap.consumerCount})`);
  }
  console.log();
}

function showOrphanCapabilities(capabilities) {
  console.log('  [3/4] ORPHAN CAPABILITIES');
  console.log('  ' + '-'.repeat(60));

  const orphans = capabilities.filter(cap => {
    const consumers = Array.isArray(cap.consumers) ? cap.consumers : [];
    return consumers.length === 0;
  });

  if (orphans.length === 0) {
    console.log('  No orphan capabilities found. All capabilities have consumers.\n');
    return;
  }

  for (const cap of orphans) {
    const name = cap.name.substring(0, 24).padEnd(25);
    const venture = (cap.ventures?.name || 'Unknown').substring(0, 15).padEnd(16);
    const action = cap.maturity_level === 'deprecated' ? 'Consider removal' : 'Promote or find consumers';
    console.log(`  ${name} ${venture} ${cap.maturity_level.padEnd(14)} -> ${action}`);
  }
  console.log();
}

function showGapAnalysis(capabilities, ventureMap) {
  console.log('  [4/4] GAP ANALYSIS');
  console.log('  ' + '-'.repeat(60));

  // Check which categories are represented
  const representedCategories = new Set();
  for (const cap of capabilities) {
    const typeInfo = CAPABILITY_TYPES[cap.capability_type];
    if (typeInfo) {
      representedCategories.add(typeInfo.category);
    }
  }

  const allCategories = Object.values(CAPABILITY_CATEGORIES).map(c => c.code);
  const missingCategories = allCategories.filter(c => !representedCategories.has(c));

  if (missingCategories.length === 0) {
    console.log('  All capability categories are represented across the portfolio.\n');
    return;
  }

  for (const cat of missingCategories) {
    const catInfo = Object.values(CAPABILITY_CATEGORIES).find(c => c.code === cat);
    const catName = catInfo ? catInfo.name : cat;
    const types = Object.entries(CAPABILITY_TYPES)
      .filter(([, v]) => v.category === cat)
      .map(([k]) => k)
      .slice(0, 3)
      .join(', ');
    console.log(`  MISSING: ${catName.padEnd(20)} Suggested types: ${types}`);
  }
  console.log();
}

main();
