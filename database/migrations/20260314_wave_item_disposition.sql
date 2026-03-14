-- Migration: 20260314_wave_item_disposition.sql
-- Purpose: Add item_disposition and brainstorm_session_id columns to roadmap_wave_items
-- Author: database-agent
-- Date: 2026-03-14
--
-- item_disposition: tracks the lifecycle state of a wave item
-- brainstorm_session_id: optional FK linking a wave item to its originating brainstorm session

-- Step 1: Add item_disposition column (idempotent)
ALTER TABLE public.roadmap_wave_items
  ADD COLUMN IF NOT EXISTS item_disposition TEXT DEFAULT 'pending';

-- Step 2: Add CHECK constraint for item_disposition allowed values
-- Use DO block for idempotent constraint creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.roadmap_wave_items'::regclass
      AND conname = 'roadmap_wave_items_item_disposition_check'
  ) THEN
    ALTER TABLE public.roadmap_wave_items
      ADD CONSTRAINT roadmap_wave_items_item_disposition_check
      CHECK (item_disposition IN ('pending', 'selected', 'deferred', 'brainstormed', 'promoted', 'dropped'));
  END IF;
END
$$;

-- Step 3: Add brainstorm_session_id column (idempotent)
ALTER TABLE public.roadmap_wave_items
  ADD COLUMN IF NOT EXISTS brainstorm_session_id UUID;

-- Step 4: Add foreign key to brainstorm_sessions (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.roadmap_wave_items'::regclass
      AND conname = 'roadmap_wave_items_brainstorm_session_id_fkey'
  ) THEN
    ALTER TABLE public.roadmap_wave_items
      ADD CONSTRAINT roadmap_wave_items_brainstorm_session_id_fkey
      FOREIGN KEY (brainstorm_session_id) REFERENCES public.brainstorm_sessions(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- Rollback SQL (manual):
-- ALTER TABLE public.roadmap_wave_items DROP CONSTRAINT IF EXISTS roadmap_wave_items_brainstorm_session_id_fkey;
-- ALTER TABLE public.roadmap_wave_items DROP CONSTRAINT IF EXISTS roadmap_wave_items_item_disposition_check;
-- ALTER TABLE public.roadmap_wave_items DROP COLUMN IF EXISTS brainstorm_session_id;
-- ALTER TABLE public.roadmap_wave_items DROP COLUMN IF EXISTS item_disposition;
