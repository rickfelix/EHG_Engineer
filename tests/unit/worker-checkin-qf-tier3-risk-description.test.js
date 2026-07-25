/**
 * QF-20260725-244: isAutoStartableQF() must scan the TIER3_RISK_RE keywords against the
 * DESCRIPTION as well as the TITLE.
 *
 * Live incident: QF-20260725-096 ("Session view is read-only in practice: every action button
 * 401s (fetch calls send no internal-API-key header)") is an auth/security QF whose implied fix
 * shape -- thread the internal API key into the fetch headers of an unauthenticated page --
 * would publish an app-wide admin-bypass secret. It auto-dispatched to a worker anyway, because
 * the gate read the TITLE only: "internal-API-key" contains no word-boundary `auth`, while the
 * DESCRIPTION is saturated with auth / authorization / credential. Verified by executing the
 * real TIER3_RISK_RE against that row: title=false, description=true.
 *
 * scripts/classify-quick-fix.js already gates on DESCRIPTION and FAILS that QF ("Contains
 * forbidden keyword auth", "Contains forbidden keyword authorization"), so description was
 * always the correct surface -- reading the title alone is what let the two surfaces disagree.
 *
 * Same family as the factory_lane incident (see worker-checkin-qf-factory-lane.test.js): a guard
 * predicate reading a narrower surface than the risk actually lives on. That one recurred, hence
 * this regression test.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isAutoStartableQF } = require('../../scripts/worker-checkin.cjs');

const NOW = Date.parse('2026-07-25T13:00:00Z');

function qf(overrides = {}) {
  return {
    id: 'QF-X',
    status: 'open',
    pr_url: null,
    commit_sha: null,
    created_at: '2026-07-25T00:00:00Z',
    routing_tier: null,
    title: 'x',
    description: '',
    severity: 'medium',
    not_before: null,
    factory_lane: false,
    ...overrides,
  };
}

// Verbatim-shaped reproduction of the live row that escaped the gate.
const QF_096_TITLE =
  'Session view is read-only in practice: every action button 401s (fetch calls send no internal-API-key header)';
const QF_096_DESCRIPTION_EXCERPT =
  'server/public/fleet-ui/session-view.js drives four action routes and every one of its fetch() '
  + 'calls is issued with no Authorization and no x-internal-api-key header, so they all 401. '
  + 'Threading the credential into an unauthenticated page would expose requireAuth bypass.';

describe('isAutoStartableQF — TIER3_RISK_RE scans description, not just title', () => {
  it('reproduces the QF-20260725-096 escape: risk words ONLY in the description are still caught', () => {
    const liveShape = qf({
      title: QF_096_TITLE,
      description: QF_096_DESCRIPTION_EXCERPT,
      routing_tier: 1,
      severity: 'high',
    });
    expect(isAutoStartableQF(liveShape, NOW)).toBe(false);
  });

  it('confirms the pre-fix blind spot really was title-only (the title alone carries no risk keyword)', () => {
    // Guards the premise of this fix: if the title ever did match, this test would stop proving
    // anything about the description surface.
    const titleOnly = qf({ title: QF_096_TITLE, description: '' });
    expect(isAutoStartableQF(titleOnly, NOW)).toBe(true);
  });

  it('still excludes when the risk keyword is in the title (pre-existing behavior preserved)', () => {
    expect(isAutoStartableQF(qf({ title: 'fix RLS policy on ventures' }), NOW)).toBe(false);
  });

  it.each([
    ['auth', 'the auth header is dropped'],
    ['authorization', 'missing Authorization on every call'],
    ['credentials', 'rotate the credentials for the sink'],
    ['migration', 'apply the pending migration first'],
    ['schema', 'the schema drifted from the model'],
  ])('excludes when %s appears only in the description', (_kw, description) => {
    expect(isAutoStartableQF(qf({ description }), NOW)).toBe(false);
  });

  it('admits a genuinely low-risk QF whose title and description both lack risk keywords', () => {
    const benign = qf({
      title: 'Typo in the idle-note wording',
      description: 'The idle message says "recieved"; correct the spelling. No behavioral change.',
    });
    expect(isAutoStartableQF(benign, NOW)).toBe(true);
  });

  it('tolerates a missing description (undefined) without throwing or over-blocking', () => {
    const row = qf({ title: 'Typo in the idle-note wording' });
    delete row.description;
    expect(isAutoStartableQF(row, NOW)).toBe(true);
  });
});
