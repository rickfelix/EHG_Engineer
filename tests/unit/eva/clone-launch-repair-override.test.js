/**
 * SD-LEO-INFRA-CLONE-LAUNCH-ENABLES-REPAIR-OVERRIDE-001 (FR-2)
 *
 * Clean-clone launch opts a fresh clone into vision repair via the flag's DESIGNED per-venture override
 * (eva_venture_config key venture:<id>:vision_repair_loop_enabled=true). This test drives the REAL
 * override write (setCloneVisionRepairOverride — the same helper launchCleanClone calls) and the REAL
 * isRepairLoopEnabled read — NOT a mock of the flag (closing the 2nd 'test doesn't exercise the real
 * path' miss). The global kill-switch stays off; real ventures are unaffected.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setCloneVisionRepairOverride } from '../../../lib/eva/clean-clone/launch.js';
import { isRepairLoopEnabled } from '../../../lib/eva/vision-repair-loop.js';

// Faithful in-memory eva_venture_config double: implements exactly the chain isRepairLoopEnabled uses
// (.from('eva_venture_config').select('value').eq('key',K).maybeSingle()) and the helper's upsert.
function makeConfigStore(initial = {}) {
  const rows = new Map(Object.entries(initial)); // key -> boolean value
  return {
    rows,
    from(table) {
      if (table !== 'eva_venture_config') throw new Error(`unexpected table: ${table}`);
      let key = null;
      return {
        select() { return this; },
        eq(col, val) { if (col === 'key') key = val; return this; },
        async maybeSingle() {
          return rows.has(key) ? { data: { value: rows.get(key) }, error: null } : { data: null, error: null };
        },
        async upsert(row) { rows.set(row.key, row.value); return { data: [row], error: null }; },
      };
    },
  };
}

const CLONE = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const silent = { log() {}, warn() {} };
let savedEnv;

beforeEach(() => { savedEnv = process.env.LEO_VISION_REPAIR_LOOP_ENABLED; delete process.env.LEO_VISION_REPAIR_LOOP_ENABLED; });
afterEach(() => { if (savedEnv === undefined) delete process.env.LEO_VISION_REPAIR_LOOP_ENABLED; else process.env.LEO_VISION_REPAIR_LOOP_ENABLED = savedEnv; });

describe('FR-2: clone repair override drives the REAL isRepairLoopEnabled', () => {
  it('TS-1: after the override is set, the REAL isRepairLoopEnabled returns true for the clone (global off)', async () => {
    const sb = makeConfigStore({ vision_repair_loop_enabled: false }); // global kill-switch OFF
    const wrote = await setCloneVisionRepairOverride(sb, CLONE, silent);
    expect(wrote).toBe(true);
    expect(sb.rows.get(`venture:${CLONE}:vision_repair_loop_enabled`)).toBe(true);
    // REAL predicate (not mocked)
    expect(await isRepairLoopEnabled({ supabase: sb, ventureId: CLONE })).toBe(true);
    // global stays false
    expect(sb.rows.get('vision_repair_loop_enabled')).toBe(false);
  });

  it('TS-2: a venture NOT launched via clean-clone is unaffected (real isRepairLoopEnabled false)', async () => {
    const sb = makeConfigStore({ vision_repair_loop_enabled: false });
    await setCloneVisionRepairOverride(sb, CLONE, silent);
    expect(await isRepairLoopEnabled({ supabase: sb, ventureId: OTHER })).toBe(false);
  });

  it('TS-3: the override helper is idempotent (re-run => still one row, still enabled)', async () => {
    const sb = makeConfigStore({ vision_repair_loop_enabled: false });
    await setCloneVisionRepairOverride(sb, CLONE, silent);
    await setCloneVisionRepairOverride(sb, CLONE, silent);
    const overrideRows = [...sb.rows.keys()].filter((k) => k === `venture:${CLONE}:vision_repair_loop_enabled`);
    expect(overrideRows).toHaveLength(1);
    expect(await isRepairLoopEnabled({ supabase: sb, ventureId: CLONE })).toBe(true);
  });

  it('TS-4: a config-write error is non-fatal (helper returns false, does not throw)', async () => {
    const erroringSb = { from: () => ({ upsert: async () => ({ data: null, error: { message: 'boom' } }) }) };
    await expect(setCloneVisionRepairOverride(erroringSb, CLONE, silent)).resolves.toBe(false);
  });

  it('guards: missing supabase / ventureId => false, no throw', async () => {
    expect(await setCloneVisionRepairOverride(null, CLONE, silent)).toBe(false);
    expect(await setCloneVisionRepairOverride(makeConfigStore(), '', silent)).toBe(false);
  });

  it('an explicit per-venture OFF override still beats the (off) global, and the clone override is independent', async () => {
    const sb = makeConfigStore({ vision_repair_loop_enabled: false, [`venture:${OTHER}:vision_repair_loop_enabled`]: false });
    await setCloneVisionRepairOverride(sb, CLONE, silent);
    expect(await isRepairLoopEnabled({ supabase: sb, ventureId: CLONE })).toBe(true);   // clone opted in
    expect(await isRepairLoopEnabled({ supabase: sb, ventureId: OTHER })).toBe(false);  // explicit off
  });
});
