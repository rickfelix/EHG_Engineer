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
import { resolveApprovalChoice } from '../archplan-approval-choice.mjs';

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
