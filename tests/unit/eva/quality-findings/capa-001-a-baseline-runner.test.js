/**
 * TS-1 (SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A): unit test over fixture
 * results asserting the accessibility/performance/responsive findings shape
 * matches FindingShape, and that severity is capped at medium/low per FR-1's
 * acceptance criteria (never critical/high, so writeFinding()'s sync
 * remediation-SD generation can never fire for this baseline).
 */

import { describe, it, expect } from 'vitest';
import {
  VIEWPORTS,
  axeImpactToSeverity,
  buildAccessibilityFindings,
  buildAccessibilityRunRecordedFinding,
  buildResponsiveFindings,
  buildResponsiveCheckedFindings,
  buildLighthouseFindings,
  buildLighthouseFailureFinding,
  enforceSeverityCap,
  validateDeploymentUrl,
} from '../../../../scripts/eva/capa-001-a-baseline-runner.mjs';
import { validateFindingShape, computeFindingHash } from '../../../../lib/eva/quality-findings/finding-shape.js';

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const URL = 'https://altifyai.app';

function withHash(finding) {
  return {
    ...finding,
    finding_hash: computeFindingHash({
      venture_id: finding.venture_id,
      stage_number: finding.stage_number,
      finding_category: finding.finding_category,
      finding_signature: finding.finding_signature,
    }),
  };
}

describe('axeImpactToSeverity — severity cap (FR-1)', () => {
  it('critical/serious/moderate all cap at medium (never critical/high)', () => {
    expect(axeImpactToSeverity('critical')).toBe('medium');
    expect(axeImpactToSeverity('serious')).toBe('medium');
    expect(axeImpactToSeverity('moderate')).toBe('medium');
  });

  it('minor (and anything unrecognized) maps to low', () => {
    expect(axeImpactToSeverity('minor')).toBe('low');
    expect(axeImpactToSeverity(undefined)).toBe('low');
  });
});

describe('buildAccessibilityFindings — fixture-shaped axe violations', () => {
  const violations = [
    {
      id: 'color-contrast',
      impact: 'serious',
      help: 'Elements must meet minimum color contrast ratio',
      helpUrl: 'https://dequeuniversity.com/rules/axe/color-contrast',
      nodes: [{ target: ['.hero-cta'], html: '<button class="hero-cta">Sign up</button>' }],
    },
    {
      id: 'image-alt',
      impact: 'minor',
      help: 'Images must have alt text',
      helpUrl: 'https://dequeuniversity.com/rules/axe/image-alt',
      nodes: [{ target: ['img.logo'], html: '<img class="logo">' }],
    },
  ];

  it('produces findings that validate against FindingShape', () => {
    const findings = buildAccessibilityFindings(VENTURE_ID, URL, violations).map(withHash);
    expect(findings).toHaveLength(2);
    for (const f of findings) {
      const r = validateFindingShape(f);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
      expect(f.finding_category).toBe('accessibility');
    }
  });

  it('severity is never critical/high, per FR-1 acceptance criteria', () => {
    const findings = buildAccessibilityFindings(VENTURE_ID, URL, violations);
    for (const f of findings) {
      expect(['medium', 'low']).toContain(f.severity);
    }
    expect(findings[0].severity).toBe('medium'); // serious
    expect(findings[1].severity).toBe('low'); // minor
  });

  it('evidence_pointer carries rule id, impact, and url for traceability', () => {
    const [f] = buildAccessibilityFindings(VENTURE_ID, URL, violations);
    expect(f.evidence_pointer.rule_id).toBe('color-contrast');
    expect(f.evidence_pointer.impact).toBe('serious');
    expect(f.evidence_pointer.url).toBe(URL);
  });

  it('handles zero violations (clean scan) as an empty array', () => {
    expect(buildAccessibilityFindings(VENTURE_ID, URL, [])).toEqual([]);
  });
});

