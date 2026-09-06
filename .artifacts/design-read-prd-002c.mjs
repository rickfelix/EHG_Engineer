import { createDatabaseClient } from '../lib/supabase-connection.js';
const c = await createDatabaseClient('engineer', { verify: false });
const r = await c.query(`SELECT id, directive_id, title, status, phase, content, metadata, functional_requirements, acceptance_criteria, technical_requirements, non_functional_requirements, test_scenarios, system_architecture, plan_checklist
  FROM product_requirements_v2 WHERE id = 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C' OR directive_id LIKE '%002-C%' ORDER BY created_at DESC LIMIT 2`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
