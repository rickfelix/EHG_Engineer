#!/usr/bin/env node
/**
 * Poll Errors CLI — Scheduled Task Entry Point
 *
 * Orchestrates the full error polling cycle across all active ventures:
 * 1. Fetch active ventures with Sentry config
 * 2. Poll each venture's Sentry project for new issues
 * 3. Sanitize and write to feedback table with dedup
 * 4. Check guardrails before allowing corrections
 * 5. Output summary for logging
 *
 * Usage:
 *   node scripts/factory/poll-errors.js
 *   node scripts/factory/poll-errors.js --venture <name>   # Poll single venture
 *   node scripts/factory/poll-errors.js --dry-run          # Preview without writing
 *   node scripts/factory/poll-errors.js --digest            # Generate daily digest
 *
 * SD: SD-LEO-INFRA-SOFTWARE-FACTORY-AUTOMATED-001
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { pollVentureErrors } from '../../lib/factory/sentry-poller.js';
import { writeErrors } from '../../lib/factory/feedback-writer.js';
import { checkGuardrails } from '../../lib/factory/guardrails.js';
import { generateDigest, formatDigest } from '../../lib/factory/daily-digest.js';

const { values: args } = parseArgs({
  options: {
    venture: { type: 'string', default: '' },
    'dry-run': { type: 'boolean', default: false },
    digest: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false }
  },
  strict: true
});

if (args.help) {
  console.log(`
Poll Errors — Software Factory Scheduled Task

Usage:
  node scripts/factory/poll-errors.js              # Poll all active ventures
  node scripts/factory/poll-errors.js --venture X  # Poll single venture
  node scripts/factory/poll-errors.js --dry-run    # Preview without writing
  node scripts/factory/poll-errors.js --digest     # Generate daily digest
`);
  process.exit(0);
}

async function main() {
  if (args.digest) {
    const digest = await generateDigest();
    console.log(formatDigest(digest));
    process.exit(0);
  }

  const supabase = createSupabaseServiceClient();

  // Fetch ventures with Sentry config
  let ventureQuery = supabase
    .from('ventures')
    .select('id, name, metadata')
    .eq('status', 'active');

  if (args.venture) {
    ventureQuery = ventureQuery.ilike('name', `%${args.venture}%`);
  }

  const { data: ventures, error } = await ventureQuery;
  if (error) {
    console.error('Failed to fetch ventures:', error.message);
    process.exit(1);
  }

  if (!ventures?.length) {
    console.log('No active ventures found.');
    process.exit(0);
  }

  console.log(`Polling ${ventures.length} venture(s)...`);
  console.log('');

  let totalWritten = 0;
  let totalDeduped = 0;
  let totalInjection = 0;
  const zeroErrorThreshold = parseInt(process.env.SENTRY_ZERO_ERROR_THRESHOLD || '5', 10);
  const suspectedBroken = [];

  for (const venture of ventures) {
    const sentryConfig = venture.metadata?.sentry;
    if (!sentryConfig?.org || !sentryConfig?.project || !sentryConfig?.token) {
      console.log(`[${venture.name}] Skipped — no Sentry config in metadata`);
      continue;
    }

    // Check guardrails before polling (if kill switch active, skip entirely)
    const guardrails = await checkGuardrails(venture.id);
    if (!guardrails.allowed && guardrails.violations.some(v => v.startsWith('KILL_SWITCH'))) {
      console.log(`[${venture.name}] Skipped — kill switch active`);
      continue;
    }

    try {
      console.log(`[${venture.name}] Polling Sentry...`);
      const errors = await pollVentureErrors({
        sentryOrg: sentryConfig.org,
        sentryProject: sentryConfig.project,
        sentryToken: sentryConfig.token,
        baseUrl: sentryConfig.baseUrl || undefined,
        since: sentryConfig.lastPollAt || undefined
      });

      console.log(`[${venture.name}] Found ${errors.length} issue(s)`);

      if (args['dry-run']) {
        for (const err of errors) {
          console.log(`  ${err.severity.toUpperCase()} | ${err.title}`);
        }
        continue;
      }

      if (errors.length > 0) {
        const result = await writeErrors(venture.id, venture.name, errors);
        console.log(`[${venture.name}] Written: ${result.written}, Deduped: ${result.deduped}, Injection flagged: ${result.injectionFlagged}`);
        totalWritten += result.written;
        totalDeduped += result.deduped;
        totalInjection += result.injectionFlagged;
      }

      // Zero-error health monitoring: track consecutive polls with no errors
      const prevCount = sentryConfig.consecutive_zero_error_count || 0;
      const updatedSentryConfig = {
        ...sentryConfig,
        lastPollAt: new Date().toISOString()
      };

      if (errors.length === 0) {
        updatedSentryConfig.consecutive_zero_error_count = prevCount + 1;
        if (updatedSentryConfig.consecutive_zero_error_count >= zeroErrorThreshold) {
          updatedSentryConfig.potentially_broken_sdk = true;
          suspectedBroken.push(venture.name);
          console.log(`[${venture.name}] ⚠️  ${updatedSentryConfig.consecutive_zero_error_count} consecutive zero-error polls — SDK may be broken`);
        }
      } else {
        // Errors received — reset zero-error tracking
        updatedSentryConfig.consecutive_zero_error_count = 0;
        updatedSentryConfig.potentially_broken_sdk = false;
      }

      await supabase
        .from('ventures')
        .update({
          metadata: {
            ...venture.metadata,
            sentry: updatedSentryConfig
          }
        })
        .eq('id', venture.id);

    } catch (err) {
      console.error(`[${venture.name}] Poll failed: ${err.message}`);
    }
  }

  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Ventures polled: ${ventures.length}`);
  console.log(`Errors written:  ${totalWritten}`);
  console.log(`Deduped:         ${totalDeduped}`);
  console.log(`Injection flags: ${totalInjection}`);

  if (suspectedBroken.length > 0) {
    console.log('');
    console.log('⚠️  Suspected Broken SDKs');
    console.log('-------------------------');
    for (const name of suspectedBroken) {
      console.log(`  • ${name} (${zeroErrorThreshold}+ consecutive zero-error polls)`);
    }
    console.log('');
    console.log('These ventures may have a silently broken Sentry SDK.');
    console.log('Verify SDK initialization and DSN configuration.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
