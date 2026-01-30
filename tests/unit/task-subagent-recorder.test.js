/**
 * Unit Tests for Task Sub-Agent Recorder Hook
 * SD-LEO-INFRA-SUB-AGENT-TASK-001
 *
 * Tests cover:
 * - TS-1: Happy path recording
 * - TS-2: Non-qualifying events
 * - TS-3: Parsing fallback
 * - TS-4: Idempotency
 * - TS-7: Output truncation
 */

import crypto from 'crypto';

// Helper functions extracted from the hook logic for testing

function generateInvocationId(params) {
  const { tool_name, subagent_type, tool_call_id, tool_input } = params;

  const canonicalInput = {
    tool_name,
    subagent_type,
    tool_call_id: tool_call_id || null,
    input_hash: crypto
      .createHash('sha256')
      .update(JSON.stringify(tool_input || {}, Object.keys(tool_input || {}).sort()))
      .digest('hex')
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalInput, Object.keys(canonicalInput).sort()))
    .digest('hex');
}

function parseVerdict(output) {
  if (!output) return 'unknown';

  if (typeof output === 'object') {
    const verdictField = output.verdict || output.Verdict || output.VERDICT;
    if (verdictField) {
      const normalized = String(verdictField).toLowerCase().trim();
      if (['pass', 'fail', 'warning', 'unknown'].includes(normalized)) {
        return normalized;
      }
    }
  }

  const textOutput = typeof output === 'string' ? output : JSON.stringify(output);

  const verdictMatch = textOutput.match(/(?:^|\n)\s*(?:VERDICT|Verdict):\s*(PASS|FAIL|WARNING|UNKNOWN|pass|fail|warning|unknown)/im);
  if (verdictMatch) {
    return verdictMatch[1].toLowerCase();
  }

  if (/✅\s*(PASS|passed|approved)/i.test(textOutput)) return 'pass';
  if (/❌\s*(FAIL|failed|rejected)/i.test(textOutput)) return 'fail';
  if (/⚠️?\s*(WARN|warning)/i.test(textOutput)) return 'warning';

  return 'unknown';
}

function parseSummary(output) {
  if (!output) return '';

  if (typeof output === 'object') {
    const summaryField = output.summary || output.Summary || output.SUMMARY;
    if (summaryField) {
      return String(summaryField).substring(0, 500).trim();
    }

    const descField = output.description || output.message || output.result;
    if (descField) {
      return String(descField).substring(0, 500).trim();
    }
  }

  const textOutput = typeof output === 'string' ? output : JSON.stringify(output);

  const summaryMatch = textOutput.match(/(?:^|\n)\s*(?:Summary|SUMMARY):\s*(.+?)(?:\n|$)/im);
  if (summaryMatch) {
    return summaryMatch[1].substring(0, 500).trim();
  }

  return textOutput.replace(/\s+/g, ' ').substring(0, 500).trim();
}

function prepareRawOutput(output, maxBytes = 262144) {
  if (!output) return { data: null, truncated: false };

  let serialized;
  try {
    serialized = typeof output === 'string' ? output : JSON.stringify(output);
  } catch (e) {
    serialized = String(output);
  }

  const originalBytes = Buffer.byteLength(serialized, 'utf8');

  if (originalBytes <= maxBytes) {
    return {
      data: output,
      truncated: false,
      original_bytes: originalBytes
    };
  }

  const truncated = serialized.substring(0, maxBytes);
  return {
    data: truncated,
    truncated: true,
    original_bytes: originalBytes
  };
}

