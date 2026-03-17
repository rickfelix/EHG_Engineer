#!/usr/bin/env node

/**
 * Poller Validation Script
 * Runs all ranking data pollers, validates output quality, and generates a report.
 *
 * Usage: node scripts/validate-pollers.js [--dry-run] [--json]
 *
 * Part of SD-LEO-INFRA-COMPETITOR-MONITORING-PHASE-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { pollAppleRSS } from '../lib/eva/stage-zero/data-pollers/apple-rss-poller.js';
import { pollGooglePlay } from '../lib/eva/stage-zero/data-pollers/gplay-scraper.js';
import { pollProductHunt } from '../lib/eva/stage-zero/data-pollers/producthunt-poller.js';
import {
  normalizeAppleEntry,
  normalizeGooglePlayEntry,
  normalizeProductHuntEntry,
} from '../lib/eva/stage-zero/data-pollers/normalizer.js';

dotenv.config();

const TIMEOUT_MS = 30_000;
const REQUIRED_FIELDS = ['source', 'app_name', 'chart_position', 'chart_type'];
const OPTIONAL_FIELDS = ['developer', 'app_url', 'category', 'rating', 'review_count', 'description'];

/**
 * Run a single poller with a timeout wrapper.
 */
async function runWithTimeout(name, fn, timeoutMs) {
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    return { ...result, duration_ms: Date.now() - start };
  } catch (err) {
    return { success: false, count: 0, error: err.message, duration_ms: Date.now() - start };
  }
}

/**
 * Validate that normalized records have required fields.
 */
function validateSchema(records, source) {
  let valid = 0;
  let invalid = 0;
  const missingFields = {};

  for (const record of records) {
    let recordValid = true;
    for (const field of REQUIRED_FIELDS) {
      if (record[field] === undefined || record[field] === null || record[field] === '') {
        recordValid = false;
        missingFields[field] = (missingFields[field] || 0) + 1;
      }
    }
    if (recordValid) valid++;
    else invalid++;
  }

  const optionalPresent = {};
  for (const field of OPTIONAL_FIELDS) {
    const count = records.filter(r => r[field] !== undefined && r[field] !== null && r[field] !== '').length;
    optionalPresent[field] = { count, pct: records.length > 0 ? Math.round((count / records.length) * 100) : 0 };
  }

  return {
    total: records.length,
    valid,
    invalid,
    schema_pass_rate: records.length > 0 ? Math.round((valid / records.length) * 100) : 0,
    missing_fields: missingFields,
    field_completeness: optionalPresent,
  };
}

/**
 * Test normalizer functions with sample data.
 */
