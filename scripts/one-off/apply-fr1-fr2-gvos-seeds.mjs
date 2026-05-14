#!/usr/bin/env node
/**
 * FR-1 + FR-2: Apply gvos_tokens (_b_seed) then gvos_archetypes (_b_seed).
 * Order matters: tokens MUST seed first because archetypes reference token names.
 *
 * SD-LEO-FEAT-GVOS-ACTIVATION-REMEDIATION-001 / FR-1 + FR-2
 *
 * Acceptance:
 *   - gvos_tokens count >= 31 post FR-1
 *   - gvos_archetypes count == 11 AND SUM(jsonb_array_length(negative_prompt_list)) == 28 post FR-2
 *   - Zero orphan-FK from gvos_archetypes.tokens_required to gvos_tokens.name
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { createDatabaseClient, splitPostgreSQLStatements } from '../lib/supabase-connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const migrations = [
  { fr: 'FR-1', file: path.join(repoRoot, 'database', 'migrations', '20260513_001_gvos_tokens_b_seed.sql') },
  { fr: 'FR-2', file: path.join(repoRoot, 'database', 'migrations', '20260513_002_gvos_archetypes_b_seed.sql') },
];

const client = await createDatabaseClient('ehg', { verify: true });
console.log('Connected to ehg project');

try {
  for (const { fr, file } of migrations) {
    console.log(`\n========== ${fr}: ${path.basename(file)} ==========`);
    const sql = readFileSync(file, 'utf-8');
    const statements = splitPostgreSQLStatements(sql);
    console.log(`Statements: ${statements.length} | SQL length: ${sql.length} chars`);
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i].trim();
      const preview = stmt.slice(0, 80).replace(/\s+/g, ' ');
      process.stdout.write(`[${i + 1}/${statements.length}] ${preview}... `);
      const t0 = Date.now();
      try {
        const r = await client.query(stmt);
        process.stdout.write(`OK (${Date.now() - t0}ms)`);
        if (r && r.command === 'INSERT') process.stdout.write(` rows=${r.rowCount}`);
        process.stdout.write('\n');
      } catch (e) {
        process.stdout.write(`FAIL\n`);
        console.error('Statement:', stmt.slice(0, 400));
        throw e;
      }
    }
    console.log(`${fr} applied.`);
  }

  console.log('\n========== ACCEPTANCE VERIFICATION ==========');
  const tokens = await client.query('SELECT COUNT(*) AS cnt FROM public.gvos_tokens');
  const arch = await client.query(`
    SELECT COUNT(*) AS row_count,
           COALESCE(SUM(jsonb_array_length(negative_prompt_list)), 0) AS prompt_total
    FROM public.gvos_archetypes
  `);
  const orphan = await client.query(`
    SELECT COUNT(*) AS orphan_count
    FROM public.gvos_archetypes a
    CROSS JOIN LATERAL jsonb_array_elements_text(a.tokens_required) AS req(token_name)
    WHERE NOT EXISTS (SELECT 1 FROM public.gvos_tokens t WHERE t.name = req.token_name)
  `);

  const tokenCount = Number(tokens.rows[0].cnt);
  const archCount = Number(arch.rows[0].row_count);
  const promptTotal = Number(arch.rows[0].prompt_total);
  const orphanCount = Number(orphan.rows[0].orphan_count);

  console.log(`gvos_tokens count:      ${tokenCount} (FR-1 target: >= 31, expected exact: 31)`);
  console.log(`gvos_archetypes count:  ${archCount} (FR-2 target: = 11)`);
  console.log(`negative_prompt total:  ${promptTotal} (FR-2 target: = 28)`);
  console.log(`orphan-FK count:        ${orphanCount} (target: = 0)`);

  let pass = true;
  if (tokenCount < 31) { console.error('  ✗ FR-1 FAIL: gvos_tokens < 31'); pass = false; }
  if (archCount !== 11) { console.error('  ✗ FR-2 FAIL: archetype count != 11'); pass = false; }
  if (promptTotal !== 28) { console.error('  ✗ FR-2 FAIL: negative_prompt total != 28'); pass = false; }
  if (orphanCount > 0) { console.error('  ✗ ORPHAN-FK FAIL: tokens_required has unresolved entries'); pass = false; }

  if (pass) {
    console.log('\n✅ FR-1 + FR-2 ACCEPTANCE PASSED');
  } else {
    console.error('\n❌ FR-1 + FR-2 ACCEPTANCE FAILED');
    process.exit(1);
  }
} catch (err) {
  console.error('Migration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  await client.end();
  console.log('Connection closed');
}
