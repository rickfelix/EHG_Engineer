import { createDatabaseClient } from './scripts/lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Check ALL handoffs for these SDs, regardless of status
    const handoffsResult = await client.query(`
      SELECT sd_id, handoff_type, status, validation_score, created_at
      FROM sd_phase_handoffs
      WHERE sd_id IN (
        'SD-GENESIS-DATAMODEL-001',
        'SD-GENESIS-E2E-001',
        'SD-GENESIS-PRD-001',
        'SD-GENESIS-RESEARCH-001',
        'SD-GENESIS-STAGE16-17-001',
        'SD-GENESIS-UI-001',
        'SD-GENESIS-UI-002'
      )
      ORDER BY sd_id, created_at DESC
    `);

    console.log('ALL HANDOFFS (including rejected/pending):');
    console.log('='.repeat(80));

    const grouped = {};
    handoffsResult.rows.forEach(h => {
      if (!grouped[h.sd_id]) {
        grouped[h.sd_id] = [];
      }
      grouped[h.sd_id].push(h);
    });

    Object.keys(grouped).sort().forEach(sdId => {
      console.log(`\n${sdId}:`);
      grouped[sdId].forEach(h => {
        const date = new Date(h.created_at).toLocaleString();
        console.log(`  ${h.handoff_type}: ${h.status} (score: ${h.validation_score || 'N/A'}) - ${date}`);
      });
    });

    // Count by type
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 COUNT BY TYPE:');
    const typeCount = {};
    handoffsResult.rows.forEach(h => {
      const key = `${h.handoff_type}:${h.status}`;
      typeCount[key] = (typeCount[key] || 0) + 1;
    });
    Object.keys(typeCount).sort().forEach(key => {
      console.log(`  ${key}: ${typeCount[key]}`);
    });

  } finally {
    await client.end();
  }
})();
