/**
 * Golden Nugget Validator - Content Quality Validation for Stage Transitions
 *
 * SD-HARDENING-V2-003: Golden Nugget Validation
 * SD-HARDENING-V2-004: Heuristic to Hard Gates
 * - Validates artifact CONTENT against stages_v2.yaml requirements
 * - Enforces quality gates: existence is NOT enough
 * - BLOCKS stage transitions when artifacts don't meet minimum quality standards
 *
 * THE LAW: Existence is NOT enough. Quality is MANDATORY for transition.
 * THE LAW v2: Gate failures are BLOCKERS, not warnings.
 *
 * Validation Checks:
 * 1. Required artifacts exist in handoff package
 * 2. Artifact content is not empty
 * 3. Artifact content meets minimum length requirements
 * 4. Special artifacts have required fields (e.g., hypothesis structure)
 * 5. Exit gates are satisfied (HARD BLOCK on failure)
 * 6. Epistemic classification if required
 */

import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * GoldenNuggetValidationException - Thrown when stage transition validation fails
 * SD-HARDENING-V2-004: Hard block on validation failure
 * THE LAW: No stage transition without passing Golden Nugget validation.
 */
export class GoldenNuggetValidationException extends Error {
  constructor(stageId, validationResults) {
    const summary = [
      `Stage ${stageId} validation FAILED:`,
      validationResults.missing_artifacts.length > 0 ? `  Missing artifacts: ${validationResults.missing_artifacts.join(', ')}` : null,
      validationResults.quality_failures.length > 0 ? `  Quality failures: ${validationResults.quality_failures.map(f => f.artifact_type).join(', ')}` : null,
      validationResults.epistemic_gaps.length > 0 ? `  Epistemic gaps: ${validationResults.epistemic_gaps.length}` : null,
      validationResults.gate_failures.length > 0 ? `  Gate failures: ${validationResults.gate_failures.map(f => f.gate_description).join(', ')}` : null,
      validationResults.semantic_failures?.length > 0 ? `  Semantic failures: ${validationResults.semantic_failures.map(f => f.reason).join(', ')}` : null
    ].filter(Boolean).join('\n');

    super(summary);
    this.name = 'GoldenNuggetValidationException';
    this.isRetryable = false;  // Fix the artifacts, don't retry blindly
    this.stageId = stageId;
    this.validationResults = validationResults;
  }
}

// ============================================================================
// COGNITIVE UPGRADE v2.6.0: SEMANTIC VALIDATION LAYER
// ============================================================================
// THE LAW: Character count is NOT quality. Semantic value is MANDATORY.
// ============================================================================

/**
 * Anti-Entropy Check - Detect low-value content
 * Flags: Lorem Ipsum, high repetition, filler text, placeholder content
 *
 * @param {string} content - Text content to analyze
 * @returns {Object} {passed, entropy_score, issues}
 */
