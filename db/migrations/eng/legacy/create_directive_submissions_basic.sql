-- Create basic directive_submissions table as requested
-- This is a simplified version with only the requested columns
CREATE TABLE IF NOT EXISTS public.directive_submissions_basic (
    id SERIAL PRIMARY KEY,
    submission_id VARCHAR(255) UNIQUE NOT NULL,
    feedback TEXT NOT NULL,
    screenshot_url TEXT,
    intent_summary TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_directive_submissions_basic_submission_id 
    ON public.directive_submissions_basic(submission_id);

CREATE INDEX IF NOT EXISTS idx_directive_submissions_basic_created_at 
    ON public.directive_submissions_basic(created_at DESC);

-- Add RLS policies (if needed for Supabase)
ALTER TABLE public.directive_submissions_basic ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on directive_submissions_basic" 
    ON public.directive_submissions_basic
    FOR ALL 
    USING (true)
    WITH CHECK (true);

-- Add update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_directive_submissions_basic_updated_at 
    BEFORE UPDATE ON public.directive_submissions_basic 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();