/**
 * SD-LEO-INFRA-EVA-CONSULTANT-GENERATOR-001 (FR-3 evidence-floor half, FR-4) —
 * analyzeCrossVentureReuse(): stopword-excluded evidence floor + venture-status grounding.
 *
 * TS-5/TS-6/TS-7: the generator recommended cross-venture reuse involving SCRAPPED ventures
 * (CronGenius, DataDistill) because it never checked venture status. This tests the new
 * grounding gate: suppress on a confirmed cancelled venture (case-insensitively), and
 * safely no-op (never suppress, never error) when a named entity isn't a venture at all
 * (e.g. platform repos EHG_Engineer/EHG).
 *
 * Also covers the evidence-floor half of FR-3: a stopword-only keyword overlap (the
 * generic engineering vocabulary Solomon's sweep cited -- "implement, changes,
 * description, details, update, add, status, before") must never reach the >=3
 * overlap threshold on its own.
 */
import { describe, it, expect } from 'vitest';
import { analyzeCrossVentureReuse } from '../../../scripts/eva/consultant-analysis-round.mjs';

function mockClient({ ventures = [], sds = [] } = {}) {
  return {
    from: (table) => {
      if (table === 'ventures') {
        let filtered = ventures;
        const builder = {
          select: () => builder,
          ilike: (col, pattern) => {
            filtered = filtered.filter((r) => String(r[col]).toLowerCase() === String(pattern).toLowerCase());
            return builder;
          },
          in: (col, vals) => {
            filtered = filtered.filter((r) => vals.includes(r[col]));
            return builder;
          },
          order: () => builder,
          limit: (n) => Promise.resolve({ data: filtered.slice(0, n), error: null }),
        };
        return builder;
      }
      if (table === 'strategic_directives_v2') {
        const builder = {
          select: () => builder,
          eq: () => builder,
          gte: () => builder,
          limit: (n) => Promise.resolve({ data: sds.slice(0, n), error: null }),
        };
        return builder;
      }
      throw new Error(`mockClient: unexpected table ${table}`);
    },
  };
}

// 5 filler SDs so the `sds.length >= 5` early-return guard doesn't short-circuit before
// the real fixtures are evaluated (the analyzer requires >=5 total completed SDs).
function filler(n, targetApplication) {
  return Array.from({ length: n }, (_, i) => ({
    id: `filler-${targetApplication}-${i}`,
    sd_key: `SD-FILLER-${targetApplication}-${i}`,
    title: 'filler',
    key_changes: [],
    success_criteria: [],
    target_application: targetApplication,
  }));
}

const REAL_KEYWORDS = 'webhook scheduler notification pipeline throttle';

function sdWithChanges(app, text) {
  return {
    id: `sd-${app}`,
    sd_key: `SD-${app}-001`,
    title: `${app} work`,
    key_changes: [{ change: text }],
    success_criteria: [],
    target_application: app,
  };
}

describe('analyzeCrossVentureReuse — evidence floor (FR-3)', () => {
  it('a stopword-only keyword overlap never reaches the >=3 overlap threshold', async () => {
    const stopwordText = 'implement changes description details update add status before';
    const client = mockClient({
      sds: [
        sdWithChanges('AppOne', stopwordText),
        sdWithChanges('AppTwo', stopwordText),
        ...filler(3, 'AppThree'),
      ],
    });
    const findings = await analyzeCrossVentureReuse(client);
    expect(findings).toEqual([]);
  });

  it('a genuine domain-specific keyword overlap (non-stopword) IS flagged when no venture is involved', async () => {
    const client = mockClient({
      sds: [
        sdWithChanges('EHG_Engineer', REAL_KEYWORDS),
        sdWithChanges('EHG', REAL_KEYWORDS),
        ...filler(3, 'Other'),
      ],
    });
    const findings = await analyzeCrossVentureReuse(client);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].domain).toBe('cross_venture_reuse');
  });
});

describe('analyzeCrossVentureReuse — venture-status grounding (FR-4)', () => {
  it('TS-5: suppresses a recommendation naming a cancelled venture', async () => {
    const client = mockClient({
      ventures: [{ id: 'v-crongenius', name: 'CronGenius', status: 'cancelled', created_at: '2026-01-01' }],
      sds: [
        sdWithChanges('CronGenius', REAL_KEYWORDS),
        sdWithChanges('EHG_Engineer', REAL_KEYWORDS),
        ...filler(3, 'Other'),
      ],
    });
    const findings = await analyzeCrossVentureReuse(client);
    expect(findings.some((f) => f.title.includes('CronGenius'))).toBe(false);
  });

  it('TS-6: suppresses even when the finding names a case-variant of the live venture name ("datadistill" vs "DataDistill")', async () => {
    const client = mockClient({
      ventures: [{ id: 'v-datadistill', name: 'DataDistill', status: 'cancelled', created_at: '2026-01-01' }],
      sds: [
        sdWithChanges('datadistill', REAL_KEYWORDS),
        sdWithChanges('EHG_Engineer', REAL_KEYWORDS),
        ...filler(3, 'Other'),
      ],
    });
    const findings = await analyzeCrossVentureReuse(client);
    expect(findings.some((f) => f.title.toLowerCase().includes('datadistill'))).toBe(false);
  });

  it('TS-7: a non-venture platform-repo pairing (EHG_Engineer/EHG) is a safe no-op -- emitted normally, not suppressed', async () => {
    const client = mockClient({
      ventures: [], // no ventures row for either name
      sds: [
        sdWithChanges('EHG_Engineer', REAL_KEYWORDS),
        sdWithChanges('EHG', REAL_KEYWORDS),
        ...filler(3, 'Other'),
      ],
    });
    const findings = await analyzeCrossVentureReuse(client);
    expect(findings.some((f) => f.title.includes('EHG_Engineer') && f.title.includes('EHG'))).toBe(true);
  });

  it('a recommendation naming an ACTIVE venture is emitted normally (not suppressed)', async () => {
    const client = mockClient({
      ventures: [{ id: 'v-active', name: 'ActiveVenture', status: 'active', created_at: '2026-01-01' }],
      sds: [
        sdWithChanges('ActiveVenture', REAL_KEYWORDS),
        sdWithChanges('EHG_Engineer', REAL_KEYWORDS),
        ...filler(3, 'Other'),
      ],
    });
    const findings = await analyzeCrossVentureReuse(client);
    expect(findings.some((f) => f.title.includes('ActiveVenture'))).toBe(true);
  });
});
