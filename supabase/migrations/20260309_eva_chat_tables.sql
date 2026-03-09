-- EVA Chat Tables
-- SD-LEO-INFRA-EVA-CHAT-CANVAS-002 (Phase 1)
--
-- Creates conversation and message tables for the EVA Chat route.

-- Conversations
CREATE TABLE IF NOT EXISTS eva_chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eva_chat_conversations_user
  ON eva_chat_conversations(user_id, created_at DESC);

-- Messages
CREATE TABLE IF NOT EXISTS eva_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES eva_chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  canvas_content JSONB,
  canvas_content_type TEXT,
  token_count INTEGER,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eva_chat_messages_conversation
  ON eva_chat_messages(conversation_id, created_at ASC);

-- RLS Policies
ALTER TABLE eva_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_chat_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: users can only access their own
CREATE POLICY "Users can view own conversations"
  ON eva_chat_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
  ON eva_chat_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON eva_chat_conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- Messages: access through conversation ownership
CREATE POLICY "Users can view messages in own conversations"
  ON eva_chat_messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM eva_chat_conversations WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in own conversations"
  ON eva_chat_messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM eva_chat_conversations WHERE user_id = auth.uid()
    )
  );

-- Service role bypass for backend message insertion
CREATE POLICY "Service role full access conversations"
  ON eva_chat_conversations FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access messages"
  ON eva_chat_messages FOR ALL
  USING (auth.role() = 'service_role');

-- RPC: Create conversation
CREATE OR REPLACE FUNCTION create_eva_conversation(
  p_user_id UUID,
  p_title TEXT DEFAULT 'New Conversation',
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO eva_chat_conversations (user_id, title, metadata)
  VALUES (p_user_id, p_title, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- RPC: Get conversations for user
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.title,
    c.status,
    c.metadata,
    c.created_at,
    c.updated_at,
    COUNT(m.id) AS message_count,
    MAX(m.created_at) AS last_message_at
  FROM eva_chat_conversations c
  LEFT JOIN eva_chat_messages m ON m.conversation_id = c.id
  WHERE c.user_id = p_user_id
    AND c.status = 'active'
  GROUP BY c.id
  ORDER BY COALESCE(MAX(m.created_at), c.created_at) DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- RPC: Get messages for conversation
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
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.content,
    m.canvas_content,
    m.canvas_content_type,
    m.token_count,
    m.model_used,
    m.created_at
  FROM eva_chat_messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC;
END;
$$;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_eva_chat_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER eva_chat_conversations_updated
  BEFORE UPDATE ON eva_chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_eva_chat_timestamp();
