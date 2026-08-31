import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';

// QF-20260830-792: syncToDatabase() instantiates its supabase client at module-import time
// (`const supabase = createSupabaseServiceClient()`), so the mock must be registered before
// the module under test is imported -- matches the established pattern in
// tests/unit/budget-check.test.js.
const upsertMock = vi.fn().mockResolvedValue({ error: null });
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({ upsert: upsertMock }),
  }),
}));

let existsSyncMock;
let readFileSyncMock;
let writeFileSyncMock;
let createReadStreamMock;

vi.mock('fs', () => {
  existsSyncMock = vi.fn().mockReturnValue(true);
  readFileSyncMock = vi.fn().mockReturnValue('{}');
  writeFileSyncMock = vi.fn();
  createReadStreamMock = vi.fn();
  return {
    default: {
      existsSync: existsSyncMock,
      readFileSync: readFileSyncMock,
      writeFileSync: writeFileSyncMock,
      createReadStream: createReadStreamMock,
    },
  };
});

const { syncToDatabase } = await import('../../scripts/sync-context-usage.js');

function jsonlStream(lines) {
  return Readable.from(lines.map((l) => l + '\n').join(''));
}

describe('syncToDatabase legacy-row skip (QF-20260830-792)', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    upsertMock.mockResolvedValue({ error: null });
    writeFileSyncMock.mockClear();
    readFileSyncMock.mockReturnValue(JSON.stringify({ lastSyncedLine: 0, lastSyncedTimestamp: null }));
  });

  it('skips entries with no session_id instead of failing the whole batch, and still advances sync state', async () => {
    const validEntry = { session_id: 's1', timestamp: '2026-01-01T00:00:00Z', model_id: 'sonnet' };
    const legacyEntry = { timestamp: '2025-01-01T00:00:00Z', model_id: 'sonnet' }; // no session_id
    createReadStreamMock.mockReturnValue(jsonlStream([
      JSON.stringify(legacyEntry),
      JSON.stringify(validEntry),
    ]));

    await syncToDatabase();

    // Only the valid entry should have been sent upstream.
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [upserted] = upsertMock.mock.calls[0];
    expect(upserted).toHaveLength(1);
    expect(upserted[0].session_id).toBe('s1');

    // Sync state must still advance past the legacy row (line 2, the last line in the batch),
    // not get stuck at line 1 forever.
    expect(writeFileSyncMock).toHaveBeenCalled();
    const [, savedStateJson] = writeFileSyncMock.mock.calls[0];
    const savedState = JSON.parse(savedStateJson);
    expect(savedState.lastSyncedLine).toBe(2);
  });

  it('does not call upsert at all when every entry in the batch lacks a session_id', async () => {
    createReadStreamMock.mockReturnValue(jsonlStream([
      JSON.stringify({ timestamp: '2025-01-01T00:00:00Z' }),
      JSON.stringify({ timestamp: '2025-01-02T00:00:00Z' }),
    ]));

    await syncToDatabase();

    expect(upsertMock).not.toHaveBeenCalled();
    const [, savedStateJson] = writeFileSyncMock.mock.calls[0];
    expect(JSON.parse(savedStateJson).lastSyncedLine).toBe(2);
  });
});

describe('syncToDatabase same-batch (session_id,timestamp) dedup (QF-20260830-942)', () => {
  beforeEach(() => {
    upsertMock.mockClear();
    upsertMock.mockResolvedValue({ error: null });
    writeFileSyncMock.mockClear();
    readFileSyncMock.mockReturnValue(JSON.stringify({ lastSyncedLine: 0, lastSyncedTimestamp: null }));
  });

  it('collapses two lines sharing the same (session_id, timestamp) into one upserted row', async () => {
    const dup = { session_id: 's1', timestamp: '2026-07-18T06:43:37.986Z', model_id: 'sonnet', input_tokens: 1 };
    const dupNewer = { ...dup, input_tokens: 2 };
    const other = { session_id: 's2', timestamp: '2026-07-18T06:43:38.000Z', model_id: 'sonnet' };
    createReadStreamMock.mockReturnValue(jsonlStream([
      JSON.stringify(dup),
      JSON.stringify(dupNewer),
      JSON.stringify(other),
    ]));

    await syncToDatabase();

    // Without the dedup fix, Postgres would reject the whole upsert
    // ("ON CONFLICT DO UPDATE command cannot affect row a second time"); here the mock succeeds,
    // so we assert the CALL PAYLOAD was already collapsed to one row per key before upload.
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [upserted] = upsertMock.mock.calls[0];
    expect(upserted).toHaveLength(2);
    const s1Row = upserted.find((r) => r.session_id === 's1');
    // Last occurrence wins.
    expect(s1Row.input_tokens).toBe(2);

    const [, savedStateJson] = writeFileSyncMock.mock.calls[0];
    expect(JSON.parse(savedStateJson).lastSyncedLine).toBe(3);
  });
});
