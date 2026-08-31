/**
 * QF-20260830-232 — LEAD-FINAL migration application gate.
 *
 * SPECIMEN: SD-LEO-INFRA-COMPETITIVE-OBSERVED-TAG-MIGRATION-001 closed completed
 * with a shipped migration never applied and no durable deferral record.
 */
import { describe, it, expect } from 'vitest';
import {
  enumerateMigrationsForSd,
  findDeferral,
  evaluateMigrationGate,
} from '../../../lib/migration/completion-migration-gate.js';

describe('enumerateMigrationsForSd', () => {
  it('collects migration paths ADDED across every commit mentioning the SD key', () => {
    const calls = [];
    const git = (cmd) => {
      calls.push(cmd);
      if (cmd.startsWith('git log')) return 'aaa\nbbb\n';
      if (cmd.includes('aaa')) return 'database/migrations/20260101_x.sql\n';
      if (cmd.includes('bbb')) return 'database/migrations/20260102_y.sql\n';
      return '';
    };
    const result = enumerateMigrationsForSd('SD-TEST-001', { git });
    expect(result).toEqual({
      paths: ['database/migrations/20260101_x.sql', 'database/migrations/20260102_y.sql'],
      unverifiable: false,
    });
    // calls[0] is the FR-3 fetch; the grep-by-SD-key call is calls[1].
    expect(calls[0]).toMatch(/^git fetch origin main/);
    expect(calls[1]).toContain('SD-TEST-001');
  });

  it('returns empty, verifiable when no commit mentions the SD (the ordinary case)', () => {
    const git = () => '';
    expect(enumerateMigrationsForSd('SD-TEST-002', { git })).toEqual({ paths: [], unverifiable: false });
  });

  it('[TWO-SIDED] surfaces unverifiable, never a silent pass, when git fails', () => {
    const git = () => { throw new Error('no repo'); };
    expect(enumerateMigrationsForSd('SD-TEST-003', { git })).toEqual({ paths: [], unverifiable: true });
  });

  it('fetches origin/main before grepping the log', () => {
    const calls = [];
    const git = (cmd) => { calls.push(cmd); return ''; };
    enumerateMigrationsForSd('SD-TEST-004', { git });
    expect(calls[0]).toMatch(/^git fetch origin main/);
    expect(calls[1]).toMatch(/^git log origin\/main/);
  });

  it('[TS-1] returns unverifiable:true on a FETCH failure specifically, never silently falling through to git log', () => {
    const calls = [];
    const git = (cmd) => {
      calls.push(cmd);
      if (cmd.startsWith('git fetch')) throw new Error('network unreachable');
      // If reached, this would have returned real matches -- proving the fetch failure
      // short-circuits BEFORE git log runs, rather than silently passing through to it.
      if (cmd.startsWith('git log')) return 'aaa\n';
      return 'database/migrations/20260101_x.sql\n';
    };
    const result = enumerateMigrationsForSd('SD-TEST-005', { git });
    expect(result).toEqual({ paths: [], unverifiable: true });
    expect(calls).toEqual(['git fetch origin main --quiet']);
  });
});

describe('findDeferral', () => {
  it('finds a deferral entry that names both owner and due_date', () => {
    const metadata = { deferred_migrations: [{ migration_path: 'a.sql', owner: 'adam', due_date: '2026-09-01' }] };
    expect(findDeferral(metadata, 'a.sql')).toMatchObject({ owner: 'adam' });
  });

  it('[TWO-SIDED] does not treat a partial entry (missing owner or due_date) as a valid deferral', () => {
    const metadata = { deferred_migrations: [{ migration_path: 'a.sql', owner: 'adam' }] };
    expect(findDeferral(metadata, 'a.sql')).toBeNull();
  });

  it('returns null when metadata carries no deferred_migrations at all', () => {
    expect(findDeferral({}, 'a.sql')).toBeNull();
    expect(findDeferral(null, 'a.sql')).toBeNull();
  });
});

describe('evaluateMigrationGate', () => {
  it('[SPECIMEN] blocks an unapplied migration with no deferral record', async () => {
    const isApplied = async () => false;
    const result = await evaluateMigrationGate({ metadata: {}, paths: ['database/migrations/20260623_x.sql'] }, isApplied);
    expect(result).toEqual({ blocked: true, unresolved: ['database/migrations/20260623_x.sql'] });
  });

  it('[TWO-SIDED] does not block when the migration has a successful apply row', async () => {
    const isApplied = async () => true;
    const result = await evaluateMigrationGate({ metadata: {}, paths: ['database/migrations/20260623_x.sql'] }, isApplied);
    expect(result).toEqual({ blocked: false, unresolved: [] });
  });

  it('[TWO-SIDED] does not block an unapplied migration that carries a valid owner+due_date deferral', async () => {
    const isApplied = async () => false;
    const metadata = { deferred_migrations: [{ migration_path: 'a.sql', owner: 'adam', due_date: '2026-09-01' }] };
    const result = await evaluateMigrationGate({ metadata, paths: ['a.sql'] }, isApplied);
    expect(result).toEqual({ blocked: false, unresolved: [] });
  });

  it('reports every unresolved path, not just the first', async () => {
    const isApplied = async () => false;
    const result = await evaluateMigrationGate({ metadata: {}, paths: ['a.sql', 'b.sql'] }, isApplied);
    expect(result.unresolved).toEqual(['a.sql', 'b.sql']);
  });
});
