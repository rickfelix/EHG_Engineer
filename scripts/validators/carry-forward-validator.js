/**
 * carry-forward-validator.js
 *
 * Validates carry_forward metadata block for child Strategic Directives.
 * Part of Phase A: SD Split Carry-Forward Mechanism (validation only, no DB writes).
 *
 * Gate Logic (per Chairman's Phase A adjustments):
 * - G1: Child SDs entering PLAN MUST have carry_forward block
 * - G4: Require EITHER references.anchor_specs OR carry_forward.inherited_anchors (not both mandatory)
 * - G5: carry_forward.version must be parseable semver
 * - G6: At PLAN entry: warn if edges missing + EDGES_REQUIRED; At PRD approval: hard fail
 * - G9: inherited_anchors must contain only valid file paths
 * - G10: Lineage validation - ancestor_chain must match parent pointer walk
 *
 * Lineage Semantics:
 * - root_sd_id: The topmost ancestor (no parent_sd_id)
 * - ancestor_chain: Array from root → parent (EXCLUDES the child itself)
 * - from_parent: Must equal parent_sd_id (direct parent)
 * - split_depth: Must equal ancestor_chain.length
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

// Validation result types
export const ValidationSeverity = {
  PASS: 'PASS',
  WARN: 'WARN',
  ESCALATE: 'ESCALATE',
  FAIL: 'FAIL'
};

// Gate identifiers
export const Gates = {
  G1_CARRY_FORWARD_REQUIRED: 'G1',
  G4_ANCHOR_COVERAGE: 'G4',
  G5_VERSION_VALID: 'G5',
  G6_DEPENDENCY_EDGES: 'G6',
  G9_FILE_PATHS_VALID: 'G9',
  G10_LINEAGE_CONSISTENT: 'G10'
};

/**
 * Validates a single SD's carry_forward block
 * @param {Object} sd - Strategic Directive record from database
 * @param {Object} options - Validation options
 * @param {string} options.phase - Current phase: 'PLAN_ENTRY' | 'PRD_APPROVAL' | 'PLAN_TO_EXEC'
 * @param {string} options.projectRoot - Project root for file path validation
 * @param {Function} options.fetchAncestors - Async function to fetch ancestor SDs by ID
 * @returns {Object} Validation result with gates and overall status
 */
export async function validateCarryForward(sd, options = {}) {
  const {
    phase = 'PLAN_ENTRY',
    projectRoot = process.cwd(),
    fetchAncestors = null
  } = options;

  const results = {
    sdId: sd.id,
    isChildSd: !!sd.parent_sd_id,
    phase,
    gates: {},
    overallStatus: ValidationSeverity.PASS,
    errors: [],
    warnings: []
  };

  // Non-child SDs don't need carry_forward validation
  if (!sd.parent_sd_id) {
    results.gates[Gates.G1_CARRY_FORWARD_REQUIRED] = {
      status: ValidationSeverity.PASS,
      message: 'Not a child SD - carry_forward not required'
    };
    return results;
  }

  const metadata = sd.metadata || {};
  const carryForward = metadata.carry_forward;

  // G1: Child SDs MUST have carry_forward block
  results.gates[Gates.G1_CARRY_FORWARD_REQUIRED] = validateG1(carryForward, sd);
  if (results.gates[Gates.G1_CARRY_FORWARD_REQUIRED].status === ValidationSeverity.FAIL) {
    results.overallStatus = ValidationSeverity.FAIL;
    results.errors.push(results.gates[Gates.G1_CARRY_FORWARD_REQUIRED].message);
    // Cannot proceed without carry_forward block
    return results;
  }

  // G4: Anchor coverage - require EITHER own anchors OR inherited anchors
  const references = metadata.references || {};
  results.gates[Gates.G4_ANCHOR_COVERAGE] = validateG4(references, carryForward, phase);
  updateOverallStatus(results, results.gates[Gates.G4_ANCHOR_COVERAGE]);

  // G5: Version validation
  results.gates[Gates.G5_VERSION_VALID] = validateG5(carryForward);
  updateOverallStatus(results, results.gates[Gates.G5_VERSION_VALID]);

  // G6: Dependency edges - severity depends on phase
  results.gates[Gates.G6_DEPENDENCY_EDGES] = validateG6(carryForward, phase);
  updateOverallStatus(results, results.gates[Gates.G6_DEPENDENCY_EDGES]);

  // G9: File path validation
  results.gates[Gates.G9_FILE_PATHS_VALID] = validateG9(carryForward, projectRoot);
  updateOverallStatus(results, results.gates[Gates.G9_FILE_PATHS_VALID]);

  // G10: Lineage consistency (requires ancestor fetch)
  if (fetchAncestors) {
    results.gates[Gates.G10_LINEAGE_CONSISTENT] = await validateG10(sd, carryForward, fetchAncestors);
    updateOverallStatus(results, results.gates[Gates.G10_LINEAGE_CONSISTENT]);
  } else {
    results.gates[Gates.G10_LINEAGE_CONSISTENT] = {
      status: ValidationSeverity.WARN,
      message: 'Lineage validation skipped - fetchAncestors not provided'
    };
  }

  // Collect errors and warnings
  Object.entries(results.gates).forEach(([gate, result]) => {
    if (result.status === ValidationSeverity.FAIL) {
      results.errors.push(`[${gate}] ${result.message}`);
    } else if (result.status === ValidationSeverity.WARN || result.status === ValidationSeverity.ESCALATE) {
      results.warnings.push(`[${gate}] ${result.message}`);
    }
  });

  return results;
}

