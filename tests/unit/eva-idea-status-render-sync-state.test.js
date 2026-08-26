/**
 * SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 FR-4 AC-1 / TS-4.
 *
 * scripts/eva-idea-status.js:74-77 used to destructure only `data: syncState` from its
 * eva_sync_state query, discarding `error` — a failed read printed the identical "No sync
 * history" message as a genuinely empty table. renderSyncState() is the extracted pure function
 * (DESIGN sub-agent's testability-seam requirement) that must render these two cases distinctly.
 */
import { describe, it, expect } from 'vitest';
import { renderSyncState } from '../../scripts/eva-idea-status.js';

describe('renderSyncState (FR-4 AC-1 / TS-4)', () => {
  it('a query error renders an explicit ERROR line, never the empty-table message', () => {
    const lines = renderSyncState(null, { message: 'connection reset' });
    const joined = lines.join('\n');
    expect(joined).toMatch(/ERROR/);
    expect(joined).toMatch(/connection reset/);
    expect(joined).not.toMatch(/No sync history/);
  });

  it('a genuinely empty table (no error) renders "No sync history"', () => {
    const lines = renderSyncState([], null);
    expect(lines.join('\n')).toMatch(/No sync history/);
  });

  it('a genuinely empty table via null data (no error) also renders "No sync history"', () => {
    const lines = renderSyncState(null, null);
    expect(lines.join('\n')).toMatch(/No sync history/);
  });

  it('populated sync state rows render health per source, not the empty-table message', () => {
    const lines = renderSyncState([
      { source_type: 'youtube', source_identifier: 'For Processing', last_sync_at: '2026-08-20T00:00:00Z', total_synced: 12, consecutive_failures: 0 },
      { source_type: 'todoist', source_identifier: '6gfJpjh9Ghvv8fFq', last_sync_at: null, total_synced: 0, consecutive_failures: 3 },
    ], null);
    const joined = lines.join('\n');
    expect(joined).not.toMatch(/No sync history/);
    expect(joined).toMatch(/youtube\/For Processing/);
    expect(joined).toMatch(/Healthy/);
    expect(joined).toMatch(/todoist\/6gfJpjh9Ghvv8fFq/);
    expect(joined).toMatch(/CIRCUIT OPEN/);
  });

  it('an error takes precedence even if data happens to be a non-empty array (defensive)', () => {
    const lines = renderSyncState([{ source_type: 'youtube' }], { message: 'boom' });
    expect(lines.join('\n')).toMatch(/ERROR/);
  });
});
