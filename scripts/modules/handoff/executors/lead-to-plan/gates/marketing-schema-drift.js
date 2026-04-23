/**
 * Marketing Schema Drift Gate for LEAD-TO-PLAN
 *
 * SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-A Phase 0.
 *
 * Runs `scripts/verify-marketing-schema.mjs` as a precheck for any
 * downstream Marketing Distribution SD (phases B, C, D). Blocks LEAD-TO-PLAN
 * when the live DB drifts from `config/marketing-schema-manifest.json`.
 *
 * Gate is scoped explicitly to the Marketing Distribution orchestrator
 * family via sd_key prefix match — it does NOT fire on unrelated SDs.
 *
 * Exit 0 from the verifier → PASS (score 100).
 * Non-zero exit → FAIL (score 0), verifier stdout/stderr surfaced in issues.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Traverse: gates/ -> lead-to-plan/ -> executors/ -> handoff/ -> modules/ -> scripts/ -> repo-root
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..');

const MARKETING_SD_KEY_PATTERN = /^SD-EHG-MARKETING-DISTRIBUTION-INFRASTRUCTURE-ORCH-001-[BCD]$/i;

function runVerifier() {
  return new Promise((resolveP) => {
    const verifierPath = resolve(REPO_ROOT, 'scripts/verify-marketing-schema.mjs');
    if (!existsSync(verifierPath)) {
      resolveP({
        exitCode: 127,
        stdout: '',
        stderr: `verifier not found at ${verifierPath}`
      });
      return;
    }
    const proc = spawn(process.execPath, [verifierPath, '--json'], {
      cwd: REPO_ROOT,
      env: { ...process.env }
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('close', (code) => resolveP({ exitCode: code ?? 1, stdout, stderr }));
    proc.on('error', (err) => resolveP({ exitCode: 1, stdout, stderr: err.message }));
  });
}

/**
 * Validate marketing schema is aligned with committed manifest.
 *
 * @param {Object} sd - Strategic Directive
 * @returns {Object} Validation result
 */
export async function validateMarketingSchemaDrift(sd) {
  const sdKey = sd?.sd_key || sd?.id || '';
  const inScope = MARKETING_SD_KEY_PATTERN.test(sdKey);

  if (!inScope) {
    return {
      pass: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: { skipped: true, reason: 'sd_key not in Marketing Distribution phase B/C/D' }
    };
  }

  const { exitCode, stdout, stderr } = await runVerifier();

  if (exitCode === 0) {
    let summary = null;
    try { summary = JSON.parse(stdout); } catch { /* keep stdout raw */ }
    return {
      pass: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: [],
      details: {
        skipped: false,
        tables_total: summary?.tables_total ?? null,
        tables_aligned: summary?.tables_aligned ?? null,
        elapsed_ms: summary?.elapsed_ms ?? null
      }
    };
  }

  let parsedDiffs = null;
  try {
    const payload = JSON.parse(stdout);
    parsedDiffs = Array.isArray(payload?.diffs) ? payload.diffs : null;
  } catch { /* fall through */ }

  const issues = parsedDiffs
    ? parsedDiffs.map((d) => `${d.severity}: ${d.message}`)
    : [
        `Verifier exited ${exitCode}`,
        stdout.trim() || stderr.trim() || '(no output)'
      ];

  return {
    pass: false,
    score: 0,
    max_score: 100,
    issues,
    warnings: [],
    details: { skipped: false, exitCode, stdout, stderr }
  };
}

export function createMarketingSchemaDriftGate() {
  return {
    name: 'MARKETING_SCHEMA_DRIFT',
    validator: async (ctx) => {
      console.log('\n📊 GATE: Marketing Schema Drift');
      console.log('-'.repeat(50));
      return validateMarketingSchemaDrift(ctx.sd);
    },
    required: false,
    remediation:
      'Live DB schema drifts from config/marketing-schema-manifest.json. Either (a) update the manifest to match reality via a committed migration + manifest regeneration, or (b) apply the missing migration via the DATABASE sub-agent, then rerun the verifier (`node scripts/verify-marketing-schema.mjs`).'
  };
}