/**
 * G1: Child SDs entering PLAN MUST have carry_forward block
 */
function validateG1(carryForward, sd) {
  if (!carryForward) {
    return {
      status: ValidationSeverity.FAIL,
      message: `Child SD ${sd.id} missing required carry_forward block`
    };
  }

  if (typeof carryForward !== 'object') {
    return {
      status: ValidationSeverity.FAIL,
      message: `carry_forward must be an object, got ${typeof carryForward}`
    };
  }

  return {
    status: ValidationSeverity.PASS,
    message: 'carry_forward block present'
  };
}

/**
 * G4: Anchor coverage
 * At PLAN entry: require EITHER references.anchor_specs OR inherited_anchors
 * At PRD approval: require references.anchor_specs (hard fail if missing)
 */
function validateG4(references, carryForward, phase) {
  const ownAnchors = references.anchor_specs || [];
  const inheritedAnchors = carryForward?.inherited_anchors?.anchors || [];

  const hasOwnAnchors = Array.isArray(ownAnchors) && ownAnchors.length > 0;
  const hasInheritedAnchors = Array.isArray(inheritedAnchors) && inheritedAnchors.length > 0;

  if (phase === 'PRD_APPROVAL' || phase === 'PLAN_TO_EXEC') {
    // At PRD approval, require own anchors
    if (!hasOwnAnchors) {
      return {
        status: ValidationSeverity.FAIL,
        message: `references.anchor_specs required at ${phase} (found ${ownAnchors.length})`
      };
    }
    return {
      status: ValidationSeverity.PASS,
      message: `Own anchor_specs present (${ownAnchors.length})`
    };
  }

  // At PLAN_ENTRY: require either own OR inherited
  if (!hasOwnAnchors && !hasInheritedAnchors) {
    return {
      status: ValidationSeverity.FAIL,
      message: 'Requires EITHER references.anchor_specs OR carry_forward.inherited_anchors (neither found)'
    };
  }

  if (hasOwnAnchors) {
    return {
      status: ValidationSeverity.PASS,
      message: `Own anchor_specs present (${ownAnchors.length})`
    };
  }

  return {
    status: ValidationSeverity.PASS,
    message: `Using inherited anchors from parent (${inheritedAnchors.length})`
  };
}

/**
 * G5: Version validation - must be parseable semver
 */
function validateG5(carryForward) {
  const version = carryForward?.version;

  if (!version) {
    return {
      status: ValidationSeverity.FAIL,
      message: 'carry_forward.version is required'
    };
  }

  // Simple semver pattern: X.Y or X.Y.Z
  const semverPattern = /^\d+\.\d+(\.\d+)?$/;
  if (!semverPattern.test(version)) {
    return {
      status: ValidationSeverity.FAIL,
      message: `Invalid version format: "${version}" (expected semver like 1.0 or 1.0.0)`
    };
  }

  return {
    status: ValidationSeverity.PASS,
    message: `Version ${version} is valid`
  };
}

