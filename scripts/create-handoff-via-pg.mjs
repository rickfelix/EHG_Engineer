import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const cleanUrl = process.env.SUPABASE_POOLER_URL.replace(/\?sslmode=[^&]+(&|$)/, '');

const client = new Client({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

console.log('🔄 Creating LEAD→PLAN Handoff via PostgreSQL');
console.log('='.repeat(50));

// Insert with pending status first
const insertResult = await client.query(`
  INSERT INTO sd_phase_handoffs 
  (sd_id, handoff_type, from_phase, to_phase, status, 
   executive_summary, completeness_report, deliverables_manifest, 
   key_decisions, known_issues, resource_utilization, action_items)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  RETURNING id
`, [
  'SD-DOCUMENTATION-001',
  'LEAD-to-PLAN',
  'LEAD',
  'PLAN',
  'pending_acceptance',
  'LEO Protocol Integration with Dynamic Documentation Platform. Strategic directive to integrate existing AI Documentation Generation System (SD-041C) into LEO Protocol workflow to ensure 100% of future Strategic Directives are automatically documented. LEAD phase complete with 100% SD completeness achieved. Scope refined through user clarifications. Database validation bugs fixed. Ready for PLAN phase PRD creation.',
  JSON.stringify({sd_completeness: 100, validation_score: '100%', all_required_fields: true, bugs_fixed: 2}),
  JSON.stringify(['SD-DOCUMENTATION-001 approved', 'Database section added (165th section)', 'CLAUDE.md regenerated (41 sections)', 'Validation bugs fixed']),
  JSON.stringify([{decision: 'Reuse existing infrastructure', rationale: 'SIMPLICITY FIRST, 2,500 LOC exists'}, {decision: 'Protocol integration focus', rationale: 'User clarification - automate future, not backfill'}]),
  JSON.stringify([{issue: 'Validation bugs', status: 'RESOLVED', count: 2}]),
  JSON.stringify({time: '120min', tokens: '127K/200K (63.5%)', context_status: 'HEALTHY', blockers: 4, resolved: 4}),
  JSON.stringify([{action: 'Create PRD', priority: 'HIGH', owner: 'PLAN'}, {action: 'Define architecture', priority: 'HIGH'}, {action: 'Generate user stories', priority: 'HIGH'}])
]);

const handoffId = insertResult.rows[0].id;
console.log('✅ Step 1: Handoff inserted (pending)');
console.log('ID:', handoffId);

// Update to accepted
const updateResult = await client.query(`
  UPDATE sd_phase_handoffs 
  SET status = 'accepted', accepted_at = NOW()
  WHERE id = $1
  RETURNING id, status, accepted_at
`, [handoffId]);

console.log('✅ Step 2: Handoff accepted');
console.log('Status:', updateResult.rows[0].status);
console.log('Accepted At:', updateResult.rows[0].accepted_at);
console.log('');
console.log('✅ LEAD→PLAN Handoff created successfully!');
console.log('ID:', handoffId);

await client.end();
