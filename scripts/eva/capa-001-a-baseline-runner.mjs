#!/usr/bin/env node
/**
 * Venture quality baseline runner.
 * SD: SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A (FR-1, FR-2, FR-3)
 *
 * One-time, informational-only baseline across 3 dimensions for a venture's
 * deployed surface:
 *   - accessibility: axe-core (@axe-core/playwright), same mechanism
 *     tests/e2e/fixtures/accessibility.ts wraps (that fixture is TS and bound
 *     to Playwright's test-fixture context, so it isn't importable from a
 *     plain script -- this reuses the same AxeBuilder call and default WCAG
 *     tag set directly against a raw Playwright page instead).
 *   - performance: Lighthouse via `lhci collect`, reusing the repo-root
 *     lighthouserc.json thresholds as-is (no new budgets defined here).
 *   - responsive: layout-break check at the 3 named breakpoints from
 *     lib/eva/stage-17/screenshot-generator.js VIEWPORTS (not exported there,
 *     so duplicated here -- see VIEWPORTS below).
 *
 * Findings persist via lib/eva/quality-findings/writer.js. Severity is capped
 * at medium/low (never critical/high) -- writeFinding()'s sd-generator path
 * (maybeGenerateSdForFinding) auto-files a remediation SD synchronously for
 * critical/high findings, which would contradict this baseline's
 * informational-only scope (FR-1 acceptance criteria).
 *
 * Usage: node scripts/eva/capa-001-a-baseline-runner.mjs [--venture <name-or-id>] [--skip-lighthouse]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFindingsBatch } from '../../lib/eva/quality-findings/writer.js';
import { computeFindingHash } from '../../lib/eva/quality-findings/finding-shape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STAGE_NUMBER = 20;
const LHR_FILE_REGEX = /^lhr-\d+\.json$/;

// Same 3 real breakpoints as lib/eva/stage-17/screenshot-generator.js
// VIEWPORTS (AGNOSTIC there is a 4th key aliasing DESKTOP's dimensions, not
// a distinct breakpoint -- duplicated here since VIEWPORTS is not exported).
export const VIEWPORTS = {
  DESKTOP: { width: 1440, height: 900 },
  MOBILE: { width: 375, height: 812 },
  TABLET: { width: 768, height: 1024 },
};

export function parseArgs(argv) {
  const out = { venture: 'AltifyAI', skipLighthouse: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--venture') out.venture = argv[++i];
    else if (argv[i] === '--skip-lighthouse') out.skipLighthouse = true;
  }
  return out;
}

async function resolveVenture(supabase, ventureArg) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ventureArg);
  const query = supabase.from('ventures').select('id, name, deployment_url');
  const { data, error } = isUuid
    ? await query.eq('id', ventureArg).maybeSingle()
    : await query.eq('name', ventureArg).maybeSingle();
  if (error) throw new Error(`ventures lookup failed: ${error.message}`);
  if (!data) throw new Error(`venture not found: ${ventureArg}`);
  if (!data.deployment_url) throw new Error(`venture ${data.name} has no deployment_url`);
  return data;
}

// FR-1 acceptance criteria: severity capped at medium/low, never critical/high.
export function axeImpactToSeverity(impact) {
  if (impact === 'critical' || impact === 'serious' || impact === 'moderate') return 'medium';
  return 'low';
}

export function buildAccessibilityFindings(ventureId, url, violations) {
  return violations.map((v) => {
    const firstTarget = v.nodes?.[0]?.target?.join(' ') || 'page';
    return {
      venture_id: ventureId,
      stage_number: STAGE_NUMBER,
      finding_category: 'accessibility',
      severity: axeImpactToSeverity(v.impact),
      finding_signature: `accessibility:${v.id}:${firstTarget}`,
      evidence_pointer: {
        rule_id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: (v.nodes || []).slice(0, 5).map((n) => ({ target: n.target, html: (n.html || '').slice(0, 300) })),
        url,
      },
    };
  });
}

export function buildResponsiveFindings(ventureId, url, breakpointResults) {
  const findings = [];
  for (const { breakpoint, viewport, scrollWidth, clientWidth } of breakpointResults) {
    const horizontalOverflowPx = scrollWidth - clientWidth;
    if (horizontalOverflowPx > 1) {
      findings.push({
        venture_id: ventureId,
        stage_number: STAGE_NUMBER,
        finding_category: 'responsive',
        severity: 'medium',
        finding_signature: `responsive:${breakpoint}:horizontal-overflow`,
        evidence_pointer: {
          breakpoint,
          viewport,
          horizontal_overflow_px: horizontalOverflowPx,
          scroll_width: scrollWidth,
          client_width: clientWidth,
          url,
        },
      });
    }
  }
  return findings;
}

export function buildLighthouseFindings(ventureId, url, runId, lhr, thresholds) {
  const findings = [];

  const perfScore = lhr?.categories?.performance?.score;
  const perfCfg = thresholds?.['categories:performance']?.[1];
  if (perfScore != null && perfCfg?.minScore != null && perfScore < perfCfg.minScore) {
    findings.push({
      venture_id: ventureId,
      stage_number: STAGE_NUMBER,
      finding_category: 'performance',
      severity: 'medium',
      finding_signature: `performance:${runId}:categories-performance-below-threshold`,
      evidence_pointer: { run_id: runId, metric: 'categories:performance', score: perfScore, min_score: perfCfg.minScore, url },
    });
  }

  for (const metricKey of ['first-contentful-paint', 'largest-contentful-paint']) {
    const cfg = thresholds?.[metricKey]?.[1];
    const audit = lhr?.audits?.[metricKey];
    if (cfg?.maxNumericValue != null && audit?.numericValue != null && audit.numericValue > cfg.maxNumericValue) {
      findings.push({
        venture_id: ventureId,
        stage_number: STAGE_NUMBER,
        finding_category: 'performance',
        severity: 'medium',
        finding_signature: `performance:${runId}:${metricKey}-above-threshold`,
        evidence_pointer: { run_id: runId, metric: metricKey, value_ms: audit.numericValue, max_ms: cfg.maxNumericValue, url },
      });
    }
  }

  // FR-2 acceptance criteria: "run id recorded" even when every metric passes.
  findings.push({
    venture_id: ventureId,
    stage_number: STAGE_NUMBER,
    finding_category: 'performance',
    severity: 'low',
    finding_signature: `performance:${runId}:run-recorded`,
    evidence_pointer: {
      run_id: runId,
      url,
      categories: lhr?.categories ? Object.fromEntries(Object.entries(lhr.categories).map(([k, v]) => [k, v.score])) : {},
    },
  });

  return findings;
}

export function buildLighthouseFailureFinding(ventureId, url, runId, reason, detail) {
  return [{
    venture_id: ventureId,
    stage_number: STAGE_NUMBER,
    finding_category: 'performance',
    severity: 'low',
    finding_signature: `performance:${runId}:${reason}`,
    evidence_pointer: { run_id: runId, url, error: String(detail || '').slice(0, 500) },
  }];
}

function loadLighthouseThresholds() {
  const raw = readFileSync(path.join(REPO_ROOT, 'lighthouserc.json'), 'utf8');
  return JSON.parse(raw).ci.assert.assertions;
}

async function runLighthouseCheck(ventureId, url) {
  const runId = `capa-001-a-${Date.now()}`;
  const lhciDir = path.join(REPO_ROOT, '.lighthouseci');
  rmSync(lhciDir, { recursive: true, force: true });

  try {
    execFileSync(
      'npx',
      ['lhci', 'collect', `--url=${url}`, '--numberOfRuns=1'],
      { cwd: REPO_ROOT, stdio: 'pipe', shell: process.platform === 'win32' }
    );
  } catch (err) {
    return buildLighthouseFailureFinding(ventureId, url, runId, 'collect-failed', err.message || err);
  }

  const reportFiles = existsSync(lhciDir) ? readdirSync(lhciDir).filter((f) => LHR_FILE_REGEX.test(f)) : [];
  if (reportFiles.length === 0) {
    return buildLighthouseFailureFinding(ventureId, url, runId, 'no-report', 'no lhr-*.json produced');
  }

  const lhr = JSON.parse(readFileSync(path.join(lhciDir, reportFiles[0]), 'utf8'));
  const thresholds = loadLighthouseThresholds();
  const findings = buildLighthouseFindings(ventureId, url, runId, lhr, thresholds);

  rmSync(lhciDir, { recursive: true, force: true });
  return findings;
}

async function runAccessibilityAndResponsiveChecks(page, ventureId, url) {
  // Wait for hydration before scanning -- a Vite SPA's #root can render empty
  // at domcontentloaded, producing a false-clean scan (PRD risk register).
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#root, body > div', { state: 'attached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const axeResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const accessibilityFindings = buildAccessibilityFindings(ventureId, url, axeResults.violations);

  const breakpointResults = [];
  for (const [breakpoint, viewport] of Object.entries(VIEWPORTS)) {
    await page.setViewportSize(viewport);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    breakpointResults.push({ breakpoint, viewport, ...overflow });
  }
  const responsiveFindings = buildResponsiveFindings(ventureId, url, breakpointResults);

  return accessibilityFindings.concat(responsiveFindings);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const venture = await resolveVenture(supabase, args.venture);

  console.log(`[capa-001-a-baseline] venture=${venture.name} (${venture.id}) url=${venture.deployment_url}`);

  const browser = await chromium.launch();
  let findings = [];
  try {
    const page = await browser.newPage();
    findings = findings.concat(await runAccessibilityAndResponsiveChecks(page, venture.id, venture.deployment_url));
  } finally {
    await browser.close();
  }

  if (!args.skipLighthouse) {
    findings = findings.concat(await runLighthouseCheck(venture.id, venture.deployment_url));
  }

  for (const f of findings) {
    f.finding_hash = computeFindingHash({
      venture_id: f.venture_id,
      stage_number: f.stage_number,
      finding_category: f.finding_category,
      finding_signature: f.finding_signature,
    });
  }

  const result = await writeFindingsBatch(supabase, findings);
  console.log(`[capa-001-a-baseline] written=${result.written} errors=${result.errors.length} sd_generated=${result.sd_generated}`);
  if (result.errors.length > 0) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
  }
  if (result.sd_generated > 0) {
    // Should never happen given the medium/low severity cap above.
    console.error(`[capa-001-a-baseline] UNEXPECTED: ${result.sd_generated} remediation SD(s) generated despite severity cap`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error('[capa-001-a-baseline] FATAL:', err);
    process.exitCode = 1;
  });
}
