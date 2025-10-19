-- =====================================
-- PHASE 4: TESTING & QUALITY ASSURANCE DATABASE SCHEMA
-- =====================================

-- Test Suites Management
CREATE TABLE public.test_suites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  suite_type TEXT NOT NULL CHECK (suite_type IN ('unit', 'integration', 'e2e', 'performance', 'security', 'accessibility', 'load')),
  configuration JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Test Cases within suites
CREATE TABLE public.test_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_suite_id UUID NOT NULL REFERENCES public.test_suites(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  test_type TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  test_script TEXT,
  expected_result TEXT,
  tags TEXT[] DEFAULT '{}',
  is_automated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Test Executions tracking
CREATE TABLE public.test_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_suite_id UUID NOT NULL REFERENCES public.test_suites(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  executed_by UUID REFERENCES auth.users(id),
  execution_type TEXT NOT NULL CHECK (execution_type IN ('manual', 'automated', 'scheduled', 'ci_cd')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_time TIMESTAMP WITH TIME ZONE,
  total_tests INTEGER DEFAULT 0,
  passed_tests INTEGER DEFAULT 0,
  failed_tests INTEGER DEFAULT 0,
  skipped_tests INTEGER DEFAULT 0,
  coverage_percentage DECIMAL(5,2),
  performance_metrics JSONB DEFAULT '{}',
  environment TEXT DEFAULT 'development',
  build_version TEXT,
  results JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Individual test results
CREATE TABLE public.test_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_execution_id UUID NOT NULL REFERENCES public.test_executions(id) ON DELETE CASCADE,
  test_case_id UUID NOT NULL REFERENCES public.test_cases(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped')),
  execution_time_ms INTEGER,
  error_message TEXT,
  stack_trace TEXT,
  screenshots TEXT[],
  logs TEXT,
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Quality Gates Configuration
CREATE TABLE public.quality_gates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  gate_type TEXT NOT NULL CHECK (gate_type IN ('coverage', 'performance', 'security', 'accessibility', 'code_quality')),
  conditions JSONB NOT NULL DEFAULT '{}',
  threshold_value DECIMAL(10,2),
  threshold_operator TEXT CHECK (threshold_operator IN ('>=', '>', '<=', '<', '=')),
  is_blocking BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Quality Gate Results
CREATE TABLE public.quality_gate_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_execution_id UUID NOT NULL REFERENCES public.test_executions(id) ON DELETE CASCADE,
  quality_gate_id UUID NOT NULL REFERENCES public.quality_gates(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'warning')),
  actual_value DECIMAL(10,2),
  threshold_value DECIMAL(10,2),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Performance Benchmarks
CREATE TABLE public.performance_benchmarks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  test_name TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('response_time', 'throughput', 'memory_usage', 'cpu_usage', 'load_time')),
  baseline_value DECIMAL(10,2),
  target_value DECIMAL(10,2),
  threshold_warning DECIMAL(10,2),
  threshold_critical DECIMAL(10,2),
  unit TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Test Analytics and Metrics
CREATE TABLE public.test_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_tests_run INTEGER DEFAULT 0,
  test_pass_rate DECIMAL(5,2),
  code_coverage DECIMAL(5,2),
  average_execution_time DECIMAL(10,2),
  defect_detection_rate DECIMAL(5,2),
  quality_score DECIMAL(5,2),
  metrics_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AI-Powered Test Generation
CREATE TABLE public.ai_test_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('code_analysis', 'user_story', 'bug_report', 'requirements')),
  source_content TEXT,
  generated_tests JSONB DEFAULT '{}',
  confidence_score DECIMAL(5,2),
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'modified')),
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.test_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_test_generations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company-based access
CREATE POLICY "Company members can manage test suites" ON public.test_suites
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca 
      WHERE uca.company_id = test_suites.company_id 
      AND uca.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage test cases" ON public.test_cases
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca 
      WHERE uca.company_id = test_cases.company_id 
      AND uca.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can view test executions" ON public.test_executions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca 
      WHERE uca.company_id = test_executions.company_id 
      AND uca.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can view test results" ON public.test_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca 
      WHERE uca.company_id = test_results.company_id 
      AND uca.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage quality gates" ON public.quality_gates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca 
      WHERE uca.company_id = quality_gates.company_id 
      AND uca.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can view quality gate results" ON public.quality_gate_results
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca 
      WHERE uca.company_id = quality_gate_results.company_id 
      AND uca.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage performance benchmarks" ON public.performance_benchmarks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca 
      WHERE uca.company_id = performance_benchmarks.company_id 
      AND uca.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can view test analytics" ON public.test_analytics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca 
      WHERE uca.company_id = test_analytics.company_id 
      AND uca.user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can manage AI test generations" ON public.ai_test_generations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_company_access uca 
      WHERE uca.company_id = ai_test_generations.company_id 
      AND uca.user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX idx_test_suites_company_id ON public.test_suites(company_id);
CREATE INDEX idx_test_suites_type ON public.test_suites(suite_type);
CREATE INDEX idx_test_suites_active ON public.test_suites(is_active);

CREATE INDEX idx_test_cases_suite_id ON public.test_cases(test_suite_id);
CREATE INDEX idx_test_cases_company_id ON public.test_cases(company_id);
CREATE INDEX idx_test_cases_priority ON public.test_cases(priority);
CREATE INDEX idx_test_cases_automated ON public.test_cases(is_automated);

CREATE INDEX idx_test_executions_company_id ON public.test_executions(company_id);
CREATE INDEX idx_test_executions_suite_id ON public.test_executions(test_suite_id);
CREATE INDEX idx_test_executions_status ON public.test_executions(status);
CREATE INDEX idx_test_executions_start_time ON public.test_executions(start_time);

CREATE INDEX idx_test_results_execution_id ON public.test_results(test_execution_id);
CREATE INDEX idx_test_results_case_id ON public.test_results(test_case_id);
CREATE INDEX idx_test_results_status ON public.test_results(status);

CREATE INDEX idx_quality_gates_company_id ON public.quality_gates(company_id);
CREATE INDEX idx_quality_gates_type ON public.quality_gates(gate_type);
CREATE INDEX idx_quality_gates_active ON public.quality_gates(is_active);

CREATE INDEX idx_quality_gate_results_execution_id ON public.quality_gate_results(test_execution_id);
CREATE INDEX idx_quality_gate_results_gate_id ON public.quality_gate_results(quality_gate_id);

CREATE INDEX idx_test_analytics_company_id ON public.test_analytics(company_id);
CREATE INDEX idx_test_analytics_date ON public.test_analytics(metric_date);

-- Triggers for updated_at columns
CREATE TRIGGER update_test_suites_updated_at
  BEFORE UPDATE ON public.test_suites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_test_cases_updated_at
  BEFORE UPDATE ON public.test_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quality_gates_updated_at
  BEFORE UPDATE ON public.quality_gates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_performance_benchmarks_updated_at
  BEFORE UPDATE ON public.performance_benchmarks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_test_generations_updated_at
  BEFORE UPDATE ON public.ai_test_generations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();