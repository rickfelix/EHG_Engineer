#!/usr/bin/env node
/**
 * Add User Stories for SD-VISION-TRANSITION-001F
 * Shared Services API Contracts (CrewAI Wiring)
 *
 * Wires 4 Kochel CrewAI functional contracts to venture lifecycle stage transitions.
 *
 * Functional Requirements:
 * - FR-1: Register CrewAI Agent Platform as API Gateway Service
 * - FR-2: Hook advanceStage() to Trigger Kochel Contracts (stages 2-3, 14-15, 15, 17)
 * - FR-3: Store Crew Outputs in venture_artifacts with Quality Score
 * - FR-4: Enforce 85% Quality Gate at Decision Stages (3, 5, 16)
 * - FR-5: Graceful Degradation on CrewAI Unavailability
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_ID = 'SD-VISION-TRANSITION-001F';
const PRD_ID = 'PRD-SD-VISION-TRANSITION-001F';

// User stories following INVEST criteria with Given-When-Then acceptance criteria
// story_key format: {SD-ID}:US-XXX (required by valid_story_key constraint)
const userStories = [
  {
    story_key: 'SD-VISION-TRANSITION-001F:US-001',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Register CrewAI Agent Platform as API Gateway Service',
    user_role: 'Chairman',
    user_want: 'CrewAI Agent Platform registered as a managed service in API Gateway with circuit breaker protection',
    user_benefit: 'Ensures reliable communication with CrewAI platform while protecting against service unavailability',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Register CrewAI service',
        given: 'API Gateway configuration exists in api-gateway.ts',
        when: 'System initializes API Gateway services',
        then: 'crewai-platform service is registered with base URL http://localhost:8000 AND circuit breaker is configured with 5 failure threshold AND timeout is set to 60 seconds AND auth headers include API key'
      },
      {
        id: 'AC-001-2',
        scenario: 'Circuit breaker - Service unavailable',
        given: 'CrewAI platform server is down (port 8000 not responding)',
        when: 'System attempts to call CrewAI service AND encounters 5 consecutive failures',
        then: 'Circuit breaker opens AND subsequent calls fail fast without network requests AND circuit attempts reset after 30 seconds'
      },
      {
        id: 'AC-001-3',
        scenario: 'Health check endpoint',
        given: 'CrewAI platform is registered as API Gateway service',
        when: 'API Gateway performs health check on /health endpoint',
        then: 'Health status is returned (healthy/unhealthy) AND circuit breaker state reflects health status'
      },
      {
        id: 'AC-001-4',
        scenario: 'Configuration validation',
        given: 'API Gateway is being configured',
        when: 'crewai-platform service config is loaded',
        then: 'Required fields validated: baseURL, timeout, circuitBreakerOptions AND throws error if missing required config'
      }
    ],
    definition_of_done: [
      'crewai-platform service registered in api-gateway.ts',
      'Circuit breaker configured with failure threshold and timeout',
      'Health check endpoint implemented',
      'Configuration validation added',
      'Unit tests for service registration pass',
      'Circuit breaker integration tested'
    ],
    technical_notes: 'Extends existing api-gateway.ts pattern used for EVA and other services. Use evaCircuitBreaker.ts as reference implementation. Edge cases: CrewAI server restart during active request, auth token rotation, network partition between EHG and Agent Platform, partial response timeouts.',
    implementation_approach: 'Add crewai-platform to API_SERVICES config in api-gateway.ts. Implement circuit breaker using same pattern as EVA integration. Add health check polling.',
    implementation_context: 'FR-1: Foundation for all CrewAI integration. Must be implemented first before other user stories. Sets up service discovery and resilience patterns.',
    architecture_references: [
      'ehg/src/lib/integration/api-gateway.ts - API Gateway service registration',
      'ehg/src/lib/integration/evaCircuitBreaker.ts - Circuit breaker pattern reference',
      'ehg/agent-platform/ - CrewAI platform FastAPI server (port 8000)',
      'Database: None (configuration only)'
    ],
    example_code_patterns: {
      service_registration: `// In api-gateway.ts
const API_SERVICES = {
  'crewai-platform': {
    baseURL: process.env.CREWAI_PLATFORM_URL || 'http://localhost:8000',
    timeout: 60000, // 60 seconds for AI processing
    headers: {
      'Authorization': \`Bearer \${process.env.CREWAI_API_KEY}\`,
      'Content-Type': 'application/json'
    },
    circuitBreakerOptions: {
      failureThreshold: 5,
      resetTimeout: 30000,
      monitoringPeriod: 60000
    }
  }
};`,
      circuit_breaker: `// Circuit breaker wrapper
async function callCrewAI(endpoint: string, data: any) {
  const breaker = getCircuitBreaker('crewai-platform');

  try {
    return await breaker.execute(async () => {
      const response = await fetch(\`\${CREWAI_BASE_URL}\${endpoint}\`, {
        method: 'POST',
        headers: API_SERVICES['crewai-platform'].headers,
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(60000)
      });

      if (!response.ok) {
        throw new Error(\`CrewAI error: \${response.statusText}\`);
      }

      return await response.json();
    });
  } catch (error) {
    if (breaker.state === 'open') {
      console.warn('CrewAI circuit breaker is OPEN - service unavailable');
    }
    throw error;
  }
}`,
      health_check: `// Health check implementation
async function checkCrewAIHealth(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8000/health', {
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}`
    },
    testing_scenarios: [
      { scenario: 'Register CrewAI service successfully', type: 'unit', priority: 'P0' },
      { scenario: 'Circuit breaker opens after 5 failures', type: 'integration', priority: 'P0' },
      { scenario: 'Health check detects unavailable service', type: 'integration', priority: 'P1' },
      { scenario: 'Configuration validation rejects invalid config', type: 'unit', priority: 'P1' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-TRANSITION-001F:US-002',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Create CrewAI Client Service for Job Submission and Polling',
    user_role: 'Chairman',
    user_want: 'A dedicated CrewAI client service to submit jobs, poll status, and retrieve results',
    user_benefit: 'Encapsulates all CrewAI communication logic in a reusable service with consistent error handling',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-002-1',
        scenario: 'Happy path - Submit job successfully',
        given: 'CrewAI platform is available AND venture has valid stage data',
        when: 'Service calls submitJob(contractId, ventureId, inputData)',
        then: 'Job is submitted to CrewAI platform AND execution_id is returned AND job status is "pending"'
      },
      {
        id: 'AC-002-2',
        scenario: 'Polling - Job completion',
        given: 'Job has been submitted with execution_id',
        when: 'Service polls job status every 5 seconds for up to 60 seconds',
        then: 'Status updates from "pending" to "running" to "completed" AND final result is retrieved when status = "completed"'
      },
      {
        id: 'AC-002-3',
        scenario: 'Error path - Job timeout',
        given: 'Job is submitted and polling begins',
        when: 'Job does not complete within 60 seconds',
        then: 'Polling stops AND error thrown "CrewAI job timeout" AND job marked as timed_out'
      },
      {
        id: 'AC-002-4',
        scenario: 'Error path - Job failed',
        given: 'Job is submitted and running',
        when: 'CrewAI platform returns status "failed" with error message',
        then: 'Polling stops AND error thrown with CrewAI error message AND job marked as failed'
      },
      {
        id: 'AC-002-5',
        scenario: 'Contract validation',
        given: 'Contract ID is provided for job submission',
        when: 'Service validates contract exists in leo_interfaces table',
        then: 'Contract spec is retrieved AND input schema is validated against inputData AND error thrown if schema mismatch'
      }
    ],
    definition_of_done: [
      'crewaiService.ts created with submitJob, pollJobStatus, getJobResult methods',
      'Job submission with execution_id return implemented',
      'Polling mechanism with configurable interval and timeout',
      'Contract validation against leo_interfaces schema',
      'Error handling for timeout, failure, unavailability cases',
      'Unit tests for all service methods pass',
      'Integration tests with mock CrewAI server pass'
    ],
    technical_notes: 'Service wraps API Gateway calls to CrewAI platform. Implements async job pattern with polling. Validates requests against leo_interfaces contract schemas before submission. Edge cases: Job status never updates (stuck), CrewAI returns malformed response, multiple concurrent jobs for same venture, job result exceeds maximum response size (>1MB).',
    implementation_approach: 'Create new service file crewaiService.ts. Use API Gateway client for HTTP calls. Implement polling with setInterval and Promise wrapper. Load contract specs from leo_interfaces table for validation.',
    implementation_context: 'FR-2 dependency: Required before stage transitions can trigger CrewAI. Provides clean abstraction layer for all CrewAI communication.',
    architecture_references: [
      'ehg/src/services/crewaiService.ts (NEW) - CrewAI client service',
      'ehg/src/lib/integration/api-gateway.ts - HTTP client',
      'Database: leo_interfaces - contract specifications',
      'Database: workflow_executions - job execution tracking',
      'ehg/agent-platform/api/ - CrewAI platform API endpoints'
    ],
    example_code_patterns: {
      service_interface: `// crewaiService.ts interface
export interface CrewAIJobSubmission {
  contractId: string;
  ventureId: string;
  inputData: any;
}

export interface CrewAIJobResult {
  executionId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timed_out';
  result?: any;
  error?: string;
  qualityScore?: number;
}`,
      submit_job: `// Submit job to CrewAI
export async function submitCrewAIJob(
  contractId: string,
  ventureId: string,
  inputData: any
): Promise<string> {
  // 1. Validate contract exists and get spec
  const contract = await getContractSpec(contractId);
  if (!contract) {
    throw new Error(\`Contract not found: \${contractId}\`);
  }

  // 2. Validate input against contract schema
  validateInputSchema(inputData, contract.input_schema);

  // 3. Submit to CrewAI platform
  const response = await callCrewAI('/api/crews/execute', {
    contract_id: contractId,
    venture_id: ventureId,
    input_data: inputData
  });

  return response.execution_id;
}`,
      poll_job: `// Poll job status with timeout
export async function pollJobStatus(
  executionId: string,
  timeoutMs: number = 60000
): Promise<CrewAIJobResult> {
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    const status = await getJobStatus(executionId);

    if (status.status === 'completed') {
      return status;
    }

    if (status.status === 'failed') {
      throw new Error(\`CrewAI job failed: \${status.error}\`);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('CrewAI job timeout - exceeded 60 seconds');
}`,
      validate_contract: `// Validate input against contract schema
function validateInputSchema(inputData: any, schema: any): void {
  const validator = new JSONSchemaValidator();
  const result = validator.validate(inputData, schema);

  if (!result.valid) {
    throw new Error(\`Input validation failed: \${result.errors.join(', ')}\`);
  }
}`
    },
    testing_scenarios: [
      { scenario: 'Submit job and receive execution_id', type: 'integration', priority: 'P0' },
      { scenario: 'Poll job until completion', type: 'integration', priority: 'P0' },
      { scenario: 'Handle job timeout gracefully', type: 'integration', priority: 'P1' },
      { scenario: 'Handle job failure with error message', type: 'integration', priority: 'P1' },
      { scenario: 'Validate contract input schema', type: 'unit', priority: 'P1' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-TRANSITION-001F:US-003',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Hook advanceStage() to Trigger CrewAI Contracts at Designated Stages',
    user_role: 'Chairman',
    user_want: 'Automatic CrewAI contract execution when advancing to specific venture lifecycle stages (2-3, 14-15, 15, 17)',
    user_benefit: 'AI-powered artifacts generated automatically at key decision points without manual intervention',
    priority: 'critical',
    story_points: 8,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Advance to Stage 2 triggers journey-map-generator',
        given: 'Venture is at Stage 1 AND user advances to Stage 2',
        when: 'advanceStage(ventureId, 2) is called',
        then: 'journey-map-generator-v1 contract is triggered AND job is submitted to CrewAI AND execution tracked in workflow_executions AND stage advances to 2'
      },
      {
        id: 'AC-003-2',
        scenario: 'Stage mapping - All 4 contracts',
        given: 'Stage trigger configuration is loaded',
        when: 'System checks which contracts to trigger for stages 2, 3, 14, 15, 17',
        then: 'Stage 2-3 maps to journey-map-generator-v1 AND Stage 14-15 maps to route-map-suggester-v1 AND Stage 15 maps to epic-planner-v1 AND Stage 17 maps to build-planner-v1'
      },
      {
        id: 'AC-003-3',
        scenario: 'Error path - CrewAI unavailable (circuit open)',
        given: 'Circuit breaker for CrewAI is OPEN (service down)',
        when: 'User advances to Stage 2 which should trigger CrewAI',
        then: 'Warning logged "CrewAI unavailable, skipping AI artifact generation" AND stage still advances successfully (graceful degradation) AND user sees notification "AI analysis unavailable, proceeding without"'
      },
      {
        id: 'AC-003-4',
        scenario: 'Async execution - Non-blocking',
        given: 'User advances to Stage 2',
        when: 'CrewAI job is submitted',
        then: 'Job submission returns immediately (does not block stage transition) AND job executes asynchronously AND user can continue working while CrewAI processes'
      },
      {
        id: 'AC-003-5',
        scenario: 'Input data preparation',
        given: 'Venture is advancing to Stage 2',
        when: 'System prepares input for journey-map-generator contract',
        then: 'Input includes venture_name, description, target_market, and problem_statement AND input format matches contract input_schema from leo_interfaces'
      }
    ],
    definition_of_done: [
      'advanceStage() in workflowExecutionService.ts modified to trigger CrewAI',
      'Stage-to-contract mapping configured (2-3, 14-15, 15, 17)',
      'Async job submission implemented (non-blocking)',
      'Graceful degradation when CrewAI unavailable',
      'Input data preparation for all 4 contracts',
      'Unit tests for stage mapping pass',
      'E2E tests for stage advancement with CrewAI trigger pass'
    ],
    technical_notes: 'Modifies existing workflowExecutionService.ts advanceStage function. Use stage-to-contract mapping from SD metadata. Submit jobs asynchronously (fire-and-forget with callback). Edge cases: User advances multiple stages rapidly (queue multiple jobs), concurrent stage advancements for different ventures, stage advancement rollback after job submitted, input data incomplete for contract requirements.',
    implementation_approach: 'Add contract trigger logic to advanceStage() function. Load stage mapping from database or config. Use crewaiService.submitJob() for execution. Implement error handling with graceful degradation.',
    implementation_context: 'FR-2: Core integration point. Connects venture workflow to AI automation. Must handle failures gracefully to not block user workflows.',
    architecture_references: [
      'ehg/src/services/workflowExecutionService.ts - Stage advancement logic',
      'ehg/src/services/crewaiService.ts - CrewAI job submission',
      'ehg/src/services/evaStageEvents.ts - Event emitter for stage changes',
      'Database: leo_interfaces - contract specifications',
      'Database: workflow_executions - execution tracking',
      'Database: stage_executions - stage transition history'
    ],
    example_code_patterns: {
      stage_mapping: `// Stage-to-contract mapping (from SD metadata)
const STAGE_TO_CONTRACT_MAP: Record<number, string[]> = {
  2: ['journey-map-generator-v1'],
  3: ['journey-map-generator-v1'],
  14: ['route-map-suggester-v1'],
  15: ['route-map-suggester-v1', 'epic-planner-v1'],
  17: ['build-planner-v1']
};`,
      advance_stage_hook: `// Modified advanceStage() with CrewAI hook
export async function advanceStage(
  ventureId: string,
  targetStage: number
): Promise<void> {
  try {
    // 1. Existing validation logic
    await validateStageTransition(ventureId, targetStage);

    // 2. Update stage in database
    await updateVentureStage(ventureId, targetStage);

    // 3. NEW: Trigger CrewAI contracts for this stage
    await triggerCrewAIContractsForStage(ventureId, targetStage);

    // 4. Emit stage change event
    emitStageChangeEvent(ventureId, targetStage);
  } catch (error) {
    console.error('Stage advancement failed:', error);
    throw error;
  }
}`,
      trigger_contracts: `// Trigger CrewAI contracts for stage
async function triggerCrewAIContractsForStage(
  ventureId: string,
  stage: number
): Promise<void> {
  const contractIds = STAGE_TO_CONTRACT_MAP[stage];
  if (!contractIds || contractIds.length === 0) {
    return; // No contracts for this stage
  }

  // Check if CrewAI is available
  const isAvailable = await checkCrewAIAvailability();
  if (!isAvailable) {
    console.warn(\`CrewAI unavailable for stage \${stage}, skipping\`);
    return; // Graceful degradation
  }

  // Submit jobs asynchronously (non-blocking)
  for (const contractId of contractIds) {
    try {
      const inputData = await prepareContractInput(ventureId, contractId);
      const executionId = await submitCrewAIJob(contractId, ventureId, inputData);

      console.log(\`CrewAI job submitted: \${executionId} for contract \${contractId}\`);

      // Poll result in background (callback)
      pollAndStoreResult(executionId, ventureId, contractId);
    } catch (error) {
      console.error(\`Failed to submit CrewAI job for \${contractId}:\`, error);
      // Don't block stage advancement on job submission failure
    }
  }
}`,
      prepare_input: `// Prepare input data for contract
async function prepareContractInput(
  ventureId: string,
  contractId: string
): Promise<any> {
  const venture = await getVenture(ventureId);

  switch (contractId) {
    case 'journey-map-generator-v1':
      return {
        venture_name: venture.name,
        description: venture.description,
        target_market: venture.target_market,
        problem_statement: venture.problem_statement
      };

    case 'route-map-suggester-v1':
      return {
        venture_name: venture.name,
        current_stage: venture.current_stage,
        objectives: venture.objectives
      };

    // ... other contracts

    default:
      throw new Error(\`Unknown contract: \${contractId}\`);
  }
}`
    },
    testing_scenarios: [
      { scenario: 'Advance to Stage 2 triggers journey-map-generator', type: 'e2e', priority: 'P0' },
      { scenario: 'All 4 contract triggers mapped correctly', type: 'unit', priority: 'P0' },
      { scenario: 'Graceful degradation when CrewAI down', type: 'integration', priority: 'P0' },
      { scenario: 'Async job submission non-blocking', type: 'integration', priority: 'P1' },
      { scenario: 'Input data prepared correctly for each contract', type: 'unit', priority: 'P1' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-TRANSITION-001F:US-004',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Store CrewAI Outputs in venture_artifacts with Quality Score',
    user_role: 'Chairman',
    user_want: 'All CrewAI crew outputs persisted to venture_artifacts table with quality_score for traceability and analysis',
    user_benefit: 'Complete audit trail of AI-generated artifacts with quality metrics for continuous improvement',
    priority: 'critical',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-004-1',
        scenario: 'Happy path - Store artifact with quality score',
        given: 'CrewAI job completes successfully with result and quality_score',
        when: 'System stores result in venture_artifacts table',
        then: 'Artifact record created with venture_id, artifact_type, content (JSON), quality_score (0-100), created_by = "crewai:{contract_id}", and metadata includes execution_id and contract_version'
      },
      {
        id: 'AC-004-2',
        scenario: 'Artifact versioning',
        given: 'Artifact of same type already exists for venture',
        when: 'New CrewAI result is stored',
        then: 'New version is created AND previous version is retained AND version number increments'
      },
      {
        id: 'AC-004-3',
        scenario: 'Quality score validation',
        given: 'CrewAI returns quality_score in result',
        when: 'System validates quality_score before storage',
        then: 'Quality score must be between 0 and 100 AND error thrown if out of range OR quality_score is null'
      },
      {
        id: 'AC-004-4',
        scenario: 'Artifact retrieval',
        given: 'Multiple artifact versions exist for venture',
        when: 'UI requests latest artifact of type "user_journey_map"',
        then: 'Latest version is returned with quality_score AND version history is available'
      },
      {
        id: 'AC-004-5',
        scenario: 'Provenance tracking',
        given: 'Artifact is stored from CrewAI result',
        when: 'System records provenance metadata',
        then: 'Metadata includes: crew_name, execution_id, contract_id, contract_version, timestamp, input_parameters_hash for reproducibility'
      }
    ],
    definition_of_done: [
      'Artifact storage function created in crewaiService.ts',
      'venture_artifacts table updated with quality_score column (already exists from Phase A)',
      'Versioning logic implemented',
      'Quality score validation added',
      'Provenance metadata captured',
      'Unit tests for artifact storage pass',
      'Integration tests for versioning pass'
    ],
    technical_notes: 'Uses existing venture_artifacts table enhanced in Phase A with quality_score column. Implements artifact versioning (keep last 5 versions per type). Edge cases: Very large artifact content (>1MB), concurrent artifact creation for same venture/type, quality_score missing from CrewAI response (default to null), artifact storage failure after job completion (retry logic).',
    implementation_approach: 'Add storeCrewAIArtifact() function to crewaiService.ts. Query existing artifacts for versioning. Insert new record with full provenance metadata. Implement retention policy (delete versions older than 5).',
    implementation_context: 'FR-3: Critical for traceability and quality gate enforcement (US-005). Provides data for quality analysis and artifact history.',
    architecture_references: [
      'Database: venture_artifacts - artifact storage (quality_score column added in Phase A)',
      'ehg/src/services/crewaiService.ts - Artifact storage logic',
      'Database: leo_interfaces - contract version tracking',
      'ehg/src/hooks/useVentureArtifacts.ts - Artifact retrieval'
    ],
    example_code_patterns: {
      store_artifact: `// Store CrewAI result as artifact
export async function storeCrewAIArtifact(
  ventureId: string,
  contractId: string,
  executionId: string,
  result: any,
  qualityScore: number | null
): Promise<string> {
  // 1. Validate quality score
  if (qualityScore !== null && (qualityScore < 0 || qualityScore > 100)) {
    throw new Error(\`Invalid quality score: \${qualityScore}\`);
  }

  // 2. Determine artifact type from contract
  const artifactType = getArtifactTypeForContract(contractId);

  // 3. Get current version number
  const currentVersion = await getLatestArtifactVersion(ventureId, artifactType);
  const newVersion = currentVersion + 1;

  // 4. Insert artifact
  const { data, error } = await supabase
    .from('venture_artifacts')
    .insert({
      venture_id: ventureId,
      artifact_type: artifactType,
      content: result,
      quality_score: qualityScore,
      version: newVersion,
      created_by: \`crewai:\${contractId}\`,
      metadata: {
        execution_id: executionId,
        contract_id: contractId,
        contract_version: await getContractVersion(contractId),
        crew_name: result.crew_name,
        timestamp: new Date().toISOString()
      }
    })
    .select('id')
    .single();

  if (error) throw error;

  // 5. Clean up old versions (keep last 5)
  await cleanupOldArtifactVersions(ventureId, artifactType, 5);

  return data.id;
}`,
      artifact_type_mapping: `// Map contract to artifact type
function getArtifactTypeForContract(contractId: string): string {
  const mapping: Record<string, string> = {
    'journey-map-generator-v1': 'user_journey_map',
    'route-map-suggester-v1': 'route_map',
    'epic-planner-v1': 'user_story_pack',
    'build-planner-v1': 'system_prompt'
  };

  return mapping[contractId] || 'unknown';
}`,
      cleanup_old_versions: `// Delete old artifact versions (keep last N)
async function cleanupOldArtifactVersions(
  ventureId: string,
  artifactType: string,
  keepCount: number = 5
): Promise<void> {
  const { data: versions } = await supabase
    .from('venture_artifacts')
    .select('id, version')
    .eq('venture_id', ventureId)
    .eq('artifact_type', artifactType)
    .order('version', { ascending: false });

  if (versions && versions.length > keepCount) {
    const toDelete = versions.slice(keepCount).map(v => v.id);

    await supabase
      .from('venture_artifacts')
      .delete()
      .in('id', toDelete);

    console.log(\`Cleaned up \${toDelete.length} old artifact versions\`);
  }
}`
    },
    testing_scenarios: [
      { scenario: 'Store artifact with quality score', type: 'integration', priority: 'P0' },
      { scenario: 'Artifact versioning increments correctly', type: 'integration', priority: 'P1' },
      { scenario: 'Quality score validation rejects invalid values', type: 'unit', priority: 'P1' },
      { scenario: 'Retrieve latest artifact version', type: 'integration', priority: 'P1' },
      { scenario: 'Old versions cleaned up (keep last 5)', type: 'integration', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-TRANSITION-001F:US-005',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Enforce 85% Quality Gate at Decision Stages (3, 5, 16)',
    user_role: 'Chairman',
    user_want: 'Stage advancement blocked at decision stages (3, 5, 16) if average quality score of venture artifacts is below 85%',
    user_benefit: 'Ensures high-quality AI-generated artifacts inform critical go/no-go decisions, preventing poor quality from affecting venture outcomes',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-005-1',
        scenario: 'Happy path - Quality gate passes',
        given: 'Venture is at Stage 2 with artifact quality_score = 90% AND user attempts to advance to Stage 3 (decision stage)',
        when: 'advanceStage(ventureId, 3) is called',
        then: 'Quality gate check runs AND average quality score (90%) exceeds threshold (85%) AND stage advances successfully AND user sees "Quality gate passed: 90%"'
      },
      {
        id: 'AC-005-2',
        scenario: 'Error path - Quality gate fails',
        given: 'Venture is at Stage 2 with artifact quality_score = 70% AND user attempts to advance to Stage 3',
        when: 'advanceStage(ventureId, 3) is called',
        then: 'Quality gate check runs AND average quality score (70%) below threshold (85%) AND stage advancement BLOCKED AND error thrown "Quality gate failed: 70% < 85%. Improve artifacts before proceeding."'
      },
      {
        id: 'AC-005-3',
        scenario: 'Quality calculation - Multiple artifacts',
        given: 'Venture has 3 artifacts with quality scores: 85%, 90%, 80%',
        when: 'Quality gate calculates average',
        then: 'Average is calculated as (85 + 90 + 80) / 3 = 85% AND quality gate passes (threshold inclusive)'
      },
      {
        id: 'AC-005-4',
        scenario: 'Chairman override',
        given: 'Venture quality score is 75% (below threshold) AND Chairman provides override reason',
        when: 'advanceStage(ventureId, 3, { override: true, reason: "Prototype testing approved manually" })',
        then: 'Quality gate check runs AND override is logged in workflow_executions AND stage advances AND override reason stored for audit'
      },
      {
        id: 'AC-005-5',
        scenario: 'No artifacts - Bypass gate',
        given: 'Venture has no AI-generated artifacts (CrewAI was unavailable)',
        when: 'Quality gate check runs at Stage 3',
        then: 'Quality gate is bypassed (no artifacts to check) AND warning logged "No artifacts for quality check" AND stage advances (graceful degradation)'
      }
    ],
    definition_of_done: [
      'Quality gate check added to advanceStage() for stages 3, 5, 16',
      'Average quality score calculation implemented',
      'Stage advancement blocking logic added',
      'Chairman override mechanism implemented',
      'No-artifact bypass logic added',
      'Unit tests for quality calculation pass',
      'E2E tests for quality gate enforcement pass'
    ],
    technical_notes: 'Uses check_venture_quality_gate() function created in Phase A. Calculates average of all artifact quality_scores for venture. Decision stages (3, 5, 16) are configured in lifecycle_stage_config table. Edge cases: Quality score is null (exclude from average), all quality scores null (bypass gate), quality threshold configurable per stage (future enhancement), partial artifact set (some CrewAI jobs failed).',
    implementation_approach: 'Add quality gate check before stage update in advanceStage(). Query venture_artifacts for quality scores. Calculate average excluding nulls. Block transition if below threshold unless override provided. Log all gate checks to workflow_executions.',
    implementation_context: 'FR-4: Critical quality enforcement. Prevents low-quality AI outputs from affecting business decisions. Must allow Chairman override for flexibility.',
    architecture_references: [
      'ehg/src/services/workflowExecutionService.ts - Stage advancement with quality gate',
      'Database: venture_artifacts - quality_score column',
      'Database: check_venture_quality_gate() - Phase A function',
      'Database: lifecycle_stage_config - decision stage configuration',
      'Database: workflow_executions - quality gate audit log'
    ],
    example_code_patterns: {
      quality_gate_check: `// Quality gate enforcement in advanceStage()
async function enforceQualityGate(
  ventureId: string,
  targetStage: number,
  options?: { override?: boolean; reason?: string }
): Promise<void> {
  const decisionStages = [3, 5, 16];

  if (!decisionStages.includes(targetStage)) {
    return; // Not a decision stage, skip gate
  }

  // Calculate average quality score
  const avgQuality = await calculateAverageQualityScore(ventureId);

  if (avgQuality === null) {
    console.warn('No artifacts for quality gate check, bypassing');
    return; // No artifacts, bypass gate (graceful degradation)
  }

  const threshold = 85; // TODO: Make configurable per stage

  if (avgQuality < threshold) {
    if (options?.override) {
      // Chairman override
      await logQualityGateOverride(ventureId, targetStage, avgQuality, options.reason);
      console.warn(\`Quality gate overridden at stage \${targetStage}: \${avgQuality}%\`);
      return;
    }

    throw new Error(
      \`Quality gate failed: \${avgQuality}% < \${threshold}%. Improve artifacts before proceeding.\`
    );
  }

  // Gate passed
  console.log(\`Quality gate passed: \${avgQuality}% >= \${threshold}%\`);
}`,
      calculate_quality: `// Calculate average quality score for venture
async function calculateAverageQualityScore(
  ventureId: string
): Promise<number | null> {
  const { data: artifacts } = await supabase
    .from('venture_artifacts')
    .select('quality_score')
    .eq('venture_id', ventureId)
    .not('quality_score', 'is', null);

  if (!artifacts || artifacts.length === 0) {
    return null; // No artifacts with quality scores
  }

  const scores = artifacts.map(a => a.quality_score as number);
  const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;

  return Math.round(average); // Round to integer
}`,
      log_override: `// Log quality gate override for audit
async function logQualityGateOverride(
  ventureId: string,
  stage: number,
  actualQuality: number,
  reason: string
): Promise<void> {
  await supabase
    .from('workflow_executions')
    .insert({
      venture_id: ventureId,
      execution_type: 'quality_gate_override',
      metadata: {
        stage,
        actual_quality_score: actualQuality,
        threshold: 85,
        override_reason: reason,
        overridden_by: 'Chairman',
        timestamp: new Date().toISOString()
      }
    });
}`
    },
    testing_scenarios: [
      { scenario: 'Quality gate passes with score above 85%', type: 'e2e', priority: 'P0' },
      { scenario: 'Quality gate blocks with score below 85%', type: 'e2e', priority: 'P0' },
      { scenario: 'Average quality calculated correctly', type: 'unit', priority: 'P1' },
      { scenario: 'Chairman override allows advancement', type: 'e2e', priority: 'P1' },
      { scenario: 'No artifacts bypasses quality gate', type: 'e2e', priority: 'P1' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-TRANSITION-001F:US-006',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Display CrewAI Results in VentureDetail UI with Status Indicators',
    user_role: 'Chairman',
    user_want: 'View CrewAI-generated artifacts, execution status, and quality scores directly in the VentureDetail page',
    user_benefit: 'Understand AI analysis results and quality metrics to make informed decisions about venture progression',
    priority: 'high',
    story_points: 5,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-006-1',
        scenario: 'Happy path - Display artifact with quality score',
        given: 'Venture has CrewAI-generated "user_journey_map" artifact with quality_score = 88%',
        when: 'User views VentureDetail page',
        then: 'Artifact section displays "User Journey Map" with quality badge (88%, green) AND artifact content is viewable AND generated_by shows "CrewAI: journey-map-generator-v1"'
      },
      {
        id: 'AC-006-2',
        scenario: 'Status indicators - Job in progress',
        given: 'CrewAI job is running for venture',
        when: 'User views VentureDetail page',
        then: 'Status indicator shows "AI Analysis in Progress" with spinner AND estimated completion time displayed AND user can refresh to check status'
      },
      {
        id: 'AC-006-3',
        scenario: 'Quality score visualization',
        given: 'Venture has 3 artifacts with scores 90%, 85%, 70%',
        when: 'User views quality summary',
        then: 'Quality scores displayed with color coding: 90% (green), 85% (yellow), 70% (red) AND average quality score shown (81.67%) AND quality gate status indicated (Pass/Fail for decision stages)'
      },
      {
        id: 'AC-006-4',
        scenario: 'Error state - Job failed',
        given: 'CrewAI job failed with error message',
        when: 'User views VentureDetail page',
        then: 'Error indicator shows "AI Analysis Failed" AND error message displayed AND "Retry" button available AND option to proceed without AI artifact'
      },
      {
        id: 'AC-006-5',
        scenario: 'Manual re-trigger',
        given: 'Venture is at Stage 2 AND artifact exists',
        when: 'User clicks "Re-generate with AI" button',
        then: 'New CrewAI job is submitted AND previous artifact is versioned AND new artifact replaces current when complete'
      }
    ],
    definition_of_done: [
      'VentureDetail.tsx updated with CrewAI artifacts section',
      'Quality score badges with color coding implemented',
      'Status indicators for pending/running/failed jobs',
      'Manual re-trigger button added',
      'Error handling and retry UI',
      'Unit tests for UI components pass',
      'E2E tests for artifact display pass'
    ],
    technical_notes: 'Extends VentureDetail.tsx with new CrewAI artifacts section. Uses useVentureArtifacts hook to fetch artifacts. Implements real-time status polling for in-progress jobs. Edge cases: Very large artifact content (pagination or expansion), multiple concurrent jobs for same venture, artifact content with special formatting (JSON, Markdown), accessibility for color-blind users (not just color for quality indicators).',
    implementation_approach: 'Add CrewAIArtifacts component to VentureDetail.tsx. Create useCrewAIStatus hook for job status polling. Implement quality score badges with shadcn/ui Badge component. Add manual re-trigger action.',
    implementation_context: 'FR-5 related: UI must handle graceful degradation when CrewAI unavailable. Provides visibility into AI automation status and results.',
    architecture_references: [
      'ehg/src/pages/VentureDetail.tsx - Main venture detail page',
      'ehg/src/components/ventures/CrewAIArtifacts.tsx (NEW) - Artifacts display component',
      'ehg/src/hooks/useVentureArtifacts.ts - Artifact data fetching',
      'ehg/src/hooks/useCrewAIStatus.ts (NEW) - Job status polling',
      'ehg/src/components/ui/Badge.tsx - Quality score badges'
    ],
    example_code_patterns: {
      artifacts_component: `// CrewAIArtifacts.tsx component
export function CrewAIArtifacts({ ventureId }: { ventureId: string }) {
  const { artifacts, loading } = useVentureArtifacts(ventureId);
  const { jobStatus } = useCrewAIStatus(ventureId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI-Generated Artifacts</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Job status indicator */}
        {jobStatus && (
          <JobStatusIndicator status={jobStatus} />
        )}

        {/* Artifact list */}
        {artifacts.map(artifact => (
          <ArtifactCard
            key={artifact.id}
            artifact={artifact}
            onRegenerate={() => handleRegenerate(artifact.artifact_type)}
          />
        ))}
      </CardContent>
    </Card>
  );
}`,
      quality_badge: `// Quality score badge with color coding
function QualityScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <Badge variant="secondary">Not Scored</Badge>;
  }

  const getVariant = (score: number) => {
    if (score >= 85) return 'success'; // Green
    if (score >= 70) return 'warning'; // Yellow
    return 'destructive'; // Red
  };

  return (
    <Badge variant={getVariant(score)}>
      Quality: {score}%
    </Badge>
  );
}`,
      status_indicator: `// Job status indicator
function JobStatusIndicator({ status }: { status: CrewAIJobResult }) {
  const getStatusIcon = () => {
    switch (status.status) {
      case 'running':
        return <Loader2 className="animate-spin" />;
      case 'completed':
        return <CheckCircle className="text-green-500" />;
      case 'failed':
        return <XCircle className="text-red-500" />;
      default:
        return <Clock className="text-gray-500" />;
    }
  };

  return (
    <div className="flex items-center gap-2">
      {getStatusIcon()}
      <span>{getStatusMessage(status)}</span>
    </div>
  );
}`,
      manual_retrigger: `// Manual re-trigger action
async function handleRegenerate(artifactType: string) {
  const contractId = getContractIdForArtifactType(artifactType);

  if (!contractId) {
    toast.error('Cannot regenerate this artifact type');
    return;
  }

  try {
    const inputData = await prepareContractInput(ventureId, contractId);
    const executionId = await submitCrewAIJob(contractId, ventureId, inputData);

    toast.success('AI analysis started. Results will appear when complete.');

    // Start polling for result
    pollJobStatus(executionId);
  } catch (error) {
    toast.error(\`Failed to start AI analysis: \${error.message}\`);
  }
}`
    },
    testing_scenarios: [
      { scenario: 'Display artifact with quality score badge', type: 'e2e', priority: 'P0' },
      { scenario: 'Show job in progress with spinner', type: 'e2e', priority: 'P1' },
      { scenario: 'Quality scores color-coded correctly', type: 'unit', priority: 'P1' },
      { scenario: 'Display error state with retry button', type: 'e2e', priority: 'P1' },
      { scenario: 'Manual re-trigger submits new job', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  },
  {
    story_key: 'SD-VISION-TRANSITION-001F:US-007',
    prd_id: PRD_ID,
    sd_id: SD_ID,
    title: 'Implement Graceful Degradation for CrewAI Unavailability',
    user_role: 'Chairman',
    user_want: 'Venture workflow continues functioning even when CrewAI Agent Platform is unavailable or experiencing issues',
    user_benefit: 'System resilience ensures business continuity without dependency on AI service uptime',
    priority: 'critical',
    story_points: 3,
    status: 'draft',
    acceptance_criteria: [
      {
        id: 'AC-007-1',
        scenario: 'Happy path - CrewAI available',
        given: 'CrewAI Agent Platform is running AND circuit breaker is CLOSED',
        when: 'User advances to Stage 2',
        then: 'CrewAI job is submitted successfully AND stage advances AND artifact generation proceeds normally'
      },
      {
        id: 'AC-007-2',
        scenario: 'Graceful degradation - CrewAI unavailable',
        given: 'CrewAI Agent Platform is down AND circuit breaker is OPEN',
        when: 'User advances to Stage 2 which normally triggers CrewAI',
        then: 'Stage advances successfully (not blocked) AND warning notification "AI analysis unavailable, proceeding without automated artifacts" AND user can manually add artifacts later'
      },
      {
        id: 'AC-007-3',
        scenario: 'Quality gate bypass - No artifacts available',
        given: 'Venture reached decision Stage 3 AND no AI artifacts exist (CrewAI was down)',
        when: 'User attempts to advance past Stage 3',
        then: 'Quality gate is bypassed (no artifacts to check) AND warning shown "Quality gate skipped - no AI artifacts available" AND stage advances (manual decision making)'
      },
      {
        id: 'AC-007-4',
        scenario: 'Circuit breaker recovery',
        given: 'Circuit breaker was OPEN (CrewAI down) AND CrewAI service recovers',
        when: 'Circuit breaker reset timeout expires AND health check passes',
        then: 'Circuit breaker transitions to HALF_OPEN AND next request attempts CrewAI call AND if successful, circuit transitions to CLOSED AND normal operation resumes'
      },
      {
        id: 'AC-007-5',
        scenario: 'User notification - Service status',
        given: 'CrewAI service status changes',
        when: 'Circuit breaker opens or closes',
        then: 'User sees notification banner: "AI analysis service unavailable" (when open) OR "AI analysis service restored" (when recovered)'
      }
    ],
    definition_of_done: [
      'Circuit breaker integration with CrewAI calls',
      'Stage advancement continues when CrewAI unavailable',
      'Quality gate bypass logic for no-artifact scenarios',
      'Circuit breaker recovery mechanism',
      'User notifications for service status changes',
      'Unit tests for graceful degradation pass',
      'E2E tests simulating CrewAI downtime pass'
    ],
    technical_notes: 'Leverages existing circuit breaker pattern from evaCircuitBreaker.ts. Ensures no blocking dependencies on CrewAI for core venture workflows. Logs all degradation events for monitoring. Edge cases: CrewAI intermittent failures (flapping circuit breaker), partial response before timeout, service recovery during active job processing, network partition between services.',
    implementation_approach: 'Wrap all CrewAI service calls with circuit breaker. Implement try-catch in triggerCrewAIContractsForStage() to not throw on failure. Add circuit breaker event listeners for user notifications. Log degradation events to monitoring.',
    implementation_context: 'FR-5: Critical resilience requirement. System must function without AI dependency. Prevents venture workflow blockage due to infrastructure issues.',
    architecture_references: [
      'ehg/src/lib/integration/evaCircuitBreaker.ts - Circuit breaker pattern',
      'ehg/src/services/crewaiService.ts - CrewAI client with circuit breaker',
      'ehg/src/services/workflowExecutionService.ts - Degradation handling',
      'ehg/src/lib/monitoring/serviceHealth.ts - Service health monitoring'
    ],
    example_code_patterns: {
      circuit_breaker_wrapper: `// Circuit breaker wrapper for CrewAI calls
async function callCrewAIWithCircuitBreaker<T>(
  operation: () => Promise<T>
): Promise<T | null> {
  const breaker = getCircuitBreaker('crewai-platform');

  try {
    return await breaker.execute(operation);
  } catch (error) {
    if (breaker.state === 'open') {
      console.warn('CrewAI circuit breaker OPEN - graceful degradation');
      notifyUser('AI analysis service unavailable', 'warning');
      return null; // Graceful degradation
    }

    console.error('CrewAI call failed:', error);
    return null;
  }
}`,
      degradation_handling: `// Graceful degradation in stage trigger
async function triggerCrewAIContractsForStage(
  ventureId: string,
  stage: number
): Promise<void> {
  const result = await callCrewAIWithCircuitBreaker(async () => {
    const contractIds = STAGE_TO_CONTRACT_MAP[stage];
    if (!contractIds) return;

    for (const contractId of contractIds) {
      const inputData = await prepareContractInput(ventureId, contractId);
      await submitCrewAIJob(contractId, ventureId, inputData);
    }
  });

  if (result === null) {
    // CrewAI unavailable - log and continue
    console.log(\`Stage \${stage} advanced without AI artifacts (service unavailable)\`);

    await logDegradationEvent(ventureId, stage, 'crewai_unavailable');

    // DO NOT throw error - allow workflow to continue
  }
}`,
      quality_gate_bypass: `// Quality gate bypass when no artifacts
async function enforceQualityGate(
  ventureId: string,
  targetStage: number
): Promise<void> {
  const avgQuality = await calculateAverageQualityScore(ventureId);

  if (avgQuality === null) {
    // No artifacts - bypass quality gate (graceful degradation)
    console.warn(\`Quality gate bypassed at stage \${targetStage} - no artifacts\`);

    notifyUser(
      'Quality gate skipped - no AI artifacts available. Proceeding with manual review.',
      'warning'
    );

    await logQualityGateBypass(ventureId, targetStage, 'no_artifacts');

    return; // Allow advancement
  }

  // Normal quality gate logic
  // ...
}`,
      circuit_recovery: `// Circuit breaker event listeners
breaker.on('open', () => {
  console.error('CrewAI circuit breaker OPENED');
  notifyUser('AI analysis service unavailable - system will continue without AI', 'error');
  logServiceEvent('crewai', 'circuit_open');
});

breaker.on('halfOpen', () => {
  console.log('CrewAI circuit breaker HALF_OPEN - attempting recovery');
});

breaker.on('close', () => {
  console.log('CrewAI circuit breaker CLOSED - service restored');
  notifyUser('AI analysis service restored', 'success');
  logServiceEvent('crewai', 'circuit_closed');
});`
    },
    testing_scenarios: [
      { scenario: 'Stage advances successfully when CrewAI down', type: 'e2e', priority: 'P0' },
      { scenario: 'Quality gate bypassed with no artifacts', type: 'e2e', priority: 'P0' },
      { scenario: 'Circuit breaker opens after failures', type: 'integration', priority: 'P1' },
      { scenario: 'Circuit breaker recovers when service restored', type: 'integration', priority: 'P1' },
      { scenario: 'User notifications for service status changes', type: 'e2e', priority: 'P2' }
    ],
    created_by: 'STORIES'
  }
];

async function addUserStories() {
  console.log('📋 Creating user stories for SD-VISION-TRANSITION-001F...\n');

  // Check if stories already exist
  const { data: existing, error: checkError } = await supabase
    .from('user_stories')
    .select('story_key')
    .eq('sd_id', SD_ID);

  if (checkError) {
    console.error('❌ Error checking existing stories:', checkError.message);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log('⚠️  User stories already exist for this SD:');
    existing.forEach(s => console.log('   -', s.story_key));
    console.log('\n💡 To recreate, first delete existing stories:');
    console.log(`   DELETE FROM user_stories WHERE sd_id = '${SD_ID}';`);
    process.exit(0);
  }

  // Insert stories
  const { data: inserted, error: insertError } = await supabase
    .from('user_stories')
    .insert(userStories)
    .select();

  if (insertError) {
    console.error('❌ Error inserting user stories:', insertError.message);
    console.error('   Details:', insertError);
    process.exit(1);
  }

  console.log('✅ Successfully created', inserted.length, 'user stories:\n');

  let totalPoints = 0;
  const priorityCounts = { critical: 0, high: 0, medium: 0, low: 0 };

  inserted.forEach(story => {
    console.log(`   ${story.story_key}: ${story.title}`);
    console.log(`     Priority: ${story.priority} | Points: ${story.story_points}`);
    console.log(`     AC Count: ${story.acceptance_criteria?.length || 0}`);
    console.log('');
    totalPoints += story.story_points || 0;
    priorityCounts[story.priority] = (priorityCounts[story.priority] || 0) + 1;
  });

  console.log('--- Summary ---');
  console.log(`Total Stories: ${inserted.length}`);
  console.log(`Total Story Points: ${totalPoints}`);
  console.log(`SD: ${SD_ID}`);
  console.log(`PRD: ${PRD_ID}`);

  console.log('\n--- Priority Breakdown ---');
  console.log(`  Critical: ${priorityCounts.critical} stories`);
  console.log(`  High: ${priorityCounts.high} stories`);
  console.log(`  Medium: ${priorityCounts.medium} stories`);
  console.log(`  Low: ${priorityCounts.low} stories`);

  console.log('\n--- Functional Requirement Mapping ---');
  console.log('  FR-1 (Register API Gateway) → US-001');
  console.log('  FR-2 (Hook advanceStage) → US-002, US-003');
  console.log('  FR-3 (Store Artifacts) → US-004');
  console.log('  FR-4 (Quality Gate) → US-005');
  console.log('  FR-5 (Graceful Degradation) → US-007');
  console.log('  UI Enhancement → US-006');

  console.log('\n--- Implementation Order (Recommended) ---');
  console.log('  1. US-001 (API Gateway Registration) - Foundation');
  console.log('  2. US-002 (CrewAI Client Service) - Service abstraction');
  console.log('  3. US-004 (Store Artifacts) - Data persistence');
  console.log('  4. US-003 (Hook advanceStage) - Integration point');
  console.log('  5. US-005 (Quality Gate) - Quality enforcement');
  console.log('  6. US-007 (Graceful Degradation) - Resilience');
  console.log('  7. US-006 (UI Display) - User experience (last)');

  console.log('\n--- INVEST Quality Check ---');
  console.log('  ✅ Independent - Each story can be developed separately');
  console.log('  ✅ Negotiable - Implementation details flexible');
  console.log('  ✅ Valuable - Each delivers user/business value');
  console.log('  ✅ Estimable - Story points assigned (3-8 points)');
  console.log('  ✅ Small - All stories completable in 1-2 days');
  console.log('  ✅ Testable - Given-When-Then acceptance criteria defined');

  console.log('\n--- Context Engineering (BMAD Enhancement) ---');
  console.log('  ✅ Architecture references provided for all stories');
  console.log('  ✅ Example code patterns included');
  console.log('  ✅ Testing scenarios defined (unit, integration, e2e)');
  console.log('  ✅ Implementation approach specified');
  console.log('  ✅ Edge cases documented');

  console.log('\n--- Next Steps ---');
  console.log('1. Review stories in database or via query');
  console.log('2. Create PRD for SD-VISION-TRANSITION-001F if not exists');
  console.log('3. Run PLAN-TO-EXEC handoff when ready');
  console.log('4. Implement in recommended order (US-001 → US-007)');
  console.log('5. Write E2E tests for quality gate and graceful degradation');
  console.log('6. Test with CrewAI platform down (circuit breaker scenarios)');
}

addUserStories().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
