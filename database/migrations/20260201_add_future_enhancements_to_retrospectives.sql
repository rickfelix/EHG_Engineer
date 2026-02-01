-- Quick-fix QF-20260201-963: Add future_enhancements capture to retrospectives
-- Issue: Future enhancement ideas identified during SD implementation are lost
-- because /learn only captures "what happened" not "what could be better"
-- Fix: Add future_enhancements JSONB field to store improvement opportunities

-- Add future_enhancements column to retrospectives table
ALTER TABLE retrospectives
ADD COLUMN IF NOT EXISTS future_enhancements JSONB DEFAULT '[]'::jsonb;

-- Add comment explaining the field
COMMENT ON COLUMN retrospectives.future_enhancements IS 
'Array of future enhancement opportunities identified during SD implementation. 
Each entry: {
  enhancement: string (what could be improved),
  current_approach: string (how it works now),
  proposed_approach: string (how it could work better),
  impact: string (expected improvement),
  effort: string (low/medium/high),
  component: string (affected file/module),
  source_sd_id: string (SD where this was discovered)
}';

-- Create index for searching enhancements
CREATE INDEX IF NOT EXISTS idx_retrospectives_future_enhancements 
ON retrospectives USING gin (future_enhancements);
