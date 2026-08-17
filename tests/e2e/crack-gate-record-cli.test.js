/**
 * SD-FDBK-FIX-VENTURE-CRACK-GATE-001 FR-7 (TS-7) — record-gate-attestation.mjs CLI contract.
 */
import { describe, it, expect, vi } from 'vitest';
import { main, buildAttestationRow } from '../../scripts/eva/record-gate-attestation.mjs';

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const VALID_ARGV = [
  'node', 'record-gate-attestation.mjs',
  '--venture', VENTURE_ID, '--type', 'stage17_judgment', '--verdict', 'PASS',
  '--citation', 'https://example.com/review', '--actor', 'rick@example.com', '--producer', 'stage-17-blueprint-review',
  '--subject-ref', 'probe://site', '--path-to-pass', 'n/a',
];

describe('buildAttestationRow', () => {
  it('maps flags into the attestations table row shape', () => {
    const row = buildAttestationRow({
      '--venture': VENTURE_ID, '--type': 'stage17_judgment', '--verdict': 'PASS', '--citation': 'https://x',
      '--actor': 'a', '--producer': 'b', '--subject-ref': 'sr', '--path-to-pass': 'ptp',
    });
    expect(row.venture_id).toBe(VENTURE_ID);
    expect(row.enforcement_strength).toBe('convention');
    expect(row.findings).toEqual({});
  });
});

describe('record-gate-attestation.mjs main()', () => {
  it('TS-7: exits 0 and prints the recorded id on success', async () => {
    const supabase = { from: vi.fn(() => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 1, verdict: 'PASS', computed_at: '2026-08-17T00:00:00Z' }, error: null }) }) }) })) };
    const result = await main(VALID_ARGV, { supabase });
    expect(result.exitCode).toBe(0);
    expect(result.id).toBe(1);
  });

  it('exits 1 with a clear message when a flag value looks like another flag (the args[i+1] bug class)', async () => {
    const argv = ['node', 's', '--venture', VENTURE_ID, '--type', 'stage17_judgment', '--verdict', 'PASS', '--citation', '--actor', 'Rick'];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await main(argv, { supabase: {} });
    expect(result.exitCode).toBe(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(/requires a value/);
    errorSpy.mockRestore();
  });

  it('exits 1 and lists missing required flags', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await main(['node', 's', '--venture', VENTURE_ID], { supabase: {} });
    expect(result.exitCode).toBe(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(/Missing required flag/);
    errorSpy.mockRestore();
  });

  it('exits 2 when venture_gate_attestations does not exist yet (chairman migration not applied)', async () => {
    const supabase = { from: vi.fn(() => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'schema cache miss' } }) }) }) })) };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await main(VALID_ARGV, { supabase });
    expect(result.exitCode).toBe(2);
    errorSpy.mockRestore();
  });

  it('exits 1 and surfaces the DB constraint message legibly when attested_by is generic (e.g. "system")', async () => {
    const supabase = { from: vi.fn(() => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'new row for relation "venture_gate_attestations" violates check constraint "vga_attested_by_is_identified"' } }) }) }) })) };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const argv = [
      'node', 'record-gate-attestation.mjs',
      '--venture', VENTURE_ID, '--type', 'stage17_judgment', '--verdict', 'PASS',
      '--citation', 'https://example.com/review', '--actor', 'system', '--producer', 'stage-17-blueprint-review',
      '--subject-ref', 'probe://site', '--path-to-pass', 'n/a',
    ];
    const result = await main(argv, { supabase });
    expect(result.exitCode).toBe(1);
    expect(errorSpy.mock.calls[0][0]).toMatch(/vga_attested_by_is_identified/);
    errorSpy.mockRestore();
  });
});