/**
 * G6: Dependency edges validation
 * At PLAN entry: warn/escalate if edges missing + EDGES_REQUIRED
 * At PRD approval: hard fail if edges required but missing
 */
function validateG6(carryForward, phase) {
  const depPolicy = carryForward?.dependency_policy || {};
  const policy = depPolicy.policy || 'EDGES_REQUIRED';
  const noEdgesReason = depPolicy.no_edges_reason;

  // Check if edges are declared
  const inheritedContext = carryForward?.inherited_context_closure || {};
  const declaredDeps = inheritedContext.declared_dependencies || [];
  const hasDeclaredEdges = Array.isArray(declaredDeps) && declaredDeps.length > 0;

  // If policy is NO_EDGES_EXPECTED, just verify reason is provided
  if (policy === 'NO_EDGES_EXPECTED') {
    if (!noEdgesReason || noEdgesReason.trim() === '') {
      return {
        status: ValidationSeverity.WARN,
        message: 'NO_EDGES_EXPECTED policy requires no_edges_reason explanation'
      };
    }
    return {
      status: ValidationSeverity.PASS,
      message: `NO_EDGES_EXPECTED with reason: "${noEdgesReason.substring(0, 50)}..."`
    };
  }

  // Policy is EDGES_REQUIRED (default)
  if (!hasDeclaredEdges) {
    if (phase === 'PRD_APPROVAL' || phase === 'PLAN_TO_EXEC') {
      return {
        status: ValidationSeverity.FAIL,
        message: 'EDGES_REQUIRED but no declared_dependencies at PRD approval'
      };
    }
    // PLAN_ENTRY: warn/escalate only
    return {
      status: ValidationSeverity.ESCALATE,
      message: 'EDGES_REQUIRED but no declared_dependencies - requires Chairman review before PRD approval'
    };
  }

  return {
    status: ValidationSeverity.PASS,
    message: `${declaredDeps.length} dependency edges declared`
  };
}

/**
 * G9: File path validation - inherited_anchors must contain valid paths
 */
function validateG9(carryForward, projectRoot) {
  const inheritedAnchors = carryForward?.inherited_anchors?.anchors || [];

  if (!Array.isArray(inheritedAnchors) || inheritedAnchors.length === 0) {
    return {
      status: ValidationSeverity.PASS,
      message: 'No inherited anchors to validate'
    };
  }

  const invalidPaths = [];
  for (const anchor of inheritedAnchors) {
    const filePath = anchor.path;
    if (!filePath) {
      invalidPaths.push({ anchor, reason: 'missing path field' });
      continue;
    }

    const absolutePath = resolve(projectRoot, filePath);
    if (!existsSync(absolutePath)) {
      invalidPaths.push({ path: filePath, reason: 'file not found' });
    }
  }

  if (invalidPaths.length > 0) {
    return {
      status: ValidationSeverity.FAIL,
      message: `${invalidPaths.length}/${inheritedAnchors.length} inherited anchor paths invalid: ${JSON.stringify(invalidPaths.slice(0, 3))}`
    };
  }

  return {
    status: ValidationSeverity.PASS,
    message: `All ${inheritedAnchors.length} inherited anchor paths valid`
  };
}

/**
 * G10: Lineage consistency validation
 * - from_parent must equal parent_sd_id
 * - ancestor_chain must be root → parent (excluding child)
 * - split_depth must equal ancestor_chain.length
 * - Walk parent pointers up to root and compare to declared chain
 */
