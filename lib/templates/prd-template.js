/**
 * PRD Template Engine
 * Generates PRD data from SD metadata with configurable overrides.
 * Part of SD-REFACTOR-SCRIPTS-001: Script Framework Consolidation
 * Extended with Design Vocabulary support: SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-A
 * @module lib/templates/prd-template
 */

import { suggestPersonality, getPersonalityOptions } from '../agents/plan/styleTagger.js';

export const PRD_TEMPLATE = {
  version: '1.0',
  status: 'draft',
  phase: 'planning',
  created_by: 'LEO_TEMPLATE_ENGINE',
  computed: {
    // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Use sd_key instead of legacy_id (column dropped 2026-01-24)
    id: (sd) => `PRD-${sd.sd_key || sd.id}`,
    directive_id: (sd) => sd.id,
    sd_id: (sd) => sd.id,
    title: (sd) => `${sd.title} PRD`,
    category: (sd) => sd.sd_type || 'feature',
    priority: (sd) => sd.priority || 'medium',
  }
};

function generateExecutiveSummary(sd) {
  const parts = [];
  if (sd.description) parts.push(sd.description);
  if (sd.problem_statement) parts.push(`\n\nProblem Statement: ${sd.problem_statement}`);
  if (sd.strategic_objectives?.length > 0) {
    const objectives = sd.strategic_objectives.map((o, i) => `${i + 1}. ${typeof o === 'string' ? o : o.objective}`).join('\n');
    parts.push(`\n\nStrategic Objectives:\n${objectives}`);
  }
  return parts.join('') || `PRD for ${sd.title}`;
}

function generateFunctionalRequirements(sd) {
  const requirements = [];
  if (sd.success_criteria?.length > 0) {
    sd.success_criteria.forEach((criterion, idx) => {
      const text = typeof criterion === 'string' ? criterion : criterion.criterion;
      requirements.push({
        id: `FR-${idx + 1}`,
        requirement: text,
        priority: 'HIGH',
        description: 'Derived from SD success criterion',
        acceptance_criteria: [`${text} is verified and documented`]
      });
    });
  }
  if (requirements.length === 0 && sd.scope) {
    const scopeLines = sd.scope.split('\n').filter(l => l.trim());
    scopeLines.slice(0, 5).forEach((line, idx) => {
      requirements.push({
        id: `FR-${idx + 1}`,
        requirement: line.replace(/^[-*]\s*/, '').trim(),
        priority: idx < 2 ? 'HIGH' : 'MEDIUM',
        description: 'Derived from SD scope',
        acceptance_criteria: ['Requirement implemented and tested']
      });
    });
  }
  if (requirements.length === 0) {
    requirements.push({
      id: 'FR-1',
      requirement: `Implement ${sd.title}`,
      priority: 'HIGH',
      description: 'Primary deliverable',
      acceptance_criteria: ['Feature implemented as specified']
    });
  }
  return requirements;
}

function generateAcceptanceCriteria(sd) {
  const criteria = [];
  if (sd.success_criteria?.length > 0) {
    sd.success_criteria.forEach(c => criteria.push(typeof c === 'string' ? c : c.criterion));
  }
  if (sd.success_metrics?.length > 0) {
    sd.success_metrics.forEach(m => {
      if (typeof m === 'string') criteria.push(m);
      else if (m.metric && m.target) criteria.push(`${m.metric}: ${m.target}`);
    });
  }
  criteria.push('All unit tests passing', 'Code review completed', 'Documentation updated');
  return [...new Set(criteria)];
}

function generateTestScenarios(sd) {
  const scenarios = [];
  if (sd.success_criteria?.length > 0) {
    sd.success_criteria.slice(0, 4).forEach((c, idx) => {
      const criterion = typeof c === 'string' ? c : c.criterion;
      scenarios.push({
        id: `TS-${idx + 1}`,
        scenario: `Verify: ${criterion}`,
        test_type: 'integration',
        description: `Test that ${criterion.toLowerCase()}`,
        expected_result: `${criterion} verified successfully`
      });
    });
  }
  scenarios.push({
    id: `TS-${scenarios.length + 1}`,
    scenario: 'Handle error conditions gracefully',
    test_type: 'unit',
    description: 'Test error handling paths',
    expected_result: 'Errors caught and handled with appropriate messages'
  });
  return scenarios;
}