export function checkSemanticEntropy(content) {
  const issues = [];
  let entropyScore = 100;

  // 1. Lorem Ipsum detection
  const loremPatterns = [
    /lorem\s+ipsum/gi,
    /dolor\s+sit\s+amet/gi,
    /consectetur\s+adipiscing/gi,
    /placeholder\s+text/gi,
    /sample\s+content/gi,
    /TODO:|FIXME:|TBD:|XXX:/gi,
    /\[insert\s+.*?\]/gi,
    /\{.*?placeholder.*?\}/gi
  ];

  for (const pattern of loremPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      issues.push(`Placeholder content detected: "${matches[0]}"`);
      entropyScore -= 30;
    }
  }

  // 2. High repetition detection (same phrase repeated 3+ times)
  const words = content.toLowerCase().split(/\s+/);
  const phrases = [];
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(words.slice(i, i + 3).join(' '));
  }

  const phraseCounts = {};
  for (const phrase of phrases) {
    if (phrase.length > 10) {  // Only count meaningful phrases
      phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
    }
  }

  const repetitions = Object.entries(phraseCounts)
    .filter(([_, count]) => count >= 3)
    .map(([phrase, count]) => ({ phrase, count }));

  if (repetitions.length > 0) {
    issues.push(`High repetition detected: ${repetitions.length} phrases repeated 3+ times`);
    entropyScore -= 10 * repetitions.length;
  }

  // 3. Low unique word ratio (entropy measure)
  const uniqueWords = new Set(words.filter(w => w.length > 3));
  const uniqueRatio = uniqueWords.size / Math.max(words.length, 1);

  if (uniqueRatio < 0.15) {
    issues.push(`Low semantic variance: Only ${(uniqueRatio * 100).toFixed(1)}% unique words`);
    entropyScore -= 25;
  }

  // 4. Filler phrase detection
  const fillerPatterns = [
    /as\s+mentioned\s+above/gi,
    /it\s+is\s+worth\s+noting/gi,
    /needless\s+to\s+say/gi,
    /in\s+conclusion/gi,
    /to\s+summarize/gi,
    /basically/gi,
    /essentially/gi
  ];

  let fillerCount = 0;
  for (const pattern of fillerPatterns) {
    const matches = content.match(pattern);
    if (matches) fillerCount += matches.length;
  }

  if (fillerCount > 5) {
    issues.push(`Excessive filler phrases: ${fillerCount} instances`);
    entropyScore -= 5 * fillerCount;
  }

  // SOVEREIGN SEAL v2.7.0: Buzzword blacklist detection
  // High-entropy but low-value business jargon that games uniqueness checks
  const buzzwordPatterns = [
    /\bsynergy\b/gi,
    /\bsynergistic\b/gi,
    /\bparadigm\s+shift\b/gi,
    /\bparadigm\b/gi,
    /\bleverage\b/gi,
    /\boperationalize\b/gi,
    /\boptimize\b/gi,
    /\bdisruptive\b/gi,
    /\binnovation\s+vector\b/gi,
    /\bstakeholder\s+engagement\b/gi,
    /\bholistic\s+approach\b/gi,
    /\bbest\s+practices\b/gi,
    /\bcore\s+competency\b/gi,
    /\bvalue\s+add\b/gi,
    /\bscalable\s+solution\b/gi,
    /\bagile\s+methodology\b/gi,
    /\bthought\s+leader\b/gi,
    /\bmoving\s+forward\b/gi,
    /\bat\s+the\s+end\s+of\s+the\s+day\b/gi,
    /\blow-hanging\s+fruit\b/gi
  ];

  let buzzwordCount = 0;
  const foundBuzzwords = [];
  for (const pattern of buzzwordPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      buzzwordCount += matches.length;
      foundBuzzwords.push(matches[0]);
    }
  }

  // Calculate buzzword density (buzzwords per 100 words)
  const wordCount = content.split(/\s+/).length;
  const buzzwordDensity = (buzzwordCount / wordCount) * 100;

  if (buzzwordDensity > 2) {  // More than 2% buzzwords = gaming attempt
    issues.push(`High buzzword density: ${buzzwordDensity.toFixed(1)}% (${foundBuzzwords.slice(0, 3).join(', ')}...)`);
    entropyScore -= 20;
  } else if (buzzwordCount > 3) {  // More than 3 buzzwords total
    issues.push(`Buzzword accumulation: ${buzzwordCount} instances detected`);
    entropyScore -= 10;
  }

  return {
    passed: entropyScore >= 60,
    entropy_score: Math.max(0, entropyScore),
    issues,
    unique_word_ratio: uniqueRatio,
    buzzword_density: buzzwordDensity
  };
}

/**
 * Semantic Keyword Validation for specific artifact types
 * Ensures artifacts contain domain-specific terminology
 *
 * @param {string} artifactType - Type of artifact
 * @param {string} content - Artifact content
 * @returns {Object} {passed, required_keywords, found_keywords, missing_keywords}
 */
