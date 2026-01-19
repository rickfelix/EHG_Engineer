/**
 * LEO Protocol Plan Mode Integration - Public API
 * SD-PLAN-MODE-001: Permission bundling
 * SD-PLAN-MODE-002: LEO action plan templates
 * SD-PLAN-MODE-003: Intelligent SD-type aware plan generation
 */

export { LEOPlanModeOrchestrator } from './LEOPlanModeOrchestrator.js';

// Phase permissions
export {
  getPermissionsForPhase,
  getCombinedPermissions,
  LEAD_PERMISSIONS,
  PLAN_PERMISSIONS,
  EXEC_PERMISSIONS,
  VERIFY_PERMISSIONS,
  FINAL_PERMISSIONS,
  PHASE_PERMISSIONS
} from './phase-permissions.js';

// Basic plan templates (fallback)
export {
  getPlanTemplate,
  getPlanFilename,
  LEAD_PLAN_TEMPLATE,
  PLAN_PLAN_TEMPLATE,
  EXEC_PLAN_TEMPLATE,
  VERIFY_PLAN_TEMPLATE,
  FINAL_PLAN_TEMPLATE
} from './plan-templates.js';

// SD-PLAN-MODE-003: SD context loading
export {
  loadSDContext,
  getRecommendedSubAgents,
  getWorkflowIntensity,
  SD_TYPE_PROFILES,
  COMPLEXITY_PROFILES
} from './sd-context-loader.js';

// SD-PLAN-MODE-003: Intelligent plan templates
export {
  generateIntelligentPlan,
  generateLeadPlan,
  generatePlanPlan,
  generateExecPlan,
  generateVerifyPlan,
  generateFinalPlan
} from './intelligent-plan-templates.js';

import { LEOPlanModeOrchestrator } from './LEOPlanModeOrchestrator.js';
export default LEOPlanModeOrchestrator;