function generateRisks(sd) {
  const typeRisks = {
    refactor: [{ risk: 'Regression in existing functionality', impact: 'HIGH', probability: 'MEDIUM', category: 'Technical', mitigation: 'Comprehensive test coverage before refactoring', severity: 'HIGH' }],
    feature: [{ risk: 'Scope creep beyond original requirements', impact: 'MEDIUM', probability: 'MEDIUM', category: 'Process', mitigation: 'Strict adherence to PRD scope', severity: 'MEDIUM' }],
    infrastructure: [{ risk: 'Breaking changes to dependent systems', impact: 'HIGH', probability: 'LOW', category: 'Technical', mitigation: 'Staged rollout with monitoring', severity: 'MEDIUM' }]
  };
  const sdType = sd.sd_type || 'feature';
  const risks = [...(typeRisks[sdType] || typeRisks.feature)];
  if (sd.complexity_score && sd.complexity_score > 7) {
    risks.push({ risk: 'High complexity may lead to delays', impact: 'MEDIUM', probability: 'MEDIUM', category: 'Schedule', mitigation: 'Break into smaller milestones with checkpoints', severity: 'MEDIUM' });
  }
  return risks;
}

function generateSystemArchitecture(sd) {
  let arch = `## Architecture Overview\n\nThis PRD implements ${sd.title}.\n\n`;
  if (sd.target_application) arch += `**Target Application**: ${sd.target_application}\n\n`;
  arch += '## Components\n\nComponents to be defined during implementation based on:\n- Functional requirements analysis\n- Existing codebase patterns\n- Integration requirements\n';
  return arch;
}

function generateImplementationApproach(sd) {
  const sdType = sd.sd_type || 'feature';
  if (sdType === 'refactor') {
    return '## Implementation Approach\n\n### Refactoring Strategy\n\n1. Establish baseline tests for existing behavior\n2. Identify refactoring targets and dependencies\n3. Apply incremental changes with continuous testing\n4. Validate no regressions via REGRESSION sub-agent\n';
  }
  return '## Implementation Approach\n\n### Development Strategy\n\n1. Set up development environment and branch\n2. Implement core functionality per user stories\n3. Add unit and integration tests\n4. Code review and documentation\n';
}

/**
 * Generate Design Vocabulary section for PRD
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-A
 */
function generateDesignVocabulary(sd) {
  // Get suggested personality
  const suggestion = suggestPersonality(sd);

  // Use existing venture_personality if set, otherwise use suggestion
  const personality = sd.venture_personality || suggestion.personality;

  return {
    venture_personality: personality,
    suggestion: {
      recommended: suggestion.personality,
      confidence: suggestion.confidence,
      description: suggestion.description,
      reasoning: suggestion.reasoning,
      alternatives: suggestion.alternatives
    },
    style_constraints: generateStyleConstraints(personality),
    available_options: getPersonalityOptions()
  };
}

/**
 * Generate style constraints based on personality
 */
