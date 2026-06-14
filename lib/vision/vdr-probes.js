/**
 * SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-1) — VDR typed probe runners.
 *
 * The Vision Denominator Registry (VDR) computes the vision BUILD-completeness gauge by running
 * a TYPED probe per REQUIRED capability against LIVE signals. These runners are the deterministic,
 * no-LLM numerator engine. Each runner is pure + injectable (the supabase client and the code-grep
 * seam are passed in) so the gauge is unit-testable without a live DB and the percentage is never
 * fabricated.
 *
 * Probe result contract — every runner returns:
 *   { status: 'built' | 'partial' | 'unbuilt' | 'unknown', value: <observed>, detail: <string> }
 * 'unknown' means the probe could not be evaluated (e.g. a cross-repo grep when the repo is absent);
 * the gauge EXCLUDES 'unknown' from the denominator and reports the count, so an unprobeable
 * capability is never silently counted as built OR unbuilt (honest, auditable).
 *
 * Probe types:
 *   - kr_status:     a key_results row (by `code`) — built when achieved / current>=target.
 *   - db_count:      COUNT(table [+ filter]) vs a threshold — builtWhen 'gte' (present) or 'absent' (==0).
 *   - row_predicate: at least one row matches a filter — builtWhen 'exists' or 'absent'.
 *   - code_grep:     a regex matches under a repo path — builtWhen 'present' or 'absent'.
 */

export const VALID_STATUSES = ['built', 'partial', 'unbuilt', 'unknown'];

/** kr_status: read key_results by `code`. built when status='achieved' OR current>=target; partial when current>0 (and target>0). */
export async function krStatusProbe(def, io) {
  const supabase = io && io.supabase;
  if (!supabase) return { status: 'unknown', value: null, detail: 'no supabase client' };
  try {
    const { data, error } = await supabase
      .from('key_results')
      .select('code,status,current_value,target_value')
      .eq('code', def.code)
      .maybeSingle();
    if (error) return { status: 'unknown', value: null, detail: `kr query error: ${error.message}` };
    if (!data) return { status: 'unknown', value: null, detail: `KR ${def.code} not found` };
    const cur = Number(data.current_value);
    const tgt = Number(data.target_value);
    const met = data.status === 'achieved' || (Number.isFinite(cur) && Number.isFinite(tgt) && tgt > 0 && cur >= tgt);
    if (met) return { status: 'built', value: data.status, detail: `${def.code} ${data.status} (${cur}/${tgt})` };
    if (Number.isFinite(cur) && cur > 0) return { status: 'partial', value: cur, detail: `${def.code} in progress (${cur}/${tgt})` };
    return { status: 'unbuilt', value: cur, detail: `${def.code} ${data.status} (${cur}/${tgt})` };
  } catch (e) {
    return { status: 'unknown', value: null, detail: `kr probe threw: ${e.message}` };
  }
}

/** db_count: COUNT(table [+ eq filter]) vs threshold. builtWhen 'gte' (>=min ⇒ built) or 'absent' (==0 ⇒ built). */
export async function dbCountProbe(def, io) {
  const supabase = io && io.supabase;
  if (!supabase) return { status: 'unknown', value: null, detail: 'no supabase client' };
  try {
    let q = supabase.from(def.table).select('*', { count: 'exact', head: true });
    if (def.filter && typeof def.filter === 'object') {
      for (const [k, v] of Object.entries(def.filter)) q = q.eq(k, v);
    }
    const { count, error } = await q;
    if (error) return { status: 'unknown', value: null, detail: `count error on ${def.table}: ${error.message}` };
    const n = Number(count) || 0;
    if (def.builtWhen === 'absent') {
      return { status: n === 0 ? 'built' : 'unbuilt', value: n, detail: `${def.table} count=${n} (built when 0)` };
    }
    const min = Number.isFinite(def.min) ? def.min : 1;
    return { status: n >= min ? 'built' : 'unbuilt', value: n, detail: `${def.table} count=${n} (built when >=${min})` };
  } catch (e) {
    return { status: 'unknown', value: null, detail: `db_count threw: ${e.message}` };
  }
}

/** row_predicate: does >=1 row match the eq filter? builtWhen 'exists' (default) or 'absent'. */
export async function rowPredicateProbe(def, io) {
  const supabase = io && io.supabase;
  if (!supabase) return { status: 'unknown', value: null, detail: 'no supabase client' };
  try {
    let q = supabase.from(def.table).select('*', { count: 'exact', head: true });
    if (def.filter && typeof def.filter === 'object') {
      for (const [k, v] of Object.entries(def.filter)) q = q.eq(k, v);
    }
    const { count, error } = await q;
    if (error) return { status: 'unknown', value: null, detail: `predicate error on ${def.table}: ${error.message}` };
    const exists = (Number(count) || 0) > 0;
    const builtWhenAbsent = def.builtWhen === 'absent';
    const built = builtWhenAbsent ? !exists : exists;
    return { status: built ? 'built' : 'unbuilt', value: Number(count) || 0, detail: `${def.table} exists=${exists} (built when ${builtWhenAbsent ? 'absent' : 'exists'})` };
  } catch (e) {
    return { status: 'unknown', value: null, detail: `row_predicate threw: ${e.message}` };
  }
}

/** code_grep: does `pattern` match under repoRoot/<path>? builtWhen 'present' (default) or 'absent'.
 *  io.grep(pattern, absPath) MUST return { matched: boolean, accessible: boolean }. If the path is not
 *  accessible (e.g. the cross-repo ehg checkout is absent) the probe is 'unknown' (never guessed). */
export async function codeGrepProbe(def, io) {
  const grep = io && io.grep;
  if (typeof grep !== 'function') return { status: 'unknown', value: null, detail: 'no grep seam' };
  try {
    const res = await grep(def.pattern, def.path, def.repo || 'EHG_Engineer');
    if (!res || res.accessible === false) {
      return { status: 'unknown', value: null, detail: `path not accessible: ${def.repo || ''}/${def.path}` };
    }
    const builtWhenAbsent = def.builtWhen === 'absent';
    const built = builtWhenAbsent ? !res.matched : res.matched;
    return { status: built ? 'built' : 'unbuilt', value: !!res.matched, detail: `grep /${def.pattern}/ in ${def.repo || ''}/${def.path} matched=${!!res.matched} (built when ${builtWhenAbsent ? 'absent' : 'present'})` };
  } catch (e) {
    return { status: 'unknown', value: null, detail: `code_grep threw: ${e.message}` };
  }
}

export const PROBE_RUNNERS = {
  kr_status: krStatusProbe,
  db_count: dbCountProbe,
  row_predicate: rowPredicateProbe,
  code_grep: codeGrepProbe,
};

/** Run one probe def by type. Unknown type ⇒ 'unknown' (never fabricated). */
export async function runProbe(def, io) {
  const runner = PROBE_RUNNERS[def && def.type];
  if (!runner) return { status: 'unknown', value: null, detail: `unknown probe type: ${def && def.type}` };
  const r = await runner(def, io || {});
  if (!r || !VALID_STATUSES.includes(r.status)) {
    return { status: 'unknown', value: null, detail: 'probe returned invalid status' };
  }
  return r;
}

