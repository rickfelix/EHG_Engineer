// SD-LEO-INFRA-COORDINATOR-MATERIALIZE-QUEUE-BEFORE-SOURCE-001 (FR-1/FR-2/FR-4) — the coordinator's
// belt-low path should DRAIN un-materialized Adam proposals before pinging Adam for more. These tests
// assert: detection counts only proposed_sd_key NOT IN strategic_directives_v2; the drain is idempotent
// (reuses the canonical keyExists skip); reachAdam is suppressed when fresh pending exist; fail-soft on
// a malformed file; and the stale-guard never auto-materializes a proposal outside the freshness window.
import { describe, it, expect } from 'vitest';
import {
  scanPendingProposals,
  drainPendingProposals,
  shouldMaterializeBeforeSource,
} from '../../lib/coordinator/pending-proposals-gauge.mjs';

const NOW = Date.parse('2026-06-23T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

// In-memory fs double. files: { name: { content, mtimeMs } }
function mockFs(files) {
  return {
    readdirSync: () => Object.keys(files),
    readFileSync: (p) => {
      const name = p.split(/[\\/]/).pop();
      if (files[name]?.content === undefined) throw new Error('ENOENT');
      return files[name].content;
    },
    statSync: (p) => {
      const name = p.split(/[\\/]/).pop();
      return { mtimeMs: files[name]?.mtimeMs ?? NOW };
    },
  };
}

// supabase double: strategic_directives_v2.select('sd_key').in('sd_key', keys) → rows for existingKeys
function mockSb(existingKeys = []) {
  return {
    from() {
      return { select: () => ({ in: (_c, keys) => Promise.resolve({ data: keys.filter(k => existingKeys.includes(k)).map(sd_key => ({ sd_key })), error: null }) }) };
    },
  };
}

function prop(key) { return JSON.stringify({ PROPOSAL: true, proposed_sd_key: key, title: 't', sd_type: 'infrastructure', priority: 'high' }); }

describe('scanPendingProposals (FR-1)', () => {
  it('counts only proposed_sd_key NOT IN strategic_directives_v2', async () => {
    const fs = mockFs({
      'adam-prop-a.json': { content: prop('SD-A'), mtimeMs: NOW },
      'adam-prop-b.json': { content: prop('SD-B'), mtimeMs: NOW },
      'adam-prop-c.json': { content: prop('SD-C'), mtimeMs: NOW },
    });
    const scan = await scanPendingProposals({ dir: '.prd-payloads', supabase: mockSb(['SD-B']), now: NOW, fs });
    expect(scan.scanned).toBe(3);
    expect(scan.pendingCount).toBe(2);
    expect(scan.pendingKeys.sort()).toEqual(['SD-A', 'SD-C']);
  });

  it('ignores non adam-prop files and key-less payloads', async () => {
    const fs = mockFs({
      'adam-prop-a.json': { content: prop('SD-A'), mtimeMs: NOW },
      'PRD-something.json': { content: prop('SD-X'), mtimeMs: NOW },        // not adam-prop-*
      'adam-prop-nokey.json': { content: JSON.stringify({ PROPOSAL: true }), mtimeMs: NOW }, // no key
    });
    const scan = await scanPendingProposals({ supabase: mockSb([]), now: NOW, fs });
    expect(scan.scanned).toBe(1);
    expect(scan.pendingKeys).toEqual(['SD-A']);
  });

  it('stale-guard: a proposal older than the freshness window is classified stale, not fresh', async () => {
    const fs = mockFs({
      'adam-prop-fresh.json': { content: prop('SD-FRESH'), mtimeMs: NOW - 1 * DAY },
      'adam-prop-stale.json': { content: prop('SD-STALE'), mtimeMs: NOW - 30 * DAY },
    });
    const scan = await scanPendingProposals({ freshnessMs: 7 * DAY, supabase: mockSb([]), now: NOW, fs });
    expect(scan.freshKeys).toEqual(['SD-FRESH']);
    expect(scan.staleKeys).toEqual(['SD-STALE']);
    expect(scan.freshProposals.map(p => p.key)).toEqual(['SD-FRESH']);
  });

  it('fail-soft: a malformed adam-prop file does not halt the scan', async () => {
    const fs = mockFs({
      'adam-prop-good.json': { content: prop('SD-GOOD'), mtimeMs: NOW },
      'adam-prop-bad.json': { content: '{ not json', mtimeMs: NOW },
    });
    const scan = await scanPendingProposals({ supabase: mockSb([]), now: NOW, fs });
    expect(scan.pendingKeys).toEqual(['SD-GOOD']);
  });
});

describe('drainPendingProposals (FR-2)', () => {
  it('idempotent: an already-materialized key is skipped (no double-create)', async () => {
    const calls = [];
    const ingest = async (proposal, source) => {
      calls.push(proposal.proposed_sd_key);
      // mimic the canonical keyExists skip for SD-EXISTS
      return { action: proposal.proposed_sd_key === 'SD-EXISTS' ? 'skipped' : 'created' };
    };
    const freshProposals = [
      { key: 'SD-NEW', path: 'p1', proposal: { proposed_sd_key: 'SD-NEW' } },
      { key: 'SD-EXISTS', path: 'p2', proposal: { proposed_sd_key: 'SD-EXISTS' } },
    ];
    const summary = await drainPendingProposals({ freshProposals, deps: { ingest } });
    expect(summary.materialized).toBe(1);
    expect(summary.skippedExisting).toBe(1);
    expect(calls).toEqual(['SD-NEW', 'SD-EXISTS']);
  });

  it('fail-soft: a throwing create does not halt the drain', async () => {
    const ingest = async (proposal) => {
      if (proposal.proposed_sd_key === 'SD-BOOM') throw new Error('boom');
      return { action: 'created' };
    };
    const freshProposals = [
      { key: 'SD-BOOM', path: 'p1', proposal: { proposed_sd_key: 'SD-BOOM' } },
      { key: 'SD-OK', path: 'p2', proposal: { proposed_sd_key: 'SD-OK' } },
    ];
    const summary = await drainPendingProposals({ freshProposals, deps: { ingest } });
    expect(summary.failed).toBe(1);
    expect(summary.materialized).toBe(1);
  });
});

describe('shouldMaterializeBeforeSource (FR-4c — reachAdam suppression)', () => {
  it('true when fresh pending exist → MATERIALIZE branch (reachAdam suppressed)', () => {
    expect(shouldMaterializeBeforeSource({ freshKeys: ['SD-A'] })).toBe(true);
  });
  it('false when no fresh pending → normal Adam-ping path', () => {
    expect(shouldMaterializeBeforeSource({ freshKeys: [], staleKeys: ['SD-OLD'] })).toBe(false);
    expect(shouldMaterializeBeforeSource({})).toBe(false);
  });
});
