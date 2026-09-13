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
 *   - performance: Lighthouse (the `lighthouse` + `chrome-launcher` packages
 *     directly, not the `lhci` CLI -- see runLighthouseCheck()'s comment),
 *     reusing the repo-root lighthouserc.json thresholds as-is (no new
 *     budgets defined here).
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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFindingsBatch } from '../../lib/eva/quality-findings/writer.js';
import { computeFindingHash } from '../../lib/eva/quality-findings/finding-shape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STAGE_NUMBER = 20;

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

// SECURITY sub-agent finding SEC-2 (EXEC phase): deployment_url is written by
// the venture deploy/DNS-wiring pipelines from a cloud adapter's API response
// or a constructed domain string -- neither write site validates it, and it
// then reaches a real browser navigation and a Lighthouse subprocess run.
// Reject anything that isn't a plausible public https URL before either.
// Note: URL#hostname wraps IPv6 literals in brackets (new URL('https://[::1]/').hostname
// === '[::1]'), so the loopback/private patterns below must match the bracketed form too.
// Adversarial /ship review (WARNING): the original pattern only blocked the
// exact literal '[::1]' for IPv6, missing the IPv4-mapped form ('[::ffff:
// 127.0.0.1]'), link-local ('[fe80::...]'), unique-local ('[fc00::/7]'), and
// IPv4 carrier-grade NAT (100.64.0.0/10) -- all of which reach internal/
// loopback-equivalent targets. Closing these (host-string matching only; a
// hostname that RESOLVES to one of these ranges at request time, i.e.
// DNS-rebinding, cannot be closed by any string filter and is a known,
// accepted residual -- see VALIDATION sub-agent finding, VERIFY phase).
const PRIVATE_OR_LOOPBACK_HOST_RE = /^(localhost|127\.|0\.0\.0\.0|\[::1\]$|\[::ffff:|\[fe80:|\[f[cd][0-9a-f]{0,2}:|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/i;
export function validateDeploymentUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`deployment_url is not a valid URL: ${JSON.stringify(rawUrl)}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`deployment_url must be https, got: ${parsed.protocol}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('deployment_url must not carry embedded credentials');
  }
  if (PRIVATE_OR_LOOPBACK_HOST_RE.test(parsed.hostname)) {
    throw new Error(`deployment_url must not target a loopback/private/link-local host: ${parsed.hostname}`);
  }
  return parsed.toString();
}

async function resolveVenture(supabase, ventureArg) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ventureArg);
  // Each branch is a fully self-contained, single-row-bounded query (not a
  // shared unbounded .select() split across a ternary) so count-truncation-
  // diff-lint's static check can see the .maybeSingle() bound directly.
  const { data, error } = isUuid
    ? await supabase.from('ventures').select('id, name, deployment_url').eq('id', ventureArg).maybeSingle()
    : await supabase.from('ventures').select('id, name, deployment_url').eq('name', ventureArg).maybeSingle();
  if (error) throw new Error(`ventures lookup failed: ${error.message}`);
  if (!data) throw new Error(`venture not found: ${ventureArg}`);
  if (!data.deployment_url) throw new Error(`venture ${data.name} has no deployment_url`);
  data.deployment_url = validateDeploymentUrl(data.deployment_url);
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

// VALIDATION sub-agent finding (VERIFY phase, BLOCKER): FR-1/FR-3 only ever
// emit a finding on defect, so a clean scan and a scan that never ran are
// byte-identical in venture_quality_findings -- no row anywhere records that
// accessibility was actually checked, or names any of the 3 breakpoints
// (FR-3's own acceptance criterion requires findings "tagged with the
// breakpoint name"). Mirrors the run-recorded marker FR-2 already emits.
export function buildAccessibilityRunRecordedFinding(ventureId, url, violationCount) {
  return {
    venture_id: ventureId,
    stage_number: STAGE_NUMBER,
    finding_category: 'accessibility',
    severity: 'low',
    finding_signature: 'accessibility:run-recorded',
    evidence_pointer: { url, violation_count: violationCount },
  };
}

export function buildResponsiveCheckedFindings(ventureId, url, breakpointResults) {
  return breakpointResults.map(({ breakpoint, viewport, scrollWidth, clientWidth }) => ({
    venture_id: ventureId,
    stage_number: STAGE_NUMBER,
    finding_category: 'responsive',
    severity: 'low',
    finding_signature: `responsive:${breakpoint}:checked`,
    evidence_pointer: {
      breakpoint,
      viewport,
      horizontal_overflow_px: scrollWidth - clientWidth,
      url,
    },
  }));
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
      finding_signature: `performance:categories-performance-below-threshold`,
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
        finding_signature: `performance:${metricKey}-above-threshold`,
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
    finding_signature: `performance:run-recorded`,
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
    finding_signature: `performance:${reason}`,
    evidence_pointer: { run_id: runId, url, error: String(detail || '').slice(0, 500) },
  }];
}

function loadLighthouseThresholds() {
  const raw = readFileSync(path.join(REPO_ROOT, 'lighthouserc.json'), 'utf8');
  return JSON.parse(raw).ci.assert.assertions;
}

