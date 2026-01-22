/**
 * Golden Nugget Validator - Design Fidelity Module
 *
 * GOLDEN NUGGET #8: DESIGN FIDELITY (v3.2.0 Productization Package)
 * THE LAW: User Personas (Founder/Customer/Investor) are MANDATORY.
 * THE LAW: Glanceability (<2 sec) and Cognitive Load are QUALITY GATES.
 * THE LAW: Stories for DBAs/Developers are BLOCKED - write for Customers.
 *
 * @module lib/agents/modules/golden-nugget-validator/design-fidelity
 */

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
