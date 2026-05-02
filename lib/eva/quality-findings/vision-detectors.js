/**
 * Vision-compliance detectors for Stage 20 Unified Quality Lifecycle.
 *
 * SD: SD-LEO-INFRA-STAGE-QUALITY-ANALYZER-FR-E-001
 *
 * Detects whether a venture has wired the chairman-mandate vision components:
 *   - feedback widget (Sentry feedback / LogRocket / FullStory / Hotjar / equiv)
 *   - error capture SDK (Sentry / Bugsnag / Rollbar / Datadog RUM / equiv)
 *
 * The vision mandate is POSITIVE — the absence of any signature for a category
 * is itself the FAIL finding (severity='critical'). Stage 20 emits findings
 * under finding_category='feedback_widget_present' or 'error_capture_wired'
 * (see lib/eva/quality-findings/finding-shape.js FINDING_CATEGORIES).
 *
 * Architecture:
 *   - VENDOR_SIGNATURES is a frozen registry (data, not logic). New vendors
 *     are added by appending entries — never by editing detection code.
 *   - detectFeedbackWidgetPresent(ctx) and detectErrorCaptureWired(ctx) iterate
 *     the registry filtered by category, apply the entry's signal against the
 *     matching ctx slice, return the first match (or absence verdict).
 *   - Both detectors are PURE — no DB/fs/network. Caller assembles ctx.
 *
 * @module lib/eva/quality-findings/vision-detectors
 */

import { FINDING_CATEGORIES } from './finding-shape.js';

/**
 * Vendor signature registry. First-match-wins per category.
 *
 * Schema per entry:
 *   - id:             unique short identifier
 *   - vendor:         human-readable vendor name
 *   - category:       one of FINDING_CATEGORIES (must be 'feedback_widget_present'
 *                     or 'error_capture_wired' for entries here)
 *   - detection_kind: 'package' | 'env' | 'file_pattern'
 *   - signal:         dependency name (string), env var name (string), or
 *                     RegExp (for file_pattern)
 *   - severity:       informational severity for FOUND case ('low' typically;
 *                     'medium' for partial-match signatures)
 *   - evidence_hint:  one-line human description for audit trail
 */
