-- Create minimal sample ventures with existing user ID
DO $$
DECLARE
  sample_company_id UUID;
  first_user_id UUID;
BEGIN
  -- Get the first available company and user
  SELECT id INTO sample_company_id FROM companies LIMIT 1;
  SELECT id INTO first_user_id FROM auth.users LIMIT 1;
  
  -- If no company exists, create one
  IF sample_company_id IS NULL THEN
    INSERT INTO companies (id, name, description, created_at)
    VALUES (gen_random_uuid(), 'TechCorp Innovation', 'Technology innovation and venture development company', now())
    RETURNING id INTO sample_company_id;
  END IF;
  
  -- If no ventures exist, create sample ventures
  IF NOT EXISTS (SELECT 1 FROM ventures LIMIT 1) THEN
    INSERT INTO ventures (id, name, description, industry, current_workflow_stage, status, company_id, created_by, metadata, created_at)
    VALUES 
    (gen_random_uuid(), 'TechFlow Analytics', 'AI-powered business intelligence platform for small businesses', 'Technology', 25, 'active', sample_company_id, COALESCE(first_user_id, sample_company_id), '{"stage": 25, "completed": false}', now()),
    (gen_random_uuid(), 'HealthSync Pro', 'Integrated healthcare management system for clinics', 'Healthcare', 18, 'active', sample_company_id, COALESCE(first_user_id, sample_company_id), '{"stage": 18, "completed": false}', now()),
    (gen_random_uuid(), 'GreenEnergy Solutions', 'Renewable energy optimization platform for commercial buildings', 'Energy', 32, 'active', sample_company_id, COALESCE(first_user_id, sample_company_id), '{"stage": 32, "completed": false}', now()),
    (gen_random_uuid(), 'EduTech Innovate', 'Personalized learning platform using adaptive AI', 'Education', 15, 'active', sample_company_id, COALESCE(first_user_id, sample_company_id), '{"stage": 15, "completed": false}', now()),
    (gen_random_uuid(), 'FinTech Secure', 'Blockchain-based financial transaction platform', 'Finance', 28, 'active', sample_company_id, COALESCE(first_user_id, sample_company_id), '{"stage": 28, "completed": false}', now());
  END IF;
  
  -- Create sample AI agents if none exist
  IF NOT EXISTS (SELECT 1 FROM ai_ceo_agents LIMIT 1) THEN
    INSERT INTO ai_ceo_agents (agent_id, agent_name, company_id, capabilities, risk_threshold, priority_weights, decision_framework, multi_agent_protocols, performance_metrics, is_active, configuration_complete, created_at)
    VALUES 
    (gen_random_uuid(), 'Strategic Decision Agent', sample_company_id, '["strategic_planning", "market_analysis", "competitive_intelligence"]', 0.7, '{"strategic": 0.4, "financial": 0.3, "operational": 0.2, "risk": 0.1}', '{"framework": "data_driven", "confidence_threshold": 0.8}', '{"coordination": "hierarchical", "escalation": "chairman"}', '{"success_rate": 0.92, "tasks_completed": 87, "avg_response_time": 1.2}', true, true, now()),
    (gen_random_uuid(), 'Market Research Agent', sample_company_id, '["market_research", "customer_analysis", "trend_forecasting"]', 0.7, '{"strategic": 0.4, "financial": 0.3, "operational": 0.2, "risk": 0.1}', '{"framework": "data_driven", "confidence_threshold": 0.8}', '{"coordination": "hierarchical", "escalation": "chairman"}', '{"success_rate": 0.88, "tasks_completed": 156, "avg_response_time": 0.8}', true, true, now()),
    (gen_random_uuid(), 'Workflow Coordinator', sample_company_id, '["workflow_management", "task_orchestration", "resource_allocation"]', 0.7, '{"strategic": 0.4, "financial": 0.3, "operational": 0.2, "risk": 0.1}', '{"framework": "data_driven", "confidence_threshold": 0.8}', '{"coordination": "hierarchical", "escalation": "chairman"}', '{"success_rate": 0.75, "tasks_completed": 234, "avg_response_time": 2.1}', false, true, now());
  END IF;
  
END $$;