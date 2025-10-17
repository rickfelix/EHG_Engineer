-- Add columns for storing AI-generated backlog summaries
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS backlog_summary TEXT,
ADD COLUMN IF NOT EXISTS backlog_summary_generated_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN strategic_directives_v2.backlog_summary IS 'AI-generated summary of backlog items for this strategic directive';
COMMENT ON COLUMN strategic_directives_v2.backlog_summary_generated_at IS 'Timestamp when the backlog summary was last generated';