export function validateSemanticKeywords(artifactType, content) {
  const keywordRequirements = {
    'risk_matrix': {
      required: ['risk', 'probability', 'impact', 'mitigation'],
      optional: ['severity', 'contingency', 'likelihood', 'exposure', 'control'],
      minRequired: 3,
      minOptional: 2
    },
    'financial_model': {
      required: ['revenue', 'cost', 'margin', 'projection'],
      optional: ['cac', 'ltv', 'burn', 'runway', 'profit', 'unit economics'],
      minRequired: 3,
      minOptional: 2
    },
    'validation_report': {
      required: ['validation', 'result', 'criteria'],
      optional: ['score', 'pass', 'fail', 'recommendation', 'finding'],
      minRequired: 2,
      minOptional: 2
    },
    'competitive_analysis': {
      required: ['competitor', 'market', 'advantage'],
      optional: ['differentiation', 'positioning', 'threat', 'opportunity', 'share'],
      minRequired: 2,
      minOptional: 2
    },
    'business_model_canvas': {
      required: ['value proposition', 'customer', 'revenue'],
      optional: ['channel', 'relationship', 'resource', 'partner', 'cost structure'],
      minRequired: 2,
      minOptional: 3
    }
  };

  const requirements = keywordRequirements[artifactType];
  if (!requirements) {
    return { passed: true, reason: 'No keyword requirements for this artifact type' };
  }

  const contentLower = content.toLowerCase();

  // SOVEREIGN SEAL v2.7.0: Word-boundary matching (not substring matching)
  // This prevents "riskless" matching "risk", "at-risk" matching "risk", etc.
  const matchesWordBoundary = (keyword, text) => {
    // Escape special regex characters in keyword
    const escapedKw = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Create word boundary pattern (handles multi-word keywords)
    const pattern = new RegExp(`\\b${escapedKw}\\b`, 'i');
    return pattern.test(text);
  };

  const foundRequired = requirements.required.filter(kw =>
    matchesWordBoundary(kw, contentLower)
  );
  const foundOptional = requirements.optional.filter(kw =>
    matchesWordBoundary(kw, contentLower)
  );
  const missingRequired = requirements.required.filter(kw =>
    !matchesWordBoundary(kw, contentLower)
  );

  const requiredMet = foundRequired.length >= requirements.minRequired;
  const optionalMet = foundOptional.length >= requirements.minOptional;

  return {
    passed: requiredMet && optionalMet,
    required_keywords: requirements.required,
    found_required: foundRequired,
    missing_required: missingRequired,
    found_optional: foundOptional,
    matching_mode: 'word_boundary',  // SOVEREIGN SEAL v2.7.0: Track matching mode
    reason: !requiredMet
      ? `Missing required keywords: ${missingRequired.join(', ')} (need ${requirements.minRequired})`
      : !optionalMet
        ? `Insufficient domain terminology: Only ${foundOptional.length}/${requirements.minOptional} optional keywords found`
        : 'Semantic keywords validated (word-boundary matching)'
  };
}

/**
 * Epistemic Classification Check
 * Ensures artifact separates Facts from Assumptions (Four Buckets)
 *
 * @param {string} content - Artifact content
 * @returns {Object} {passed, buckets_found, reason}
 */
export function checkEpistemicClassification(content) {
  const contentLower = content.toLowerCase();

  const bucketPatterns = {
    facts: /\bfact[s]?\b|\bknown\b|\bverified\b|\bconfirmed\b|\bdata\s+shows\b/i,
    assumptions: /\bassumption[s]?\b|\bassum[ed|ing]\b|\bbelieve[sd]?\b|\bhypothes[is|ize]\b|\bexpect\b/i,
    simulations: /\bsimulat[ed|ion]\b|\bmodel[led|ing]?\b|\bproject[ed|ion]\b|\bforecast\b|\bscenario\b/i,
    unknowns: /\bunknown[s]?\b|\buncertain\b|\btbd\b|\bto\s+be\s+determined\b|\bpending\b|\brisk\b/i
  };

  const bucketsFound = {};
  let count = 0;

  for (const [bucket, pattern] of Object.entries(bucketPatterns)) {
    if (pattern.test(contentLower)) {
      bucketsFound[bucket] = true;
      count++;
    }
  }

  return {
    passed: count >= 2,  // Must have at least 2 of 4 buckets
    buckets_found: bucketsFound,
    bucket_count: count,
    reason: count >= 2
      ? `Epistemic classification present: ${Object.keys(bucketsFound).join(', ')}`
      : `Insufficient epistemic classification: Only ${count}/2 required buckets found`
  };
}

// ============================================================================
// GOLDEN NUGGET #8: DESIGN FIDELITY (v3.2.0 Productization Package)
// ============================================================================
// THE LAW: User Personas (Founder/Customer/Investor) are MANDATORY.
// THE LAW: Glanceability (<2 sec) and Cognitive Load are QUALITY GATES.
// THE LAW: Stories for DBAs/Developers are BLOCKED - write for Customers.
// ============================================================================

/**
 * Design Fidelity Validation - Ensures artifacts prioritize end-user value
 *
 * Rejects PRDs that:
 * 1. Lack User Personas (Founder/Customer/Investor)
 * 2. Don't address Glanceability (<2 sec comprehension)
 * 3. Don't address Cognitive Load management
 *
 * @param {Object} artifact - PRD or design artifact
 * @returns {Object} {passed, failures, persona_check, ux_check}
 */
