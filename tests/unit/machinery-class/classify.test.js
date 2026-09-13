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

  it('does not classify a machinery mention inside an OUT OF SCOPE section as machinery-class (QF-20260901-817 live specimen)', () => {
    const sd = {
      key_changes: [],
      description: 'Design-only deliverable settling which automation approach should be built later.',
      scope: 'IN SCOPE (design-only deliverable, no production code touched):\n'
        + '- Author a design doc settling the automation approach.\n'
        + 'OUT OF SCOPE (explicit guardrails against scope creep into implementation):\n'
        + '- Scheduling the sync script as a cron job -- a design recommendation only.\n'
        + '- Building any part of the automation -- design only.',
    };
    expect(classifyMachineryClass(sd).machineryClass).toBe(false);
  });

  it('still classifies a genuine machinery mention BEFORE an OUT OF SCOPE heading', () => {
    const sd = {
      key_changes: [],
      description: 'Ships a new watcher process that polls the queue every 30s.',
      scope: 'OUT OF SCOPE:\n- Unrelated future work.',
    };
    expect(classifyMachineryClass(sd).machineryClass).toBe(true);
  });
});

describe('classifyMachineryClass — bound-phrase worker/watcher anchor (QF-20260913-876)', () => {
  it('does NOT classify the SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001 PRD passage as machinery-class (live specimen)', () => {
    // Verbatim from the SD's own PRD risk-assessment paragraph. "worker" and "writes" are both
    // present in the SAME semicolon-joined sentence (no intervening period), but many words
    // apart and unrelated to each other -- the old [^.]* open span matched this as
    // worker[^.]*writes; the bound-phrase anchor must not.
    const sd = {
      key_changes: [],
      description: 'instance 3 (sms_outbound_obligations) is a live WORKER CLAIM QUEUE '
        + '(claimed_by/claimed_at/attempts/not_before), not a passive record table -- 1,327 rows, '
        + '~19 writes/day, ~17 status write sites in lib/chairman/sms-outbound-worker.js. '
        + "The worker claims a row by writing status='sending' BEFORE any provider receipt exists",
    };
    expect(classifyMachineryClass(sd).machineryClass).toBe(false);
  });

  it('DOES classify "a worker" immediately followed (within 2 words) by an anchor verb', () => {
    const sd = { key_changes: [], description: 'Ship a worker that consumes the shared queue.' };
    const result = classifyMachineryClass(sd);
    expect(result.machineryClass).toBe(true);
    expect(result.reason).toBe('free_text_match');
  });

  it('DOES classify "a watcher" immediately followed (within 2 words) by an anchor verb', () => {
    const sd = { key_changes: [], description: 'Add a watcher that polls the directory every minute.' };
    expect(classifyMachineryClass(sd).machineryClass).toBe(true);
  });

  it('does NOT classify when the anchor verb is more than 2 words away from worker/watcher', () => {
    const sd = { key_changes: [], description: 'The worker in question is entirely unrelated to whatever eventually writes the file.' };
    expect(classifyMachineryClass(sd).machineryClass).toBe(false);
  });
});

describe('classifyMachineryClass — metadata.machinery_class_override (QF-20260913-876)', () => {
  it('an override with kind: null wins over a genuine structured-type match, with provenance echoed', () => {
    const sd = {
      key_changes: [{ type: 'worker', change: 'Add stage-9 worker' }],
      metadata: {
        machinery_class_override: {
          kind: null,
          reason: 'misclassified -- no machinery actually ships',
          set_by: 'coordinator-a9ba7d90',
          set_at: '2026-09-13T05:24:00Z',
        },
      },
    };
    const result = classifyMachineryClass(sd);
    expect(result.machineryClass).toBe(false);
    expect(result.kind).toBe('none');
    expect(result.reason).toBe('override');
    expect(result.override).toEqual({
      reason: 'misclassified -- no machinery actually ships',
      set_by: 'coordinator-a9ba7d90',
      set_at: '2026-09-13T05:24:00Z',
    });
  });

  it('an override can also force machinery-class TRUE for prose the regex missed', () => {
    const sd = {
      key_changes: [],
      description: 'No machinery-sounding words here at all.',
      metadata: { machinery_class_override: { kind: 'router', reason: 'ships a router the prose does not name' } },
    };
    const result = classifyMachineryClass(sd);
    expect(result.machineryClass).toBe(true);
    expect(result.kind).toBe('router');
    expect(result.reason).toBe('override');
  });

  it('a malformed override (no reason, or an unrecognized kind) is ignored -- falls through to normal classification', () => {
    const sdNoReason = {
      key_changes: [],
      description: 'plain prose',
      metadata: { machinery_class_override: { kind: null, reason: '' } },
    };
    expect(classifyMachineryClass(sdNoReason).reason).not.toBe('override');

    const sdBadKind = {
      key_changes: [],
      description: 'plain prose',
      metadata: { machinery_class_override: { kind: 'not-a-real-kind', reason: 'x' } },
    };
    expect(classifyMachineryClass(sdBadKind).reason).not.toBe('override');
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
