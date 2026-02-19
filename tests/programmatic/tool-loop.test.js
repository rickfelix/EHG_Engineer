/**
 * Unit tests for lib/programmatic/tool-loop.js
 * SD-LEO-INFRA-PROGRAMMATIC-TOOL-CALLING-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @anthropic-ai/sdk
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

const { runProgrammaticTask } = await import('../../lib/programmatic/tool-loop.js');

describe('runProgrammaticTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns text on end_turn without tool calls', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"result": "ok"}' }],
    });

    const result = await runProgrammaticTask('test prompt', []);
    expect(result).toBe('{"result": "ok"}');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('dispatches tool call and continues loop', async () => {
    const mockHandler = vi.fn().mockResolvedValue('{"rows": []}');
    const tool = {
      definition: { name: 'supabase_query', description: 'test', input_schema: { type: 'object', properties: {}, required: [] } },
      handler: mockHandler,
    };

    // First turn: tool_use
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'tu_001', name: 'supabase_query', input: { table: 'test', select: '*' } },
      ],
    });
    // Second turn: end_turn
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"total_score": 85}' }],
    });

    const result = await runProgrammaticTask('score SD', [tool]);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockHandler).toHaveBeenCalledWith(
      { table: 'test', select: '*' },
      { dryRun: false }
    );
    expect(result).toBe('{"total_score": 85}');
  });

  it('handles unknown tool gracefully', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_002', name: 'unknown_tool', input: {} }],
    });
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'done' }],
    });

    const result = await runProgrammaticTask('test', []);
    expect(result).toBe('done');

    // Check second call included tool_result with error
    const secondCall = mockCreate.mock.calls[1][0];
    const userMsg = secondCall.messages.find(m => m.role === 'user' && Array.isArray(m.content));
    expect(userMsg.content[0].content).toContain('Unknown tool');
  });

  it('passes dryRun flag to tool handlers', async () => {
    const mockHandler = vi.fn().mockResolvedValue('{"dry_run": true}');
    const tool = {
      definition: { name: 'test_tool', description: 'test', input_schema: { type: 'object', properties: {} } },
      handler: mockHandler,
    };

    mockCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_003', name: 'test_tool', input: {} }],
    });
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'done' }],
    });

    await runProgrammaticTask('test', [tool], { dryRun: true });
    expect(mockHandler).toHaveBeenCalledWith({}, { dryRun: true });
  });

  it('handles handler errors without crashing', async () => {
    const errorHandler = vi.fn().mockRejectedValue(new Error('DB connection failed'));
    const tool = {
      definition: { name: 'failing_tool', description: 'test', input_schema: { type: 'object', properties: {} } },
      handler: errorHandler,
    };

    mockCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_004', name: 'failing_tool', input: {} }],
    });
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'fallback' }],
    });

    const result = await runProgrammaticTask('test', [tool]);
    expect(result).toBe('fallback');

    // Verify error was surfaced in tool_result
    const secondCall = mockCreate.mock.calls[1][0];
    const userMsg = secondCall.messages.find(m => m.role === 'user' && Array.isArray(m.content));
    expect(userMsg.content[0].content).toContain('DB connection failed');
  });

  it('respects MAX_TOOL_TURNS safety cap', async () => {
    // Always return tool_use to trigger the cap
    mockCreate.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_loop', name: 'unknown', input: {} }],
    });

    await runProgrammaticTask('loop', []);
    // Should have stopped at MAX_TOOL_TURNS (20)
    expect(mockCreate.mock.calls.length).toBeLessThanOrEqual(21);
  });
});
