#!/usr/bin/env node
import { createDatabaseClient } from './lib/supabase-connection.js';

const client = await createDatabaseClient('engineer', { verify: false });

const result = await client.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'tech_stack_references'
  ORDER BY ordinal_position;
`);

console.log('\ntech_stack_references schema:');
console.table(result.rows);

const result2 = await client.query(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name = 'prd_research_audit_log'
  ORDER BY ordinal_position;
`);

console.log('\nprd_research_audit_log schema:');
console.table(result2.rows);

await client.end();