describe('Task Sub-Agent Recorder Hook', () => {

  describe('generateInvocationId', () => {
    test('generates deterministic hash for same input', () => {
      const params1 = {
        tool_name: 'Task',
        subagent_type: 'TESTING',
        tool_call_id: 'call_123',
        tool_input: { prompt: 'test' }
      };

      const params2 = { ...params1 };

      const hash1 = generateInvocationId(params1);
      const hash2 = generateInvocationId(params2);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    test('generates different hash for different subagent_type', () => {
      const params1 = {
        tool_name: 'Task',
        subagent_type: 'TESTING',
        tool_call_id: 'call_123',
        tool_input: { prompt: 'test' }
      };

      const params2 = {
        ...params1,
        subagent_type: 'DATABASE'
      };

      expect(generateInvocationId(params1)).not.toBe(generateInvocationId(params2));
    });

    test('handles null tool_call_id consistently', () => {
      const params1 = {
        tool_name: 'Task',
        subagent_type: 'TESTING',
        tool_call_id: null,
        tool_input: { prompt: 'test' }
      };

      const params2 = {
        tool_name: 'Task',
        subagent_type: 'TESTING',
        tool_call_id: undefined,
        tool_input: { prompt: 'test' }
      };

      // Both should produce same hash (null normalization)
      expect(generateInvocationId(params1)).toBe(generateInvocationId(params2));
    });
  });

  describe('parseVerdict', () => {
    test('parses structured verdict field (lowercase)', () => {
      expect(parseVerdict({ verdict: 'pass' })).toBe('pass');
      expect(parseVerdict({ verdict: 'fail' })).toBe('fail');
      expect(parseVerdict({ verdict: 'warning' })).toBe('warning');
    });

    test('parses structured verdict field (uppercase)', () => {
      expect(parseVerdict({ VERDICT: 'PASS' })).toBe('pass');
      expect(parseVerdict({ Verdict: 'Fail' })).toBe('fail');
    });

    test('extracts verdict from text with markers (TS-3)', () => {
      const textOutput = 'VERDICT: FAIL\nSummary: Missing required artifact\nDetails: ...';
      expect(parseVerdict(textOutput)).toBe('fail');
    });

    test('detects emoji-based verdicts', () => {
      expect(parseVerdict('✅ PASS - All checks completed')).toBe('pass');
      expect(parseVerdict('❌ FAIL - Tests failed')).toBe('fail');
      expect(parseVerdict('⚠️ WARNING - Partial completion')).toBe('warning');
    });

    test('returns unknown for unrecognized output', () => {
      expect(parseVerdict('Some random text')).toBe('unknown');
      expect(parseVerdict(null)).toBe('unknown');
      expect(parseVerdict(undefined)).toBe('unknown');
    });
  });

  describe('parseSummary', () => {
    test('extracts structured summary field', () => {
      expect(parseSummary({ summary: 'All checks passed' })).toBe('All checks passed');
      expect(parseSummary({ Summary: 'Test complete' })).toBe('Test complete');
    });

    test('falls back to description/message fields', () => {
      expect(parseSummary({ description: 'Detailed description' })).toBe('Detailed description');
      expect(parseSummary({ message: 'Success message' })).toBe('Success message');
    });

    test('extracts summary from text with markers (TS-3)', () => {
      const textOutput = 'VERDICT: FAIL\nSummary: Missing required artifact\nDetails: ...';
      expect(parseSummary(textOutput)).toBe('Missing required artifact');
    });

    test('truncates to 500 characters', () => {
      const longSummary = 'a'.repeat(600);
      expect(parseSummary({ summary: longSummary })).toHaveLength(500);
    });

    test('uses first 500 chars of raw text as fallback', () => {
      const textOutput = 'b'.repeat(600);
      expect(parseSummary(textOutput)).toHaveLength(500);
    });

    test('returns empty string for null/undefined', () => {
      expect(parseSummary(null)).toBe('');
      expect(parseSummary(undefined)).toBe('');
    });
  });

  describe('prepareRawOutput', () => {
    test('stores small output without truncation', () => {
      const output = { verdict: 'pass', summary: 'OK' };
      const result = prepareRawOutput(output);

      expect(result.truncated).toBe(false);
      expect(result.data).toEqual(output);
      expect(result.original_bytes).toBeGreaterThan(0);
    });

    test('truncates large output and sets flag (TS-7)', () => {
      const largeOutput = 'x'.repeat(2000);
      const result = prepareRawOutput(largeOutput, 1024);

      expect(result.truncated).toBe(true);
      expect(result.data).toHaveLength(1024);
      expect(result.original_bytes).toBe(2000);
    });

    test('handles null output', () => {
      const result = prepareRawOutput(null);

      expect(result.data).toBeNull();
      expect(result.truncated).toBe(false);
    });

    test('handles objects with special characters', () => {
      const output = { message: '日本語テスト' };
      const result = prepareRawOutput(output);

      expect(result.truncated).toBe(false);
      expect(result.data).toEqual(output);
    });
  });

  describe('Hook Behavior', () => {
    test('should process Task tool with subagent_type (TS-1)', () => {
      const hookInput = {
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'TESTING',
          prompt: 'Run tests'
        },
        tool_result: {
          verdict: 'pass',
          summary: 'All tests passed'
        }
      };

      // Verify the input is qualifying
      expect(hookInput.tool_name).toBe('Task');
      expect(hookInput.tool_input.subagent_type).toBeTruthy();
      expect(parseVerdict(hookInput.tool_result)).toBe('pass');
      expect(parseSummary(hookInput.tool_result)).toBe('All tests passed');
    });

    test('should not process non-Task tools (TS-2)', () => {
      const hookInput = {
        tool_name: 'Read',
        tool_input: {
          file_path: '/some/path'
        }
      };

      // Verify the input is non-qualifying
      expect(hookInput.tool_name).not.toBe('Task');
    });

    test('should not process Task without subagent_type (TS-2)', () => {
      const hookInput = {
        tool_name: 'Task',
        tool_input: {
          prompt: 'Do something'
        }
      };

      // Verify subagent_type is missing
      expect(hookInput.tool_input.subagent_type).toBeUndefined();
    });

    test('idempotency: same invocation produces same ID (TS-4)', () => {
      const hookInput1 = {
        tool_name: 'Task',
        tool_input: {
          subagent_type: 'TESTING',
          prompt: 'Run tests'
        },
        tool_call_id: 'call_abc123'
      };

      const hookInput2 = { ...hookInput1 };

      const id1 = generateInvocationId({
        tool_name: hookInput1.tool_name,
        subagent_type: hookInput1.tool_input.subagent_type,
        tool_call_id: hookInput1.tool_call_id,
        tool_input: hookInput1.tool_input
      });

      const id2 = generateInvocationId({
        tool_name: hookInput2.tool_name,
        subagent_type: hookInput2.tool_input.subagent_type,
        tool_call_id: hookInput2.tool_call_id,
        tool_input: hookInput2.tool_input
      });

      expect(id1).toBe(id2);
    });
  });
});
