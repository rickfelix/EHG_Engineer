import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  console.log('=== ROUTE AUDIT COMPLETION ANALYSIS ===\n');

  // Get all route audit stages with their status
  const allStages = await client.query(`
    SELECT
      sd.sd_key,
      sd.title,
      sd.status,
      sd.current_phase,
      prd.id as prd_id,
      prd.status as prd_status
    FROM strategic_directives_v2 sd
    LEFT JOIN product_requirements_v2 prd ON prd.sd_id = sd.sd_key
    WHERE sd.sd_key LIKE 'route-audit-stage-%'
    ORDER BY sd.sd_key
  `);

  console.log('All Route Audit Stages:\n');
  allStages.rows.forEach(row => {
    console.log(`${row.sd_key}:`);
    console.log(`  SD Status: ${row.status}`);
    console.log(`  SD Phase: ${row.current_phase}`);
    console.log(`  PRD: ${row.prd_id || 'NOT CREATED'}`);
    console.log(`  PRD Status: ${row.prd_status || 'N/A'}\n`);
  });

  console.log('\n=== SUMMARY ===\n');

  const summary = allStages.rows.reduce((acc, row) => {
    const hasPRD = row.prd_id !== null;
    const isCompleted = row.status === 'completed';

    if (isCompleted && hasPRD) acc.completedWithPRD++;
    else if (isCompleted && !hasPRD) acc.completedWithoutPRD++;
    else if (!isCompleted && hasPRD) acc.draftWithPRD++;
    else acc.draftWithoutPRD++;

    return acc;
  }, { completedWithPRD: 0, completedWithoutPRD: 0, draftWithPRD: 0, draftWithoutPRD: 0 });

  console.log(`Completed WITH PRD: ${summary.completedWithPRD}`);
  console.log(`Completed WITHOUT PRD: ${summary.completedWithoutPRD}`);
  console.log(`Draft WITH PRD: ${summary.draftWithPRD}`);
  console.log(`Draft WITHOUT PRD: ${summary.draftWithoutPRD}`);

  console.log(`\nTotal: ${allStages.rows.length} stages`);

  await client.end();
})();
