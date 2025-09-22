-- Create directive_submissions table for SDIP/DirectiveLab
CREATE TABLE IF NOT EXISTS public.directive_submissions (
    id SERIAL PRIMARY KEY,
    submission_id VARCHAR(255) UNIQUE NOT NULL,
    feedback TEXT NOT NULL,
    screenshot_url TEXT,
    intent_summary TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    current_step INTEGER DEFAULT 1,
    gate_status JSONB DEFAULT '{}',
    strategic_category VARCHAR(100),
    tactical_items JSONB DEFAULT '[]',
    aligned_items JSONB DEFAULT '[]',
    required_items JSONB DEFAULT '[]',
    recommended_items JSONB DEFAULT '[]',
    clarifying_questions JSONB DEFAULT '[]',
    question_answers JSONB DEFAULT '{}',
    final_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_directive_submissions_submission_id 
    ON public.directive_submissions(submission_id);

CREATE INDEX IF NOT EXISTS idx_directive_submissions_created_at 
    ON public.directive_submissions(created_at DESC);

-- Add RLS policies (if needed for Supabase)
ALTER TABLE public.directive_submissions ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on directive_submissions" 
    ON public.directive_submissions
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

CREATE TRIGGER update_directive_submissions_updated_at 
    BEFORE UPDATE ON public.directive_submissions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();