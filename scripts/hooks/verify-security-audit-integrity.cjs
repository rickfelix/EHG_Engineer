#!/usr/bin/env node
/**
 * Verify integrity_hash for security_audit_events rows.
 *
 * Recomputes SHA-256 over canonical event tuple and compares to stored hash.
 * Surfaces tampering or schema drift.
 *
 * Usage:
 *   node scripts/verify-security-audit-integrity.cjs --row-id <uuid>
 *   node scripts/verify-security-audit-integrity.cjs --sample 100
 *
 * SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001
 */

require('dotenv').config();
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { drainAndExit } = require('../../lib/hooks/drain-undici.cjs'); // QF-20260719-890: drain before post-fetch exits

function computeIntegrityHash(row) {
  const canonical = JSON.stringify({
    event_type: row.event_type,
    severity: row.severity,
    occurred_at: row.occurred_at,
    source_agent: row.source_agent,
    venture_id: row.venture_id || null,
    sd_id: row.sd_id || null,
    event_payload: row.event_payload || {}
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { rowId: null, sample: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--row-id') out.rowId = args[++i];
    else if (args[i] === '--sample') out.sample = parseInt(args[++i], 10);
  }
  if (!out.rowId && !out.sample) {
    console.error('Usage: --row-id <uuid> | --sample <N>');
    process.exit(2);
  }
  return out;
}

async function verifyRow(supabase, row) {
  const computed = computeIntegrityHash(row);
  const match = computed === row.integrity_hash;
  return { id: row.id, match, stored: row.integrity_hash, computed };
}

async function main() {
  const { rowId, sample } = parseArgs();
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  let rows;
  if (rowId) {
    const { data, error } = await supabase.from('security_audit_events').select('*').eq('id', rowId);
    if (error) { console.error('Query error:', error.message); await drainAndExit(1); }
    rows = data || [];
  } else {
    const { data, error } = await supabase.from('security_audit_events').select('*').limit(sample);
    if (error) { console.error('Query error:', error.message); await drainAndExit(1); }
    rows = data || [];
  }

  if (rows.length === 0) {
    console.log('No rows found');
    await drainAndExit(0);
  }

  let mismatches = 0;
  for (const row of rows) {
    const result = await verifyRow(supabase, row);
    if (!result.match) {
      mismatches++;
      console.error(`MISMATCH id=${result.id} stored=${result.stored.slice(0, 12)}... computed=${result.computed.slice(0, 12)}...`);
    }
  }

  console.log(`Verified ${rows.length} row(s); ${mismatches} mismatch(es).`);
  await drainAndExit(mismatches > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); return drainAndExit(1); });