describe('buildAccessibilityRunRecordedFinding — coverage marker (VALIDATION sub-agent finding, VERIFY phase)', () => {
  it('always produces exactly one low-severity marker, so a clean scan is distinguishable from "never ran"', () => {
    const f = withHash(buildAccessibilityRunRecordedFinding(VENTURE_ID, URL, 0));
    expect(f.finding_category).toBe('accessibility');
    expect(f.severity).toBe('low');
    expect(f.finding_signature).toBe('accessibility:run-recorded');
    expect(f.evidence_pointer.violation_count).toBe(0);
    expect(validateFindingShape(f).valid).toBe(true);
  });

  it('finding_signature is stable regardless of violation_count — idempotent re-runs UPSERT, not accumulate', () => {
    const f1 = withHash(buildAccessibilityRunRecordedFinding(VENTURE_ID, URL, 0));
    const f2 = withHash(buildAccessibilityRunRecordedFinding(VENTURE_ID, URL, 3));
    expect(f1.finding_hash).toBe(f2.finding_hash);
    expect(f2.evidence_pointer.violation_count).toBe(3);
  });
});

describe('buildResponsiveFindings — breakpoint overflow (FR-3)', () => {
  it('flags horizontal overflow > 1px at a breakpoint', () => {
    const results = [
      { breakpoint: 'MOBILE', viewport: VIEWPORTS.MOBILE, scrollWidth: 420, clientWidth: 375 },
    ];
    const findings = buildResponsiveFindings(VENTURE_ID, URL, results).map(withHash);
    expect(findings).toHaveLength(1);
    expect(findings[0].finding_category).toBe('responsive');
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].evidence_pointer.breakpoint).toBe('MOBILE');
    expect(findings[0].evidence_pointer.horizontal_overflow_px).toBe(45);
    expect(validateFindingShape(findings[0]).valid).toBe(true);
  });

  it('does not flag a breakpoint with no overflow (scrollWidth <= clientWidth)', () => {
    const results = [
      { breakpoint: 'DESKTOP', viewport: VIEWPORTS.DESKTOP, scrollWidth: 1440, clientWidth: 1440 },
      { breakpoint: 'TABLET', viewport: VIEWPORTS.TABLET, scrollWidth: 768, clientWidth: 768 },
    ];
    expect(buildResponsiveFindings(VENTURE_ID, URL, results)).toEqual([]);
  });

  it('ignores sub-pixel overflow (<=1px)', () => {
    const results = [
      { breakpoint: 'TABLET', viewport: VIEWPORTS.TABLET, scrollWidth: 769, clientWidth: 768 },
    ];
    expect(buildResponsiveFindings(VENTURE_ID, URL, results)).toEqual([]);
  });

  it('VIEWPORTS matches the 3 real breakpoints from screenshot-generator.js (DESKTOP/MOBILE/TABLET only)', () => {
    expect(VIEWPORTS).toEqual({
      DESKTOP: { width: 1440, height: 900 },
      MOBILE: { width: 375, height: 812 },
      TABLET: { width: 768, height: 1024 },
    });
  });
});

describe('buildResponsiveCheckedFindings — coverage markers, one per breakpoint (VALIDATION sub-agent finding, VERIFY phase)', () => {
  it('emits exactly one low-severity marker per breakpoint, each tagged with the breakpoint name (FR-3 acceptance criterion)', () => {
    const results = [
      { breakpoint: 'DESKTOP', viewport: VIEWPORTS.DESKTOP, scrollWidth: 1440, clientWidth: 1440 },
      { breakpoint: 'MOBILE', viewport: VIEWPORTS.MOBILE, scrollWidth: 420, clientWidth: 375 },
      { breakpoint: 'TABLET', viewport: VIEWPORTS.TABLET, scrollWidth: 768, clientWidth: 768 },
    ];
    const findings = buildResponsiveCheckedFindings(VENTURE_ID, URL, results).map(withHash);
    expect(findings).toHaveLength(3);
    expect(findings.map((f) => f.evidence_pointer.breakpoint)).toEqual(['DESKTOP', 'MOBILE', 'TABLET']);
    for (const f of findings) {
      expect(f.finding_category).toBe('responsive');
      expect(f.severity).toBe('low');
      expect(f.finding_signature).toBe(`responsive:${f.evidence_pointer.breakpoint}:checked`);
      expect(validateFindingShape(f).valid).toBe(true);
    }
    // The overflowing MOBILE breakpoint still gets a low-severity coverage marker
    // in addition to whatever buildResponsiveFindings separately flags as a defect.
    expect(findings[1].evidence_pointer.horizontal_overflow_px).toBe(45);
  });

  it('finding_signature per breakpoint is stable across runs — idempotent UPSERT, not accumulation', () => {
    const clean = [{ breakpoint: 'TABLET', viewport: VIEWPORTS.TABLET, scrollWidth: 768, clientWidth: 768 }];
    const dirty = [{ breakpoint: 'TABLET', viewport: VIEWPORTS.TABLET, scrollWidth: 800, clientWidth: 768 }];
    const f1 = withHash(buildResponsiveCheckedFindings(VENTURE_ID, URL, clean)[0]);
    const f2 = withHash(buildResponsiveCheckedFindings(VENTURE_ID, URL, dirty)[0]);
    expect(f1.finding_hash).toBe(f2.finding_hash);
  });
});

