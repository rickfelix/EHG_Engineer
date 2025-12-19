#!/usr/bin/env node
import { createDatabaseClient } from './lib/supabase-connection.js';

const sdId = process.argv[2] || 'SD-HARDENING-V2-001A';

(async () => {
  const client = await createDatabaseClient('engineer', { verify: false });

  const verifySQL = `
    SELECT
      id,
      title,
      status,
      parent_sd_id,
      key_principles,
      key_changes,
      risks,
      metadata->'exploration_files' as exploration_files,
      metadata->'explored_at' as explored_at,
      created_at,
      updated_at
    FROM strategic_directives_v2
    WHERE id = $1;
  `;

  const result = await client.query(verifySQL, [sdId]);

  if (result.rows.length === 0) {
    console.log(`❌ No SD found with id ${sdId}`);
    process.exit(1);
  }

  const sd = result.rows[0];
  console.log(`📋 ${sdId} Handoff Readiness Check\n`);
  console.log('✅ ID:', sd.id);
  console.log('✅ Title:', sd.title);
  console.log('✅ Status:', sd.status);
  console.log('✅ Parent SD ID:', sd.parent_sd_id || 'None (standalone)');
  console.log('');

  console.log('📚 Key Principles:', sd.key_principles ? sd.key_principles.length : 0, 'items');
  if (sd.key_principles) {
    sd.key_principles.forEach((p, i) => console.log(`   ${i+1}. ${p}`));
  }
  console.log('');

  console.log('🔧 Key Changes:', sd.key_changes ? sd.key_changes.length : 0, 'items');
  if (sd.key_changes) {
    sd.key_changes.forEach((c, i) => console.log(`   ${i+1}. ${c}`));
  }
  console.log('');

  console.log('⚠️  Risks:', sd.risks ? sd.risks.length : 0, 'items');
  if (sd.risks) {
    sd.risks.forEach((r, i) => console.log(`   ${i+1}. ${r.risk} (severity: ${r.severity})`));
  }
  console.log('');

  console.log('📂 Exploration Files:', sd.exploration_files ? sd.exploration_files.length : 0, 'files');
  if (sd.exploration_files) {
    sd.exploration_files.forEach((f, i) => console.log(`   ${i+1}. ${f.path}`));
  }
  console.log('');

  console.log('🕒 Explored At:', sd.explored_at || 'Not set');
  console.log('');

  // Check readiness
  const hasKeyPrinciples = sd.key_principles && sd.key_principles.length > 0;
  const hasKeyChanges = sd.key_changes && sd.key_changes.length > 0;
  const hasRisks = sd.risks && sd.risks.length > 0;
  const hasExplorationFiles = sd.exploration_files && sd.exploration_files.length > 0;
  const hasExploredAt = Boolean(sd.explored_at);

  const isReady = hasKeyPrinciples && hasKeyChanges && hasRisks && hasExplorationFiles && hasExploredAt;

  console.log('🎯 Handoff Readiness:');
  console.log(`   ${hasKeyPrinciples ? '✅' : '❌'} hasKeyPrinciples`);
  console.log(`   ${hasKeyChanges ? '✅' : '❌'} hasKeyChanges`);
  console.log(`   ${hasRisks ? '✅' : '❌'} hasRisks`);
  console.log(`   ${hasExplorationFiles ? '✅' : '❌'} hasExplorationFiles`);
  console.log(`   ${hasExploredAt ? '✅' : '❌'} hasExploredAt`);
  console.log('');

  if (isReady) {
    console.log(`✅ ${sdId} is READY for LEAD-TO-PLAN handoff`);
  } else {
    console.log(`❌ ${sdId} is NOT ready - missing required fields`);
    process.exit(1);
  }

  await client.end();
})();