export const VENDOR_SIGNATURES = Object.freeze([
  // ── feedback_widget_present ────────────────────────────────────────────
  {
    id: 'sentry-feedback-pkg',
    vendor: 'Sentry',
    category: 'feedback_widget_present',
    detection_kind: 'package',
    signal: '@sentry/feedback',
    severity: 'low',
    evidence_hint: 'Sentry user-feedback widget package present in dependencies',
  },
  {
    id: 'logrocket-pkg',
    vendor: 'LogRocket',
    category: 'feedback_widget_present',
    detection_kind: 'package',
    signal: 'logrocket',
    severity: 'low',
    evidence_hint: 'LogRocket SDK present in dependencies (includes feedback widget)',
  },
  {
    id: 'fullstory-pkg',
    vendor: 'FullStory',
    category: 'feedback_widget_present',
    detection_kind: 'package',
    signal: '@fullstory/browser',
    severity: 'low',
    evidence_hint: 'FullStory browser SDK present in dependencies',
  },
  {
    id: 'hotjar-pkg',
    vendor: 'Hotjar',
    category: 'feedback_widget_present',
    detection_kind: 'package',
    signal: '@hotjar/browser',
    severity: 'low',
    evidence_hint: 'Hotjar feedback/poll widget package present in dependencies',
  },
  {
    id: 'logrocket-init-pattern',
    vendor: 'LogRocket',
    category: 'feedback_widget_present',
    detection_kind: 'file_pattern',
    signal: /LogRocket\.init\(/,
    severity: 'low',
    evidence_hint: 'LogRocket.init( call site found in source',
  },

  // ── error_capture_wired ────────────────────────────────────────────────
  {
    id: 'sentry-react-pkg',
    vendor: 'Sentry',
    category: 'error_capture_wired',
    detection_kind: 'package',
    signal: '@sentry/react',
    severity: 'low',
    evidence_hint: 'Sentry React SDK present in dependencies',
  },
  {
    id: 'sentry-browser-pkg',
    vendor: 'Sentry',
    category: 'error_capture_wired',
    detection_kind: 'package',
    signal: '@sentry/browser',
    severity: 'low',
    evidence_hint: 'Sentry browser SDK present in dependencies',
  },
  {
    id: 'sentry-init-pattern',
    vendor: 'Sentry',
    category: 'error_capture_wired',
    detection_kind: 'file_pattern',
    signal: /Sentry\.init\(/,
    severity: 'low',
    evidence_hint: 'Sentry.init( call site found in source',
  },
  {
    id: 'bugsnag-pkg',
    vendor: 'Bugsnag',
    category: 'error_capture_wired',
    detection_kind: 'package',
    signal: '@bugsnag/js',
    severity: 'low',
    evidence_hint: 'Bugsnag JS SDK present in dependencies',
  },
  {
    id: 'rollbar-pkg',
    vendor: 'Rollbar',
    category: 'error_capture_wired',
    detection_kind: 'package',
    signal: 'rollbar',
    severity: 'low',
    evidence_hint: 'Rollbar SDK present in dependencies',
  },
  {
    id: 'datadog-rum-pkg',
    vendor: 'Datadog',
    category: 'error_capture_wired',
    detection_kind: 'package',
    signal: '@datadog/browser-rum',
    severity: 'low',
    evidence_hint: 'Datadog browser RUM SDK present in dependencies',
  },
]);

const ABSENCE_SEVERITY = 'critical';

function packageDeps(pkg) {
  if (!pkg || typeof pkg !== 'object') return new Set();
  const a = pkg.dependencies && typeof pkg.dependencies === 'object' ? Object.keys(pkg.dependencies) : [];
  const b = pkg.devDependencies && typeof pkg.devDependencies === 'object' ? Object.keys(pkg.devDependencies) : [];
  const c = pkg.peerDependencies && typeof pkg.peerDependencies === 'object' ? Object.keys(pkg.peerDependencies) : [];
  return new Set([...a, ...b, ...c]);
}

function envKeys(envVars) {
  if (!envVars || typeof envVars !== 'object') return new Set();
  return new Set(Object.keys(envVars));
}

function matchesSignature(sig, ctx) {
  if (sig.detection_kind === 'package') {
    const deps = packageDeps(ctx.packageJson);
    return deps.has(sig.signal);
  }
  if (sig.detection_kind === 'env') {
    const env = envKeys(ctx.envVars);
    return env.has(sig.signal);
  }
  if (sig.detection_kind === 'file_pattern') {
    const samples = Array.isArray(ctx.fileSamples) ? ctx.fileSamples : [];
    const re = sig.signal instanceof RegExp ? sig.signal : new RegExp(String(sig.signal));
    return samples.some((s) => s && typeof s.content === 'string' && re.test(s.content));
  }
  return false;
}

function detectByCategory(category, ctx) {
  const candidates = VENDOR_SIGNATURES.filter((s) => s.category === category);
  for (const sig of candidates) {
    if (matchesSignature(sig, ctx || {})) {
      return {
        found: true,
        vendor: sig.vendor,
        signature_id: sig.id,
        severity: sig.severity || 'low',
        evidence_pointer: {
          kind: sig.detection_kind,
          signal_repr: sig.signal instanceof RegExp ? sig.signal.toString() : String(sig.signal),
          evidence_hint: sig.evidence_hint,
        },
      };
    }
  }
  return {
    found: false,
    severity: ABSENCE_SEVERITY,
    evidence_pointer: {
      reason: 'no_vendor_signature_matched',
      categories_checked: [category],
      registry_size: candidates.length,
    },
  };
}

/**
 * Detect whether the venture has any feedback-widget vendor wired.
 *
 * @param {Object} ctx
 * @param {Object} [ctx.packageJson]   - parsed package.json (deps/devDependencies)
 * @param {Object} [ctx.envVars]       - object whose keys are env var names
 * @param {Array<{path: string, content: string}>} [ctx.fileSamples] - source samples
 * @returns {{found: boolean, vendor?: string, signature_id?: string, severity: string, evidence_pointer: object}}
 */
export function detectFeedbackWidgetPresent(ctx) {
  return detectByCategory('feedback_widget_present', ctx);
}

/**
 * Detect whether the venture has any error-capture vendor wired.
 *
 * @param {Object} ctx
 * @returns {{found: boolean, vendor?: string, signature_id?: string, severity: string, evidence_pointer: object}}
 */
export function detectErrorCaptureWired(ctx) {
  return detectByCategory('error_capture_wired', ctx);
}

// Sanity: every registry entry references a category that exists in
// FINDING_CATEGORIES. Throws at module load if drift creeps in.
for (const entry of VENDOR_SIGNATURES) {
  if (!FINDING_CATEGORIES.includes(entry.category)) {
    throw new Error(
      `vision-detectors.js: VENDOR_SIGNATURES entry id='${entry.id}' references category='${entry.category}' which is not in FINDING_CATEGORIES`
    );
  }
}