// VALIDATION sub-agent finding VAL-3 (VERIFY phase, first live run against
// AltifyAI): the original `npx lhci collect` invocation (fixed for SEC-1 to
// spawn @lhci/cli's entry directly with shell:false) still discarded a
// REAL, ALREADY-SAVED Lighthouse result on this machine. lighthouse/cli's
// own run.js writes the LHR to disk, and only THEN calls chrome-launcher's
// teardown -- which can throw EPERM on Windows (a chrome-launcher/Windows
// temp-dir-cleanup race, unrelated to this SD). The lhci CLI wrapper treats
// that post-save teardown throw as a hard failure and never hands the
// already-written LHR back, so every run here silently produced a fake
// "collect-failed" finding instead of the real (and materially over-budget:
// LCP ~4-5s against the 3500ms threshold) performance result. Fixed by
// calling lighthouse's Node API directly -- bypassing the lhci CLI
// subprocess/exit-code layer entirely -- with chrome.kill() wrapped in its
// own try/catch so a teardown throw can never discard a result already held
// in memory. This also further improves on SEC-1: no subprocess, no argv,
// nothing to inject at all.
async function runLighthouseCheck(ventureId, url) {
  const runId = `capa-001-a-${Date.now()}`;
  const [{ default: lighthouse }, chromeLauncher] = await Promise.all([
    import('lighthouse'),
    import('chrome-launcher'),
  ]);

  let chrome;
  try {
    chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
  } catch (err) {
    return buildLighthouseFailureFinding(ventureId, url, runId, 'chrome-launch-failed', err.message || err);
  }

  try {
    // Adversarial /ship review (WARNING): loadLighthouseThresholds() and
    // buildLighthouseFindings() used to run OUTSIDE this catch -- an uncaught
    // throw there (e.g. a missing/malformed lighthouserc.json) would propagate
    // out of runLighthouseCheck() entirely and out of main() uncaught, losing
    // the accessibility/responsive findings already collected earlier in the
    // same run even though they succeeded. runLighthouseCheck() must never
    // throw; every internal failure degrades to a collect-failed finding.
    let runnerResult;
    try {
      runnerResult = await lighthouse(url, {
        logLevel: 'error',
        output: 'json',
        onlyCategories: ['performance', 'best-practices'],
        port: chrome.port,
      });
    } catch (err) {
      return buildLighthouseFailureFinding(ventureId, url, runId, 'collect-failed', err.message || err);
    }

    if (!runnerResult?.lhr) {
      return buildLighthouseFailureFinding(ventureId, url, runId, 'no-report', 'lighthouse() returned no lhr');
    }

    try {
      const thresholds = loadLighthouseThresholds();
      return buildLighthouseFindings(ventureId, url, runId, runnerResult.lhr, thresholds);
    } catch (err) {
      return buildLighthouseFailureFinding(ventureId, url, runId, 'threshold-eval-failed', err.message || err);
    }
  } finally {
    // chrome-launcher's teardown can itself throw (the exact EPERM this fix
    // routes around) -- never let that discard a result already returned above.
    try {
      await chrome.kill();
    } catch (err) {
      console.error(`[capa-001-a-baseline] chrome.kill() failed (non-fatal): ${err.message || err}`);
    }
  }
}

async function runAccessibilityAndResponsiveChecks(page, ventureId, url) {
  // Wait for hydration before scanning -- a Vite SPA's #root can render empty
  // at domcontentloaded, producing a false-clean scan (PRD risk register).
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#root, body > div', { state: 'attached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const axeResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const accessibilityFindings = buildAccessibilityFindings(ventureId, url, axeResults.violations);
  const accessibilityRunRecorded = buildAccessibilityRunRecordedFinding(ventureId, url, axeResults.violations.length);

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
  const responsiveCheckedFindings = buildResponsiveCheckedFindings(ventureId, url, breakpointResults);

  return accessibilityFindings
    .concat([accessibilityRunRecorded])
    .concat(responsiveFindings)
    .concat(responsiveCheckedFindings);
}

// TESTING sub-agent finding (EXEC phase): the severity cap was enforced only
// by construction in each builder, with no runtime guard before the write --
// a future change to any builder could silently cross into critical/high and
// trigger writeFinding()'s sync remediation-SD generation, contradicting this
// baseline's informational-only scope. Fail loud instead.
export function enforceSeverityCap(findings) {
  const offenders = findings.filter((f) => f.severity === 'critical' || f.severity === 'high');
  if (offenders.length > 0) {
    throw new Error(
      `capa-001-a-baseline-runner: ${offenders.length} finding(s) at critical/high severity ` +
      `(informational-only baseline must stay medium/low): ${offenders.map((f) => f.finding_signature).join(', ')}`
    );
  }
  return findings;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const venture = await resolveVenture(supabase, args.venture);

  console.log(`[capa-001-a-baseline] venture=${venture.name} (${venture.id}) url=${venture.deployment_url}`);

  const browser = await chromium.launch();
  let findings = [];
  try {
    // VALIDATION sub-agent finding VAL-1 (VERIFY phase): @axe-core/playwright's
    // AxeBuilder rejects a page created via the shorthand browser.newPage() --
    // it throws "Please use browser.newContext()" -- so an explicit context is
    // required even though this script only ever needs one page from it.
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      findings = findings.concat(await runAccessibilityAndResponsiveChecks(page, venture.id, venture.deployment_url));
    } finally {
      await context.close();
    }
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

  enforceSeverityCap(findings);

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
