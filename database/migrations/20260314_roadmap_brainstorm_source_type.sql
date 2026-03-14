-- SD: SD-MAN-INFRA-STRATEGIC-ROADMAP-PROCESS-001
-- Add 'brainstorm' to roadmap_wave_items.source_type CHECK constraint
-- Enables auto-creating roadmap items from brainstorm sessions

-- Drop existing constraint
ALTER TABLE roadmap_wave_items DROP CONSTRAINT IF EXISTS roadmap_wave_items_source_type_check;

-- Re-create with 'brainstorm' included
ALTER TABLE roadmap_wave_items ADD CONSTRAINT roadmap_wave_items_source_type_check
  CHECK (source_type IN ('todoist', 'youtube', 'brainstorm'));
