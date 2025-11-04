-- Create directive_submissions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.directive_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id VARCHAR(255) UNIQUE DEFAULT gen_random_uuid()::text,
    chairman_input TEXT,
    feedback TEXT,
    screenshot_url TEXT,
    intent_summary TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    current_step INTEGER DEFAULT 1,
    completed_steps INTEGER[] DEFAULT '{}',
    gate_status JSONB DEFAULT '{}',
    strategic_tactical_classification VARCHAR(100),
    synthesis_data JSONB,
    questions JSONB DEFAULT '[]',
    final_summary TEXT,
    created_by VARCHAR(100) DEFAULT 'Chairman',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_directive_submissions_submission_id 
    ON public.directive_submissions(submission_id);

CREATE INDEX IF NOT EXISTS idx_directive_submissions_created_at 
    ON public.directive_submissions(created_at DESC);

-- Enable RLS
ALTER TABLE public.directive_submissions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all operations on directive_submissions" ON directive_submissions;
DROP POLICY IF EXISTS "Allow anonymous inserts" ON directive_submissions;
DROP POLICY IF EXISTS "Allow public read" ON directive_submissions;
DROP POLICY IF EXISTS "Allow public updates" ON directive_submissions;

-- Create permissive RLS policies for anonymous users
CREATE POLICY "Allow anonymous inserts"
ON directive_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public read"
ON directive_submissions
FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Allow public updates"
ON directive_submissions
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Grant necessary table permissions
GRANT INSERT, SELECT, UPDATE ON directive_submissions TO anon;
GRANT INSERT, SELECT, UPDATE ON directive_submissions TO authenticated;

-- Add update trigger for updated_at
CREATE OR REPLACE FUNCTION update_directive_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_directive_submissions_updated_at_trigger ON directive_submissions;

CREATE TRIGGER update_directive_submissions_updated_at_trigger 
    BEFORE UPDATE ON public.directive_submissions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_directive_submissions_updated_at();