describe('buildLighthouseFindings — threshold comparison (FR-2)', () => {
  const thresholds = {
    'categories:performance': ['warn', { minScore: 0.6 }],
    'first-contentful-paint': ['warn', { maxNumericValue: 3000 }],
    'largest-contentful-paint': ['warn', { maxNumericValue: 3500 }],
  };

  it('flags a below-threshold performance score', () => {
    const lhr = {
      categories: { performance: { score: 0.4 } },
      audits: {
        'first-contentful-paint': { numericValue: 1000 },
        'largest-contentful-paint': { numericValue: 1500 },
      },
    };
    const findings = buildLighthouseFindings(VENTURE_ID, URL, 'run-1', lhr, thresholds).map(withHash);
    const perfFinding = findings.find((f) => f.finding_signature.includes('categories-performance-below-threshold'));
    expect(perfFinding).toBeDefined();
    expect(perfFinding.severity).toBe('medium');
    expect(validateFindingShape(perfFinding).valid).toBe(true);
  });

  it('flags FCP/LCP above their max thresholds', () => {
    const lhr = {
      categories: { performance: { score: 0.9 } },
      audits: {
        'first-contentful-paint': { numericValue: 5000 },
        'largest-contentful-paint': { numericValue: 6000 },
      },
    };
    const findings = buildLighthouseFindings(VENTURE_ID, URL, 'run-2', lhr, thresholds);
    expect(findings.some((f) => f.finding_signature.includes('first-contentful-paint-above-threshold'))).toBe(true);
    expect(findings.some((f) => f.finding_signature.includes('largest-contentful-paint-above-threshold'))).toBe(true);
  });

  it('always includes a low-severity run-recorded finding, even when every metric passes', () => {
    const lhr = {
      categories: { performance: { score: 0.95 }, accessibility: { score: 1 } },
      audits: {
        'first-contentful-paint': { numericValue: 800 },
        'largest-contentful-paint': { numericValue: 1200 },
      },
    };
    const findings = buildLighthouseFindings(VENTURE_ID, URL, 'run-3', lhr, thresholds).map(withHash);
    expect(findings).toHaveLength(1);
    expect(findings[0].finding_signature).toBe('performance:run-recorded');
    expect(findings[0].severity).toBe('low');
    expect(validateFindingShape(findings[0]).valid).toBe(true);
  });

  it('all findings produced are medium/low severity, never critical/high', () => {
    const lhr = {
      categories: { performance: { score: 0.1 } },
      audits: {
        'first-contentful-paint': { numericValue: 9000 },
        'largest-contentful-paint': { numericValue: 9000 },
      },
    };
    const findings = buildLighthouseFindings(VENTURE_ID, URL, 'run-4', lhr, thresholds);
    for (const f of findings) {
      expect(['medium', 'low']).toContain(f.severity);
    }
  });

  it('finding_signature (and therefore finding_hash) is stable across different runIds — idempotent re-runs UPSERT the same row instead of piling up duplicates (writer.js upserts on venture_id+finding_hash)', () => {
    const lhr = {
      categories: { performance: { score: 0.95 } },
      audits: {
        'first-contentful-paint': { numericValue: 800 },
        'largest-contentful-paint': { numericValue: 1200 },
      },
    };
    const run1 = buildLighthouseFindings(VENTURE_ID, URL, 'capa-001-a-1000', lhr, thresholds).map(withHash);
    const run2 = buildLighthouseFindings(VENTURE_ID, URL, 'capa-001-a-2000', lhr, thresholds).map(withHash);
    expect(run1.map((f) => f.finding_hash)).toEqual(run2.map((f) => f.finding_hash));
    expect(run1.map((f) => f.finding_signature)).toEqual(run2.map((f) => f.finding_signature));
    // run_id still differs in evidence_pointer -- only the dedup key is stable.
    expect(run1[0].evidence_pointer.run_id).not.toBe(run2[0].evidence_pointer.run_id);
  });
});

