/**
 * Governance Guardrail Registry (V11: governance_guardrail_enforcement)
 *
 * Configurable registry of strategic guardrails that can operate in
 * blocking or advisory mode. Blocking guardrails prevent SD creation
 * when violations are detected. Advisory guardrails log warnings.
 *
 * Provides scope routing enforcement and chain validation.
 */

/**
 * Guardrail modes:
 * - 'blocking': Violations prevent SD creation
 * - 'advisory': Violations log warnings but allow creation
 */
const MODES = {
  BLOCKING: 'blocking',
  ADVISORY: 'advisory',
};

/**
 * Default guardrail definitions.
 * Each guardrail has an id, name, mode, and a check function.
 */
const DEFAULT_GUARDRAILS = [
  {
    id: 'GR-VISION-ALIGNMENT',
    name: 'Vision Alignment Minimum',
    mode: MODES.BLOCKING,
    description: 'SD must not score below 30/100 on vision alignment at conception',
    check: (sdData) => {
      if (sdData.visionScore != null && sdData.visionScore < 30) {
        return {
          violated: true,
          severity: 'critical',
          message: `Vision alignment score ${sdData.visionScore}/100 is below minimum threshold (30). SD scope may be misaligned with strategic vision.`,
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'GR-SCOPE-BOUNDARY',
    name: 'Scope Boundary Enforcement',
    mode: MODES.BLOCKING,
    description: 'SD scope must not exceed defined category boundaries',
    check: (sdData) => {
      // Scope routing: infrastructure SDs should not include UI work, and vice versa
      const scope = (sdData.scope || '').toLowerCase();
      const sdType = (sdData.sd_type || '').toLowerCase();

      if (sdType === 'infrastructure' && /\b(react|component|tsx|ui|frontend|css|tailwind)\b/.test(scope)) {
        return {
          violated: true,
          severity: 'high',
          message: 'Infrastructure SD includes frontend/UI scope. Consider splitting into separate feature SD.',
        };
      }
      if (sdType === 'documentation' && /\b(implement|create|build|deploy|migrate)\b/.test(scope)) {
        return {
          violated: true,
          severity: 'medium',
          message: 'Documentation SD includes implementation language. Review scope boundaries.',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'GR-GOVERNANCE-CASCADE',
    name: 'Strategic Governance Cascade',
    mode: MODES.ADVISORY,
    description: 'SD should trace to a strategic theme or OKR',
    check: (sdData) => {
      const hasStrategicLink = sdData.strategic_objectives
        && Array.isArray(sdData.strategic_objectives)
        && sdData.strategic_objectives.length > 0;

      if (!hasStrategicLink) {
        return {
          violated: true,
          severity: 'low',
          message: 'SD has no strategic_objectives linking it to OKRs or strategic themes. Consider adding strategic alignment.',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'GR-RISK-ASSESSMENT',
    name: 'Risk Assessment Required',
    mode: MODES.ADVISORY,
    description: 'High-priority SDs should have risks identified',
    check: (sdData) => {
      const isHighPriority = ['critical', 'high'].includes((sdData.priority || '').toLowerCase());
      const hasRisks = sdData.risks && Array.isArray(sdData.risks) && sdData.risks.length > 0;

      if (isHighPriority && !hasRisks) {
        return {
          violated: true,
          severity: 'medium',
          message: 'High-priority SD has no risks identified. Risk assessment recommended.',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'GR-CORRECTIVE-EXEMPT',
    name: 'Corrective SD Exemption',
    mode: MODES.ADVISORY,
    description: 'Corrective SDs are exempt from vision scoring guardrails',
    check: (sdData) => {
      // Corrective SDs get a pass - they exist to fix gaps
      if (sdData.metadata?.source === 'corrective_sd_generator') {
        return { violated: false, exempt: true };
      }
      return { violated: false };
    },
  },
  {
    id: 'GR-BULK-SD-BLOCK',
    name: 'Bulk SD Creation Block',
    mode: MODES.BLOCKING,
    description: 'Prevents creating 4+ SDs in a single session without an orchestrator architecture plan',
    check: (sdData) => {
      const sessionSdCount = sdData.sessionSdCount || 0;
      const hasOrchestratorPlan = sdData.metadata?.orchestrator_plan_ref
        || sdData.metadata?.architecture_plan_ref;

      if (sessionSdCount >= 4 && !hasOrchestratorPlan) {
        return {
          violated: true,
          severity: 'high',
          message: `Session has created ${sessionSdCount} SDs without an orchestrator plan. Use orchestrator pattern for bulk SD creation.`,
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'GR-ORCHESTRATOR-ARCH-PLAN',
    name: 'Orchestrator Architecture Plan Required',
    mode: MODES.BLOCKING,
    description: 'Orchestrator SDs with 3+ children must have an architecture plan reference',
    check: (sdData) => {
      const childrenCount = sdData.childrenCount || 0;
      const isOrchestrator = childrenCount >= 3 || sdData.sd_type === 'orchestrator';
      const hasArchPlan = sdData.metadata?.architecture_plan_ref
        || sdData.metadata?.arch_plan_key;

      if (isOrchestrator && !hasArchPlan) {
        return {
          violated: true,
          severity: 'high',
          message: `Orchestrator SD with ${childrenCount} children requires an architecture plan reference in metadata.`,
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'GR-BRAINSTORM-INTENT',
    name: 'Brainstorm Intent Documentation',
    mode: MODES.ADVISORY,
    description: 'SDs sourced from brainstorm sessions should reference the brainstorm session ID',
    check: (sdData) => {
      const isBrainstormSourced = sdData.metadata?.source === 'brainstorm'
        || sdData.metadata?.brainstorm_origin === true;
      const hasBrainstormRef = sdData.metadata?.brainstorm_session_id;

      if (isBrainstormSourced && !hasBrainstormRef) {
        return {
          violated: true,
          severity: 'low',
          message: 'SD sourced from brainstorm session but missing brainstorm_session_id in metadata. Add reference for traceability.',
        };
      }
      return { violated: false };
    },
  },
  {
    id: 'GR-OKR-HARD-STOP',
    name: 'OKR Cycle Hard Stop',
    mode: MODES.BLOCKING,
    description: 'SD creation blocked after OKR cycle day 28 unless chairman override is provided',
    check: (sdData) => {
      const okrCycleDay = sdData.okrCycleDay;

      // If no OKR cycle data available, skip check (exempt)
      if (okrCycleDay == null) {
        return { violated: false };
      }

      const threshold = 28;
      const hasChairmanOverride = sdData.chairmanOverride === true
        || sdData.metadata?.chairman_override === true;

      if (okrCycleDay > threshold && !hasChairmanOverride) {
        return {
          violated: true,
          severity: 'critical',
          message: `OKR cycle day ${okrCycleDay} exceeds hard stop threshold (${threshold}). Chairman override required for late-cycle SD creation.`,
        };
      }
      return { violated: false };
    },
  },
];

// Mutable registry for runtime customization
let _guardrails = [...DEFAULT_GUARDRAILS];

/**
 * List all registered guardrails.
 *
 * @returns {Array<{ id: string, name: string, mode: string, description: string }>}
 */
function list() {
  return _guardrails.map(({ id, name, mode, description }) => ({
    id,
    name,
    mode,
    description,
  }));
}

/**
 * Check SD data against all registered guardrails.
 *
 * @param {Object} sdData - SD fields to evaluate
 * @returns {{ passed: boolean, violations: Array<Object>, warnings: Array<Object> }}
 */
function check(sdData) {
  const violations = [];
  const warnings = [];

  for (const guardrail of _guardrails) {
    try {
      const result = guardrail.check(sdData);
      if (result.exempt) continue;

      if (result.violated) {
        const entry = {
          guardrail: guardrail.id,
          name: guardrail.name,
          mode: guardrail.mode,
          severity: result.severity,
          message: result.message,
        };

        if (guardrail.mode === MODES.BLOCKING) {
          violations.push(entry);
        } else {
          warnings.push(entry);
        }
      }
    } catch (err) {
      // Guardrail check failed — log but don't block
      warnings.push({
        guardrail: guardrail.id,
        name: guardrail.name,
        mode: MODES.ADVISORY,
        severity: 'low',
        message: `Guardrail check error: ${err.message}`,
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
  };
}

/**
 * Register a custom guardrail at runtime.
 *
 * @param {{ id: string, name: string, mode: string, description: string, check: Function }} guardrail
 */
function register(guardrail) {
  if (!guardrail.id || typeof guardrail.check !== 'function') {
    throw new Error('Guardrail must have id and check function');
  }
  // Replace if exists, otherwise append
  const idx = _guardrails.findIndex((g) => g.id === guardrail.id);
  if (idx >= 0) {
    _guardrails[idx] = guardrail;
  } else {
    _guardrails.push(guardrail);
  }
}

/**
 * Reset registry to defaults (for testing).
 */
function reset() {
  _guardrails = [...DEFAULT_GUARDRAILS];
}

export {
  list,
  check,
  register,
  reset,
  MODES,
};
