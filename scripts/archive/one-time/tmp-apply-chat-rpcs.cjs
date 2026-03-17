#!/usr/bin/env node
/**
 * Temporary script to apply EVA Chat RPC functions to Supabase
 * Uses direct PostgreSQL connection via pooler URL
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_POOLER_URL,
  ssl: { rejectUnauthorized: false }
});

const FUNCTIONS = [
  {
    name: 'create_eva_conversation',
    sql: `
CREATE OR REPLACE FUNCTION create_eva_conversation(
  p_user_id UUID,
  p_title TEXT DEFAULT 'New Conversation',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO eva_chat_conversations (user_id, title, metadata)
  VALUES (p_user_id, p_title, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;`
  },
  {
    name: 'get_eva_conversations',
    sql: `
CREATE OR REPLACE FUNCTION get_eva_conversations(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id UUID,
  title TEXT,
  status TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  message_count BIGINT,
  last_message_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.title, c.status, c.metadata, c.created_at, c.updated_at,
    COUNT(m.id) AS message_count,
    MAX(m.created_at) AS last_message_at
  FROM eva_chat_conversations c
  LEFT JOIN eva_chat_messages m ON m.conversation_id = c.id
  WHERE c.user_id = p_user_id AND c.status = 'active'
  GROUP BY c.id
  ORDER BY COALESCE(MAX(m.created_at), c.created_at) DESC
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;`
  },
  {
    name: 'get_conversation_messages',
    sql: `
CREATE OR REPLACE FUNCTION get_conversation_messages(
  p_conversation_id UUID
)
RETURNS TABLE(
  id UUID,
  role TEXT,
  content TEXT,
  canvas_content JSONB,
  canvas_content_type TEXT,
  token_count INTEGER,
  model_used TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
BEGIN
  RETURN QUERY
  SELECT m.id, m.role, m.content, m.canvas_content, m.canvas_content_type,
         m.token_count, m.model_used, m.created_at
  FROM eva_chat_messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC;
END;
$fn$;`
  },
  {
    name: 'update_eva_chat_timestamp',
    sql: `
CREATE OR REPLACE FUNCTION update_eva_chat_timestamp()
RETURNS TRIGGER AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;`
  }
];

async function apply() {
  const client = await pool.connect();
  try {
    for (const fn of FUNCTIONS) {
      await client.query(fn.sql);
      console.log(`  ✅ ${fn.name}`);
    }

    // Create trigger
    await client.query('DROP TRIGGER IF EXISTS eva_chat_conversations_updated ON eva_chat_conversations');
    await client.query(`
      CREATE TRIGGER eva_chat_conversations_updated
        BEFORE UPDATE ON eva_chat_conversations
        FOR EACH ROW
        EXECUTE FUNCTION update_eva_chat_timestamp();
    `);
    console.log('  ✅ trigger: eva_chat_conversations_updated');

    console.log('\n✅ All EVA Chat RPCs applied successfully!');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

apply();
