/**
 * EVA Capability Verifier
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-011 / FR-003
 *
 * Dynamically imports EVA modules and verifies exported function signatures.
 *
 * Usage:
 *   node scripts/eva/capability-verifier.mjs
 *
 * Output: JSON to stdout with capabilities and coverage percentage
 * Exit: 0 if coverage >= 90%, 1 otherwise
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { pathToFileURL } from 'url';

const PROJECT_ROOT = process.cwd();

/**
 * Capabilities to verify — each defines a module path and expected exports
 */
const CAPABILITIES = [
  {
    name: 'validateSchemaShape',
    module: 'lib/eva/contract-validator.js',
    verification_method: 'typeof export === "function"',
    export_name: 'validateSchemaShape'
  },
  {
    name: 'validateContracts',
    module: 'lib/eva/contract-validator.js',
    verification_method: 'typeof export === "function"',
    export_name: 'validateContracts'
  },
  {
    name: 'extractOutputSchema',
    module: 'lib/eva/stage-templates/output-schema-extractor.js',
    verification_method: 'typeof export === "function"',
    export_name: 'extractOutputSchema'
  },
  {
    name: 'ensureOutputSchema',
    module: 'lib/eva/stage-templates/output-schema-extractor.js',
    verification_method: 'typeof export === "function"',
    export_name: 'ensureOutputSchema'
  }
];

// Add stage template checks (stages 1 through 25)
for (let i = 1; i <= 25; i++) {
  const num = String(i).padStart(2, '0');
  CAPABILITIES.push({
    name: `stage-${num}-outputSchema`,
    module: `lib/eva/stage-templates/stage-${num}.js`,
    verification_method: 'default.outputSchema is array with length > 0',
    export_name: 'default',
    check: 'outputSchema'
  });
}

/**
 * Verify a single capability
 */
async function verifyCapability(cap) {
  const result = {
    name: cap.name,
    module: cap.module,
    status: 'missing',
    verification_method: cap.verification_method
  };

  const fullPath = resolve(PROJECT_ROOT, cap.module);

  // Check file exists first
  if (!existsSync(fullPath)) {
    result.status = 'missing';
    result.detail = 'Module file does not exist';
    return result;
  }

  try {
    const mod = await import(pathToFileURL(fullPath).href);

    if (cap.check === 'outputSchema') {
      // For stage templates, check default.outputSchema
      const defaultExport = mod.default;
      if (!defaultExport) {
        result.status = 'error';
        result.detail = 'No default export found';
        return result;
      }
      if (Array.isArray(defaultExport.outputSchema) && defaultExport.outputSchema.length > 0) {
        result.status = 'present';
        result.detail = `outputSchema has ${defaultExport.outputSchema.length} fields`;
      } else {
        result.status = 'missing';
        result.detail = 'outputSchema is empty or not an array';
      }
    } else {
      // For named exports, check typeof
      const exportValue = mod[cap.export_name];
      if (typeof exportValue === 'function') {
        result.status = 'present';
        result.detail = `Export "${cap.export_name}" is a function`;
      } else if (exportValue !== undefined) {
        result.status = 'present';
        result.detail = `Export "${cap.export_name}" exists (type: ${typeof exportValue})`;
      } else {
        result.status = 'missing';
        result.detail = `Export "${cap.export_name}" not found`;
      }
    }
  } catch (err) {
    result.status = 'error';
    result.detail = `Import error: ${err.message}`;
  }

  return result;
}

async function main() {
  try {
    const results = [];

    for (const cap of CAPABILITIES) {
      results.push(await verifyCapability(cap));
    }

    const total = results.length;
    const present = results.filter(r => r.status === 'present').length;
    const missing = results.filter(r => r.status === 'missing').length;
    const errors = results.filter(r => r.status === 'error').length;
    const coveragePercent = total > 0 ? Math.round((present / total) * 100) : 0;

    console.log(JSON.stringify({
      capabilities: results,
      coverage_percent: coveragePercent,
      total,
      present,
      missing,
      errors,
      verified_at: new Date().toISOString()
    }, null, 2));

    process.exit(coveragePercent >= 90 ? 0 : 1);

  } catch (err) {
    console.log(JSON.stringify({ error: true, message: err.message, exit_code: 1 }, null, 2));
    process.exit(1);
  }
}

main();
