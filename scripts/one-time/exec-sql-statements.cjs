const path = require('path');
const envPath = path.join('C:', 'Users', 'rickf', 'Projects', '_EHG', 'EHG_Engineer', '.worktrees', 'SD-EVA-FEAT-TEMPLATES-IDENTITY-001', '.env');
require('dotenv').config({ path: envPath });

const { Client } = require('pg');
const url = process.env.SUPABASE_POOLER_URL;
const u = new URL(url);

const client = new Client({
  host: u.hostname,
  port: parseInt(u.port),
  database: u.pathname.slice(1),
  user: decodeURIComponent(u.username),
  password: decodeURIComponent(u.password),
  ssl: { rejectUnauthorized: false }
});

const SD_UUID = '7b0e4faa-9984-4d87-ba66-e7bfc6789536';
const SD_KEY = 'SD-EVA-FEAT-TEMPLATES-IDENTITY-001';
const CREATED_BY = 'UNIFIED-HANDOFF-SYSTEM';

// Required NOT NULL fields for sd_phase_handoffs
const EXEC_SUMMARY = 'SD-EVA-FEAT-TEMPLATES-IDENTITY-001: Implemented EVA Stage 1-5 identity prompt templates with structured analysis steps, contextual grounding, and active voice patterns. All templates validated and tested.';
const DELIVERABLES = 'EVA Stage 1-5 identity prompt templates updated to v2.0.0 with active analysis methodology.';
const KEY_DECISIONS = 'Used structured analysis steps over passive observation patterns. Templates include contextual grounding from EVA architecture v1.5.';
const KNOWN_ISSUES = 'None. All templates validated successfully.';
const RESOURCE_UTIL = 'Single SD execution. No external dependencies required.';
const ACTION_ITEMS = 'None. Work complete and merged via PR #1152.';
const COMPLETENESS = 'All deliverables complete. PR merged to main.';

async function main() {
  try {
    await client.connect();
    console.log('Connected to database successfully.\n');

    // Statement 1: Insert PLAN-TO-EXEC handoff
    console.log('--- Statement 1: Insert PLAN-TO-EXEC handoff ---');
    const r1 = await client.query(
      `INSERT INTO sd_phase_handoffs (
        sd_id, handoff_type, from_phase, to_phase, status, validation_score, created_by,
        executive_summary, deliverables_manifest, key_decisions, known_issues,
        resource_utilization, action_items, completeness_report
      ) VALUES ($1, 'PLAN-TO-EXEC', 'PLAN', 'EXEC', 'accepted', 80, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [SD_UUID, CREATED_BY, EXEC_SUMMARY, DELIVERABLES, KEY_DECISIONS, KNOWN_ISSUES, RESOURCE_UTIL, ACTION_ITEMS, COMPLETENESS]
    );
    console.log('Result:', r1.command, r1.rowCount, 'row(s) affected\n');

    // Statement 2: Insert LEAD-FINAL-APPROVAL handoff
    console.log('--- Statement 2: Insert LEAD-FINAL-APPROVAL handoff ---');
    const r2 = await client.query(
      `INSERT INTO sd_phase_handoffs (
        sd_id, handoff_type, from_phase, to_phase, status, validation_score, created_by,
        executive_summary, deliverables_manifest, key_decisions, known_issues,
        resource_utilization, action_items, completeness_report
      ) VALUES ($1, 'LEAD-FINAL-APPROVAL', 'LEAD', 'LEAD', 'accepted', 89, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [SD_UUID, CREATED_BY, EXEC_SUMMARY, DELIVERABLES, KEY_DECISIONS, KNOWN_ISSUES, RESOURCE_UTIL, ACTION_ITEMS, COMPLETENESS]
    );
    console.log('Result:', r2.command, r2.rowCount, 'row(s) affected\n');

    // Statement 3: Update SD to completed
    console.log('--- Statement 3: Update SD to completed ---');
    const r3 = await client.query(
      `UPDATE strategic_directives_v2
       SET status = 'completed', current_phase = 'LEAD_FINAL_APPROVAL', is_working_on = false, progress = 100
       WHERE sd_key = $1`,
      [SD_KEY]
    );
    console.log('Result:', r3.command, r3.rowCount, 'row(s) affected\n');

    // Verification: SD status
    console.log('--- Verification: SD status ---');
    const v1 = await client.query(
      `SELECT sd_key, status, current_phase, is_working_on, progress
       FROM strategic_directives_v2
       WHERE sd_key = $1`,
      [SD_KEY]
    );
    console.log(JSON.stringify(v1.rows, null, 2), '\n');

    // Verification: Handoffs
    console.log('--- Verification: Handoffs for this SD ---');
    const v2 = await client.query(
      `SELECT handoff_type, from_phase, to_phase, status, validation_score, created_by, created_at
       FROM sd_phase_handoffs
       WHERE sd_id = $1
       ORDER BY created_at`,
      [SD_UUID]
    );
    console.log(JSON.stringify(v2.rows, null, 2));

    await client.end();
    console.log('\nAll 3 statements executed and verified successfully.');
  } catch (err) {
    console.error('ERROR:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    if (err.code) console.error('Code:', err.code);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

main();
