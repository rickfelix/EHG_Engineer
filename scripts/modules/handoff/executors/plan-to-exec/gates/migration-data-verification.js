/**
 * Migration Data Verification Gate
 * SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-A
 *
 * GATE_MIGRATION_DATA_VERIFICATION: After migration executes, queries target table(s)
 * to confirm rows were inserted. BLOCKING for sd_type=database, ADVISORY for others.
 * Fixes GAP-001 (SDs missing from DB after successful migration).
 */

const BLOCKING_SD_TYPES = ['database'];

/**
 * Create the GATE_MIGRATION_DATA_VERIFICATION gate validator
 *
 * @param {Object} supabase - Supabase client instance
 * @returns {Object} Gate configuration
 */
export function createMigrationDataVerificationGate(supabase) {
  return {
    name: 'GATE_MIGRATION_DATA_VERIFICATION',
    validator: async (ctx) => {
      console.log('\n🔍 GATE: Migration Data Verification (GAP-001 Prevention)');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || 'feature';
      const sdId = ctx.sd?.id || ctx.sdId;
      const isBlocking = BLOCKING_SD_TYPES.includes(sdType);

      console.log(`   SD Type: ${sdType} (${isBlocking ? 'BLOCKING' : 'ADVISORY'})`);

      try {
        // Step 1: Find migrations associated with this SD
        const migrations = await findSdMigrations(supabase, sdId, ctx.sd?.sd_key);

        if (migrations.length === 0) {
          console.log('   ℹ️  No migrations found for this SD');
          return {
            passed: true,
            score: 100,
            maxScore: 100,
            issues: [],
            warnings: ['No migrations found - gate not applicable'],
            details: { migrationCount: 0, sdType, mode: 'skip' }
          };
        }

        console.log(`   📋 Found ${migrations.length} migration(s)`);

        // Step 2: Verify each migration's data was applied
        const results = [];
        for (const migration of migrations) {
          const result = await verifyMigrationData(supabase, migration);
          results.push(result);
          const icon = result.verified ? '✅' : '❌';
          console.log(`   ${icon} ${migration.name}: ${result.message}`);
        }

        const allVerified = results.every(r => r.verified);
        const verifiedCount = results.filter(r => r.verified).length;

        if (allVerified) {
          console.log(`\n   ✅ All ${migrations.length} migration(s) verified`);
          return {
            passed: true,
            score: 100,
            maxScore: 100,
            issues: [],
            warnings: [],
            details: {
              migrationCount: migrations.length,
              verifiedCount,
              sdType,
              mode: isBlocking ? 'blocking' : 'advisory',
              results
            }
          };
        }

        // Some migrations not verified
        const failedMigrations = results.filter(r => !r.verified);
        const issues = failedMigrations.map(r =>
          `Migration ${r.name} data not verified: ${r.message}`
        );

        if (isBlocking) {
          console.log(`\n   ❌ BLOCKING: ${failedMigrations.length} migration(s) failed verification`);
          return {
            passed: false,
            score: 0,
            maxScore: 100,
            issues: [
              `BLOCKING: ${failedMigrations.length}/${migrations.length} migration(s) failed data verification`,
              ...issues
            ],
            warnings: [],
            details: {
              migrationCount: migrations.length,
              verifiedCount,
              failedCount: failedMigrations.length,
              sdType,
              mode: 'blocking',
              results
            }
          };
        }

        // Advisory mode - pass with warnings
        console.log(`\n   ⚠️  ADVISORY: ${failedMigrations.length} migration(s) not verified`);
        return {
          passed: true,
          score: Math.round((verifiedCount / migrations.length) * 100),
          maxScore: 100,
          issues: [],
          warnings: [
            `${failedMigrations.length}/${migrations.length} migration(s) not verified (advisory)`,
            ...issues
          ],
          details: {
            migrationCount: migrations.length,
            verifiedCount,
            failedCount: failedMigrations.length,
            sdType,
            mode: 'advisory',
            results
          }
        };

      } catch (error) {
        console.log(`\n   ⚠️  Gate error: ${error.message}`);
        return {
          passed: !isBlocking,
          score: isBlocking ? 0 : 50,
          maxScore: 100,
          issues: isBlocking ? [`Gate error: ${error.message}`] : [],
          warnings: isBlocking ? [] : [`Gate error (advisory): ${error.message}`],
          details: { error: error.message, sdType, mode: isBlocking ? 'blocking' : 'advisory' }
        };
      }
    },
    required: true,
    weight: 1.0
  };
}

/**
 * Find migration files associated with an SD
 */
async function findSdMigrations(supabase, sdId, sdKey) {
  const migrations = [];

  // Check for migration records in the database
  try {
    const { data } = await supabase
      .from('sd_phase_handoffs')
      .select('metadata')
      .eq('sd_id', sdId)
      .eq('handoff_type', 'PLAN-TO-EXEC')
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.metadata?.migrations) {
      for (const m of data.metadata.migrations) {
        migrations.push({
          name: m.name || m.file || 'unknown',
          tables: m.tables || m.target_tables || [],
          expectedRows: m.expected_rows || m.row_count || null
        });
      }
    }
  } catch {
    // Migration metadata not available - proceed with filesystem check
  }

  // Also check for migration files by SD key pattern
  if (migrations.length === 0 && sdKey) {
    try {
      const { data: deliverables } = await supabase
        .from('sd_deliverables')
        .select('title, metadata')
        .eq('sd_id', sdId)
        .ilike('title', '%migration%');

      if (deliverables) {
        for (const d of deliverables) {
          if (d.metadata?.target_tables) {
            migrations.push({
              name: d.title,
              tables: d.metadata.target_tables,
              expectedRows: d.metadata.expected_rows || null
            });
          }
        }
      }
    } catch {
      // Deliverables not available
    }
  }

  return migrations;
}

/**
 * Verify that migration data exists in target tables
 */
async function verifyMigrationData(supabase, migration) {
  if (!migration.tables || migration.tables.length === 0) {
    return {
      name: migration.name,
      verified: true,
      message: 'No target tables specified - skipped'
    };
  }

  const tableResults = [];
  for (const table of migration.tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        tableResults.push({
          table,
          exists: false,
          count: 0,
          error: error.message
        });
      } else {
        tableResults.push({
          table,
          exists: true,
          count: count || 0
        });
      }
    } catch (err) {
      tableResults.push({
        table,
        exists: false,
        count: 0,
        error: err.message
      });
    }
  }

  const allExist = tableResults.every(t => t.exists);
  const hasData = tableResults.some(t => t.count > 0);

  if (!allExist) {
    const missing = tableResults.filter(t => !t.exists).map(t => t.table);
    return {
      name: migration.name,
      verified: false,
      message: `Tables not found: ${missing.join(', ')}`,
      tableResults
    };
  }

  if (migration.expectedRows !== null && !hasData) {
    return {
      name: migration.name,
      verified: false,
      message: `Expected rows in ${migration.tables.join(', ')} but found none`,
      tableResults
    };
  }

  return {
    name: migration.name,
    verified: true,
    message: `Verified: ${tableResults.map(t => `${t.table}(${t.count} rows)`).join(', ')}`,
    tableResults
  };
}
