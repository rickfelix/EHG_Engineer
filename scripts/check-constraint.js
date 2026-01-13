#!/usr/bin/env node

import { createClient as _createClient } from '@supabase/supabase-js';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

async function checkConstraint() {
  const client = await createDatabaseClient('engineer', { verify: false });

  const query = `
    SELECT
      conname AS constraint_name,
      pg_get_constraintdef(c.oid) AS constraint_definition
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'product_requirements_v2'
      AND conname = 'functional_requirements_min_count';
  `;

  const result = await client.query(query);
  console.log(JSON.stringify(result.rows, null, 2));

  await client.end();
}

checkConstraint().catch(console.error);
