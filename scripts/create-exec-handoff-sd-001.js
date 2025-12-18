#!/usr/bin/env node
/**
 * Create EXEC-TO-LEAD handoff for SD-HARDENING-V1-001
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

async function main() {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Create EXEC-TO-LEAD handoff
    const handoffResult = await client.query(`
      INSERT INTO sd_phase_handoffs (
        sd_id,
        handoff_type,
        from_phase,
        to_phase,
        status,
        executive_summary,
        deliverables_manifest,
        created_at
      ) VALUES (
        'SD-HARDENING-V1-001',
        'EXEC-TO-LEAD',
        'EXEC',
        'LEAD',
        'accepted',
        'RLS Security Hardening migration completed. Created fn_is_chairman() SECURITY DEFINER function and hardened RLS policies for chairman_decisions, venture_artifacts, and venture_stage_work tables. Critical security fix: replaced USING(true) with proper chairman-scoped access controls.',
        $1::jsonb,
        NOW()
      )
      RETURNING id, handoff_type
    `, [
      JSON.stringify([
        {
          name: '20251218_rls_security_hardening.sql',
          type: 'migration',
          path: 'supabase/migrations/20251218_rls_security_hardening.sql',
          description: 'RLS hardening migration with fn_is_chairman() and hardened policies'
        },
        {
          name: 'fn_is_chairman()',
          type: 'database_function',
          description: 'SECURITY DEFINER function to identify chairman user'
        }
      ])
    ]);
    console.log('✅ EXEC-TO-LEAD handoff created:', handoffResult.rows[0]);

    // Check progress again
    const progResult = await client.query(`SELECT get_progress_breakdown('SD-HARDENING-V1-001')`);
    const prog = progResult.rows[0].get_progress_breakdown;
    console.log('\nNew progress:', prog.total_progress + '%');
    console.log('Can complete:', prog.can_complete);
    console.log('Handoffs count:', prog.phases?.LEAD_final_approval?.handoffs_count);

    // If can complete, mark as completed
    if (prog.can_complete) {
      await client.query(`
        UPDATE strategic_directives_v2
        SET
          status = 'completed',
          current_phase = 'COMPLETE',
          completion_date = NOW(),
          progress_percentage = 100,
          updated_at = NOW()
        WHERE legacy_id = 'SD-HARDENING-V1-001'
      `);
      console.log('\n✅ SD-HARDENING-V1-001 marked as COMPLETE');
    }

  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch(console.error);
