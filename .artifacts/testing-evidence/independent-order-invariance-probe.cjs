/* INDEPENDENT verification by the TESTING sub-agent (not the author's tests).
   Target: the "shadow-mode never changes live order" safety property of
   SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-B. */
const assert = require('assert');
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', error: e.message }); }
}
async function checkAsync(name, fn) {
  try { await fn(); results.push({ name, status: 'PASS' }); }
  catch (e) { results.push({ name, status: 'FAIL', error: e.message }); }
}

const SL = require('../../lib/priority/shadow-logger.cjs');
const { shadowCompareAndLog } = SL;
const okClient = () => ({ from: () => ({ insert: async () => ({ error: null }) }) });

(async () => {
  // P1: shadowCompareAndLog must NEVER throw SYNCHRONOUSLY. A sync throw at call site 3 would
  // trip sortByDispatchRank's `catch { return items }` and silently return the UNSORTED array.
  check('P1a no sync throw when keyOf throws', () => {
    const r = shadowCompareAndLog({ items: [{}], keyOf: () => { throw new Error('boom'); },
      scoreInputsOf: () => ({}), liveOrder: ['a'], callSite: 'p', entityType: 'sd' });
    assert.ok(r instanceof Promise, 'must return a Promise, not throw');
  });
  check('P1b no sync throw when scoreInputsOf throws', () => {
    const r = shadowCompareAndLog({ items: [{}], keyOf: () => 'a',
      scoreInputsOf: () => { throw new Error('boom'); }, liveOrder: ['a'], callSite: 'p', entityType: 'sd' });
    assert.ok(r instanceof Promise);
  });
  check('P1c no sync throw with NO arguments at all', () => {
    assert.ok(shadowCompareAndLog() instanceof Promise);
  });
  check('P1d no sync throw when items is not an array', () => {
    assert.ok(shadowCompareAndLog({ items: 'nope', keyOf: () => 'a',
      scoreInputsOf: () => ({}), liveOrder: [] }) instanceof Promise);
  });

  // P2: the returned promise must NEVER reject.
  await checkAsync('P2a promise never rejects when insert throws', async () => {
    const c = { from: () => ({ insert: async () => { throw new Error('db down'); } }) };
    const out = await shadowCompareAndLog({ items: [{ k: 'a' }, { k: 'b' }], keyOf: (x) => x.k,
      scoreInputsOf: (x) => ({ age: x.k === 'a' ? 1 : 99 }),
      liveOrder: ['a', 'b'], callSite: 'p', entityType: 'sd', client: c });
    assert.ok(out && typeof out === 'object');
  });
  await checkAsync('P2b promise never rejects when client.from throws', async () => {
    const c = { from: () => { throw new Error('client exploded'); } };
    await shadowCompareAndLog({ items: [{ k: 'a' }, { k: 'b' }], keyOf: (x) => x.k,
      scoreInputsOf: (x) => ({ age: x.k === 'a' ? 1 : 99 }), liveOrder: ['a', 'b'],
      callSite: 'p', entityType: 'sd', client: c });
  });

  // P3: must NEVER mutate the caller's items/liveOrder arrays. Call site 2 passes the SAME
  // reference on to withheldFilteredQfs; call site 3 RETURNS the same reference.
  await checkAsync('P3a items array not mutated after await', async () => {
    const items = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];
    const snapOrder = items.map((x) => x.k);
    const snapRefs = items.slice();
    const liveOrder = ['a', 'b', 'c'];
    const liveSnap = liveOrder.slice();
    await shadowCompareAndLog({ items, keyOf: (x) => x.k,
      scoreInputsOf: (x) => ({ age: { a: 1, b: 500, c: 50 }[x.k] }),
      liveOrder, callSite: 'p', entityType: 'sd', client: okClient() });
    assert.deepStrictEqual(items.map((x) => x.k), snapOrder, 'items REORDERED');
    assert.deepStrictEqual(items, snapRefs, 'items element identity changed');
    assert.deepStrictEqual(liveOrder, liveSnap, 'liveOrder mutated');
  });
  check('P3b frozen items array survives (proves no in-place sort)', () => {
    const items = Object.freeze([{ k: 'a' }, { k: 'b' }]);
    assert.ok(shadowCompareAndLog({ items, keyOf: (x) => x.k,
      scoreInputsOf: (x) => ({ age: x.k === 'a' ? 1 : 99 }), liveOrder: ['a', 'b'],
      callSite: 'p', entityType: 'sd', client: okClient() }) instanceof Promise);
  });

  // P4: kill switch (FR-2 AC-3).
  await checkAsync('P4 kill switch off means skipped and client never touched', async () => {
    process.env.PRIORITY_SHADOW_COMPARATOR = 'off';
    let touched = false;
    const out = await shadowCompareAndLog({ items: [{ k: 'a' }], keyOf: (x) => x.k,
      scoreInputsOf: () => ({ age: 1 }), liveOrder: ['a'], callSite: 'p', entityType: 'sd',
      client: { from: () => { touched = true; return { insert: async () => ({ error: null }) }; } } });
    delete process.env.PRIORITY_SHADOW_COMPARATOR;
    assert.strictEqual(out.skipped, true);
    assert.strictEqual(touched, false, 'client touched despite kill switch');
  });

  // P5: REAL call site 3 order IDENTICAL with shadow ENABLED vs DISABLED (FR-2 AC-3, live fn).
  const wc = require('../../scripts/worker-checkin.cjs');
  const mkSb = (rows) => ({ from: () => ({ select: () => ({ in: async () => ({ data: rows }) }) }) });
  const rows = [
    { sd_key: 'SD-A', priority: 'low', metadata: {} },
    { sd_key: 'SD-B', priority: 'critical', metadata: {} },
    { sd_key: 'SD-C', priority: 'high', metadata: { fleet_critical: true } },
    { sd_key: 'SD-D', priority: 'medium', metadata: { dispatch_rank: 1, dispatch_rank_at: new Date().toISOString() } },
  ];
  const pool = () => [{ sd_key: 'SD-A' }, { sd_key: 'SD-B' }, { sd_key: 'SD-C' }, { sd_key: 'SD-D' }];
  await checkAsync('P5a sortByDispatchRank order identical shadow ON vs OFF', async () => {
    delete process.env.PRIORITY_SHADOW_COMPARATOR;
    const on = await wc.sortByDispatchRank(mkSb(rows), pool(), (x) => x.sd_key);
    process.env.PRIORITY_SHADOW_COMPARATOR = 'off';
    const off = await wc.sortByDispatchRank(mkSb(rows), pool(), (x) => x.sd_key);
    delete process.env.PRIORITY_SHADOW_COMPARATOR;
    assert.deepStrictEqual(on.map((x) => x.sd_key), off.map((x) => x.sd_key),
      'ON=' + on.map((x) => x.sd_key) + ' OFF=' + off.map((x) => x.sd_key));
    assert.deepStrictEqual(on.map((x) => x.sd_key), ['SD-C', 'SD-D', 'SD-B', 'SD-A']);
  });
  await checkAsync('P5b sortByDispatchRank early-return returns SAME array reference', async () => {
    const items = pool();
    const out = await wc.sortByDispatchRank(mkSb([]), items, (x) => x.sd_key);
    assert.strictEqual(out, items, 'early-return identity broken by shadow wiring');
  });

  // P6: call site 2 pattern - the array handed to shadow is the SAME one passed to withheldFilteredQfs.
  await checkAsync('P6 QF severity order survives the shadow call (call site 2 pattern)', async () => {
    const qfs = [
      { id: 'QF-1', severity: 'low', created_at: '2026-01-01' },
      { id: 'QF-2', severity: 'critical', created_at: '2026-01-02' },
      { id: 'QF-3', severity: 'medium', created_at: '2026-01-03' },
    ];
    const severityOrdered = wc.sortQfCandidatesBySeverity(qfs);
    const before = severityOrdered.map((q) => q.id);
    await shadowCompareAndLog({ items: severityOrdered, keyOf: (q) => q && q.id,
      scoreInputsOf: (q) => ({ criticality: { critical: 10, high: 7, medium: 4, low: 1 }[q && q.severity],
        age: (Date.now() - Date.parse(q.created_at)) / 86400000 }),
      liveOrder: severityOrdered.map((q) => q && q.id), callSite: 'p', entityType: 'qf',
      client: okClient() });
    assert.deepStrictEqual(severityOrdered.map((q) => q.id), before, 'QF array reordered by shadow');
  });

  // P7: call site 1 pattern (coordinator-backlog-rank.mjs) - NO repo test covers this call site.
  await checkAsync('P7 coordinator claimable array untouched by the exact call-site block', async () => {
    const claimable = [
      { sd_key: 'SD-1', created_at: '2025-01-01T00:00:00Z' },
      { sd_key: 'SD-2', created_at: '2026-08-01T00:00:00Z' },
      { sd_key: 'SD-3', created_at: '2024-06-01T00:00:00Z' },
    ];
    const before = claimable.map((d) => d.sd_key);
    const unlockScore = (k) => ({ 'SD-1': 5, 'SD-2': 0, 'SD-3': 1 }[k]);
    let inserted = null;
    await shadowCompareAndLog({
      items: claimable, keyOf: (d) => d.sd_key,
      scoreInputsOf: (d) => ({ leverage: unlockScore(d.sd_key),
        age: Number.isFinite(new Date(d.created_at).getTime())
          ? (Date.now() - new Date(d.created_at).getTime()) / 86400000 : undefined }),
      liveOrder: claimable.map((d) => d.sd_key),
      callSite: 'coordinator-backlog-rank.mjs:363', entityType: 'sd',
      client: { from: () => ({ insert: async (r) => { inserted = r; return { error: null }; } }) },
    });
    assert.deepStrictEqual(claimable.map((d) => d.sd_key), before, 'coordinator claimable REORDERED');
    results.push({ status: 'INFO',
      name: 'P7-observation: coordinator wrote ' + (inserted ? inserted.length : 0) + ' of 3 items as disagreements' });
  });

  // P8: audit_log row shape matches FR-3 exactly.
  await checkAsync('P8 audit_log row shape matches FR-3', async () => {
    let rows2 = null;
    await shadowCompareAndLog({ items: [{ k: 'a' }, { k: 'b' }], keyOf: (x) => x.k,
      scoreInputsOf: (x) => ({ age: x.k === 'a' ? 1 : 99 }), liveOrder: ['a', 'b'],
      callSite: 'cs:1', entityType: 'sd',
      client: { from: (t) => { assert.strictEqual(t, 'audit_log', 'wrong table');
        return { insert: async (r) => { rows2 = r; return { error: null }; } }; } } });
    assert.ok(rows2 && rows2.length > 0, 'no disagreement rows written');
    const r = rows2[0];
    assert.strictEqual(r.event_type, 'priority_shadow_disagreement');
    assert.strictEqual(r.entity_type, 'sd');
    assert.ok('live_rank' in r.old_value && 'live_neighbor_keys' in r.old_value);
    assert.ok('shadow_rank' in r.new_value && 'shadow_score' in r.new_value && 'components' in r.new_value);
    assert.ok(r.metadata.comparator_version, 'missing comparator_version');
    assert.strictEqual(r.metadata.call_site, 'cs:1');
    assert.strictEqual(r.severity, 'info');
  });

  const failed = results.filter((r) => r.status === 'FAIL');
  const graded = results.filter((r) => r.status !== 'INFO');
  console.log(JSON.stringify({ probe: 'independent-order-invariance',
    total: graded.length, passed: graded.filter((r) => r.status === 'PASS').length,
    failed: failed.length, results }, null, 2));
  process.exitCode = failed.length ? 1 : 0;
})();
