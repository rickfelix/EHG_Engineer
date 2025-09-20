-- LEO Protocol v4.1 Progress Tracking Schema
-- Deterministic, structured, and easily queryable

-- Progress tracking table
CREATE TABLE IF NOT EXISTS leo_progress_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Entity identification
    entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('SD', 'PRD', 'EES')),
    entity_id VARCHAR(255) NOT NULL,
    
    -- LEO Protocol v4.1 phase progress
    lead_planning_progress INTEGER DEFAULT 0 CHECK (lead_planning_progress BETWEEN 0 AND 100),
    plan_design_progress INTEGER DEFAULT 0 CHECK (plan_design_progress BETWEEN 0 AND 100),
    exec_implementation_progress INTEGER DEFAULT 0 CHECK (exec_implementation_progress BETWEEN 0 AND 100),
    plan_verification_progress INTEGER DEFAULT 0 CHECK (plan_verification_progress BETWEEN 0 AND 100),
    lead_approval_progress INTEGER DEFAULT 0 CHECK (lead_approval_progress BETWEEN 0 AND 100),
    
    -- Calculated fields (computed from above)
    total_progress INTEGER GENERATED ALWAYS AS (
        ROUND(
            (lead_planning_progress * 0.20) + 
            (plan_design_progress * 0.20) + 
            (exec_implementation_progress * 0.30) + 
            (plan_verification_progress * 0.15) + 
            (lead_approval_progress * 0.15)
        )
    ) STORED,
    
    current_phase VARCHAR(50) GENERATED ALWAYS AS (
        CASE 
            WHEN lead_approval_progress = 100 THEN 'COMPLETE'
            WHEN plan_verification_progress < 100 THEN 'VERIFICATION'
            WHEN exec_implementation_progress < 100 THEN 'EXEC'
            WHEN plan_design_progress < 100 THEN 'PLAN'
            ELSE 'LEAD'
        END
    ) STORED,
    
    -- Checklist tracking (structured JSON)
    checklists JSONB DEFAULT '{}', -- {"lead": [], "plan": [], "exec": [], "verification": [], "approval": []}
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(100),
    
    -- Constraints
    UNIQUE(entity_type, entity_id)
);

-- Function to automatically calculate checklist completion
CREATE OR REPLACE FUNCTION calculate_checklist_progress(checklist_items JSONB)
RETURNS INTEGER AS $$
BEGIN
    IF checklist_items IS NULL OR jsonb_array_length(checklist_items) = 0 THEN
        RETURN 100; -- Empty checklist = complete
    END IF;
    
    RETURN ROUND(
        (SELECT COUNT(*) FROM jsonb_array_elements(checklist_items) item 
         WHERE (item->>'checked')::boolean = true) * 100.0 / 
        jsonb_array_length(checklist_items)
    );
END;
$$ LANGUAGE plpgsql;

-- Trigger to update progress based on checklists
CREATE OR REPLACE FUNCTION update_progress_from_checklists()
RETURNS TRIGGER AS $$
BEGIN
    -- Update phase progress based on checklist completion
    NEW.lead_planning_progress := 
        CASE WHEN NEW.entity_type = 'SD' THEN 100 
             ELSE OLD.lead_planning_progress 
        END;
        
    NEW.plan_design_progress := calculate_checklist_progress(NEW.checklists->'plan');
    NEW.exec_implementation_progress := calculate_checklist_progress(NEW.checklists->'exec');
    NEW.plan_verification_progress := calculate_checklist_progress(NEW.checklists->'verification');
    NEW.lead_approval_progress := calculate_checklist_progress(NEW.checklists->'approval');
    
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_progress ON leo_progress_v2;
CREATE TRIGGER trigger_update_progress
    BEFORE UPDATE ON leo_progress_v2
    FOR EACH ROW
    EXECUTE FUNCTION update_progress_from_checklists();

-- View for easy dashboard queries
CREATE OR REPLACE VIEW leo_progress_dashboard AS
SELECT 
    p.*,
    -- Join with SD data
    sd.title as sd_title,
    sd.status as sd_status,
    sd.priority as sd_priority,
    -- Join with PRD data
    prd.title as prd_title,
    prd.status as prd_status
FROM leo_progress_v2 p
LEFT JOIN strategic_directives_v2 sd ON p.entity_type = 'SD' AND p.entity_id = sd.id
LEFT JOIN product_requirements_v2 prd ON p.entity_type = 'PRD' AND p.entity_id = prd.id;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leo_progress_entity ON leo_progress_v2(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_leo_progress_total ON leo_progress_v2(total_progress DESC);
CREATE INDEX IF NOT EXISTS idx_leo_progress_phase ON leo_progress_v2(current_phase);

-- Sample insert for current SD
INSERT INTO leo_progress_v2 (
    entity_type, 
    entity_id, 
    lead_planning_progress,
    plan_design_progress,
    exec_implementation_progress,
    plan_verification_progress,
    lead_approval_progress,
    checklists,
    updated_by
) VALUES (
    'SD',
    'SD-DASHBOARD-UI-2025-08-31-A',
    100, -- LEAD planning complete
    100, -- PLAN design complete  
    100, -- EXEC implementation complete
    100, -- Verification complete
    0,   -- Approval pending
    '{"lead": [], "plan": [{"text": "Create PRD", "checked": true}], "exec": [{"text": "Implement search", "checked": true}], "verification": [{"text": "Test functionality", "checked": true}], "approval": []}',
    'LEO_PROTOCOL'
) ON CONFLICT (entity_type, entity_id) 
DO UPDATE SET
    lead_planning_progress = EXCLUDED.lead_planning_progress,
    plan_design_progress = EXCLUDED.plan_design_progress,
    exec_implementation_progress = EXCLUDED.exec_implementation_progress,
    plan_verification_progress = EXCLUDED.plan_verification_progress,
    lead_approval_progress = EXCLUDED.lead_approval_progress,
    checklists = EXCLUDED.checklists,
    updated_by = EXCLUDED.updated_by;