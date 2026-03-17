import { describe, it, expect } from 'vitest';
import { validateKnownIssues } from '../../../../scripts/modules/handoff/validators/known-issues-validator.js';

describe('validateKnownIssues', () => {
  it('returns score 70 with warning when known_issues is undefined', async () => {
    const result = await validateKnownIssues({ handoff: {} });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(70);
    expect(result.warnings).toContain('known_issues field not set (should be empty array if none)');
    expect(result.details.isDefined).toBe(false);
  });

  it('returns score 70 when handoff is missing entirely', async () => {
    const result = await validateKnownIssues({});
    expect(result.passed).toBe(false);
    expect(result.score).toBe(70);
  });

  it('returns score 100 when known_issues is empty array (explicitly none)', async () => {
    const result = await validateKnownIssues({ handoff: { known_issues: [] } });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.isDefined).toBe(true);
    expect(result.details.count).toBe(0);
    expect(result.details.explicitlyNone).toBe(true);
  });

  it('returns score 100 when issues are well-documented strings (>10 chars)', async () => {
    const result = await validateKnownIssues({
      handoff: {
        known_issues: [
          'Memory leak in the websocket handler under heavy load',
          'CSS rendering issue in Safari on mobile devices'
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings).toHaveLength(0);
    expect(result.details.count).toBe(2);
    expect(result.details.documented).toBe(2);
  });

  it('warns when some string issues are too short', async () => {
    const result = await validateKnownIssues({
      handoff: {
        known_issues: [
          'Bug fix',  // too short (<=10)
          'Memory leak in the websocket connection handler module'
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings).toContain('Some issues may need more detail');
    expect(result.details.documented).toBe(1);
  });

  it('accepts object issues with description field', async () => {
    const result = await validateKnownIssues({
      handoff: {
        known_issues: [
          { description: 'Known race condition in concurrent writes' }
        ]
      }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.documented).toBe(1);
  });

  it('accepts object issues with issue field', async () => {
    const result = await validateKnownIssues({
      handoff: {
        known_issues: [
          { issue: 'Timeout on large file uploads' }
        ]
      }
    });
    expect(result.details.documented).toBe(1);
  });

  it('accepts object issues with title field', async () => {
    const result = await validateKnownIssues({
      handoff: {
        known_issues: [
          { title: 'Safari rendering bug' }
        ]
      }
    });
    expect(result.details.documented).toBe(1);
  });

  it('returns score 80 with warning when known_issues is not an array', async () => {
    const result = await validateKnownIssues({
      handoff: { known_issues: 'Some issues exist' }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.warnings).toContain('known_issues should be an array');
    expect(result.details.isDefined).toBe(true);
    expect(result.details.isArray).toBe(false);
  });

  it('returns score 80 when known_issues is an object (not array)', async () => {
    const result = await validateKnownIssues({
      handoff: { known_issues: { issue1: 'bug' } }
    });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
    expect(result.warnings).toContain('known_issues should be an array');
  });

  it('handles null known_issues as undefined (field not set)', async () => {
    // null is not undefined, so it takes the non-array path
    const result = await validateKnownIssues({ handoff: { known_issues: null } });
    // null is not undefined, not an array => falls through to non-array return
    expect(result.passed).toBe(true);
    expect(result.score).toBe(80);
  });
});
