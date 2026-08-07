/**
 * Census of eva_vision_scores rubric signatures.
 *
 * FULL PAGINATION, not a capped fetch. A .limit(N) followed by client-side grouping
 * measures N, not the population — recorded failure mode.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const PAGE = 500;

(async () => {
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );

  const { count: expected, error: cErr } = await sb
    .from('eva_vision_scores').select('*', { count: 'exact', head: true });
  if (cErr) throw new Error('count failed: ' + cErr.message);

  const sigCounts = new Map();   // signature -> { n, dimCount, example, snapshotRubrics:Set }
  let seen = 0;

  for (let from = 0; from < expected; from += PAGE) {
    const { data, error } = await sb
      .from('eva_vision_scores')
      .select('id, sd_id, total_score, dimension_scores, rubric_snapshot')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`page ${from} failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      seen++;
      const ds = row.dimension_scores;
      let sig, dimCount;
      if (!ds || typeof ds !== 'object' || Array.isArray(ds)) {
        sig = `<non-object:${ds === null ? 'null' : typeof ds}>`;
        dimCount = 0;
      } else {
        const keys = Object.keys(ds).sort();
        dimCount = keys.length;
        sig = keys.join(',');
      }
      let rec = sigCounts.get(sig);
      if (!rec) {
        rec = { n: 0, dimCount, example: row.id, rubrics: new Set(), modes: new Set(), withRubricKey: 0 };
        sigCounts.set(sig, rec);
      }
      rec.n++;
      // REPORT rubric AND mode SEPARATELY. The first version of this census used
      // `rs.rubric || rs.mode`, which is the very conflation it exists to detect: it
      // reported mode values in a column labelled rubric, making 'sd-heal' look like a
      // rubric identifier spanning six incompatible dimension counts.
      const rs = row.rubric_snapshot;
      if (rs && typeof rs === 'object' && !Array.isArray(rs)) {
        if (typeof rs.rubric === 'string' && rs.rubric) { rec.rubrics.add(rs.rubric); rec.withRubricKey++; }
        else rec.rubrics.add('<no-rubric-key>');
        rec.modes.add(typeof rs.mode === 'string' && rs.mode ? rs.mode : '<no-mode-key>');
      } else if (typeof rs === 'string') {
        rec.rubrics.add('<string-snapshot>'); rec.modes.add('<string-snapshot>');
      } else {
        rec.rubrics.add('<absent>'); rec.modes.add('<absent>');
      }
    }
  }

  // FALSIFY THE CENSUS: if pagination silently dropped rows, say so rather than
  // reporting a clean-looking total that measured less than the population.
  console.log(`expected=${expected} seen=${seen} ${seen === expected ? 'OK' : '*** MISMATCH — census is INCOMPLETE ***'}`);
  console.log(`distinct dimension-key signatures = ${sigCounts.size}`);
  console.log('');

  const rows = [...sigCounts.entries()].sort((a, b) => b[1].n - a[1].n);
  let totalWithRubric = 0;
  for (const [, rec] of rows) totalWithRubric += rec.withRubricKey;
  console.log(`rows carrying an explicit rubric_snapshot.rubric = ${totalWithRubric} / ${expected} ` +
              `(${((totalWithRubric / expected) * 100).toFixed(1)}%)`);
  console.log('');

  for (const [sig, rec] of rows.slice(0, 12)) {
    const shown = sig.length > 80 ? sig.slice(0, 80) + '…' : sig;
    console.log(
      `n=${String(rec.n).padStart(5)}  dims=${String(rec.dimCount).padStart(3)}  ` +
      `rubricKey=${rec.withRubricKey}\n` +
      `        rubric=[${[...rec.rubrics].join('|')}]\n` +
      `        mode  =[${[...rec.modes].join('|')}]\n` +
      `        keys  =[${shown}]`
    );
  }

  // THE DECIDING QUESTION for FR-1: does any single mode label span DIFFERENT dimension
  // counts? If so, mode cannot serve as the rubric discriminator the PRD assumes exists.
  //
  // COUNTED PER ROW. The first version accumulated per SIGNATURE — for each signature it
  // credited the signature's FULL row count to every mode appearing anywhere in it, so a
  // signature holding one 'sd-heal-batch' row reported all 2537 against that mode. The
  // qualitative spread was real; the numbers were inflated. Attribution is not fixed by
  // fixing the instrument that produced it, so this is a separate pass over rows.
  console.log('\n=== does mode discriminate the rubric? (per-ROW cross-tab) ===');
  const modeDimRows = new Map();
  for (let from = 0; from < expected; from += PAGE) {
    const { data, error } = await sb
      .from('eva_vision_scores')
      .select('dimension_scores, rubric_snapshot')
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`crosstab page ${from} failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      const ds = row.dimension_scores;
      const d = (ds && typeof ds === 'object' && !Array.isArray(ds)) ? Object.keys(ds).length : -1;
      const rs = row.rubric_snapshot;
      let m;
      if (rs && typeof rs === 'object' && !Array.isArray(rs)) m = (typeof rs.mode === 'string' && rs.mode) ? rs.mode : '<no-mode-key>';
      else if (typeof rs === 'string') m = '<string-snapshot>';
      else m = '<absent>';
      if (!modeDimRows.has(m)) modeDimRows.set(m, new Map());
      const dm = modeDimRows.get(m);
      dm.set(d, (dm.get(d) || 0) + 1);
    }
  }
  for (const [m, dm] of [...modeDimRows.entries()].sort((a, b) => b[1].size - a[1].size)) {
    const tot = [...dm.values()].reduce((a, b) => a + b, 0);
    const spread = [...dm.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d}d:${n}`).join(' ');
    console.log(`mode='${m}' n=${tot} spans ${dm.size} distinct dimension count(s) -> ${spread}`);
  }
})().catch(e => { console.error('CENSUS FAILED:', e.message); process.exit(1); });
