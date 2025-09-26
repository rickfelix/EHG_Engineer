-- LEO Protocol v4.2.0 Git Commit Rules Schema
-- Stores commit format validation rules and enforcement settings
-- Generated: 2025-09-26

-- Table for commit type definitions
CREATE TABLE IF NOT EXISTS leo_commit_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    usage_guidelines TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default commit types
INSERT INTO leo_commit_types (type_code, description, usage_guidelines) VALUES
    ('feat', 'New feature implementation', 'Use for new functionality added to the codebase'),
    ('fix', 'Bug fix or error correction', 'Use when fixing bugs or resolving errors'),
    ('docs', 'Documentation changes only', 'Use for README, markdown, or comment updates'),
    ('style', 'Code formatting, no logic changes', 'Use for formatting, whitespace, semicolons, etc.'),
    ('refactor', 'Code restructuring, no behavior changes', 'Use when reorganizing code without changing functionality'),
    ('test', 'Adding or updating tests', 'Use for test file changes, including unit and integration tests'),
    ('chore', 'Maintenance, dependencies, tooling', 'Use for build scripts, package updates, configuration'),
    ('perf', 'Performance improvements', 'Use when optimizing code for better performance'),
    ('ci', 'CI/CD configuration changes', 'Use for GitHub Actions, CircleCI, Travis, etc.'),
    ('revert', 'Reverting previous commits', 'Use when reverting a previous commit')
ON CONFLICT (type_code) DO NOTHING;

-- Table for commit validation rules
CREATE TABLE IF NOT EXISTS leo_commit_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name VARCHAR(100) NOT NULL UNIQUE,
    rule_type VARCHAR(50) NOT NULL, -- format, size, timing, branch
    rule_definition JSONB NOT NULL,
    severity VARCHAR(20) DEFAULT 'error', -- error, warning, info
    error_message TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default commit rules
INSERT INTO leo_commit_rules (rule_name, rule_type, rule_definition, error_message) VALUES
    (
        'commit_format',
        'format',
        '{"pattern": "^(feat|fix|docs|style|refactor|test|chore|perf|ci|revert)\\(SD-\\d{4}-\\d{3}\\): .{1,72}$"}',
        'Commit message must follow format: <type>(SD-YYYY-XXX): <subject>'
    ),
    (
        'subject_length',
        'format',
        '{"min": 10, "max": 72}',
        'Subject line must be between 10 and 72 characters'
    ),
    (
        'imperative_mood',
        'format',
        '{"forbidden_starts": ["Added", "Adds", "Adding", "Fixed", "Fixes", "Fixing"]}',
        'Use imperative mood: "Add" not "Added" or "Adds"'
    ),
    (
        'commit_size',
        'size',
        '{"ideal_lines": 100, "max_lines": 200, "warning_threshold": 150}',
        'Commit should be under 100 lines (max 200)'
    ),
    (
        'file_count',
        'size',
        '{"ideal_files": 3, "max_files": 10, "exclude_patterns": ["*.lock", "*.generated.*"]}',
        'Commit should modify 1-3 files (max 10)'
    ),
    (
        'branch_naming',
        'branch',
        '{"pattern": "^(feature|fix|chore|docs|test|refactor)/SD-\\d{4}-\\d{3}-.+$"}',
        'Branch must follow pattern: <type>/SD-YYYY-XXX-description'
    ),
    (
        'no_main_direct',
        'branch',
        '{"forbidden_branches": ["main", "master"], "phases": ["EXEC", "PLAN"]}',
        'Direct commits to main branch are forbidden during EXEC/PLAN phases'
    )
ON CONFLICT (rule_name) DO NOTHING;

-- Table for commit history analysis
CREATE TABLE IF NOT EXISTS leo_commit_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commit_hash VARCHAR(40) NOT NULL UNIQUE,
    sd_id VARCHAR(50),
    commit_type VARCHAR(20),
    subject TEXT,
    body TEXT,
    author VARCHAR(255),
    branch VARCHAR(255),
    files_changed INTEGER,
    lines_added INTEGER,
    lines_deleted INTEGER,
    validation_status VARCHAR(20), -- passed, failed, warning
    validation_errors JSONB,
    phase VARCHAR(50), -- LEAD, PLAN, EXEC, etc.
    checklist_item INTEGER, -- Which checklist item this relates to
    ai_generated BOOLEAN DEFAULT false,
    committed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_commit_history_sd_id ON leo_commit_history(sd_id);
CREATE INDEX IF NOT EXISTS idx_commit_history_type ON leo_commit_history(commit_type);
CREATE INDEX IF NOT EXISTS idx_commit_history_phase ON leo_commit_history(phase);
CREATE INDEX IF NOT EXISTS idx_commit_history_validation ON leo_commit_history(validation_status);
CREATE INDEX IF NOT EXISTS idx_commit_history_date ON leo_commit_history(committed_at DESC);

-- Table for commit templates
CREATE TABLE IF NOT EXISTS leo_commit_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_name VARCHAR(100) NOT NULL UNIQUE,
    commit_type VARCHAR(20) REFERENCES leo_commit_types(type_code),
    template_content TEXT NOT NULL,
    usage_context TEXT,
    example TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert example templates
INSERT INTO leo_commit_templates (template_name, commit_type, template_content, example) VALUES
    (
        'feature_implementation',
        'feat',
        '<type>(SD-<ID>): <subject>

- <what changed>
- <why it changed>
- <impact>

Implements requirement <X> from PRD',
        'feat(SD-2025-001): Add OAuth2 authentication flow

- Implemented Google OAuth2 provider
- Required for enterprise SSO support
- Affects login and registration flows

Implements requirement 3.2 from PRD'
    ),
    (
        'bug_fix',
        'fix',
        'fix(SD-<ID>): <subject>

- Root cause: <cause>
- Solution: <fix>
- Testing: <verification>

Fixes issue reported in <context>',
        'fix(SD-2025-002): Resolve null pointer in auth service

- Root cause: Missing null check for expired tokens
- Solution: Added validation before token decode
- Testing: Added unit test for edge case

Fixes issue reported in PLAN verification'
    )
ON CONFLICT (template_name) DO NOTHING;

-- Create view for commit compliance metrics
CREATE OR REPLACE VIEW v_commit_compliance_metrics AS
SELECT
    sd_id,
    COUNT(*) as total_commits,
    COUNT(*) FILTER (WHERE validation_status = 'passed') as passed_commits,
    COUNT(*) FILTER (WHERE validation_status = 'failed') as failed_commits,
    COUNT(*) FILTER (WHERE validation_status = 'warning') as warning_commits,
    ROUND(100.0 * COUNT(*) FILTER (WHERE validation_status = 'passed') / NULLIF(COUNT(*), 0), 2) as compliance_rate,
    AVG(files_changed) as avg_files_changed,
    AVG(lines_added + lines_deleted) as avg_lines_changed,
    COUNT(DISTINCT author) as unique_authors,
    COUNT(*) FILTER (WHERE ai_generated = true) as ai_generated_count
FROM leo_commit_history
GROUP BY sd_id;

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_leo_commit_types_updated_at BEFORE UPDATE
    ON leo_commit_types FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leo_commit_rules_updated_at BEFORE UPDATE
    ON leo_commit_rules FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leo_commit_templates_updated_at BEFORE UPDATE
    ON leo_commit_templates FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (adjust as needed)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;