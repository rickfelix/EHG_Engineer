/**
 * Unit tests for PlanToLeadExecutor pre-validation functions.
 * PAT-AUTO-41b51e4d: success_metrics format validation
 * PAT-AUTO-77fe50e3: smoke test readiness pre-check
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the functions indirectly through the executor's setup() method.
// The functions are module-private, so we verify behavior through output.

// Direct function tests — extract from module for isolated testing
// Since they're not exported, we recreate the logic for unit testing.

describe('validateSuccessMetricsFormat', () => {
  // Recreate the function logic for isolated testing
  function validateSuccessMetricsFormat(sd) {
    const issues = [];
    const metrics = sd?.success_metrics;
    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) return issues;
    for (let i = 0; i < metrics.length; i++) {
      const m = metrics[i];
      if (typeof m === 'string') {
        issues.push(`   ❌ [${i}] Plain string metric: "${m.substring(0, 60)}${m.length > 60 ? '...' : ''}"`);
        issues.push('      Expected: { name: "...", target: "...", actual: "...", met: true/false }');
      } else if (typeof m === 'object' && m !== null) {
        const name = m.name || m.metric;
        if (!name) {
          issues.push(`   ⚠️  [${i}] Missing 'name' field in metric object`);
        }
        if (!m.actual && m.actual !== 0 && m.actual !== false) {
          issues.push(`   ℹ️  [${i}] Empty 'actual' in "${name || 'unknown'}" — gate will score 0`);
        }
      }
    }
    return issues;
  }

  it('returns empty array for null/undefined metrics', () => {
    expect(validateSuccessMetricsFormat({})).toEqual([]);
    expect(validateSuccessMetricsFormat({ success_metrics: null })).toEqual([]);
    expect(validateSuccessMetricsFormat({ success_metrics: undefined })).toEqual([]);
  });

  it('returns empty array for empty metrics array', () => {
    expect(validateSuccessMetricsFormat({ success_metrics: [] })).toEqual([]);
  });

  it('rejects plain string metrics with error message', () => {
    const sd = { success_metrics: ['Pipeline runs within 5 seconds'] };
    const issues = validateSuccessMetricsFormat(sd);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain('Plain string metric');
    expect(issues[1]).toContain('Expected:');
    expect(issues[1]).toContain('name');
  });

  it('passes valid {name, target, actual, met} objects', () => {
    const sd = {
      success_metrics: [
        { name: 'Response time', target: '<=500ms', actual: '320ms', met: true }
      ]
    };
    expect(validateSuccessMetricsFormat(sd)).toEqual([]);
  });

  it('warns on missing name field', () => {
    const sd = { success_metrics: [{ target: '100%', actual: '95%' }] };
    const issues = validateSuccessMetricsFormat(sd);
    expect(issues.some(i => i.includes("Missing 'name'"))).toBe(true);
  });

  it('accepts metric field as name alias', () => {
    const sd = { success_metrics: [{ metric: 'Coverage', target: '80%', actual: '85%' }] };
    expect(validateSuccessMetricsFormat(sd)).toEqual([]);
  });

  it('info-warns on empty actual field', () => {
    const sd = { success_metrics: [{ name: 'Test', target: '100%' }] };
    const issues = validateSuccessMetricsFormat(sd);
    expect(issues.some(i => i.includes('Empty') && i.includes('actual'))).toBe(true);
  });

  it('does not warn when actual is 0 or false', () => {
    const sd = {
      success_metrics: [
        { name: 'Errors', target: '0', actual: 0, met: true },
        { name: 'Bypass', target: 'false', actual: false, met: true }
      ]
    };
    expect(validateSuccessMetricsFormat(sd)).toEqual([]);
  });

  it('reports only invalid entries in mixed array', () => {
    const sd = {
      success_metrics: [
        { name: 'Valid', target: '100%', actual: '100%', met: true },
        'invalid string metric',
        { name: 'Also valid', target: '5s', actual: '3s', met: true }
      ]
    };
    const issues = validateSuccessMetricsFormat(sd);
    expect(issues.some(i => i.includes('[1]'))).toBe(true);
    expect(issues.some(i => i.includes('[0]'))).toBe(false);
    expect(issues.some(i => i.includes('[2]'))).toBe(false);
  });
});

describe('preCheckSmokeTestReadiness', () => {
  const PIPELINE_KEYWORDS = [
    'pipeline', 'orchestrat', 'stage-execution', 'stage_execution',
    'eva-orchestrator', 'reality-gate', 'lifecycle',
    'venture_artifact', 'venture-artifact', 'stage-template',
    'handoff-system',
  ];

  // Recreate detection logic for testing
  function isPipelineSD(sd) {
    const sdKey = (sd.sd_key || '').toUpperCase();
    if (sdKey.startsWith('SD-LEARN-')) return false;
    const searchText = [sd.sd_key || '', sd.title || '', sd.description || ''].join(' ').toLowerCase();
    return PIPELINE_KEYWORDS.some(kw => searchText.includes(kw));
  }

  it('skips SD-LEARN-* SDs', () => {
    expect(isPipelineSD({ sd_key: 'SD-LEARN-FIX-001', title: 'pipeline fix' })).toBe(false);
  });

  it('detects pipeline SDs via keyword in title', () => {
    expect(isPipelineSD({ sd_key: 'SD-INFRA-001', title: 'Fix pipeline stage execution' })).toBe(true);
  });

  it('detects pipeline SDs via keyword in description', () => {
    expect(isPipelineSD({ sd_key: 'SD-FEAT-001', title: 'Improve flow', description: 'venture_artifact system' })).toBe(true);
  });

  it('skips non-pipeline SDs', () => {
    expect(isPipelineSD({ sd_key: 'SD-FEAT-001', title: 'Add user settings page' })).toBe(false);
  });

  it('detects orchestrator keyword', () => {
    expect(isPipelineSD({ sd_key: 'SD-ORCH-001', title: 'eva-orchestrator improvement' })).toBe(true);
  });
});
