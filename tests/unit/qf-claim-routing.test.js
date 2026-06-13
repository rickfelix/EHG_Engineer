/**
 * SD-FDBK-INFRA-CLAIM-VISIBILITY-ATOMIC-001 — QF claim/routing pins.
 * Pure unit: source-level contracts + the startability predicate
 * (live-peer-held exclusion lives in classifyQuickFixes — pinned here against
 * regression since it is the consumer-side half of the atomic claim).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyQuickFixes } from '../../scripts/modules/sd-next/display/quick-fixes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

describe('qf_start action contract (SDNextSelector)', () => {
  it('every qf_start action carries claim_cmd pointing at qf-start.js', () => {
    const src = read('scripts/modules/sd-next/SDNextSelector.js');
    const qfStartReturns = src.match(/action: 'qf_start'[^}]+/g) || [];
    expect(qfStartReturns.length).toBeGreaterThan(0);
    for (const r of qfStartReturns) {
      expect(r).toContain('claim_cmd');
      expect(r).toContain('scripts/qf-start.js');
    }
  });
});

describe('sd-start.js QF-id routing (crash fix)', () => {
  it('detects ^QF- ids before any strategic_directives_v2 query and delegates to qf-start.js', () => {
    const src = read('scripts/sd-start.js');
    const routeIdx = src.indexOf('/^QF-/i.test(sdId)');
    expect(routeIdx).toBeGreaterThan(-1);
    expect(src.slice(routeIdx, routeIdx + 600)).toContain('scripts/qf-start.js');
  });
});

describe('qf-start.js claim CLI', () => {
  it('claims via the canonical claim_sd RPC and surfaces holder info on refusal', () => {
    const src = read('scripts/qf-start.js');
    expect(src).toContain("rpc('claim_sd'");
    expect(src).toContain('claimed_by');
    expect(src).toContain('process.exit(3)');
  });
});

describe('live-peer-held QFs are excluded from topStartableQF (consumer half)', () => {
  const baseQf = {
    id: 'QF-20260612-TEST', title: 'x', type: 'bug', severity: 'high',
    status: 'open', created_at: new Date().toISOString(),
  };
  const me = { session_id: 'me' };

  it('a QF held by a LIVE peer is not startable', () => {
    const { summary } = classifyQuickFixes(
      [{ ...baseQf, claiming_session_id: 'peer' }],
      new Map(),
      { currentSession: me, activeSessions: [{ session_id: 'peer', heartbeat_age_seconds: 30 }] },
    );
    expect(summary.topStartableQF).toBeNull();
  });

  it('a QF held by a STALE (>=900s) peer remains startable (claim_sd takeover handles the race)', () => {
    const { summary } = classifyQuickFixes(
      [{ ...baseQf, claiming_session_id: 'peer' }],
      new Map(),
      { currentSession: me, activeSessions: [{ session_id: 'peer', heartbeat_age_seconds: 5000 }] },
    );
    expect(summary.topStartableQF?.id).toBe(baseQf.id);
  });

  it('an unclaimed fresh open QF is startable', () => {
    const { summary } = classifyQuickFixes([{ ...baseQf }], new Map(), { currentSession: me, activeSessions: [] });
    expect(summary.topStartableQF?.id).toBe(baseQf.id);
  });
});
