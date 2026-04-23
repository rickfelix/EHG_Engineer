/**
 * tests/unit/protocol-policies/orchestrator-bypass.test.js
 *
 * SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 (FR-001 acceptance criteria)
 *
 * Unit tests for the orchestrator-bypass policy module. Covers:
 *   - shouldBypassUserStories: every sd_type in CLAUDE_CORE.md matrix + edge cases
 *   - shouldBypassPRD: exempt types + non-exempt types
 *   - Input flexibility: SD object vs bare sd_type string
 *   - Safe defaults: null, undefined, empty, non-string, object without sd_type
 */

import { describe, it, expect } from 'vitest';
import {
  shouldBypassUserStories,
  shouldBypassPRD,
  STORY_EXEMPT_TYPES,
  PRD_EXEMPT_TYPES,
} from '../../../lib/protocol-policies/orchestrator-bypass.js';

describe('shouldBypassUserStories', () => {
  describe('accepts bare sd_type string', () => {
    it.each(['infrastructure', 'documentation', 'database', 'security', 'refactor', 'orchestrator'])(
      'returns true for exempt type %s',
      (type) => {
        expect(shouldBypassUserStories(type)).toBe(true);
      }
    );

    it.each(['feature', 'bugfix'])(
      'returns false for non-exempt type %s',
      (type) => {
        expect(shouldBypassUserStories(type)).toBe(false);
      }
    );
  });

  describe('accepts SD object', () => {
    it('returns true for SD with exempt sd_type', () => {
      expect(shouldBypassUserStories({ sd_type: 'infrastructure' })).toBe(true);
    });

    it('returns false for SD with non-exempt sd_type', () => {
      expect(shouldBypassUserStories({ sd_type: 'feature' })).toBe(false);
    });

    it('ignores other SD fields', () => {
      expect(shouldBypassUserStories({ sd_type: 'infrastructure', sd_key: 'SD-X', priority: 'high' })).toBe(true);
    });
  });

  describe('safe defaults (does NOT bypass on invalid input)', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['number', 42],
      ['empty object', {}],
      ['object with non-string sd_type', { sd_type: 42 }],
      ['object with null sd_type', { sd_type: null }],
      ['object with empty sd_type', { sd_type: '' }],
      ['array', []],
      ['unknown type', 'some_unknown_type'],
    ])('returns false for %s', (_label, input) => {
      expect(shouldBypassUserStories(input)).toBe(false);
    });
  });
});

describe('shouldBypassPRD', () => {
  describe('accepts bare sd_type string', () => {
    it.each(['documentation', 'fix'])(
      'returns true for PRD-exempt type %s',
      (type) => {
        expect(shouldBypassPRD(type)).toBe(true);
      }
    );

    it.each(['feature', 'bugfix', 'infrastructure', 'database', 'security'])(
      'returns false for type %s (PRD required)',
      (type) => {
        expect(shouldBypassPRD(type)).toBe(false);
      }
    );
  });

  describe('accepts SD object', () => {
    it('returns true for SD with PRD-exempt sd_type', () => {
      expect(shouldBypassPRD({ sd_type: 'documentation' })).toBe(true);
    });

    it('returns false for SD with non-exempt sd_type', () => {
      expect(shouldBypassPRD({ sd_type: 'infrastructure' })).toBe(false);
    });
  });

  describe('safe defaults', () => {
    it.each([null, undefined, '', 42, {}, { sd_type: null }, []])(
      'returns false for invalid input %j',
      (input) => {
        expect(shouldBypassPRD(input)).toBe(false);
      }
    );
  });
});

describe('exported sets are read-only contract', () => {
  it('STORY_EXEMPT_TYPES contains expected entries', () => {
    expect(STORY_EXEMPT_TYPES.has('infrastructure')).toBe(true);
    expect(STORY_EXEMPT_TYPES.has('documentation')).toBe(true);
    expect(STORY_EXEMPT_TYPES.has('database')).toBe(true);
    expect(STORY_EXEMPT_TYPES.has('security')).toBe(true);
    expect(STORY_EXEMPT_TYPES.has('refactor')).toBe(true);
    expect(STORY_EXEMPT_TYPES.has('orchestrator')).toBe(true);
    expect(STORY_EXEMPT_TYPES.has('feature')).toBe(false);
    expect(STORY_EXEMPT_TYPES.has('bugfix')).toBe(false);
  });

  it('PRD_EXEMPT_TYPES contains expected entries', () => {
    expect(PRD_EXEMPT_TYPES.has('documentation')).toBe(true);
    expect(PRD_EXEMPT_TYPES.has('fix')).toBe(true);
    expect(PRD_EXEMPT_TYPES.has('feature')).toBe(false);
    expect(PRD_EXEMPT_TYPES.has('infrastructure')).toBe(false);
  });

  it('shouldBypassUserStories set and PRD set diverge (different exemption semantics)', () => {
    // documentation is in both; infrastructure is only in STORY_EXEMPT; fix is only in PRD_EXEMPT
    expect(STORY_EXEMPT_TYPES.has('infrastructure')).toBe(true);
    expect(PRD_EXEMPT_TYPES.has('infrastructure')).toBe(false);
    expect(STORY_EXEMPT_TYPES.has('fix')).toBe(false);
    expect(PRD_EXEMPT_TYPES.has('fix')).toBe(true);
  });
});
