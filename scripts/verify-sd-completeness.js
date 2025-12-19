import { createDatabaseClient } from './lib/supabase-connection.js';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  try {
    // Query SD with safer field checks
    const result = await client.query(`
      SELECT
        id,
        title,
        description,
        current_phase as phase,
        category as track,
        priority,
        key_principles,
        risks,
        key_changes,
        success_criteria,
        dependencies,
        rationale,
        scope,
        category
      FROM strategic_directives_v2
      WHERE id = 'SD-HARDENING-V2-001';
    `);

    const sd = result.rows[0];

    // Safe array length checks
    const principlesCount = sd.key_principles ? (Array.isArray(sd.key_principles) ? sd.key_principles.length : 1) : 0;
    const risksCount = sd.risks ? (Array.isArray(sd.risks) ? sd.risks.length : 1) : 0;
    const changesCount = sd.key_changes ? (Array.isArray(sd.key_changes) ? sd.key_changes.length : 1) : 0;
    const criteriaCount = sd.success_criteria ? (Array.isArray(sd.success_criteria) ? sd.success_criteria.length : 1) : 0;

    // Calculate completeness
    let fields = 0;
    let present = 0;

    const checks = [
      ['Title', sd.title && sd.title !== ''],
      ['Description', sd.description && sd.description !== ''],
      ['Success Criteria', criteriaCount > 0],
      ['Key Principles', principlesCount > 0],
      ['Key Changes', changesCount > 0],
      ['Risks', risksCount > 0],
      ['Dependencies', sd.dependencies !== null],
      ['Rationale', sd.rationale && sd.rationale !== ''],
      ['Scope', sd.scope && sd.scope !== ''],
      ['Category', sd.category !== null]
    ];

    checks.forEach(([name, isPresent]) => {
      fields++;
      if (isPresent) present++;
    });

    const completeness = (present / fields * 100).toFixed(1);

    console.log('📊 SD-HARDENING-V2-001 Completeness Report');
    console.log('═══════════════════════════════════════════════');
    console.log('Title:', sd.title);
    console.log('Phase:', sd.phase || 'Not set');
    console.log('Track:', sd.track);
    console.log('Priority:', sd.priority);
    console.log('');
    console.log('📈 Completeness:', completeness + '%', '(' + present + '/' + fields, 'fields)');
    console.log('');
    console.log('📋 Field Status:');
    checks.forEach(([name, isPresent]) => {
      console.log('  ' + (isPresent ? '✅' : '❌') + ' ' + name);
    });
    console.log('');
    console.log('📦 Array Counts:');
    console.log('  Key Principles:', principlesCount, 'items');
    console.log('  Risks:', risksCount, 'items');
    console.log('  Key Changes:', changesCount, 'items');
    console.log('  Success Criteria:', criteriaCount, 'items');
    console.log('');

    if (completeness >= 90) {
      console.log('✅ SD meets 90% completeness threshold');
      console.log('✅ Ready for LEAD→PLAN handoff');
    } else {
      console.log('⚠️  SD at', completeness + '%', '- needs 90% for handoff');
      console.log('');
      console.log('Missing fields:');
      checks.forEach(([name, isPresent]) => {
        if (!isPresent) console.log('  -', name);
      });
    }

  } catch (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
