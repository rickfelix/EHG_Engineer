/**
 * Run evidence_gate_mapping table creation and lead_evaluations enrichment
 * SD-MAN-ORCH-IMPROVE-STEP-LEAD-002-E
 */
require('dotenv').config();
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected');

    // 1. Create evidence_gate_mapping table
    await client.query(`
      CREATE TABLE IF NOT EXISTS evidence_gate_mapping (
        id serial PRIMARY KEY,
        gate_question_id text NOT NULL UNIQUE,
        gate_question_text text NOT NULL,
        evidence_steps jsonb NOT NULL DEFAULT '[]',
        evidence_description text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
    `);
    console.log('Table evidence_gate_mapping created');

    // 2. Add evidence_coverage_score to lead_evaluations
    await client.query(`
      ALTER TABLE lead_evaluations
        ADD COLUMN IF NOT EXISTS evidence_coverage_score integer DEFAULT 0;
    `);
    console.log('evidence_coverage_score column added');

    try {
      await client.query(`
        ALTER TABLE lead_evaluations
          ADD CONSTRAINT lead_eval_ecs_range CHECK (evidence_coverage_score >= 0 AND evidence_coverage_score <= 100);
      `);
      console.log('CHECK constraint added');
    } catch (e) {
      if (e.message.includes('already exists')) console.log('CHECK constraint already exists');
      else throw e;
    }

    // 3. Populate mapping (the 8 strategic validation gate questions mapped to 6 evidence steps)
    // Evidence steps: 1=SD Metadata, 2=PRD/Requirements, 3=Backlog/Stories, 4=Dependencies, 5=Similar SDs, 6=Evaluations
    const mappings = [
      { id: 'SVG-Q1', text: 'Is the problem statement clear and well-defined?', steps: [1, 2], desc: 'SD title/description + PRD executive summary' },
      { id: 'SVG-Q2', text: 'Are success criteria measurable and achievable?', steps: [1, 2], desc: 'SD success_criteria + PRD acceptance_criteria' },
      { id: 'SVG-Q3', text: 'Is the scope appropriate for a single SD?', steps: [2, 3, 4], desc: 'PRD requirements count + story count + dependency graph' },
      { id: 'SVG-Q4', text: 'Are dependencies identified and manageable?', steps: [4], desc: 'Dependency graph (parent, children, siblings)' },
      { id: 'SVG-Q5', text: 'Is there potential duplication with existing work?', steps: [5], desc: 'Similar SDs search results' },
      { id: 'SVG-Q6', text: 'Are risks identified with mitigation strategies?', steps: [1, 2], desc: 'SD risks + PRD risks' },
      { id: 'SVG-Q7', text: 'Is the resource cost justified by business value?', steps: [1, 6], desc: 'SD priority/type + prior evaluations' },
      { id: 'SVG-Q8', text: 'Is technical approach feasible and well-understood?', steps: [2, 3], desc: 'PRD system_architecture + implementation_approach + stories' }
    ];

    for (const m of mappings) {
      await client.query(`
        INSERT INTO evidence_gate_mapping (gate_question_id, gate_question_text, evidence_steps, evidence_description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (gate_question_id) DO UPDATE SET
          gate_question_text = EXCLUDED.gate_question_text,
          evidence_steps = EXCLUDED.evidence_steps,
          evidence_description = EXCLUDED.evidence_description,
          updated_at = now();
      `, [m.id, m.text, JSON.stringify(m.steps), m.desc]);
    }
    console.log('8 gate mappings populated');

    console.log('Migration complete');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await client.end();
  }
}

run();
