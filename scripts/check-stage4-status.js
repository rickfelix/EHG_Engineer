const { Client } = require('pg');

async function checkStage4Status() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ehg_engineer'
  });

  try {
    await client.connect();

    // Query 1: Get all Stage 4 SDs with their current status
    console.log('=== STAGE 4 STRATEGIC DIRECTIVES STATUS ===');
    console.log('');
    const sdsResult = await client.query(`
      SELECT
        sd.id,
        sd.sd_id,
        sd.title,
        sd.status,
        sd.epic_id,
        sd.created_at::date as created_date,
        sd.updated_at::date as updated_date,
        COUNT(DISTINCT us.id) as user_story_count,
        COUNT(DISTINCT us.id) FILTER (WHERE us.status = 'completed') as completed_stories
      FROM strategic_directives_v2 sd
      LEFT JOIN user_stories us ON us.sd_id = sd.id
      WHERE sd.sd_id IN (
        'SD-STAGE4-UI-RESTRUCTURE-001',
        'SD-STAGE4-AGENT-PROGRESS-001',
        'SD-STAGE4-RESULTS-DISPLAY-001',
        'SD-STAGE4-ERROR-HANDLING-001'
      )
      GROUP BY sd.id, sd.sd_id, sd.title, sd.status, sd.epic_id, sd.created_at, sd.updated_at
      ORDER BY sd.sd_id
    `);

    sdsResult.rows.forEach(row => {
      console.log('SD: ' + row.sd_id);
      console.log('  Title: ' + row.title);
      console.log('  Status: ' + row.status);
      console.log('  Epic: ' + (row.epic_id || 'None'));
      console.log('  User Stories: ' + row.completed_stories + '/' + row.user_story_count + ' completed');
      console.log('  Created: ' + row.created_date + ', Updated: ' + row.updated_date);
      console.log('');
    });

    // Query 2: Get handoff status for each SD
    console.log('=== HANDOFF STATUS ===');
    console.log('');
    const handoffsResult = await client.query(`
      SELECT
        h.sd_id,
        h.handoff_type,
        h.status,
        h.verdict,
        h.created_at::timestamp as created_at,
        h.summary,
        CASE
          WHEN h.blockers IS NOT NULL AND h.blockers != '[]'
          THEN jsonb_array_length(h.blockers::jsonb)
          ELSE 0
        END as blocker_count
      FROM handoffs h
      WHERE h.sd_id IN (
        'SD-STAGE4-UI-RESTRUCTURE-001',
        'SD-STAGE4-AGENT-PROGRESS-001',
        'SD-STAGE4-RESULTS-DISPLAY-001',
        'SD-STAGE4-ERROR-HANDLING-001'
      )
      ORDER BY h.sd_id, h.created_at DESC
    `);

    const handoffsBySd = {};
    handoffsResult.rows.forEach(row => {
      if (!handoffsBySd[row.sd_id]) {
        handoffsBySd[row.sd_id] = [];
      }
      handoffsBySd[row.sd_id].push(row);
    });

    Object.keys(handoffsBySd).sort().forEach(sdId => {
      console.log(sdId + ':');
      handoffsBySd[sdId].forEach(handoff => {
        console.log('  ' + handoff.handoff_type + ': ' + handoff.status + ' (Verdict: ' + (handoff.verdict || 'N/A') + ')');
        console.log('    Created: ' + handoff.created_at);
        if (handoff.blocker_count > 0) {
          console.log('    ⚠️ Blockers: ' + handoff.blocker_count);
        }
        if (handoff.summary) {
          console.log('    Summary: ' + handoff.summary.substring(0, 100) + '...');
        }
      });
      console.log('');
    });

    // Query 3: Check for validation failures
    console.log('=== VALIDATION STATUS ===');
    console.log('');
    const validationResult = await client.query(`
      SELECT
        sd_id,
        sub_agent_code,
        verdict,
        created_at::timestamp as created_at,
        CASE
          WHEN error_details IS NOT NULL
          THEN substring(error_details::text, 1, 100)
          ELSE NULL
        END as error_snippet
      FROM sub_agent_execution_results
      WHERE sd_id IN (
        'SD-STAGE4-UI-RESTRUCTURE-001',
        'SD-STAGE4-AGENT-PROGRESS-001',
        'SD-STAGE4-RESULTS-DISPLAY-001',
        'SD-STAGE4-ERROR-HANDLING-001'
      )
      AND verdict IN ('BLOCKED', 'FAIL', 'ERROR')
      ORDER BY sd_id, created_at DESC
      LIMIT 10
    `);

    if (validationResult.rows.length > 0) {
      validationResult.rows.forEach(row => {
        console.log(row.sd_id + ':');
        console.log('  Sub-agent: ' + row.sub_agent_code);
        console.log('  Verdict: ' + row.verdict);
        console.log('  Time: ' + row.created_at);
        if (row.error_snippet) {
          console.log('  Error: ' + row.error_snippet + '...');
        }
        console.log('');
      });
    } else {
      console.log('No validation failures found.');
    }

    // Query 4: Check PRD status
    console.log('');
    console.log('=== PRD STATUS ===');
    console.log('');
    const prdResult = await client.query(`
      SELECT
        sd_id,
        status,
        created_at::date as created_date,
        substring(technical_requirements, 1, 100) as tech_req_snippet
      FROM product_requirements_documents
      WHERE sd_id IN (
        'SD-STAGE4-UI-RESTRUCTURE-001',
        'SD-STAGE4-AGENT-PROGRESS-001',
        'SD-STAGE4-RESULTS-DISPLAY-001',
        'SD-STAGE4-ERROR-HANDLING-001'
      )
      ORDER BY sd_id
    `);

    prdResult.rows.forEach(row => {
      console.log(row.sd_id + ':');
      console.log('  PRD Status: ' + row.status);
      console.log('  Created: ' + row.created_date);
      console.log('');
    });

    // Query 5: Summary and recommendations
    console.log('=== IMPLEMENTATION READINESS SUMMARY ===');
    console.log('');

    // Check which SDs are ready for implementation
    const stage4SDs = ['SD-STAGE4-UI-RESTRUCTURE-001', 'SD-STAGE4-AGENT-PROGRESS-001',
                       'SD-STAGE4-RESULTS-DISPLAY-001', 'SD-STAGE4-ERROR-HANDLING-001'];

    for (const sdId of stage4SDs) {
      const sd = sdsResult.rows.find(r => r.sd_id === sdId);
      const handoffs = handoffsBySd[sdId] || [];
      const planExecHandoff = handoffs.find(h => h.handoff_type === 'PLAN_to_EXEC');
      const prd = prdResult.rows.find(r => r.sd_id === sdId);

      console.log(sdId + ':');

      if (!sd) {
        console.log('  ❌ SD not found in database');
      } else if (sd.status === 'completed') {
        console.log('  ✅ COMPLETED - No further action needed');
      } else if (sd.status === 'active' && planExecHandoff && planExecHandoff.status === 'accepted') {
        console.log('  ✅ READY FOR IMPLEMENTATION');
        console.log('     - SD Status: ' + sd.status);
        console.log('     - PLAN→EXEC handoff: accepted');
        console.log('     - PRD: ' + (prd ? prd.status : 'N/A'));
      } else {
        console.log('  ⚠️ NOT READY FOR IMPLEMENTATION');
        console.log('     - SD Status: ' + (sd ? sd.status : 'N/A'));
        console.log('     - PLAN→EXEC handoff: ' + (planExecHandoff ? planExecHandoff.status : 'missing'));
        if (planExecHandoff && planExecHandoff.blocker_count > 0) {
          console.log('     - Has ' + planExecHandoff.blocker_count + ' blockers');
        }
      }
      console.log('');
    }

  } catch (error) {
    console.error('Error checking Stage 4 status:', error.message);
  } finally {
    await client.end();
  }
}

checkStage4Status();