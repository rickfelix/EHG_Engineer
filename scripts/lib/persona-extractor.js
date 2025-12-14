/**
 * Persona Extractor for PRD Pipeline
 * Extracts stakeholder personas from SD metadata or generates intelligent defaults.
 *
 * Part of: Vision Discovery & Persona-Driven PRD Pipeline
 * Feature Flag: PERSONA_INGESTION_ENABLED (default: true)
 */

/**
 * Default persona templates based on Solo Entrepreneur model
 */
const DEFAULT_PERSONAS = {
  chairman: {
    persona_id: 'chairman',
    name: 'Chairman (Solo Entrepreneur)',
    needs: ['ROI visibility', 'Resource efficiency', 'Quick iteration', 'Strategic alignment'],
    pain_points: ['Too much detail', 'Missing financial KPIs', 'Slow feedback loops'],
    success_criteria: ['Clear ROI path', 'Minimal overhead', 'Measurable outcomes']
  },
  venture_end_user: {
    persona_id: 'venture_end_user',
    name: 'Venture End User',
    needs: ['Intuitive interface', 'Fast task completion', 'Clear feedback'],
    pain_points: ['Confusing workflows', 'Missing features', 'Slow performance'],
    success_criteria: ['Task completion rate > 90%', 'User satisfaction', 'Low error rate']
  },
  eva: {
    persona_id: 'eva',
    name: 'EVA (AI Chief of Staff)',
    needs: ['Clear orchestration APIs', 'Reliable automation', 'Observable state'],
    pain_points: ['Unclear agent boundaries', 'Missing context', 'Brittle integrations'],
    success_criteria: ['Autonomous execution', 'Predictable behavior', 'Graceful degradation']
  },
  devops_engineer: {
    persona_id: 'devops_engineer',
    name: 'DevOps Engineer',
    needs: ['Reliable deployments', 'Clear monitoring', 'Fast rollback'],
    pain_points: ['Flaky pipelines', 'Missing logs', 'Configuration drift'],
    success_criteria: ['Zero-downtime deploys', 'Full observability', 'Fast recovery']
  }
};

/**
 * Keywords that indicate EVA/automation involvement
 */
const EVA_KEYWORDS = [
  'orchestration', 'automation', 'agent', 'eva', 'ai', 'autonomous',
  'workflow', 'crew', 'crewai', 'pipeline', 'scheduled', 'recurring'
];

/**
 * Check if persona payload is enabled via feature flag
 * @returns {boolean}
 */
export function isPersonaIngestionEnabled() {
  const flag = process.env.PERSONA_INGESTION_ENABLED;
  // Default to true if not set, only disable if explicitly 'false'
  return flag !== 'false';
}

/**
 * Check if persona prompt injection is enabled via feature flag
 * @returns {boolean}
 */
export function isPersonaPromptInjectionEnabled() {
  const flag = process.env.PERSONA_PROMPT_INJECTION_ENABLED;
  // Default to true if not set, only disable if explicitly 'false'
  return flag !== 'false';
}

/**
 * Check if persona-based story role assignment is enabled via feature flag
 * @returns {boolean}
 */
export function isPersonaStoryRoleEnabled() {
  const flag = process.env.PERSONA_STORY_ROLE_ENABLED;
  // Default to true if not set, only disable if explicitly 'false'
  return flag !== 'false';
}

/**
 * Check if soft gate for feature SDs without personas is enabled
 * @returns {boolean}
 */
export function isPersonaSoftGateEnabled() {
  const flag = process.env.PERSONA_SOFT_GATE_ENABLED;
  // Default to FALSE (opt-in) - only enable if explicitly 'true'
  return flag === 'true';
}

/**
 * Check if vision brief is approved for the given SD
 * Used by soft gate to require Chairman approval before PRD generation
 * @param {Object} sdData - Strategic Directive data with metadata field
 * @returns {boolean}
 */
export function isVisionBriefApproved(sdData) {
  const status = sdData?.metadata?.vision_discovery?.approval?.status;
  return status === 'approved';
}

/**
 * Maximum length for persona context block in prompts (chars)
 * Prevents excessively long prompts from persona data
 */
const MAX_PERSONA_CONTEXT_LENGTH = 2000;

/**
 * Build a formatted persona context string for sub-agent prompts
 * @param {Array} personas - Array of persona objects
 * @param {Object} options - Optional configuration
 * @param {number} options.maxLength - Maximum length before truncation (default: 2000)
 * @returns {{ context: string, truncated: boolean }}
 */
