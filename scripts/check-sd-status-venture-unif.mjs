/**
 * Quick SD Status Check for SD-VENTURE-UNIFICATION-001
 * LEO Protocol v4.3.0
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkStatus() {
  console.log('🔍 Checking SD-VENTURE-UNIFICATION-001 Status...\n');

  // Initialize connection (PostgreSQL client, not Supabase)
  const client = await createDatabaseClient();
  if (!client) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }

  const sdId = 'SD-VENTURE-UNIFICATION-001';

  try {
    // Query SD status
    const sdResult = await client.query(
      `SELECT id, title, status, current_phase, progress_percentage
       FROM strategic_directives_v2
       WHERE id = $1`,
      [sdId]
    );

    if (sdResult.rows.length === 0) {
      console.error('❌ SD not found:', sdId);
      process.exit(1);
    }

    const sd = sdResult.rows[0];
    console.log('=== STRATEGIC DIRECTIVE ===');
    console.log(`ID: ${sd.id}`);
    console.log(`Title: ${sd.title}`);
    console.log(`Status: ${sd.status}`);
    console.log(`Phase: ${sd.current_phase}`);
    console.log(`Progress: ${sd.progress_percentage}%`);

    // Query handoffs
    const handoffsResult = await client.query(
      `SELECT from_phase, to_phase, status, created_at
       FROM sd_phase_handoffs
       WHERE sd_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [sdId]
    );

    if (handoffsResult.rows.length > 0) {
      console.log('\n=== RECENT HANDOFFS ===');
      handoffsResult.rows.forEach(h => {
        const date = new Date(h.created_at).toISOString().split('T')[0];
        console.log(`${h.from_phase}→${h.to_phase} (${h.status}) - ${date}`);
      });
    }

    // Query PRD research confidence
    const prdResult = await client.query(
      `SELECT research_confidence_score
       FROM product_requirements_v2
       WHERE sd_id = $1`,
      [sdId]
    );

    console.log('\n=== LEARNING CONTEXT (v4.3.0) ===');
    console.log(`PRD Research Confidence: ${prdResult.rows[0]?.research_confidence_score || 'N/A'}`);

    console.log('\n✅ Status check complete');
  } finally {
    await client.end();
  }
}

checkStatus().catch(console.error);
