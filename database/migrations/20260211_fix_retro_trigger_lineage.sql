-- Fix trigger function to include proper lineage when inserting into protocol_improvement_queue
-- Issue: Trigger was firing without source_type/source_id, violating lineage_required constraint

-- Drop and recreate the trigger function with proper lineage
CREATE OR REPLACE FUNCTION extract_protocol_improvements_from_retro()
RETURNS TRIGGER AS $$
DECLARE
  improvement_text TEXT;
  improvement_record JSONB;
BEGIN
  -- Only proceed if learning_extracted_at was just set (NULL -> timestamp)
  IF OLD.learning_extracted_at IS NULL AND NEW.learning_extracted_at IS NOT NULL THEN

    -- Extract from what_needs_improvement
    IF NEW.what_needs_improvement IS NOT NULL THEN
      FOR improvement_record IN SELECT * FROM jsonb_array_elements(NEW.what_needs_improvement)
      LOOP
        improvement_text := improvement_record->>'text';
        IF improvement_text IS NOT NULL AND improvement_text != '' THEN
          INSERT INTO protocol_improvement_queue (
            improvement_text,
            source_type,
            source_id,
            category,
            priority_score,
            status
          ) VALUES (
            improvement_text,
            'retrospective',  -- FIXED: Add source_type
            NEW.id::text,     -- FIXED: Add source_id
            'process',
            50,  -- Default priority
            'pending'
          )
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    -- Extract from action_items
    IF NEW.action_items IS NOT NULL THEN
      FOR improvement_record IN SELECT * FROM jsonb_array_elements(NEW.action_items)
      LOOP
        improvement_text := improvement_record->>'text';
        IF improvement_text IS NOT NULL AND improvement_text != '' THEN
          INSERT INTO protocol_improvement_queue (
            improvement_text,
            source_type,
            source_id,
            category,
            priority_score,
            status
          ) VALUES (
            improvement_text,
            'retrospective',  -- FIXED: Add source_type
            NEW.id::text,     -- FIXED: Add source_id
            'action_item',
            60,  -- Slightly higher priority for action items
            'pending'
          )
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    -- Extract from key_learnings
    IF NEW.key_learnings IS NOT NULL THEN
      FOR improvement_record IN SELECT * FROM jsonb_array_elements(NEW.key_learnings)
      LOOP
        improvement_text := improvement_record->>'text';
        IF improvement_text IS NOT NULL AND improvement_text != '' THEN
          INSERT INTO protocol_improvement_queue (
            improvement_text,
            source_type,
            source_id,
            category,
            priority_score,
            status
          ) VALUES (
            improvement_text,
            'retrospective',  -- FIXED: Add source_type
            NEW.id::text,     -- FIXED: Add source_id
            'learning',
            55,  -- Medium priority for learnings
            'pending'
          )
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS trg_extract_protocol_improvements ON retrospectives;
CREATE TRIGGER trg_extract_protocol_improvements
  AFTER UPDATE ON retrospectives
  FOR EACH ROW
  EXECUTE FUNCTION extract_protocol_improvements_from_retro();

-- Verification query: Check the function was updated
SELECT
  proname as function_name,
  pg_get_functiondef(oid) as full_definition
FROM pg_proc
WHERE proname = 'extract_protocol_improvements_from_retro';
