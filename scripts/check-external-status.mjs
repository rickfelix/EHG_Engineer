#!/usr/bin/env node
// SD-LEO-INFRA-AUTO-CHECK-EXTERNAL-001 — CLI consumer of lib/fleet/external-status-check.mjs.
//
// Run this when a FLEET-WIDE anomaly is observed (cohort heartbeat-loss / mass rate-limits / widespread tool
// errors) to check whether Anthropic/Claude is having an incident BEFORE attributing the anomaly to a code or
// fleet gap. Advisory + fail-open: always exits 0 (a status-check failure must never block incident handling).
//
// Usage: node scripts/check-external-status.mjs ["<anomaly summary>"]   (or ANOMALY_SUMMARY env)
import { checkAnthropicStatus, classifyAnomalyAttribution } from '../lib/fleet/external-status-check.mjs';

const anomalySummary = process.argv.slice(2).join(' ').trim() || process.env.ANOMALY_SUMMARY || null;

const status = await checkAnthropicStatus({});
const verdict = classifyAnomalyAttribution({ anomaly: anomalySummary ? { summary: anomalySummary } : null, status });

const head = `[external-status-check] indicator=${status.indicator}` +
  (status.description ? ` (${status.description})` : '') +
  (status.ok ? '' : ` [fetch failed: ${status.error}]`) +
  (status.updatedAt ? ` | status page updated ${status.updatedAt}` : '');
console.log(head);
console.log(`  likely_external: ${verdict.likely_external} (confidence: ${verdict.confidence})`);
console.log(`  reason: ${verdict.reason}`);
console.log(`  ACTION: ${verdict.recommendation}`);
console.log(`EXTERNAL_STATUS_INDICATOR=${status.indicator} LIKELY_EXTERNAL=${verdict.likely_external}`);

// Advisory only — never fail the caller. Set exitCode (don't process.exit()) so the event loop drains
// cleanly; an explicit process.exit() while undici's fetch/AbortController handle is mid-close trips a benign
// libuv UV_HANDLE_CLOSING assertion on Windows. Everything above is fail-open, so a clean drain always exits 0.
process.exitCode = 0;
