import { describe, it, expect } from 'vitest';
import {
  canUseTool,
  getAllowedTools,
  filterToolsByProfile,
  isValidProfile,
  createToolNotAllowedError,
  VALID_PROFILES
} from '../../lib/tool-policy.js';

describe('Tool Policy Module', () => {
  describe('VALID_PROFILES', () => {
    it('contains all four profiles', () => {
      expect(VALID_PROFILES).toEqual(['full', 'coding', 'readonly', 'minimal']);
    });
  });

  describe('isValidProfile', () => {
    it('returns true for valid profiles', () => {
      expect(isValidProfile('full')).toBe(true);
      expect(isValidProfile('coding')).toBe(true);
      expect(isValidProfile('readonly')).toBe(true);
      expect(isValidProfile('minimal')).toBe(true);
    });

    it('returns false for invalid profiles', () => {
      expect(isValidProfile('superuser')).toBe(false);
      expect(isValidProfile('')).toBe(false);
      expect(isValidProfile('FULL')).toBe(false);
    });
  });

  describe('canUseTool', () => {
    describe('full profile', () => {
      it('allows all tools', () => {
        expect(canUseTool('full', 'Read')).toBe(true);
        expect(canUseTool('full', 'Write')).toBe(true);
        expect(canUseTool('full', 'Bash')).toBe(true);
        expect(canUseTool('full', 'Edit')).toBe(true);
        expect(canUseTool('full', 'WebFetch')).toBe(true);
        expect(canUseTool('full', 'NotebookEdit')).toBe(true);
      });
    });

    describe('readonly profile', () => {
      it('allows Read, Glob, Grep, WebFetch, WebSearch', () => {
        expect(canUseTool('readonly', 'Read')).toBe(true);
        expect(canUseTool('readonly', 'Glob')).toBe(true);
        expect(canUseTool('readonly', 'Grep')).toBe(true);
        expect(canUseTool('readonly', 'WebFetch')).toBe(true);
        expect(canUseTool('readonly', 'WebSearch')).toBe(true);
      });

      it('blocks Edit, Write, Bash, NotebookEdit', () => {
        expect(canUseTool('readonly', 'Edit')).toBe(false);
        expect(canUseTool('readonly', 'Write')).toBe(false);
        expect(canUseTool('readonly', 'Bash')).toBe(false);
        expect(canUseTool('readonly', 'NotebookEdit')).toBe(false);
      });

      it('blocks Task, TeamCreate, SendMessage', () => {
        expect(canUseTool('readonly', 'Task')).toBe(false);
        expect(canUseTool('readonly', 'TeamCreate')).toBe(false);
        expect(canUseTool('readonly', 'SendMessage')).toBe(false);
      });
    });

    describe('minimal profile', () => {
      it('allows only Read', () => {
        expect(canUseTool('minimal', 'Read')).toBe(true);
      });

      it('blocks everything else', () => {
        expect(canUseTool('minimal', 'Glob')).toBe(false);
        expect(canUseTool('minimal', 'Grep')).toBe(false);
        expect(canUseTool('minimal', 'Write')).toBe(false);
        expect(canUseTool('minimal', 'Edit')).toBe(false);
        expect(canUseTool('minimal', 'Bash')).toBe(false);
        expect(canUseTool('minimal', 'WebFetch')).toBe(false);
        expect(canUseTool('minimal', 'WebSearch')).toBe(false);
        expect(canUseTool('minimal', 'NotebookEdit')).toBe(false);
      });
    });

    describe('coding profile', () => {
      it('allows code-related tools', () => {
        expect(canUseTool('coding', 'Bash')).toBe(true);
        expect(canUseTool('coding', 'Read')).toBe(true);
        expect(canUseTool('coding', 'Write')).toBe(true);
        expect(canUseTool('coding', 'Edit')).toBe(true);
        expect(canUseTool('coding', 'Glob')).toBe(true);
        expect(canUseTool('coding', 'Grep')).toBe(true);
      });

      it('blocks web access tools', () => {
        expect(canUseTool('coding', 'WebFetch')).toBe(false);
        expect(canUseTool('coding', 'WebSearch')).toBe(false);
      });
    });
  });

  describe('getAllowedTools', () => {
    it('returns null for full profile (all tools allowed)', () => {
      expect(getAllowedTools('full')).toBeNull();
    });

    it('returns specific tools for readonly', () => {
      const tools = getAllowedTools('readonly');
      expect(tools).toEqual(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);
    });

    it('returns only Read for minimal', () => {
      expect(getAllowedTools('minimal')).toEqual(['Read']);
    });
  });

  describe('filterToolsByProfile', () => {
    const allTools = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Task', 'SendMessage'];

    it('returns all tools for full profile', () => {
      expect(filterToolsByProfile('full', allTools)).toEqual(allTools);
    });

    it('filters to readonly tools', () => {
      const result = filterToolsByProfile('readonly', allTools);
      expect(result).toEqual(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);
    });

    it('filters to minimal tools', () => {
      const result = filterToolsByProfile('minimal', allTools);
      expect(result).toEqual(['Read']);
    });

    it('returns original for unknown profile', () => {
      expect(filterToolsByProfile('unknown', allTools)).toEqual(allTools);
    });

    it('filters coding profile (no web tools)', () => {
      const result = filterToolsByProfile('coding', allTools);
      expect(result).not.toContain('WebFetch');
      expect(result).not.toContain('WebSearch');
      expect(result).toContain('Bash');
      expect(result).toContain('Read');
      expect(result).toContain('Write');
    });
  });

  describe('createToolNotAllowedError', () => {
    it('creates structured error for readonly violation', () => {
      const error = createToolNotAllowedError('agent-123', 'readonly', 'Write');
      expect(error.type).toBe('TOOL_NOT_ALLOWED');
      expect(error.subAgentId).toBe('agent-123');
      expect(error.profile).toBe('readonly');
      expect(error.toolName).toBe('Write');
      expect(error.allowed).toEqual(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch']);
      expect(error.reason).toContain('not allowed');
    });

    it('creates structured error for minimal violation', () => {
      const error = createToolNotAllowedError('agent-456', 'minimal', 'Glob');
      expect(error.type).toBe('TOOL_NOT_ALLOWED');
      expect(error.profile).toBe('minimal');
      expect(error.toolName).toBe('Glob');
      expect(error.allowed).toEqual(['Read']);
    });
  });
});
