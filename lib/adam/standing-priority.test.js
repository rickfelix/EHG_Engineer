/**
 * SD-LEO-INFRA-ADAM-DURABLE-STANDING-001 — tests for the durable standing priority.
 *
 * The load-bearing test here is TS-4 (the allowlist), not TS-3 (the token). TS-3 alone stays GREEN
 * while the token is emitted-but-invisible to the operator prompt, which is precisely the regression
 * shape this SD exists to avoid — so the allowlist is asserted separately, against the file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  SETTINGS_KEY, TABLE, SOURCES, classifyServed, isRoadmapAnchored,
  readStandingPriority, setStandingPriority, clearStandingPriority, evaluateStandingPriority,
} from './standing-priority.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Minimal supabase double: the chairman_dashboard_config row + strategic_directives_v2.
 *
 * IT MODELS THE REAL ROW, INCLUDING SIBLING METADATA KEYS. The previous double accepted any write
 * to any table, which kept this suite green while the designed store (system_settings) was in fact
 * refusing every insert on a CHECK constraint. A double that cannot refuse cannot falsify — so this
 * one carries real sibling keys, and a test below asserts they survive.
 */
function makeStore({ settingsRow = null, sds = [], failRead = false, siblings = { claim_ttl_minutes: 15 } } = {}) {
  let metadata = { ...siblings };
  if (settingsRow) metadata.adam_standing_priority = settingsRow;
  return {
    get metadata() { return metadata; },
    from(table) {
      if (table === 'chairman_dashboard_config') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => failRead
                    ? { data: null, error: { message: 'boom' } }
                    : { data: { id: 'cfg-1', metadata }, error: null },
                };
              },
            };
          },
          update(patch) {
            return { eq: async () => { metadata = patch.metadata; return { error: null }; } };
          },
        };
      }
      // strategic_directives_v2 — .select().in().in()
      return {
        select() {
          return {
            in(_c1, keys) {
              return {
                in: async (_c2, statuses) => ({
                  data: sds.filter((s) => keys.includes(s.sd_key) && statuses.includes(s.status)),
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };
}

const ROADMAP_PRIORITY = {
  priority_id: 'p1', title: 'Ship the sessions view', source: 'roadmap',
  roadmap_evidence: { wave_id: 'W3' }, linked_sd_keys: ['SD-A', 'SD-B'],
  set_at: '2026-08-02T00:00:00.000Z', set_by: 'chairman',
};

describe('TS-1 persistence — written in one call, read back through another', () => {
  it('round-trips through the store, not through an in-memory value', async () => {
    const sb = makeStore();
    await setStandingPriority(sb, ROADMAP_PRIORITY);
    const { priority, unknown } = await readStandingPriority(sb);
    expect(unknown).toBe(false);
    expect(priority.priority_id).toBe('p1');
    expect(priority.source).toBe('roadmap');
    expect(priority.linked_sd_keys).toEqual(['SD-A', 'SD-B']);
  });

  it('setting REPLACES rather than accumulating (upsert on the natural key)', async () => {
    const sb = makeStore();
    await setStandingPriority(sb, ROADMAP_PRIORITY);
    await setStandingPriority(sb, { ...ROADMAP_PRIORITY, priority_id: 'p2', title: 'Something else' });
    const { priority } = await readStandingPriority(sb);
    expect(priority.priority_id).toBe('p2');
  });

  it('rejects an unknown source rather than storing unclassifiable provenance', async () => {
    const sb = makeStore();
    await expect(setStandingPriority(sb, { ...ROADMAP_PRIORITY, source: 'whatever' })).rejects.toThrow(/source must be one of/);
  });

  it('MERGES — sibling fleet knobs in the shared metadata blob survive a set and a clear', async () => {
    // claim_ttl_minutes drives claimGuard's TTL on the claim hot path. Dropping it would be the
    // damage that actually matters, and a replace-instead-of-merge bug is invisible without this.
    const sb = makeStore({ siblings: { claim_ttl_minutes: 15, claim_gate_version_floor: 3 } });
    await setStandingPriority(sb, ROADMAP_PRIORITY);
    expect(sb.metadata.claim_ttl_minutes).toBe(15);
    expect(sb.metadata.claim_gate_version_floor).toBe(3);
    await clearStandingPriority(sb);
    expect(sb.metadata.claim_ttl_minutes).toBe(15);
    expect(sb.metadata.adam_standing_priority).toBeUndefined();
  });

  it('clearing an absent priority is a no-op, not an error', async () => {
    const sb = makeStore();
    await expect(clearStandingPriority(sb)).resolves.toBe(true);
  });

  it('names the store that the live database actually accepts', () => {
    // system_settings was the designed store and is REFUSED by CHECK valid_setting_keys (a closed
    // three-key enum). Pinned so the refuted choice cannot silently return.
    expect(TABLE).toBe('chairman_dashboard_config');
    expect(SETTINGS_KEY).toBe('adam_standing_priority');
  });
});

describe('TS-3 THE DISCRIMINATOR — unserved is not the same as nothing to do', () => {
  it('no priority set yields status none (a genuine no-op)', () => {
    expect(classifyServed(null, []).status).toBe('none');
  });

  it('a priority with nothing routed into it yields status unserved', () => {
    expect(classifyServed(ROADMAP_PRIORITY, []).status).toBe('unserved');
  });

  it('a priority with linked work actually moving yields status served', () => {
    const r = classifyServed(ROADMAP_PRIORITY, ['SD-B']);
    expect(r.status).toBe('served');
    expect(r.servedBy).toEqual(['SD-B']);
  });

  it('in-flight work that is NOT linked to the priority does not serve it', () => {
    // The exact silent-hours shape: the fleet is busy, but busy on something else.
    expect(classifyServed(ROADMAP_PRIORITY, ['SD-UNRELATED']).status).toBe('unserved');
  });

  it('a priority linking no SDs at all is unserved, never served-by-default', () => {
    expect(classifyServed({ ...ROADMAP_PRIORITY, linked_sd_keys: [] }, ['SD-A']).status).toBe('unserved');
  });

  it('end-to-end through the store: the two idle states produce DIFFERENT statuses', async () => {
    const empty = await evaluateStandingPriority(makeStore());
    const set = await evaluateStandingPriority(makeStore({ settingsRow: ROADMAP_PRIORITY, sds: [] }));
    expect(empty.status).toBe('none');
    expect(set.status).toBe('unserved');
    expect(empty.status).not.toBe(set.status);
  });
});

describe('TS-4 THE ALLOWLIST — the token must be actionable, not merely printed', () => {
  const startupCheck = readFileSync(resolve(REPO_ROOT, 'scripts/adam-startup-check.mjs'), 'utf8');
  const tick = readFileSync(resolve(REPO_ROOT, 'scripts/adam-quiet-tick.mjs'), 'utf8');

  it('QUIET_TICK_STANDING_PRIORITY_UNSERVED is named in the NO-OP gate token list', () => {
    // Without this, the token is emitted but the operator prompt reads the tick as "nothing to do"
    // — the fix would be exactly as invisible as the defect. This assertion is the requirement.
    const gate = startupCheck.match(/If the output contains NO ([^,]+) lines, this turn is a NO-OP/);
    expect(gate).not.toBeNull();
    expect(gate[1]).toContain('QUIET_TICK_STANDING_PRIORITY_UNSERVED');
  });

  it('carries an act-on instruction, not just a bare token name', () => {
    expect(startupCheck).toMatch(/QUIET_TICK_STANDING_PRIORITY_UNSERVED means a standing priority is SET/);
  });

  it('the tick actually emits the token it allowlists', () => {
    expect(tick).toContain('QUIET_TICK_STANDING_PRIORITY_UNSERVED=adam');
  });

  it('the informational served token is deliberately NOT allowlisted', () => {
    const gate = startupCheck.match(/If the output contains NO ([^,]+) lines, this turn is a NO-OP/);
    expect(gate[1]).not.toContain('QUIET_TICK_STANDING_PRIORITY=');
  });
});

describe('TS-2 ORDERING — the priority is surfaced above the inbox', () => {
  const tick = readFileSync(resolve(REPO_ROOT, 'scripts/adam-quiet-tick.mjs'), 'utf8');

  it('emits the standing-priority line before the inbox item loop', () => {
    // Asserted on POSITION, because presence was never the failure — a priority printed beneath a
    // dozen inbound rows has been filed, not surfaced.
    const priorityAt = tick.indexOf('QUIET_TICK_STANDING_PRIORITY_UNSERVED=adam');
    const inboxAt = tick.indexOf('for (const i of inboxSurface.items)');
    expect(priorityAt).toBeGreaterThan(-1);
    expect(inboxAt).toBeGreaterThan(-1);
    expect(priorityAt).toBeLessThan(inboxAt);
  });
});

describe('TS-5 OVERRIDE — first-class, and still distinguishable in the record', () => {
  it('a chairman override is stored with its own source, not laundered into roadmap', async () => {
    const sb = makeStore();
    await setStandingPriority(sb, ROADMAP_PRIORITY);
    await setStandingPriority(sb, {
      priority_id: 'p9', title: 'Emergent: fix the belt', source: 'chairman_override',
      linked_sd_keys: ['SD-Z'], set_by: 'chairman',
    });
    const { priority } = await readStandingPriority(sb);
    expect(priority.source).toBe('chairman_override');
    expect(priority.priority_id).toBe('p9');
    // Distinguishable: an override is not roadmap-anchored, and never claims to be.
    expect(isRoadmapAnchored(priority)).toBe(false);
  });

  it('SOURCES keeps the two kinds enumerable and distinct', () => {
    expect(SOURCES).toEqual(['roadmap', 'chairman_override']);
  });
});

describe('TS-6 LINKAGE — borrowed from work-selection-gate, never re-derived', () => {
  const src = readFileSync(resolve(REPO_ROOT, 'lib/adam/standing-priority.js'), 'utf8');

  it('imports isPlanLinked rather than defining a rival predicate', () => {
    expect(src).toMatch(/import \{ isPlanLinked \} from '\.\/work-selection-gate\.js'/);
  });

  it('defines no second roadmap marker list', () => {
    expect(src).not.toContain('ROADMAP_MARKERS =');
    expect(src).not.toContain('wave_disposition');
  });

  it('honours on-the-row roadmap evidence', () => {
    expect(isRoadmapAnchored({ roadmap_evidence: { wave_id: 'W3' } })).toBe(true);
    expect(isRoadmapAnchored({ roadmap_evidence: { roadmap_item_id: 'R1' } })).toBe(true);
  });

  it('still refuses a self-asserted roadmap claim', () => {
    // isPlanLinked's contract: evidence ON THE ROW, never inferred from a self-assertion.
    expect(isRoadmapAnchored({ roadmap_evidence: { says_its_roadmap: true } })).toBe(false);
    expect(isRoadmapAnchored({ roadmap_evidence: {} })).toBe(false);
    expect(isRoadmapAnchored(null)).toBe(false);
  });
});

describe('TS-7 BOUNDARY — the gate acquires no ranking authority', () => {
  const gateSrc = readFileSync(resolve(REPO_ROOT, 'lib/adam/work-selection-gate.js'), 'utf8');

  it('work-selection-gate still declares its non-authority', () => {
    expect(gateSrc).toContain('It does not\n * block, reorder or veto: ranking authority stays where it is.');
  });

  it('work-selection-gate does not import the standing priority (no inversion of control)', () => {
    expect(gateSrc).not.toContain('standing-priority');
  });

  it('evaluateWorkSelection still returns its advisory shape', async () => {
    const { evaluateWorkSelection } = await import('./work-selection-gate.js');
    const r = evaluateWorkSelection([{ sd_key: 'SD-A', metadata: { wave_id: 'W1' } }]);
    expect(Object.keys(r).sort()).toEqual(['checks', 'evaluations', 'reasons', 'verdict']);
    expect(['pass', 'warn']).toContain(r.verdict);
  });
});

describe('TS-8 FAIL-QUIET — a detector never fabricates a pass', () => {
  it('an unreadable store reports unknown, not served', async () => {
    const r = await evaluateStandingPriority(makeStore({ failRead: true }));
    expect(r.status).toBe('unknown');
    expect(r.priority).toBeNull();
  });

  it('readStandingPriority distinguishes "none set" from "could not read"', async () => {
    expect(await readStandingPriority(makeStore())).toEqual({ priority: null, unknown: false });
    expect(await readStandingPriority(makeStore({ failRead: true }))).toEqual({ priority: null, unknown: true });
  });

  it('the tick renders neither none nor unknown (both stay silent)', () => {
    const tick = readFileSync(resolve(REPO_ROOT, 'scripts/adam-quiet-tick.mjs'), 'utf8');
    // Only 'served' and 'unserved' reach a console.log; 'none'/'unknown' fall through silently.
    expect(tick).toMatch(/if \(standing\.status === 'served'\)/);
    expect(tick).toMatch(/else if \(standing\.status === 'unserved'\)/);
    expect(tick).not.toMatch(/standing\.status === 'unknown'\)\s*\{\s*console\.log/);
  });

  it('SETTINGS_KEY is stable — the store location is part of the contract', () => {
    expect(SETTINGS_KEY).toBe('adam_standing_priority');
  });
});
