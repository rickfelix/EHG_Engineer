import { describe, it, expect, beforeEach, vi } from 'vitest';

function makeChain(resolvedValue) {
  const handler = {
    get(_, prop) {
      if (prop === 'then') return (cb) => Promise.resolve(resolvedValue).then(cb);
      if (prop === 'catch') return (cb) => Promise.resolve(resolvedValue).catch(cb);
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

function makeMockSupabase(rpcResults = {}) {
  return {
    rpc(fnName, params) {
      const result = rpcResults[fnName] || { data: null, error: null };
      return makeChain(result);
    },
  };
}

let main, parseArgs;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const mod = require('../../../scripts/send-department-message.cjs');
  main = mod.main;
  parseArgs = mod.parseArgs;
});

describe('send-department-message', () => {
  it('shows usage when no args provided', async () => {
    process.argv = ['node', 'script'];
    const sb = makeMockSupabase();
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Usage:');
  });

  it('shows usage with --help', async () => {
    process.argv = ['node', 'script', '--help'];
    const sb = makeMockSupabase();
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Usage:');
  });

  it('sends message successfully', async () => {
    process.argv = [
      'node', 'script',
      '--department-id', 'dept-uuid',
      '--sender-id', 'sender-uuid',
      '--content', 'Hello team',
    ];
    const sb = makeMockSupabase({
      send_department_message: { data: 'msg-uuid-123', error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Department message sent successfully');
    expect(output).toContain('msg-uuid-123');
    expect(output).toContain('dept-uuid');
    expect(output).toContain('sender-uuid');
  });

  it('sends message with metadata', async () => {
    process.argv = [
      'node', 'script',
      '--department-id', 'dept-uuid',
      '--sender-id', 'sender-uuid',
      '--content', 'With metadata',
      '--metadata', '{"priority":"high"}',
    ];
    const sb = makeMockSupabase({
      send_department_message: { data: 'msg-uuid-456', error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('msg-uuid-456');
  });

  it('errors when --department-id missing', async () => {
    process.argv = ['node', 'script', '--sender-id', 'x', '--content', 'hi'];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase();
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error: --department-id is required');
    mockExit.mockRestore();
  });

  it('errors when --sender-id missing', async () => {
    process.argv = ['node', 'script', '--department-id', 'x', '--content', 'hi'];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase();
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error: --sender-id is required');
    mockExit.mockRestore();
  });

  it('errors when --content missing', async () => {
    process.argv = ['node', 'script', '--department-id', 'x', '--sender-id', 'y'];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase();
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error: --content is required');
    mockExit.mockRestore();
  });

  it('handles RPC error', async () => {
    process.argv = [
      'node', 'script',
      '--department-id', 'dept-uuid',
      '--sender-id', 'sender-uuid',
      '--content', 'Hello',
    ];
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    const sb = makeMockSupabase({
      send_department_message: { data: null, error: { message: 'department not found' } },
    });
    await expect(main(sb)).rejects.toThrow('exit');
    expect(console.error).toHaveBeenCalledWith('Error sending department message:', 'department not found');
    mockExit.mockRestore();
  });

  it('handles invalid metadata JSON gracefully', async () => {
    process.argv = [
      'node', 'script',
      '--department-id', 'dept-uuid',
      '--sender-id', 'sender-uuid',
      '--content', 'Hello',
      '--metadata', 'not-json',
    ];
    const sb = makeMockSupabase({
      send_department_message: { data: 'msg-uuid-789', error: null },
    });
    await main(sb);
    const output = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('msg-uuid-789');
  });
});
