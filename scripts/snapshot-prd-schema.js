#!/usr/bin/env node
/**
 * SD-FDBK-ENH-SCRIPTS-ADD-PRD-001 FR-1
 *
 * Snapshots product_requirements_v2 schema (information_schema + pg_constraint + pg_trigger)
 * to lib/db-schema/product-requirements-v2.json. The committed JSON is read by
 * scripts/prd/schema-validator.js validatePrdRow() to surface ALL constraint
 * violations together before INSERT — closes 16th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 *
 * Usage:  node scripts/snapshot-prd-schema.js   (writes snapshot, prints counts)
 *         node scripts/snapshot-prd-schema.js --check-drift   (compares to committed JSON)
 *
 * Connection: createDatabaseClient('engineer', { verify: false }) — pooler URL only.
 */
import { createDatabaseClient } from '../lib/supabase-connection.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const TABLE_NAME = 'product_requirements_v2';
const TABLE_REGCLASS = `'${TABLE_NAME}'::regclass`;
const SNAPSHOT_PATH = path.join(process.cwd(), 'lib', 'db-schema', 'product-requirements-v2.json');

// Hand-coded jsonb element-presence rules — DB CHECK constraints reference jsonb_array_length
// but parsing the full SQL expression is brittle. database-agent CAPA #7.
const HAND_CODED_JSONB_SHAPE_RULES = {
  acceptance_criteria: { min_elements: 1 },
  functional_requirements: { min_elements: 3 },
  test_scenarios: { min_elements: 1 },
};

// Trigger function sync_prd_sd_linking fills directive_id from sd_id (or vice versa).
// If BOTH are null/undefined the trigger cannot fill either — must FAIL client-side.
// database-agent CAPA #6.
const CONDITIONAL_TRIGGER_PAIRS = [['directive_id', 'sd_id']];