export function buildPersonaContextString(personas, options = {}) {
  const maxLength = options.maxLength || MAX_PERSONA_CONTEXT_LENGTH;

  if (!Array.isArray(personas) || personas.length === 0) {
    return { context: '', truncated: false };
  }

  const lines = ['**Stakeholder Personas** (consider these perspectives in your analysis):\n'];

  for (const persona of personas) {
    const name = persona.name || persona.persona_id || 'Unknown';
    const needs = Array.isArray(persona.needs) ? persona.needs.join(', ') : 'N/A';
    const painPoints = Array.isArray(persona.pain_points) ? persona.pain_points.join(', ') : 'N/A';
    const successCriteria = Array.isArray(persona.success_criteria) ? persona.success_criteria.join(', ') : 'N/A';

    lines.push(`- **${name}**`);
    lines.push(`  - Needs: ${needs}`);
    lines.push(`  - Pain Points: ${painPoints}`);
    lines.push(`  - Success Criteria: ${successCriteria}`);
    lines.push('');
  }

  let context = lines.join('\n');
  let truncated = false;

  // Apply length guard
  if (context.length > maxLength) {
    context = context.substring(0, maxLength - 50) + '\n\n[... persona details truncated for length ...]\n';
    truncated = true;
  }

  return { context, truncated };
}

/**
 * Validate persona object shape (lightweight, non-throwing)
 * @param {Object} persona - Persona object to validate
 * @returns {boolean} - Whether the persona is valid
 */
function isValidPersona(persona) {
  if (!persona || typeof persona !== 'object') return false;
  if (typeof persona.persona_id !== 'string' || !persona.persona_id) return false;
  if (typeof persona.name !== 'string' || !persona.name) return false;
  // needs, pain_points, success_criteria are optional but should be arrays if present
  if (persona.needs && !Array.isArray(persona.needs)) return false;
  if (persona.pain_points && !Array.isArray(persona.pain_points)) return false;
  if (persona.success_criteria && !Array.isArray(persona.success_criteria)) return false;
  return true;
}

/**
 * Check if SD text mentions EVA/automation concepts
 * @param {Object} sdData - Strategic Directive data
 * @returns {boolean}
 */
function mentionsAutomation(sdData) {
  const textToSearch = [
    sdData.title || '',
    sdData.scope || '',
    sdData.description || '',
    JSON.stringify(sdData.strategic_objectives || '')
  ].join(' ').toLowerCase();

  return EVA_KEYWORDS.some(keyword => textToSearch.includes(keyword));
}

/**
 * Generate intelligent default personas based on SD type and content
 * @param {Object} sdData - Strategic Directive data
 * @returns {Array} - Array of persona objects
 */
function generateDefaultPersonas(sdData) {
  const personas = [];
  const sdType = sdData.sd_type || 'feature';

  // Chairman is ALWAYS included (Solo Entrepreneur model)
  personas.push({ ...DEFAULT_PERSONAS.chairman });

  // Add type-specific personas
  switch (sdType) {
    case 'feature':
      personas.push({ ...DEFAULT_PERSONAS.venture_end_user });
      break;
    case 'infrastructure':
      personas.push({ ...DEFAULT_PERSONAS.devops_engineer });
      break;
    case 'database':
      // Database changes affect both DevOps and End Users
      personas.push({ ...DEFAULT_PERSONAS.devops_engineer });
      break;
    case 'security':
      // Security affects all users
      personas.push({ ...DEFAULT_PERSONAS.venture_end_user });
      break;
    case 'documentation':
      // Documentation primarily serves developers, but still affects end users
      personas.push({ ...DEFAULT_PERSONAS.venture_end_user });
      break;
    default:
      // Default to end user for unknown types
      personas.push({ ...DEFAULT_PERSONAS.venture_end_user });
  }

  // Add EVA if automation/orchestration is mentioned
  if (mentionsAutomation(sdData)) {
    personas.push({ ...DEFAULT_PERSONAS.eva });
  }

  return personas;
}

/**
 * Extract stakeholder personas from SD metadata or generate intelligent defaults
 * @param {Object} sdData - Strategic Directive data with metadata field
 * @returns {{ personas: Array, source: string, count: number }}
 */
export function extractPersonasFromSD(sdData) {
  // Check feature flag first
  if (!isPersonaIngestionEnabled()) {
    return {
      personas: [],
      source: 'disabled',
      count: 0
    };
  }

  // Try to extract from SD.metadata.vision_discovery.stakeholder_personas
  const metadataPersonas = sdData?.metadata?.vision_discovery?.stakeholder_personas;

  if (Array.isArray(metadataPersonas) && metadataPersonas.length > 0) {
    // Validate and filter personas
    const validPersonas = metadataPersonas.filter(isValidPersona);

    if (validPersonas.length > 0) {
      return {
        personas: validPersonas,
        source: 'metadata',
        count: validPersonas.length
      };
    }
    // If all personas were invalid, fall through to defaults
    console.log('   ⚠️  PERSONA_INGESTION: metadata personas invalid, using defaults');
  }

  // Generate intelligent defaults
  const defaultPersonas = generateDefaultPersonas(sdData);

  return {
    personas: defaultPersonas,
    source: 'defaults',
    count: defaultPersonas.length
  };
}

export default extractPersonasFromSD;
