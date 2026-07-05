/**
 * SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-2) — machinery-class classifier.
 */
import { describe, it, expect } from 'vitest';
import { classifyMachineryClass, MACHINERY_TYPES } from '../../../lib/machinery-class/classify.js';

describe('classifyMachineryClass — structured lane', () => {
  it('classifies a worker-typed SD as machinery-class', () => {
    const sd = { key_changes: [{ type: 'worker', change: 'Add stage-9 worker' }] };
    const result = classifyMachineryClass(sd);
    expect(result.machineryClass).toBe(true);
    expect(result.kind).toBe('worker');
  });

  it('classifies each MACHINERY_TYPES token as machinery-class', () => {
    for (const type of MACHINERY_TYPES) {
      const sd = { key_changes: [{ type, change: 'x' }] };
      expect(classifyMachineryClass(sd).machineryClass).toBe(true);
    }
  });

  it('does NOT require a schema/database type (unlike evaluateTrigger)', () => {
    const sd = { key_changes: [{ type: 'cron', change: 'Add a nightly sweep cron, no schema change' }] };
    expect(classifyMachineryClass(sd).machineryClass).toBe(true);
  });
});

describe('classifyMachineryClass — free-text lane', () => {
  it('classifies a description mentioning a new watcher process', () => {
    const sd = { description: 'Adds a new watcher process that polls the queue every 30s.', key_changes: [] };
    const result = classifyMachineryClass(sd);
    expect(result.machineryClass).toBe(true);
    expect(result.kind).toBe('watcher');
  });

  it('classifies a remediation router description', () => {
    const sd = { description: 'Ship the remediation router that consumes triage events.', key_changes: [] };
    expect(classifyMachineryClass(sd).machineryClass).toBe(true);
  });

  it('does not false-positive on bare "gate" mentioned in unrelated prose', () => {
    const sd = { description: 'This SD updates the CLAUDE.md gate documentation table for clarity.', key_changes: [] };
    expect(classifyMachineryClass(sd).machineryClass).toBe(false);
  });

  it('respects negation (no cron job shipped)', () => {
    const sd = { description: 'This SD explicitly ships no cron job, only a manual CLI helper.', key_changes: [] };
    expect(classifyMachineryClass(sd).machineryClass).toBe(false);
  });
});

describe('classifyMachineryClass — non-machinery SDs (zero false gating)', () => {
  it('a docs-only SD classifies as none', () => {
    const sd = { description: 'Update the README with new setup instructions.', key_changes: [{ type: 'documentation', change: 'docs' }] };
    expect(classifyMachineryClass(sd)).toMatchObject({ machineryClass: false, kind: 'none' });
  });

  it('a schema-only migration SD classifies as none', () => {
    const sd = { description: 'Add a new column to the ventures table.', key_changes: [{ type: 'schema', change: 'migration' }] };
    expect(classifyMachineryClass(sd).machineryClass).toBe(false);
  });

  it('a pure UI/refactor SD classifies as none', () => {
    const sd = { description: 'Refactor the dashboard React component for readability.', key_changes: [{ type: 'feature', change: 'ui' }] };
    expect(classifyMachineryClass(sd).machineryClass).toBe(false);
  });

  it('handles a missing/malformed sd without throwing', () => {
    expect(classifyMachineryClass(null)).toMatchObject({ machineryClass: false, reason: 'no_sd_provided' });
    expect(classifyMachineryClass(undefined)).toMatchObject({ machineryClass: false });
  });
});