function classifyCheckConstraint(def) {
  // enum: ANY ((ARRAY[...])::text[])
  if (/=\s*ANY\s*\(\s*\(?\s*ARRAY\[/i.test(def)) return 'enum';
  // jsonb element-presence: jsonb_array_length(...) >= N  OR  (col -> N) IS NOT NULL
  if (/jsonb_array_length\s*\(/i.test(def)) return 'jsonb_element_presence';
  if (/->\s*\d+\)\s+IS NOT NULL/i.test(def)) return 'jsonb_element_presence';
  // numeric range: col >= 0 AND col <= 100  (with optional ::numeric/::int cast)
  if (/>=\s*\(?-?\d/.test(def) && /<=\s*\(?-?\d/.test(def)) return 'range';
  if (/BETWEEN\s+\(?-?\d/i.test(def)) return 'range';
  return 'other';
}

// PG_DRIVER_ARRAY_LITERAL_TRAP (database-agent W2): pg returns PG arrays as
// literal strings like "{a,b,c}". Convert back to JS array.
function normalizePgArrayLiteral(maybe) {
  if (Array.isArray(maybe)) return maybe;
  if (typeof maybe !== 'string') return [];
  if (!maybe.startsWith('{') || !maybe.endsWith('}')) return [];
  const inner = maybe.slice(1, -1);
  if (inner === '') return [];
  return inner.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
}

function parseEnumAllowedValues(def) {
  const m = def.match(/ARRAY\[([^\]]+)\]/);
  if (!m) return null;
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/::[\w\s]+$/, '').replace(/^'|'$/g, ''));
}

function parseRangeBounds(def) {
  // col >= MIN AND col <= MAX (optional parens / numeric/int cast)
  const ge = def.match(/>=\s*\(?(-?\d+(?:\.\d+)?)\)?(?:::\w+)?/);
  const le = def.match(/<=\s*\(?(-?\d+(?:\.\d+)?)\)?(?:::\w+)?/);
  if (ge && le) return { min: parseFloat(ge[1]), max: parseFloat(le[1]) };
  // BETWEEN N AND M
  const bt = def.match(/BETWEEN\s+\(?(-?\d+(?:\.\d+)?)\)?\s+AND\s+\(?(-?\d+(?:\.\d+)?)\)?/i);
  if (bt) return { min: parseFloat(bt[1]), max: parseFloat(bt[2]) };
  return null;
}

async function buildSnapshot() {
  const client = await createDatabaseClient('engineer', { verify: false });
  try {
    const colsRes = await client.query(
      `SELECT ordinal_position, column_name, data_type, character_maximum_length,
              is_nullable, column_default, udt_name
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
       ORDER BY ordinal_position;`,
      [TABLE_NAME]
    );
    const columns = colsRes.rows;

    const checksRes = await client.query(`
      SELECT c.conname AS name,
             pg_get_constraintdef(c.oid) AS definition,
             ARRAY(
               SELECT a.attname FROM unnest(c.conkey) AS k
               JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
             ) AS columns_referenced
      FROM pg_constraint c
      WHERE c.conrelid = ${TABLE_REGCLASS} AND c.contype='c'
      ORDER BY c.conname;
    `);
    const checkConstraintsRaw = checksRes.rows;

    const trigsRes = await client.query(`
      SELECT t.tgname AS name, p.proname AS function_name, p.prosrc AS function_body,
             (t.tgtype & 4)<>0 AS fires_on_insert,
             (t.tgtype & 16)<>0 AS fires_on_update,
             (t.tgtype & 2)<>0 AS fires_before
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = ${TABLE_REGCLASS} AND NOT t.tgisinternal
      ORDER BY t.tgname;
    `);
    const triggers = trigsRes.rows;

    // Trigger-controlled column extraction
    const triggerControlledSet = new Set();
    const assignRegex =
      /NEW\.(?:"([a-zA-Z0-9_]+)"|([a-zA-Z0-9_]+))\s*(?::=|=(?!=))\s*/g;
    for (const trig of triggers) {
      const body = trig.function_body || '';
      let m;
      while ((m = assignRegex.exec(body)) !== null) {
        const col = m[1] || m[2];
        if (col) triggerControlledSet.add(col);
      }
    }
    // Conditional pair members are NOT unconditionally exempt — they must be filled by ONE-OR-OTHER.
    const conditionalPairCols = new Set(CONDITIONAL_TRIGGER_PAIRS.flat());
    const triggerControlledColumns = [...triggerControlledSet]
      .filter((c) => !conditionalPairCols.has(c))
      .sort();

    // Classify check constraints (normalize PG array literal trap)
    const checkConstraints = checkConstraintsRaw.map((cc) => {
      const kind = classifyCheckConstraint(cc.definition);
      let parsed_rule = null;
      if (kind === 'enum') {
        parsed_rule = { allowed_values: parseEnumAllowedValues(cc.definition) };
      } else if (kind === 'range') {
        parsed_rule = parseRangeBounds(cc.definition);
      }
      return {
        name: cc.name,
        definition: cc.definition,
        columns_referenced: normalizePgArrayLiteral(cc.columns_referenced),
        kind,
        parsed_rule,
      };
    });

    const varcharColumns = columns.filter(
      (c) => c.data_type === 'character varying' || c.data_type === 'varchar'
    );
    const notNullNoDefault = columns.filter(
      (c) => c.is_nullable === 'NO' && c.column_default === null
    );
    const jsonbColumns = columns.filter((c) => c.data_type === 'jsonb');

    // Schema-version hash — stable across runs unless schema changes
    const hashSource = JSON.stringify({
      columns: columns.map((c) => ({
        n: c.column_name, t: c.data_type, l: c.character_maximum_length,
        nn: c.is_nullable, d: c.column_default,
      })),
      checks: checkConstraintsRaw.map((c) => ({ n: c.name, d: c.definition })),
      triggers: triggers.map((t) => ({ n: t.name, f: t.function_name })),
    });
    const schema_version = crypto.createHash('sha256').update(hashSource).digest('hex').slice(0, 12);

    return {
      __source: 'scripts/snapshot-prd-schema.js (SD-FDBK-ENH-SCRIPTS-ADD-PRD-001)',
      __warning_do_not_edit_by_hand: 'Regenerate via npm run schema:snapshot:prd',
      schema_version,
      generated_at: new Date().toISOString(),
      table: TABLE_NAME,
      counts: {
        total_columns: columns.length,
        varchar_columns: varcharColumns.length,
        check_constraints: checkConstraints.length,
        not_null_no_default: notNullNoDefault.length,
        jsonb_columns: jsonbColumns.length,
        triggers: triggers.length,
        trigger_controlled_columns: triggerControlledColumns.length,
        conditional_trigger_pairs: CONDITIONAL_TRIGGER_PAIRS.length,
      },
      columns: columns.map((c) => ({
        ordinal_position: c.ordinal_position,
        name: c.column_name,
        data_type: c.data_type,
        character_maximum_length: c.character_maximum_length,
        is_nullable: c.is_nullable === 'YES',
        column_default: c.column_default,
        udt_name: c.udt_name,
      })),
      varchar_columns: varcharColumns.map((c) => ({
        name: c.column_name,
        max_length: c.character_maximum_length,
      })),
      not_null_no_default: notNullNoDefault.map((c) => c.column_name),
      check_constraints: checkConstraints,
      jsonb_columns: jsonbColumns.map((c) => c.column_name),
      hand_coded_jsonb_shape_rules: HAND_CODED_JSONB_SHAPE_RULES,
      triggers: triggers.map((t) => ({
        name: t.name,
        function_name: t.function_name,
        fires_on_insert: t.fires_on_insert,
        fires_on_update: t.fires_on_update,
        fires_before: t.fires_before,
        kind: t.fires_before ? 'BEFORE_MUTATING' : 'AFTER_NON_MUTATING',
      })),
      trigger_controlled_columns: triggerControlledColumns,
      conditional_trigger_pairs: CONDITIONAL_TRIGGER_PAIRS,
    };
  } finally {
    await client.end();
  }
}

async function main() {
  const snapshot = await buildSnapshot();
  const json = JSON.stringify(snapshot, null, 2) + '\n';

  if (process.argv.includes('--check-drift')) {
    if (!fs.existsSync(SNAPSHOT_PATH)) {
      console.error(`❌ DRIFT: snapshot file does not exist at ${SNAPSHOT_PATH}`);
      process.exit(2);
    }
    const committed = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
    const liveCanonical = JSON.parse(json);
    const committedCanonical = JSON.parse(committed);
    if (liveCanonical.schema_version !== committedCanonical.schema_version) {
      console.error(`❌ DRIFT DETECTED: live schema_version=${liveCanonical.schema_version} ≠ committed=${committedCanonical.schema_version}`);
      console.error('   Run: npm run schema:snapshot:prd  to regenerate');
      process.exit(2);
    }
    console.log(`✅ Snapshot in sync (schema_version=${liveCanonical.schema_version})`);
    return;
  }

  const outDir = path.dirname(SNAPSHOT_PATH);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, json, 'utf-8');
  console.log(`✅ Snapshot written: ${SNAPSHOT_PATH}`);
  console.log(`   schema_version: ${snapshot.schema_version}`);
  console.log('   counts:', JSON.stringify(snapshot.counts));
  console.log('   trigger_controlled_columns:', snapshot.trigger_controlled_columns);
  console.log('   conditional_trigger_pairs:', JSON.stringify(snapshot.conditional_trigger_pairs));
}

main().catch((err) => {
  console.error('❌ Snapshot failed:', err.message);
  process.exit(1);
});
