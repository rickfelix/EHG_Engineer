-- SD: SD-DISTILLTOBRAINSTORM-CONTINUOUS-GUIDED-PIPELINE-ORCH-001-B
-- Add item_disposition and brainstorm_session_id to roadmap_wave_items

ALTER TABLE roadmap_wave_items
  ADD COLUMN IF NOT EXISTS item_disposition TEXT DEFAULT 'pending'
    CHECK (item_disposition IN ('pending', 'selected', 'deferred', 'brainstormed', 'promoted', 'dropped')),
  ADD COLUMN IF NOT EXISTS brainstorm_session_id UUID REFERENCES brainstorm_sessions(id) ON DELETE SET NULL;

COMMENT ON COLUMN roadmap_wave_items.item_disposition IS 'Flow state: pending→selected→brainstormed→promoted (or deferred/dropped at any point)';
COMMENT ON COLUMN roadmap_wave_items.brainstorm_session_id IS 'FK to brainstorm_sessions when item has been brainstormed. Null = not yet brainstormed.';
