/**
 * venture_defect_class — ratified finding-code taxonomy for venture-application defects.
 *
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-4)
 *
 * Sibling to gap-class.js's GAP_CLASS, deliberately kept as a SEPARATE taxonomy rather than
 * an added GAP_CLASS value. GAP_CLASS's 8 ratified values (gap-class.js) describe FACTORY
 * instrument pathologies (a gate that cannot fail, a resolver that lies) and are pinned at
 * exactly 8 entries by gap-class.test.js -- extending it to also cover "the venture's own
 * checkout button is broken" would conflate two structurally different failure domains under
 * one taxonomy whose ratified provenance is factory-only (see gap-class.js's own doc-block).
 * A UAT gate failure must be classified as ONE of these two taxonomies, never both, so a
 * root-fix SD (factory) and a venture fix (venture) are never confused for one another.
 */

export const VENTURE_DEFECT_CLASS = Object.freeze({
  /** A journey step failed against the venture's own live application behavior. */
  APPLICATION_BEHAVIOR_DEFECT: 'APPLICATION_BEHAVIOR_DEFECT',
  /** The venture's rendered content/copy/data was wrong, missing, or stale. */
  CONTENT_DATA_DEFECT: 'CONTENT_DATA_DEFECT',
  /** The venture failed to integrate correctly with an external or LEO-provided service. */
  INTEGRATION_FAILURE: 'INTEGRATION_FAILURE',
});

/** @param {string} value @returns {boolean} */
export function isRatifiedVentureDefectClass(value) {
  return Object.values(VENTURE_DEFECT_CLASS).includes(value);
}

export default { VENTURE_DEFECT_CLASS, isRatifiedVentureDefectClass };