async function validateG10(sd, carryForward, fetchAncestors) {
  const lineage = carryForward?.lineage || {};
  const { root_sd_id, ancestor_chain, from_parent, split_depth } = lineage;

  const errors = [];

  // Validate from_parent matches parent_sd_id
  if (from_parent !== sd.parent_sd_id) {
    errors.push(`from_parent (${from_parent}) !== parent_sd_id (${sd.parent_sd_id})`);
  }

  // Validate ancestor_chain is an array
  if (!Array.isArray(ancestor_chain)) {
    errors.push('ancestor_chain must be an array');
  } else {
    // Validate split_depth
    if (split_depth !== ancestor_chain.length) {
      errors.push(`split_depth (${split_depth}) !== ancestor_chain.length (${ancestor_chain.length})`);
    }

    // Validate ancestor_chain ends with from_parent
    if (ancestor_chain.length > 0 && ancestor_chain[ancestor_chain.length - 1] !== from_parent) {
      errors.push(`ancestor_chain must end with from_parent (${from_parent})`);
    }

    // Validate ancestor_chain starts with root_sd_id
    if (ancestor_chain.length > 0 && ancestor_chain[0] !== root_sd_id) {
      errors.push(`ancestor_chain must start with root_sd_id (${root_sd_id})`);
    }

    // Walk parent pointers and verify chain
    try {
      const actualChain = await walkAncestorChain(sd.parent_sd_id, fetchAncestors);

      // Compare declared vs actual
      if (JSON.stringify(ancestor_chain) !== JSON.stringify(actualChain)) {
        errors.push(`Declared ancestor_chain [${ancestor_chain.join(' → ')}] !== actual [${actualChain.join(' → ')}]`);
      }

      // Verify root_sd_id matches the actual root
      if (actualChain.length > 0 && actualChain[0] !== root_sd_id) {
        errors.push(`Declared root_sd_id (${root_sd_id}) !== actual root (${actualChain[0]})`);
      }
    } catch (err) {
      errors.push(`Failed to walk ancestor chain: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    return {
      status: ValidationSeverity.FAIL,
      message: errors.join('; ')
    };
  }

  return {
    status: ValidationSeverity.PASS,
    message: `Lineage valid: ${ancestor_chain.join(' → ')} → ${sd.id}`
  };
}

/**
 * Walk parent pointers up to root to build actual ancestor chain
 * @param {string} parentId - Starting parent ID
 * @param {Function} fetchAncestors - Function to fetch SD by ID
 * @returns {string[]} Array of ancestor IDs from root to parent
 */
async function walkAncestorChain(parentId, fetchAncestors) {
  const chain = [];
  let currentId = parentId;
  const visited = new Set();

  while (currentId) {
    if (visited.has(currentId)) {
      throw new Error(`Circular reference detected at ${currentId}`);
    }
    visited.add(currentId);
    chain.unshift(currentId); // Add to front (building root → parent)

    const ancestor = await fetchAncestors(currentId);
    if (!ancestor) {
      throw new Error(`Ancestor ${currentId} not found in database`);
    }

    currentId = ancestor.parent_sd_id;
  }

  return chain;
}

/**
 * Update overall status based on gate result
 */
function updateOverallStatus(results, gateResult) {
  const severity = gateResult.status;
  const currentSeverity = results.overallStatus;

  const severityOrder = {
    [ValidationSeverity.PASS]: 0,
    [ValidationSeverity.WARN]: 1,
    [ValidationSeverity.ESCALATE]: 2,
    [ValidationSeverity.FAIL]: 3
  };

  if (severityOrder[severity] > severityOrder[currentSeverity]) {
    results.overallStatus = severity;
  }
}

/**
 * Format validation results for CLI output
 */
export function formatValidationResults(results) {
  const lines = [];
  const statusEmoji = {
    [ValidationSeverity.PASS]: '✅',
    [ValidationSeverity.WARN]: '⚠️',
    [ValidationSeverity.ESCALATE]: '🔶',
    [ValidationSeverity.FAIL]: '❌'
  };

  lines.push(`\n${statusEmoji[results.overallStatus]} ${results.sdId} (${results.phase})`);
  lines.push(`   Child SD: ${results.isChildSd ? 'YES' : 'NO'}`);
  lines.push('   Gates:');

  Object.entries(results.gates).forEach(([gate, result]) => {
    lines.push(`   ${statusEmoji[result.status]} ${gate}: ${result.message}`);
  });

  if (results.errors.length > 0) {
    lines.push('   Errors:');
    results.errors.forEach(err => lines.push(`   ❌ ${err}`));
  }

  if (results.warnings.length > 0) {
    lines.push('   Warnings:');
    results.warnings.forEach(warn => lines.push(`   ⚠️ ${warn}`));
  }

  return lines.join('\n');
}

export default {
  validateCarryForward,
  formatValidationResults,
  ValidationSeverity,
  Gates
};
