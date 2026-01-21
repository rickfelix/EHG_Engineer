/**
 * Component Consistency Checks
 * Validates component patterns and consistency
 *
 * Extracted from design-sub-agent.js for modularity
 * SD-LEO-REFACTOR-DESIGN-AGENT-001
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { SEVERITY } from './constants.js';
import { getComponentFiles } from './file-helpers.js';

/**
 * Check component consistency
 * @param {string} basePath - Base path to scan
 * @param {Object} options - File scanning options
 * @returns {Promise<Object>} Component consistency check results
 */
export async function checkComponentConsistency(basePath, options = {}) {
  const results = {
    components: [],
    inconsistencies: [],
    designPatterns: {}
  };

  const componentFiles = await getComponentFiles(basePath, options);
  const _componentAnalysis = new Map();

  for (const file of componentFiles) {
    const content = await fs.readFile(file, 'utf8');
    const componentName = path.basename(file).replace(/\.(jsx?|tsx?)$/, '');

    const analysis = {
      name: componentName,
      file: path.relative(process.cwd(), file),
      hasProps: /props\./gi.test(content) || /\{.*\}.*=.*props/gi.test(content),
      hasState: /useState|this\.state/gi.test(content),
      hasEffects: /useEffect|componentDidMount/gi.test(content),
      buttonPatterns: [],
      inputPatterns: [],
      spacing: []
    };

    // Analyze button patterns
    const buttons = content.match(/<(button|Button)[^>]*>/gi) || [];
    for (const button of buttons) {
      const classes = button.match(/className=["']([^"']+)["']/);
      if (classes) {
        analysis.buttonPatterns.push(classes[1]);
      }
    }

    // Analyze input patterns
    const inputs = content.match(/<(input|Input|TextField)[^>]*>/gi) || [];
    for (const input of inputs) {
      const classes = input.match(/className=["']([^"']+)["']/);
      if (classes) {
        analysis.inputPatterns.push(classes[1]);
      }
    }

    // Analyze spacing patterns
    const spacingPatterns = content.match(/(margin|padding):\s*[\d.]+\w+/gi) || [];
    analysis.spacing = spacingPatterns;

    _componentAnalysis.set(componentName, analysis);
    results.components.push(analysis);
  }

  // Check for inconsistencies
  const allButtonClasses = results.components.flatMap(c => c.buttonPatterns);
  const uniqueButtonStyles = [...new Set(allButtonClasses)];

  if (uniqueButtonStyles.length > 5) {
    results.inconsistencies.push({
      type: 'INCONSISTENT_BUTTONS',
      count: uniqueButtonStyles.length,
      severity: SEVERITY.MEDIUM,
      message: 'Too many button variations',
      fix: 'Create a consistent button component with variants'
    });
  }

  const allInputClasses = results.components.flatMap(c => c.inputPatterns);
  const uniqueInputStyles = [...new Set(allInputClasses)];

  if (uniqueInputStyles.length > 3) {
    results.inconsistencies.push({
      type: 'INCONSISTENT_INPUTS',
      count: uniqueInputStyles.length,
      severity: SEVERITY.MEDIUM,
      message: 'Too many input variations',
      fix: 'Standardize form input styling'
    });
  }

  // Check for design pattern usage
  results.designPatterns = {
    atomicDesign: checkAtomicDesign(results.components),
    componentComposition: results.components.filter(c => c.hasProps).length / results.components.length,
    stateManagement: results.components.filter(c => c.hasState).length
  };

  results.status = results.inconsistencies.filter(i => i.severity === SEVERITY.HIGH).length > 0 ? 'FAIL' :
    results.inconsistencies.length > 5 ? 'WARNING' : 'PASS';

  return results;
}

/**
 * Check atomic design patterns
 * @param {Array} components - Array of component analysis objects
 * @returns {Object} Atomic design pattern analysis
 */
export function checkAtomicDesign(components) {
  const atoms = components.filter(c =>
    /button|input|label|icon/i.test(c.name) && !c.hasState
  ).length;

  const molecules = components.filter(c =>
    /form|card|list/i.test(c.name) && c.hasProps
  ).length;

  const organisms = components.filter(c =>
    /header|footer|nav|sidebar/i.test(c.name)
  ).length;

  return {
    atoms,
    molecules,
    organisms,
    follows: atoms > 0 && molecules > 0
  };
}