export function checkDesignFidelity(artifact) {
  const failures = [];
  const content = (artifact.content || '').toLowerCase();
  const artifactType = artifact.type || '';

  // ===========================================================================
  // 1. PERSONA CHECK: Must have Founder, Customer, or Investor perspective
  // ===========================================================================
  // APPROVED personas (end-users, decision-makers)
  const approvedPersonas = [
    'founder', 'customer', 'investor', 'user', 'patient', 'cfo',
    'clinician', 'physician', 'executive', 'manager', 'owner',
    'chairman', 'director', 'analyst', 'buyer', 'client'
  ];

  // FORBIDDEN personas (tech-focused, internal)
  const forbiddenPersonas = [
    'developer', 'dba', 'admin', 'engineer', 'ops', 'devops',
    'sysadmin', 'backend', 'frontend', 'qa', 'tester'
  ];

  const hasApprovedPersona = approvedPersonas.some(p =>
    new RegExp(`\\b${p}\\b`, 'i').test(content)
  );

  const hasForbiddenPersona = forbiddenPersonas.some(p =>
    new RegExp(`\\b${p}\\b`, 'i').test(content)
  );

  // Check for forbidden persona as PRIMARY focus (not just mentioned)
  const personaPattern = /(?:as\s+a|for\s+the|user:\s*|persona:\s*)(\w+)/gi;
  const personaMatches = [...content.matchAll(personaPattern)];
  const primaryPersonas = personaMatches.map(m => m[1].toLowerCase());

  const hasForbiddenPrimary = primaryPersonas.some(p =>
    forbiddenPersonas.some(fp => p.includes(fp))
  );

  if (hasForbiddenPrimary) {
    failures.push({
      type: 'FORBIDDEN_PERSONA',
      reason: `MARKET-PULSE VIOLATION: Primary persona is tech-focused (${primaryPersonas.join(', ')}). Write for Customers, not DBAs.`,
      severity: 'BLOCKER'
    });
  } else if (!hasApprovedPersona) {
    failures.push({
      type: 'MISSING_PERSONA',
      reason: 'PRD lacks User Personas (Founder/Customer/Investor). Who is this for?',
      severity: 'BLOCKER'
    });
  }

  // ===========================================================================
  // 2. GLANCEABILITY CHECK: Must address <2 sec comprehension
  // ===========================================================================
  const glanceabilityPatterns = [
    /glance/i, /at-a-glance/i, /scan/i, /dashboard/i, /summary/i,
    /headline/i, /overview/i, /snapshot/i, /quick\s+view/i,
    /\bKPI\b/i, /metric/i, /indicator/i, /status\s+at/i
  ];

  const hasGlanceability = glanceabilityPatterns.some(p => p.test(content));

  if (!hasGlanceability && ['prd', 'design_spec', 'ui_spec'].includes(artifactType)) {
    failures.push({
      type: 'GLANCEABILITY_UNDEFINED',
      reason: 'PRD does not address Glanceability (<2 sec). How will users understand state at a glance?',
      severity: 'WARNING'
    });
  }

  // ===========================================================================
  // 3. COGNITIVE LOAD CHECK: Must not overwhelm users
  // ===========================================================================
  const cognitiveLoadPatterns = [
    /simple/i, /minimal/i, /progressive/i, /disclosure/i,
    /priority/i, /focus/i, /clean/i, /unclutter/i,
    /cognitive/i, /mental\s+model/i, /intuitive/i,
    /one\s+thing/i, /single\s+action/i
  ];

  const hasCognitiveLoadAwareness = cognitiveLoadPatterns.some(p => p.test(content));

  if (!hasCognitiveLoadAwareness && ['prd', 'design_spec', 'ui_spec'].includes(artifactType)) {
    failures.push({
      type: 'COGNITIVE_LOAD_UNDEFINED',
      reason: 'PRD does not address Cognitive Load. How will you prevent user overwhelm?',
      severity: 'WARNING'
    });
  }

  // ===========================================================================
  // 4. USER DELIGHT CHECK: Must mention value/benefit, not just migration
  // ===========================================================================
  const migrationFocusPatterns = [
    /migration\s+safety/i, /backward\s+compat/i, /legacy\s+support/i,
    /data\s+migration/i, /schema\s+migration/i
  ];

  const userDelightPatterns = [
    /delight/i, /experience/i, /satisfaction/i, /ease\s+of\s+use/i,
    /intuitive/i, /seamless/i, /enjoyable/i, /value/i, /benefit/i,
    /solve/i, /pain\s+point/i, /frustration/i
  ];

  const hasMigrationFocus = migrationFocusPatterns.some(p => p.test(content));
  const hasUserDelight = userDelightPatterns.some(p => p.test(content));

  if (hasMigrationFocus && !hasUserDelight) {
    failures.push({
      type: 'MIGRATION_OVER_DELIGHT',
      reason: 'PRD prioritizes "Migration Safety" over User Delight. Add customer value perspective.',
      severity: 'WARNING'
    });
  }

  // ===========================================================================
  // RESULT
  // ===========================================================================
  const hasBlocker = failures.some(f => f.severity === 'BLOCKER');

  return {
    passed: !hasBlocker,
    failures,
    persona_check: {
      has_approved: hasApprovedPersona,
      has_forbidden: hasForbiddenPersona,
      has_forbidden_primary: hasForbiddenPrimary
    },
    ux_check: {
      glanceability: hasGlanceability,
      cognitive_load: hasCognitiveLoadAwareness,
      user_delight: hasUserDelight
    }
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Stages configuration cache
 * Loaded once at module initialization
 */
let STAGES_CONFIG = null;
let STAGES_BY_ID = new Map();

/**
 * Load stages_v2.yaml at module load time
 * Parse Golden Nugget requirements for quality validation
 */
function loadStagesConfig() {
  try {
    const yamlPath = path.resolve(__dirname, '../../docs/workflow/stages_v2.yaml');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    STAGES_CONFIG = yaml.load(yamlContent);

    // Index stages by ID for fast lookup
    if (STAGES_CONFIG && STAGES_CONFIG.stages) {
      for (const stage of STAGES_CONFIG.stages) {
        STAGES_BY_ID.set(stage.id, stage);
      }
    }

    console.log(`✅ [GoldenNuggetValidator] Loaded stages_v2.yaml: ${STAGES_BY_ID.size} stages indexed`);
    return true;
  } catch (error) {
    console.error(`❌ [GoldenNuggetValidator] Failed to load stages_v2.yaml: ${error.message}`);
    return false;
  }
}

// Load configuration on module initialization
loadStagesConfig();

/**
 * Get stage requirements from stages_v2.yaml
 * Returns required artifacts, gates, and epistemic requirements
 *
 * @param {number} stageId - Stage ID to get requirements for
 * @returns {Object} Stage requirements (artifacts, gates, epistemic)
 */
export function getStageRequirements(stageId) {
  const stage = STAGES_BY_ID.get(stageId);

  if (!stage) {
    console.warn(`   ⚠️  [GoldenNuggetValidator] No stage configuration found for stage ${stageId}`);
    return {
      required_outputs: [],
      exit_gates: [],
      epistemic_required: false,
      assumption_set_action: null
    };
  }

  return {
    required_outputs: stage.artifacts || [],
    exit_gates: stage.gates?.exit || [],
    epistemic_required: stage.epistemic_classification?.required || false,
    assumption_set_action: stage.assumption_set?.action || null,
    stage_title: stage.title
  };
}

/**
 * Validate Golden Nuggets - artifact CONTENT quality
 * THE LAW: Existence is NOT enough. Quality is MANDATORY for transition.
 *
 * Validation checks:
 * 1. Required artifacts exist in handoff package
 * 2. Artifact content is not empty
 * 3. Artifact content meets minimum length requirements
 * 4. Special artifacts have required fields (e.g., hypothesis structure)
 * 5. Exit gates are satisfied
 * 6. Epistemic classification if required
 *
 * @param {number} stageId - Stage being transitioned FROM
 * @param {Array} artifacts - Artifacts in handoff package
 * @returns {Object} Validation results {passed, missing_artifacts, quality_failures, epistemic_gaps}
 */
export async function validateGoldenNuggets(stageId, artifacts) {
  console.log(`\n🔍 [GoldenNuggetValidator] Validating Golden Nuggets for stage ${stageId}`);

  const stageRequirements = getStageRequirements(stageId);
  const validationResults = {
    passed: true,
    missing_artifacts: [],
    quality_failures: [],
    epistemic_gaps: [],
    gate_failures: []
  };

  console.log(`   Stage: ${stageRequirements.stage_title || stageId}`);
  console.log(`   Required artifacts: ${stageRequirements.required_outputs.length}`);
  console.log(`   Exit gates: ${stageRequirements.exit_gates.length}`);

  // Check each required artifact exists and has quality content
  for (const requiredType of stageRequirements.required_outputs) {
    const artifact = artifacts.find(a => a.type === requiredType);

    if (!artifact) {
      console.log(`   ❌ Missing required artifact: ${requiredType}`);
      validationResults.missing_artifacts.push(requiredType);
      validationResults.passed = false;
    } else {
      // Validate artifact quality
      const qualityCheck = validateArtifactQuality(artifact, requiredType);
      if (!qualityCheck.valid) {
        console.log(`   ❌ Quality failure for ${requiredType}: ${qualityCheck.reason}`);
        validationResults.quality_failures.push({
          artifact_type: requiredType,
          reason: qualityCheck.reason,
          details: qualityCheck.details
        });
        validationResults.passed = false;
      } else {
        console.log(`   ✅ Artifact ${requiredType}: ${qualityCheck.details.content_length} chars`);
      }
    }
  }

  // Check epistemic classification if required
  if (stageRequirements.epistemic_required) {
    console.log(`   📋 Epistemic classification REQUIRED for stage ${stageId}`);

    // Look for epistemic_classification artifact or metadata
    const epistemicArtifact = artifacts.find(a =>
      a.type === 'epistemic_classification' ||
      a.metadata?.epistemic_classification
    );

    if (!epistemicArtifact) {
      console.log('   ❌ Missing epistemic classification (Four Buckets: Facts/Assumptions/Simulations/Unknowns)');
      validationResults.epistemic_gaps.push({
        stage_id: stageId,
        requirement: 'All claims must be classified as Facts, Assumptions, Simulations, or Unknowns',
        found: false
      });
      validationResults.passed = false;
    } else {
      console.log('   ✅ Epistemic classification provided');
    }
  }

  // Validate exit gates (if any are explicitly checkable)
  // SD-HARDENING-V2-004: Gate failures are BLOCKERS, not warnings
  for (const gate of stageRequirements.exit_gates) {
    // Gates are typically human-readable strings like "Title validated (3-120 chars)"
    // We can perform basic checks for common patterns
    const gateCheck = validateExitGate(gate, artifacts);
    if (!gateCheck.passed) {
      console.log(`   ❌ Exit gate BLOCKED: ${gate}`);
      console.log(`      Reason: ${gateCheck.reason}`);
      validationResults.gate_failures.push({
        gate_description: gate,
        reason: gateCheck.reason
      });
      // SD-HARDENING-V2-004: Gate failures are BLOCKERS
      validationResults.passed = false;
    }
  }

  if (validationResults.passed) {
    console.log('   ✅ All Golden Nugget validations PASSED');
  } else {
    console.log('   ❌ Golden Nugget validation FAILED');
    console.log(`      Missing: ${validationResults.missing_artifacts.length}`);
    console.log(`      Quality issues: ${validationResults.quality_failures.length}`);
    console.log(`      Epistemic gaps: ${validationResults.epistemic_gaps.length}`);
  }

  return validationResults;
}

/**
 * Validate individual artifact quality
 * Quality rules:
 * - Content must not be empty
 * - Content must meet minimum length (100 chars for documents, 50 for others)
 * - Certain artifacts must have specific fields
 *
 * @param {Object} artifact - Artifact to validate {type, content, metadata}
 * @param {string} requiredType - Expected artifact type
 * @returns {Object} {valid, reason, details}
 */
export function validateArtifactQuality(artifact, requiredType) {
  // Empty content check
  if (!artifact.content || artifact.content.trim().length === 0) {
    return {
      valid: false,
      reason: 'Artifact content is empty',
      details: { content_length: 0 }
    };
  }

  const contentLength = artifact.content.trim().length;

  // Minimum length requirements based on artifact type
  const minLengthRequirements = {
    // High-value documents
    'idea_brief': 200,
    'critique_report': 300,
    'validation_report': 300,
    'competitive_analysis': 400,
    'financial_model': 300,
    'risk_matrix': 200,
    'pricing_model': 200,
    'business_model_canvas': 400,
    'exit_strategy': 200,
    'brand_guidelines': 300,
    'gtm_plan': 300,
    'marketing_manifest': 200,
    'sales_playbook': 200,
    'tech_stack_decision': 200,
    'data_model': 300,
    'user_story_pack': 300,
    'api_contract': 200,
    'schema_spec': 200,

    // Medium-value artifacts
    'erd_diagram': 100,
    'system_prompt': 150,
    'cicd_config': 100,
    'security_audit': 200,
    'test_plan': 200,
    'uat_report': 150,
    'deployment_runbook': 150,
    'launch_checklist': 100,
    'analytics_dashboard': 100,
    'optimization_roadmap': 200,
    'assumptions_vs_reality_report': 300,

    // Default for unknown types
    'default': 100
  };

  const minLength = minLengthRequirements[requiredType] || minLengthRequirements.default;

  if (contentLength < minLength) {
    return {
      valid: false,
      reason: `Content too short (${contentLength} chars, minimum ${minLength})`,
      details: { content_length: contentLength, required_length: minLength }
    };
  }

  // ============================================================================
  // COGNITIVE UPGRADE v2.6.0: SEMANTIC VALIDATION
  // THE LAW: Character count is NOT quality. Semantic value is MANDATORY.
  // ============================================================================

  // 1. Anti-Entropy Check (applies to all artifacts)
  const entropyCheck = checkSemanticEntropy(artifact.content);
  if (!entropyCheck.passed) {
    return {
      valid: false,
      reason: `Anti-entropy check failed (score: ${entropyCheck.entropy_score}/100): ${entropyCheck.issues.join('; ')}`,
      details: {
        content_length: contentLength,
        entropy_score: entropyCheck.entropy_score,
        issues: entropyCheck.issues
      }
    };
  }

  // 2. Semantic Keyword Validation (for typed artifacts)
  const keywordCheck = validateSemanticKeywords(requiredType, artifact.content);
  if (!keywordCheck.passed && keywordCheck.required_keywords) {
    return {
      valid: false,
      reason: keywordCheck.reason,
      details: {
        content_length: contentLength,
        found_required: keywordCheck.found_required,
        missing_required: keywordCheck.missing_required,
        found_optional: keywordCheck.found_optional
      }
    };
  }

  // Type-specific validation
  switch (requiredType) {
    case 'idea_brief':
      // Should have title and description
      if (!artifact.metadata?.title || !artifact.metadata?.description) {
        return {
          valid: false,
          reason: 'Idea brief missing title or description metadata',
          details: { content_length: contentLength, has_metadata: false }
        };
      }
      break;

    case 'financial_model':
      // Should have numeric data or references to financial metrics
      const hasFinancialMetrics = /\$|revenue|margin|cost|profit|CAC|LTV/i.test(artifact.content);
      if (!hasFinancialMetrics) {
        return {
          valid: false,
          reason: 'Financial model does not contain recognizable financial metrics',
          details: { content_length: contentLength, has_metrics: false }
        };
      }
      break;

    case 'validation_report':
      // Should have validation score or decision
      const hasValidation = /score|validate|rating|decision|approve|reject/i.test(artifact.content);
      if (!hasValidation) {
        return {
          valid: false,
          reason: 'Validation report missing validation decision or score',
          details: { content_length: contentLength, has_validation: false }
        };
      }
      break;

    case 'epistemic_classification':
      // Should have buckets: facts, assumptions, simulations, unknowns
      const hasBuckets = /facts|assumptions|simulations|unknowns/i.test(artifact.content);
      if (!hasBuckets) {
        return {
          valid: false,
          reason: 'Epistemic classification missing required buckets (facts/assumptions/simulations/unknowns)',
          details: { content_length: contentLength, has_buckets: false }
        };
      }
      break;

    case 'risk_matrix':
      // COGNITIVE UPGRADE v2.6.0: Risk Matrix requires epistemic classification
      // THE LAW: Risk Matrix must separate Facts from Assumptions
      const epistemicCheck = checkEpistemicClassification(artifact.content);
      if (!epistemicCheck.passed) {
        return {
          valid: false,
          reason: `Risk matrix lacks epistemic rigor: ${epistemicCheck.reason}`,
          details: {
            content_length: contentLength,
            buckets_found: epistemicCheck.buckets_found,
            bucket_count: epistemicCheck.bucket_count
          }
        };
      }

      // Must have structured risk entries (table or list format)
      const hasRiskStructure = /\|.*risk.*\||\-\s+risk|\d+\.\s+risk|risk\s*id|risk-\d+/i.test(artifact.content);
      if (!hasRiskStructure) {
        return {
          valid: false,
          reason: 'Risk matrix must contain structured risk entries (table or list format)',
          details: { content_length: contentLength, has_structure: false }
        };
      }

      // Must have mitigation strategies
      const hasMitigation = /mitigat|contingenc|control|prevent|reduc/i.test(artifact.content);
      if (!hasMitigation) {
        return {
          valid: false,
          reason: 'Risk matrix must include mitigation strategies',
          details: { content_length: contentLength, has_mitigation: false }
        };
      }
      break;

    case 'prd':
    case 'design_spec':
    case 'ui_spec':
      // GOLDEN NUGGET #8: Design Fidelity (v3.2.0 Productization Package)
      // THE LAW: PRDs without User Personas are BLOCKED
      const designCheck = checkDesignFidelity(artifact);
      if (!designCheck.passed) {
        return {
          valid: false,
          reason: designCheck.failures.map(f => f.reason).join('; '),
          details: {
            content_length: contentLength,
            design_failures: designCheck.failures,
            persona_check: designCheck.persona_check,
            ux_check: designCheck.ux_check
          }
        };
      }
      // Log warnings even if passed (for visibility)
      const warnings = designCheck.failures.filter(f => f.severity === 'WARNING');
      if (warnings.length > 0) {
        console.log(`   ⚠️  [GoldenNuggetValidator] Design warnings for ${requiredType}:`);
        warnings.forEach(w => console.log(`      - ${w.reason}`));
      }
      break;
  }

  // All checks passed - include semantic validation details
  return {
    valid: true,
    reason: 'Artifact meets quality and semantic standards',
    details: {
      content_length: contentLength,
      entropy_score: entropyCheck.entropy_score,
      semantic_keywords: keywordCheck.found_required?.length || 0
    }
  };
}

/**
 * Validate exit gate requirements
 * SD-HARDENING-V2-004: Gates fail safe - if we can't validate, we BLOCK
 *
 * @param {string} gateDescription - Exit gate requirement
 * @param {Array} artifacts - Available artifacts
 * @returns {Object} {passed, reason}
 */
export function validateExitGate(gateDescription, artifacts) {
  // Example gates:
  // - "Title validated (3-120 chars)"
  // - "Multi-model pass complete"
  // - "Validation score >= 6"

  // Check for completion-type gates
  if (/complete|done|finished/i.test(gateDescription)) {
    if (artifacts.length === 0) {
      return {
        passed: false,
        reason: 'No artifacts provided to satisfy completion gate'
      };
    }
    return {
      passed: true,
      reason: 'Completion gate satisfied (artifacts present)'
    };
  }

  // Check for title validation gates
  if (/title.*validated|validated.*title/i.test(gateDescription)) {
    const charMatch = gateDescription.match(/\((\d+)-(\d+)\s*chars?\)/i);
    if (charMatch) {
      const minChars = parseInt(charMatch[1]);
      const maxChars = parseInt(charMatch[2]);
      const titleArtifact = artifacts.find(a => a.metadata?.title);
      if (!titleArtifact || !titleArtifact.metadata?.title) {
        return {
          passed: false,
          reason: 'Title validation failed: No artifact with title metadata'
        };
      }
      const titleLength = titleArtifact.metadata.title.length;
      if (titleLength < minChars || titleLength > maxChars) {
        return {
          passed: false,
          reason: `Title length ${titleLength} not in range ${minChars}-${maxChars}`
        };
      }
      return {
        passed: true,
        reason: `Title validated (${titleLength} chars)`
      };
    }
  }

  // Check for score gates (e.g., "Validation score >= 6")
  if (/score\s*>=?\s*(\d+)/i.test(gateDescription)) {
    const scoreMatch = gateDescription.match(/score\s*>=?\s*(\d+)/i);
    const requiredScore = parseInt(scoreMatch[1]);
    const scoredArtifact = artifacts.find(a =>
      a.metadata?.score !== undefined || a.metadata?.validation_score !== undefined
    );
    if (!scoredArtifact) {
      return {
        passed: false,
        reason: 'Score gate failed: No artifact with score metadata'
      };
    }
    const actualScore = scoredArtifact.metadata.score ?? scoredArtifact.metadata.validation_score;
    if (actualScore < requiredScore) {
      return {
        passed: false,
        reason: `Score ${actualScore} below required ${requiredScore}`
      };
    }
    return {
      passed: true,
      reason: `Score gate satisfied (${actualScore} >= ${requiredScore})`
    };
  }

  // SD-HARDENING-V2-004: FAIL SAFE - Unknown gates are BLOCKED
  // If we don't know how to validate it, we can't assume it passes
  return {
    passed: false,
    reason: `Gate validation not implemented for: "${gateDescription}" - requires manual verification or gate parser extension`
  };
}

/**
 * Reload stages configuration from disk
 * Useful for hot-reloading in development or after YAML updates
 *
 * @returns {boolean} Success status
 */
export function reloadStagesConfig() {
  console.log('🔄 [GoldenNuggetValidator] Reloading stages_v2.yaml...');
  STAGES_BY_ID.clear();
  return loadStagesConfig();
}

/**
 * Get loaded stages configuration (for debugging/introspection)
 *
 * @returns {Object} Full stages configuration
 */
export function getStagesConfig() {
  return STAGES_CONFIG;
}

/**
 * Get all indexed stages (for debugging/introspection)
 *
 * @returns {Map} Stages indexed by ID
 */
export function getStagesById() {
  return STAGES_BY_ID;
}
