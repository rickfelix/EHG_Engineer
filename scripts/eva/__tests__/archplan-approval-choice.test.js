/**
 * SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-2, EXEC-TO-PLAN TESTING review M4/M6) —
 * direct unit coverage on resolveApprovalChoice(), the pure flag-to-decision resolver
 * archplan-command.mjs's cmdUpsert delegates to. The subprocess tests in
 * archplan-command-approval.test.js prove the CLI accepts/rejects the right argv shapes;
 * this file proves the resolver itself returns the right {ok, approved|error} value for
 * every input combination, including the case a mutant that ignores --draft and always
 * resolves approved:true would otherwise ship green on (M6).
 */
import { describe, test, expect } from 'vitest';
import { resolveApprovalChoice, buildUpsertArgs } from '../archplan-approval-choice.mjs';

describe('resolveApprovalChoice', () => {
  test('--draft alone resolves approved:false', () => {
    const result = resolveApprovalChoice({ approvedFlag: undefined, draftFlag: true });
    expect(result).toEqual({ ok: true, approved: false });
  });

  test('--approved alone resolves approved:true', () => {
    const result = resolveApprovalChoice({ approvedFlag: true, draftFlag: undefined });
    expect(result).toEqual({ ok: true, approved: true });
  });

  test('neither flag is a hard error', () => {
    const result = resolveApprovalChoice({ approvedFlag: undefined, draftFlag: undefined });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Approval decision required/);
  });

  test('both flags is a hard error', () => {
    const result = resolveApprovalChoice({ approvedFlag: true, draftFlag: true });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Pass only ONE of --approved or --draft/);
  });

  test('a string value on --approved is rejected, never silently coerced', () => {
    const result = resolveApprovalChoice({ approvedFlag: 'false', draftFlag: undefined });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/--approved/);
  });

  test('a string value on --draft is rejected, never silently coerced', () => {
    const result = resolveApprovalChoice({ approvedFlag: undefined, draftFlag: 'true' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/--draft/);
  });
});

// VERIFY-phase VALIDATION review finding W2: nothing previously proved cmdUpsert's resolved
// `approved` value actually reaches the upsertArchPlan(...) call -- a mutant deleting the
// `approved,` token from that call site shipped green on all prior tests, silently restoring
// the exact bug this SD fixes on the dominant (~85% of rows) CLI write path.
describe('buildUpsertArgs', () => {
  test('forwards approved:true unchanged', () => {
    const args = buildUpsertArgs({ supabase: {}, planKey: 'A-1', visionKey: 'V-1', content: 'x', dimensions: [], brainstormId: null, approved: true });
    expect(args.approved).toBe(true);
  });

  test('forwards approved:false unchanged', () => {
    const args = buildUpsertArgs({ supabase: {}, planKey: 'A-1', visionKey: 'V-1', content: 'x', dimensions: [], brainstormId: null, approved: false });
    expect(args.approved).toBe(false);
  });

  test('sets createdBy to the canonical CLI label', () => {
    const args = buildUpsertArgs({ supabase: {}, planKey: 'A-1', visionKey: 'V-1', content: 'x', dimensions: [], brainstormId: null, approved: true });
    expect(args.createdBy).toBe('eva-archplan-command');
  });

  test('passes planKey/visionKey/content/dimensions/brainstormId through unchanged', () => {
    const supabase = {};
    const dimensions = [{ name: 'x' }];
    const args = buildUpsertArgs({ supabase, planKey: 'A-1', visionKey: 'V-1', content: 'body', dimensions, brainstormId: 'bs-1', approved: false });
    expect(args.supabase).toBe(supabase);
    expect(args.planKey).toBe('A-1');
    expect(args.visionKey).toBe('V-1');
    expect(args.content).toBe('body');
    expect(args.dimensions).toBe(dimensions);
    expect(args.brainstormId).toBe('bs-1');
  });
});
