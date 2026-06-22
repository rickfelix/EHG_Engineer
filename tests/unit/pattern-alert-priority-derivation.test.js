/**
 * SD-REFILL-00TH22DQ — pattern-alert-sd-creator priority inflation (belt-audit 2026-06-10).
 *
 * The generator filed SD-PAT-FIX-* SDs from three triggers (critical severity,
 * high severity, OR an increasing trend on ANY severity) but stamped EVERY created
 * SD with a hardcoded 'critical' priority. Live evidence: 50/50 SD-PAT-FIX-* SDs at
 * 'critical' (47 later cancelled). An increasing-trend pattern at medium/low severity
 * was the worst inflater. Fix: derive the SD priority from the pattern's actual
 * severity (derivePatternSdPriority), 1:1 over the validated SD priority enum
 * (critical|high|medium|low), falling back to 'medium' for an unknown/trend-only
 * severity. These tests pin the derivation and that buildSdDataForPattern consumes it.
 */
import { describe, it, expect } from 'vitest';
import { derivePatternSdPriority, buildSdDataForPattern } from '../../scripts/pattern-alert-sd-creator.js';

const SD_PRIORITY_ENUM = new Set(['critical', 'high', 'medium', 'low']);

describe('SD-REFILL-00TH22DQ: pattern SD priority is derived from severity, not hardcoded critical', () => {
  it('maps each severity 1:1 to the SD priority enum', () => {
    expect(derivePatternSdPriority({ severity: 'critical' })).toBe('critical');
    expect(derivePatternSdPriority({ severity: 'high' })).toBe('high');
    expect(derivePatternSdPriority({ severity: 'medium' })).toBe('medium');
    expect(derivePatternSdPriority({ severity: 'low' })).toBe('low');
  });

  it('is case-insensitive on severity', () => {
    expect(derivePatternSdPriority({ severity: 'CRITICAL' })).toBe('critical');
    expect(derivePatternSdPriority({ severity: 'High' })).toBe('high');
  });

  it('falls back to medium for unknown/missing severity (trend-only qualifier)', () => {
    expect(derivePatternSdPriority({ severity: 'unknown' })).toBe('medium');
    expect(derivePatternSdPriority({})).toBe('medium');
    expect(derivePatternSdPriority({ severity: null })).toBe('medium');
    expect(derivePatternSdPriority(null)).toBe('medium');
  });

  it('NEVER inflates a non-critical pattern to critical (the regression)', () => {
    // The exact inflation case: an increasing-trend MEDIUM pattern must not be critical.
    expect(derivePatternSdPriority({ severity: 'medium', trend: 'increasing' })).not.toBe('critical');
    expect(derivePatternSdPriority({ severity: 'low', trend: 'increasing' })).not.toBe('critical');
  });

  it('always returns a value the strategic_directives_v2 priority CHECK accepts', () => {
    for (const sev of ['critical', 'high', 'medium', 'low', 'unknown', undefined, null]) {
      expect(SD_PRIORITY_ENUM.has(derivePatternSdPriority({ severity: sev }))).toBe(true);
    }
  });

  it('buildSdDataForPattern consumes the derived priority (not a constant)', () => {
    const base = { pattern_id: 'P-X', issue_summary: 'demo', occurrence_count: 6, trend: 'increasing', category: 'protocol', prevention_checklist: [] };
    expect(buildSdDataForPattern({ ...base, severity: 'medium' }, 'SD-PAT-FIX-A-001').priority).toBe('medium');
    expect(buildSdDataForPattern({ ...base, severity: 'high' }, 'SD-PAT-FIX-B-001').priority).toBe('high');
    expect(buildSdDataForPattern({ ...base, severity: 'critical' }, 'SD-PAT-FIX-C-001').priority).toBe('critical');
  });
});
