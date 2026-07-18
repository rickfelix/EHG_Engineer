/**
 * PC-3: dependency blast-radius via loop_registry.dependency_edges —
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
 *
 * loop_registry.dependency_edges is live but 100% empty across all rows
 * (database/migrations/20260713_loop_registry.sql) and was designed for a different
 * semantic — loop-to-loop closure ordering, not op-co-component dependencies. Per
 * Solomon adjudication ab03cf18, this SD DEFINES a new convention on that same column
 * for op-co components: a loop_registry row with loop_key = `opco:<component>` and
 * dependency_edges = [{component_key, relationship: 'depends_on'}] listing what THAT
 * component depends on.
 *
 * "No flip while a dependent is mid-incident" means: before switching on componentKey,
 * find every OTHER op-co-component row that lists componentKey as a dependency (i.e.
 * componentKey's DEPENDENTS — the reverse direction), and block if any of them is
 * currently mid-incident.
 *
 * loop_registry.status (closed/open/starved/unknown) is a LOOP-CLOSURE state, not an
 * operational-incident state — reusing it here would repeat the exact semantic
 * mismatch this SD documents for dependency_edges itself. There is no existing
 * op-co-component incident source (confirmed at PLAN: exhaustive grep, zero hits), so
 * incident status is caller-injected evidence, same pattern as PC-6's open-incident
 * half. Registering real op-co-A/B/C component rows is sibling D's job — with zero
 * rows present today this check trivially (and correctly) passes.
 *
 * @module lib/switch-automation/prechecks/blast-radius
 */

const OPCO_LOOP_KEY_PREFIX = 'opco:';

function opcoLoopKey(componentKey) {
  return `${OPCO_LOOP_KEY_PREFIX}${componentKey}`;
}

/**
 * @param {Object} supabase - service-role Supabase client
 * @param {string} componentKey - the op-co component being switched on
 * @param {(dependentComponentKey: string) => boolean|null} incidentEvidenceFn - returns
 *   true (mid-incident), false (clear), or null (unknown -> fail closed) for a given
 *   dependent component key. Caller-supplied since no live incident source exists yet.
 * @returns {Promise<{id:string, name:string, passed:boolean, reason:string}>}
 */
export async function checkDependencyBlastRadius(supabase, componentKey, incidentEvidenceFn) {
  const base = { id: 'PC-3', name: 'dependency-blast-radius' };

  let rows;
  try {
    const { data, error } = await supabase
      .from('loop_registry')
      .select('loop_key, dependency_edges')
      .like('loop_key', `${OPCO_LOOP_KEY_PREFIX}%`);
    if (error) throw new Error(error.message);
    rows = data || [];
  } catch (err) {
    return { ...base, passed: false, reason: `query-failed:${err.message}` };
  }

  const selfKey = opcoLoopKey(componentKey);
  const dependents = rows.filter((row) => {
    if (row.loop_key === selfKey) return false;
    const edges = Array.isArray(row.dependency_edges) ? row.dependency_edges : [];
    return edges.some((e) => e && e.component_key === componentKey && e.relationship === 'depends_on');
  });

  if (dependents.length === 0) {
    return { ...base, passed: true, reason: 'no-known-dependents' };
  }

  for (const dep of dependents) {
    const depComponentKey = dep.loop_key.slice(OPCO_LOOP_KEY_PREFIX.length);
    let midIncident;
    try {
      midIncident = typeof incidentEvidenceFn === 'function' ? incidentEvidenceFn(depComponentKey) : null;
    } catch {
      midIncident = null;
    }
    if (midIncident !== false) {
      // true (known incident) or null (unknown) both fail closed.
      return { ...base, passed: false, reason: `dependent-mid-incident:${depComponentKey}` };
    }
  }

  return { ...base, passed: true, reason: 'all-dependents-clear' };
}

export { opcoLoopKey };
export default checkDependencyBlastRadius;
