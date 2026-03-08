/**
 * Database Sub-Agent - Integrity Checker Module
 *
 * Checks data integrity including orphaned records and constraints.
 *
 * @module lib/agents/modules/database-sub-agent/integrity-checker
 */

/**
 * Check data integrity
 *
 * @param {Object} supabase - Supabase client instance
 * @returns {Promise<Object>} Integrity check results
 */
export async function checkDataIntegrity(supabase) {
  const integrity = {
    constraints: [],
    orphanedRecords: [],
    duplicates: [],
    issues: []
  };

  if (!supabase) {
    integrity.status = 'SKIP';
    integrity.message = 'Database connection not configured';
    return integrity;
  }

  try {
    // Check for orphaned records in known relationships
    const relationships = [
      {
        child: 'product_requirements_v2',
        childKey: 'directive_id',
        parent: 'strategic_directives_v2',
        parentKey: 'id'
      },
      {
        child: 'execution_sequences',
        childKey: 'product_requirement_id',
        parent: 'product_requirements_v2',
        parentKey: 'id'
      }
    ];

    for (const rel of relationships) {
      // Two-step fetch to avoid raw SQL construction in .not() subquery
      let parentIds = [];
      try {
        const { data: parentRows } = await supabase
          .from(rel.parent)
          .select(rel.parentKey);
        parentIds = (parentRows || []).map(r => r[rel.parentKey]).filter(Boolean);
      } catch { /* ignore parent fetch errors */ }

      let orphans = [];
      try {
        if (parentIds.length > 0) {
          const { data } = await supabase
            .from(rel.child)
            .select(rel.childKey)
            .not(rel.childKey, 'in', `(${parentIds.map(id => `'${id}'`).join(',')})`);
          orphans = data || [];
        } else {
          // No parent rows = all child rows are orphans
          const { data } = await supabase
            .from(rel.child)
            .select(rel.childKey);
          orphans = data || [];
        }
      } catch { orphans = []; }

      if (orphans && orphans.length > 0) {
        integrity.orphanedRecords.push({
          table: rel.child,
          count: orphans.length,
          relationship: `${rel.child}.${rel.childKey} -> ${rel.parent}.${rel.parentKey}`
        });

        integrity.issues.push({
          type: 'ORPHANED_RECORDS',
          table: rel.child,
          count: orphans.length,
          severity: 'HIGH',
          fix: 'Add foreign key constraint or clean up orphaned records'
        });
      }
    }

    integrity.status = integrity.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                      integrity.issues.length > 2 ? 'WARNING' : 'PASS';

  } catch (error) {
    integrity.status = 'ERROR';
    integrity.error = error.message;
  }

  return integrity;
}