describe('buildLighthouseFailureFinding — collection failure fallback', () => {
  it('produces a single low-severity finding that still validates against FindingShape', () => {
    const [finding] = buildLighthouseFailureFinding(VENTURE_ID, URL, 'run-5', 'collect-failed', 'chrome not found').map(withHash);
    expect(finding.severity).toBe('low');
    expect(finding.finding_category).toBe('performance');
    expect(validateFindingShape(finding).valid).toBe(true);
    expect(finding.evidence_pointer.error).toContain('chrome not found');
  });
});

describe('enforceSeverityCap — runtime guard (TESTING sub-agent finding, EXEC phase)', () => {
  it('passes through an all-medium/low finding set unchanged', () => {
    const findings = [{ severity: 'medium', finding_signature: 'a' }, { severity: 'low', finding_signature: 'b' }];
    expect(enforceSeverityCap(findings)).toBe(findings);
  });

  it('throws if any finding is severity critical', () => {
    const findings = [{ severity: 'medium', finding_signature: 'a' }, { severity: 'critical', finding_signature: 'b' }];
    expect(() => enforceSeverityCap(findings)).toThrow(/critical\/high severity/);
  });

  it('throws if any finding is severity high', () => {
    const findings = [{ severity: 'high', finding_signature: 'a' }];
    expect(() => enforceSeverityCap(findings)).toThrow(/critical\/high severity/);
  });

  it('handles an empty findings array', () => {
    expect(enforceSeverityCap([])).toEqual([]);
  });
});

describe('validateDeploymentUrl — SSRF/trust-boundary guard (SECURITY sub-agent finding SEC-2, EXEC phase)', () => {
  it('accepts a plausible public https URL, normalized via URL#toString', () => {
    expect(validateDeploymentUrl('https://altifyai.app')).toBe('https://altifyai.app/');
  });

  it('accepts a query string containing an ordinary "&" (a legal URL separator, not a shell metachar here)', () => {
    expect(validateDeploymentUrl('https://altifyai.app/?utm_source=x&utm_medium=y')).toContain('utm_medium=y');
  });

  it('rejects a non-URL string', () => {
    expect(() => validateDeploymentUrl('not a url')).toThrow(/not a valid URL/);
  });

  it('rejects http (non-https)', () => {
    expect(() => validateDeploymentUrl('http://altifyai.app')).toThrow(/must be https/);
  });

  it('rejects file:// URLs (would leak local file content into evidence_pointer)', () => {
    expect(() => validateDeploymentUrl('file:///etc/passwd')).toThrow(/must be https/);
  });

  it('rejects embedded credentials', () => {
    expect(() => validateDeploymentUrl('https://user:pass@altifyai.app')).toThrow(/embedded credentials/);
  });

  it('rejects loopback/private/link-local hosts (cloud metadata, localhost, RFC1918)', () => {
    for (const host of ['localhost', '127.0.0.1', '169.254.169.254', '10.0.0.5', '192.168.1.1', '172.16.0.1', '0.0.0.0', '[::1]']) {
      expect(() => validateDeploymentUrl(`https://${host}/`), host).toThrow(/loopback\/private\/link-local/);
    }
  });

  it('rejects IPv4-mapped IPv6 loopback, IPv6 link-local/unique-local, and IPv4 carrier-grade NAT (/ship adversarial review, closed gaps)', () => {
    for (const host of ['[::ffff:127.0.0.1]', '[fe80::1]', '[fd00::1]', '[fc00::1]', '100.64.0.1', '100.100.0.1']) {
      expect(() => validateDeploymentUrl(`https://${host}/`), host).toThrow(/loopback\/private\/link-local/);
    }
  });

  it('does not reject a normal public IP or domain that merely starts with a similar-looking octet', () => {
    expect(() => validateDeploymentUrl('https://172.99.0.1/')).not.toThrow();
    expect(() => validateDeploymentUrl('https://1.2.3.4/')).not.toThrow();
    // 100.63.x/100.128.x sit just outside the 100.64.0.0/10 CGNAT range.
    expect(() => validateDeploymentUrl('https://100.63.0.1/')).not.toThrow();
    expect(() => validateDeploymentUrl('https://100.128.0.1/')).not.toThrow();
  });
});