function validateNormalizers() {
  const results = [];

  // Apple normalizer
  try {
    const sample = { name: 'Test App', artistName: 'Test Dev', url: 'https://apple.com/app' };
    const normalized = normalizeAppleEntry(sample, 'Health & Fitness', 1);
    const valid = normalized.source === 'apple_appstore' && normalized.app_name === 'Test App' && normalized.chart_position === 1;
    results.push({ normalizer: 'apple', valid, output: normalized });
  } catch (err) {
    results.push({ normalizer: 'apple', valid: false, error: err.message });
  }

  // Google Play normalizer
  try {
    const sample = { title: 'GP App', developer: 'GP Dev', url: 'https://play.google.com/app', scoreText: '4.5', reviews: 1000 };
    const normalized = normalizeGooglePlayEntry(sample, 'Finance', 2);
    const valid = normalized.source === 'google_play' && normalized.app_name === 'GP App' && normalized.rating === 4.5;
    results.push({ normalizer: 'google_play', valid, output: normalized });
  } catch (err) {
    results.push({ normalizer: 'google_play', valid: false, error: err.message });
  }

  // Product Hunt normalizer
  try {
    const sample = { name: 'PH Product', tagline: 'A great tool', votesCount: 500, url: 'https://producthunt.com/posts/ph', website: 'https://ph.com' };
    const normalized = normalizeProductHuntEntry(sample, 1);
    const valid = normalized.source === 'product_hunt' && normalized.app_name === 'PH Product' && normalized.vote_count === 500;
    results.push({ normalizer: 'product_hunt', valid, output: normalized });
  } catch (err) {
    results.push({ normalizer: 'product_hunt', valid: false, error: err.message });
  }

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jsonOutput = args.includes('--json');
  const log = jsonOutput ? () => {} : console.log;

  log('========================================');
  log('  POLLER VALIDATION REPORT');
  log('========================================');
  log(`  Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  log(`  Timeout: ${TIMEOUT_MS}ms per source`);
  log('');

  // Step 1: Validate normalizers (no network needed)
  log('--- Normalizer Validation ---');
  const normalizerResults = validateNormalizers();
  const allNormalizersValid = normalizerResults.every(r => r.valid);
  for (const r of normalizerResults) {
    log(`  ${r.valid ? 'PASS' : 'FAIL'} ${r.normalizer} normalizer${r.error ? ': ' + r.error : ''}`);
  }
  log('');

  // Step 2: Run pollers against live APIs
  log('--- Poller Execution ---');

  const supabase = dryRun ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Create a mock supabase for dry-run that captures upserts
  const capturedRecords = { apple_appstore: [], google_play: [], product_hunt: [] };
  const mockSupabase = {
    from: (table) => ({
      upsert: (rows) => {
        if (table === 'app_rankings') {
          for (const row of rows) {
            if (capturedRecords[row.source]) capturedRecords[row.source].push(row);
          }
        }
        return Promise.resolve({ error: null });
      },
    }),
  };

  const db = dryRun ? mockSupabase : supabase;
  const phToken = process.env.PRODUCT_HUNT_TOKEN || process.env.PRODUCT_HUNT_API_TOKEN || null;

  const pollerResults = {};

  // Apple RSS
  log('  Running Apple RSS poller...');
  pollerResults.apple_appstore = await runWithTimeout(
    'apple_appstore',
    () => pollAppleRSS({ supabase: db, logger: { log: () => {} } }),
    TIMEOUT_MS
  );
  log(`    ${pollerResults.apple_appstore.success ? 'PASS' : 'FAIL'} — ${pollerResults.apple_appstore.count} records (${pollerResults.apple_appstore.duration_ms}ms)${pollerResults.apple_appstore.error ? ' — ' + pollerResults.apple_appstore.error : ''}`);

  // Google Play
  log('  Running Google Play poller...');
  pollerResults.google_play = await runWithTimeout(
    'google_play',
    () => pollGooglePlay({ supabase: db, logger: { log: () => {} }, categories: [{ id: 'HEALTH_AND_FITNESS', name: 'Health & Fitness' }] }),
    TIMEOUT_MS
  );
  log(`    ${pollerResults.google_play.success ? 'PASS' : 'FAIL'} — ${pollerResults.google_play.count} records (${pollerResults.google_play.duration_ms}ms)${pollerResults.google_play.error ? ' — ' + pollerResults.google_play.error : ''}`);

  // Product Hunt
  log('  Running Product Hunt poller...');
  pollerResults.product_hunt = await runWithTimeout(
    'product_hunt',
    () => pollProductHunt({ supabase: db, logger: { log: () => {} }, topics: ['artificial-intelligence'], apiToken: phToken }),
    TIMEOUT_MS
  );
  log(`    ${pollerResults.product_hunt.success ? 'PASS' : 'FAIL'} — ${pollerResults.product_hunt.count} records (${pollerResults.product_hunt.duration_ms}ms)${pollerResults.product_hunt.error ? ' — ' + pollerResults.product_hunt.error : ''}`);
  log('');

  // Step 3: Schema validation on captured records (dry-run mode)
  let schemaResults = {};
  if (dryRun) {
    log('--- Schema Validation (Dry Run Captured Records) ---');
    for (const [source, records] of Object.entries(capturedRecords)) {
      if (records.length > 0) {
        schemaResults[source] = validateSchema(records, source);
        log(`  ${source}: ${schemaResults[source].schema_pass_rate}% schema compliance (${schemaResults[source].valid}/${schemaResults[source].total})`);
      } else {
        log(`  ${source}: No records captured`);
      }
    }
    log('');
  }

  // Step 4: Summary
  const sources = Object.keys(pollerResults);
  const successCount = sources.filter(s => pollerResults[s].success).length;
  const totalRecords = sources.reduce((sum, s) => sum + (pollerResults[s].count || 0), 0);

  const overallPass = allNormalizersValid && successCount >= 2; // At least 2 of 3 pollers must succeed

  log('========================================');
  log('  SUMMARY');
  log('========================================');
  log(`  Normalizers: ${allNormalizersValid ? 'ALL PASS' : 'FAILURES DETECTED'}`);
  log(`  Pollers: ${successCount}/${sources.length} succeeded`);
  log(`  Total Records: ${totalRecords}`);
  log(`  Overall: ${overallPass ? 'PASS' : 'FAIL'}`);
  if (!pollerResults.google_play.success && pollerResults.google_play.error === 'google-play-scraper not installed') {
    log('  Note: Install google-play-scraper to enable Google Play polling');
  }
  if (!pollerResults.product_hunt.success && pollerResults.product_hunt.error === 'no_token') {
    log('  Note: Set PRODUCT_HUNT_TOKEN env var to enable Product Hunt polling');
  }
  log('========================================');

  const report = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'dry_run' : 'live',
    normalizers: {
      all_valid: allNormalizersValid,
      results: normalizerResults.map(r => ({ normalizer: r.normalizer, valid: r.valid, error: r.error || null })),
    },
    pollers: pollerResults,
    schema_validation: schemaResults,
    summary: {
      sources_succeeded: successCount,
      sources_total: sources.length,
      total_records: totalRecords,
      overall_pass: overallPass,
    },
  };

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(report, null, 2));
  }

  process.exit(overallPass ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
