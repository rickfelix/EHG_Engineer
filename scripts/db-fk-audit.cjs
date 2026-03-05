#!/usr/bin/env node
/**
 * FK Audit Tool — Queries information_schema to discover all FK relationships
 * referencing ventures(id). Compares against the FK registry and reports gaps.
 *
 * Usage: node scripts/db-fk-audit.cjs [--json]
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { VENTURE_FK_REGISTRY, getSummary } = require('./modules/venture-lifecycle/fk-registry.cjs');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const jsonOutput = process.argv.includes('--json');

async function discoverLiveFKs() {
  // exec_sql RPC uses param `sql_text` and returns TABLE(result jsonb)
  const sql = `
    SELECT
      conrelid::regclass::text AS child_table,
      a.attname AS child_column,
      CASE confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS delete_rule,
      conname AS constraint_name
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
    WHERE c.confrelid = 'public.ventures'::regclass
      AND c.contype = 'f'
    ORDER BY child_table, child_column
  `;

  const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });

  if (error) {
    console.error('exec_sql RPC failed:', error.message);
    return null;
  }

  // exec_sql returns rows with {result: [...]} — flatten
  if (data && data.length > 0 && data[0].result) {
    return data[0].result;
  }

  return data || [];
}

function normalizePolicy(deleteRule) {
  if (!deleteRule) return 'NO_ACTION';
  const rule = deleteRule.toUpperCase().replace(/\s+/g, '_');
  if (rule === 'NO_ACTION') return 'RESTRICT'; // Functionally equivalent for our purposes
  return rule;
}

function runAudit(liveFKs) {
  const registryMap = new Map();
  for (const entry of VENTURE_FK_REGISTRY) {
    const key = `${entry.table}:${entry.column}`;
    registryMap.set(key, entry);
  }

  const liveMap = new Map();
  if (liveFKs) {
    for (const fk of liveFKs) {
      const key = `${fk.child_table}:${fk.child_column}`;
      liveMap.set(key, fk);
    }
  }

  const results = {
    matched: [],       // In registry AND in live DB with matching policy
    mismatched: [],    // In both but policy differs
    registryOnly: [],  // In registry but NOT in live DB
    liveOnly: [],      // In live DB but NOT in registry
  };

  // Check registry entries against live
  for (const [key, entry] of registryMap) {
    const live = liveMap.get(key);
    if (!live) {
      results.registryOnly.push(entry);
    } else {
      const livePolicy = normalizePolicy(live.delete_rule);
      if (livePolicy === entry.policy) {
        results.matched.push({ ...entry, constraint: live.constraint_name });
      } else {
        results.mismatched.push({
          ...entry,
          livePolicy,
          constraint: live.constraint_name,
        });
      }
    }
  }

  // Check live entries not in registry
  if (liveFKs) {
    for (const [key, fk] of liveMap) {
      if (!registryMap.has(key)) {
        results.liveOnly.push({
          table: fk.child_table,
          column: fk.child_column,
          livePolicy: normalizePolicy(fk.delete_rule),
          constraint: fk.constraint_name,
        });
      }
    }
  }

  return results;
}

function printReport(results, liveFKs) {
  const summary = getSummary();

  if (jsonOutput) {
    console.log(JSON.stringify({ summary, results, liveDiscoveryAvailable: liveFKs !== null }, null, 2));
    return;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FK Audit Report — Venture Data Lifecycle');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log(`Registry: ${summary.total} entries (${summary.cascade} CASCADE, ${summary.restrict} RESTRICT, ${summary.setNull} SET_NULL)`);
  console.log(`Self-referencing FKs: ${summary.selfRefs}`);
  console.log('');

  if (liveFKs === null) {
    console.log('⚠️  Live DB discovery unavailable (exec_sql RPC not configured)');
    console.log('   Registry-only audit below. Create the exec_sql function to enable full comparison.');
    console.log('');
  }

  // Matched
  if (results.matched.length > 0) {
    console.log(`✅ Matched (${results.matched.length}):`);
    for (const m of results.matched) {
      console.log(`   ${m.table}.${m.column} → ${m.policy}`);
    }
    console.log('');
  }

  // Mismatched
  if (results.mismatched.length > 0) {
    console.log(`⚠️  Policy Mismatch (${results.mismatched.length}):`);
    for (const m of results.mismatched) {
      console.log(`   ${m.table}.${m.column}: registry=${m.policy}, live=${m.livePolicy}`);
    }
    console.log('');
  }

  // Registry only
  if (results.registryOnly.length > 0) {
    console.log(`📋 Registry Only — not found in live DB (${results.registryOnly.length}):`);
    for (const r of results.registryOnly) {
      console.log(`   ${r.table}.${r.column} → ${r.policy} [${r.category}]`);
    }
    console.log('   (May be: table renamed, dropped, or behind different schema)');
    console.log('');
  }

  // Live only
  if (results.liveOnly.length > 0) {
    console.log(`🔍 Live DB Only — not in registry (${results.liveOnly.length}):`);
    for (const l of results.liveOnly) {
      console.log(`   ${l.table}.${l.column} → ${l.livePolicy} (${l.constraint})`);
    }
    console.log('   ⚠️  These should be added to fk-registry.js');
    console.log('');
  }

  // Category breakdown
  console.log('─── Category Breakdown ───');
  const categories = {};
  for (const entry of VENTURE_FK_REGISTRY) {
    categories[entry.category] = (categories[entry.category] || 0) + 1;
  }
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${count} entries`);
  }
  console.log('');

  // Final verdict
  const issues = results.mismatched.length + results.liveOnly.length;
  if (issues === 0 && liveFKs !== null) {
    console.log('✅ AUDIT PASS — Registry is consistent with live DB');
  } else if (liveFKs === null) {
    console.log(`📋 REGISTRY AUDIT — ${summary.total} entries classified (live comparison unavailable)`);
  } else {
    console.log(`⚠️  AUDIT NEEDS ATTENTION — ${issues} issue(s) found`);
  }
  console.log('');
}

async function main() {
  const startTime = Date.now();
  console.log('Running FK audit...');

  const liveFKs = await discoverLiveFKs();
  const results = runAudit(liveFKs);
  printReport(results, liveFKs);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Audit completed in ${elapsed}s`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