function generateStyleConstraints(personality) {
  // Map personality to general constraint categories
  const constraintsByPersonality = {
    spartan: {
      layout: 'Maximum information density, minimal whitespace',
      colors: 'Monochrome palette with single accent',
      typography: 'Monospace preferred, minimal weight variation',
      components: 'Sharp corners, minimal padding, no shadows'
    },
    enterprise: {
      layout: 'Professional hierarchy, 60% whitespace ratio',
      colors: 'Conservative palette, muted accents',
      typography: 'Sans-serif, professional weights',
      components: 'Medium rounded corners, subtle shadows'
    },
    startup: {
      layout: 'Bold sections, gradient heroes',
      colors: 'Vibrant, saturated palette',
      typography: 'Bold headlines (700+), energetic',
      components: 'Rounded corners, animated interactions'
    },
    dashboard: {
      layout: 'Data-dense grids, tabular alignment',
      colors: 'Chart color palette (chart-1 to chart-8)',
      typography: 'Monospace for data, clear labels',
      components: 'Compact padding, minimal decoration'
    },
    consumer: {
      layout: 'Friendly, conversational spacing',
      colors: 'Warm, inviting palette',
      typography: 'Friendly sans-serif, readable',
      components: 'Extra-rounded corners, playful hovers'
    },
    executive: {
      layout: 'Premium, 70%+ whitespace, balanced',
      colors: 'Restrained (2-3 colors max)',
      typography: 'Elegant, proper kerning',
      components: 'Subtle depth, refined shadows'
    },
    technical: {
      layout: 'Documentation-ready, code-centric',
      colors: 'Syntax highlighting compatible',
      typography: 'Monospace for code, clear hierarchy',
      components: 'Copy buttons, code blocks, precise'
    },
    marketing: {
      layout: 'Conversion-focused, clear CTAs',
      colors: 'High-contrast hero sections',
      typography: 'Large bold headlines, persuasive',
      components: 'Gradient CTAs, social proof visible'
    },
    minimal: {
      layout: 'Single-column focus, generous spacing',
      colors: '2 colors + neutrals maximum',
      typography: 'Clean, high line-height (1.8+)',
      components: 'No borders, no shadows, intentional'
    },
    glass: {
      layout: 'Layered depth with blur effects',
      colors: 'Semi-transparent surfaces',
      typography: 'Contrast-aware for readability',
      components: 'Backdrop-blur, soft rounded corners'
    },
    'dark-mode-first': {
      layout: 'Dark surfaces as primary',
      colors: 'Elevated dark surfaces, bright accents',
      typography: 'Optimized for dark background contrast',
      components: 'Visible focus indicators, WCAG AA dark'
    },
    accessible: {
      layout: '44px minimum touch targets throughout',
      colors: '7:1 contrast ratio for text',
      typography: 'Large, readable, skip-link support',
      components: 'Visible focus, keyboard navigable'
    },
    neutral: {
      layout: 'Default system layout patterns',
      colors: 'Default color scheme',
      typography: 'Standard typography',
      components: 'Default component styling'
    },
    mixed: {
      layout: 'Context-dependent layout choices',
      colors: 'Varies by component context',
      typography: 'Adaptive typography',
      components: 'Mixed styling based on needs'
    }
  };

  return constraintsByPersonality[personality] || constraintsByPersonality.neutral;
}

export function generatePRD(sd, config = {}) {
  if (!sd || !sd.id) throw new Error('Valid SD with id required');
  return {
    id: config.id || PRD_TEMPLATE.computed.id(sd),
    directive_id: sd.id,
    sd_id: sd.id,
    title: config.title || PRD_TEMPLATE.computed.title(sd),
    version: config.version || PRD_TEMPLATE.version,
    status: config.status || PRD_TEMPLATE.status,
    category: config.category || PRD_TEMPLATE.computed.category(sd),
    priority: config.priority || PRD_TEMPLATE.computed.priority(sd),
    phase: config.phase || PRD_TEMPLATE.phase,
    created_by: PRD_TEMPLATE.created_by,
    executive_summary: config.executive_summary || generateExecutiveSummary(sd),
    business_context: config.business_context || sd.business_context || '',
    technical_context: config.technical_context || sd.technical_context || '',
    functional_requirements: config.functional_requirements || generateFunctionalRequirements(sd),
    acceptance_criteria: config.acceptance_criteria || generateAcceptanceCriteria(sd),
    test_scenarios: config.test_scenarios || generateTestScenarios(sd),
    system_architecture: config.system_architecture || generateSystemArchitecture(sd),
    implementation_approach: config.implementation_approach || generateImplementationApproach(sd),
    risks: config.risks || generateRisks(sd),
    exploration_summary: config.exploration_summary || [],
    design_vocabulary: config.design_vocabulary || generateDesignVocabulary(sd),
    metadata: {
      generated_at: new Date().toISOString(),
      generator_version: '1.1.0',
      // SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-002: Use sd_key instead of legacy_id (column dropped 2026-01-24)
      sd_key: sd.sd_key,
      sd_type: sd.sd_type,
      venture_personality: sd.venture_personality || generateDesignVocabulary(sd).venture_personality,
      config_applied: Object.keys(config).length > 0
    }
  };
}

export async function loadSDConfig(sdLegacyId) {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const configPath = path.default.join(process.cwd(), 'config', 'sd-prd-configs', `${sdLegacyId}.json`);
    const content = await fs.default.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (_e) {
    return {};
  }
}

export default { generatePRD, loadSDConfig, PRD_TEMPLATE };
