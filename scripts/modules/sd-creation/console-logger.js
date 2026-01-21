/**
 * Shared console logging utilities for SD creation scripts
 * Provides consistent formatting for output
 */

/**
 * Print a header box
 * @param {string} title - The title to display
 * @param {string} [char='='] - The character for the box border
 */
export function printHeader(title, char = '=') {
  const border = char.repeat(80);
  console.log(border);
  console.log(title);
  console.log(border);
}

/**
 * Print a section separator
 * @param {string} [title] - Optional title for the separator
 */
export function printSeparator(title) {
  if (title) {
    console.log('\n' + '='.repeat(80));
    console.log(title);
    console.log('='.repeat(80));
  } else {
    console.log('\n' + '-'.repeat(80));
  }
}

/**
 * Print SD processing status
 * @param {string} sdId - The SD ID being processed
 * @param {'created'|'updated'|'failed'} status - The operation status
 * @param {string} [error] - Error message if failed
 */
export function printSDStatus(sdId, status, error) {
  switch (status) {
    case 'created':
      console.log(`   [OK] Created: ${sdId}`);
      break;
    case 'updated':
      console.log(`   [OK] Updated: ${sdId}`);
      break;
    case 'failed':
      console.log(`   [FAIL] ${sdId}: ${error || 'Unknown error'}`);
      break;
    default:
      console.log(`   ${sdId}: ${status}`);
  }
}

/**
 * Print creation results summary
 * @param {{created: string[], updated: string[], failed: Array<{id: string, error: string}>}} results
 */
export function printResultsSummary(results) {
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`[OK] Created: ${results.created.length}`);
  if (results.created.length > 0) {
    results.created.forEach(id => console.log(`   - ${id}`));
  }
  console.log(`[UPDATE] Updated: ${results.updated.length}`);
  if (results.updated.length > 0) {
    results.updated.forEach(id => console.log(`   - ${id}`));
  }
  console.log(`[FAIL] Failed: ${results.failed.length}`);
  if (results.failed.length > 0) {
    results.failed.forEach(({ id, error }) => console.log(`   - ${id}: ${error}`));
  }
}

/**
 * Print SD hierarchy tree
 * @param {Array<{id: string, title?: string, children?: string[]}>} hierarchy
 */
export function printHierarchy(hierarchy) {
  console.log('\n' + '='.repeat(80));
  console.log('HIERARCHY');
  console.log('='.repeat(80));

  function printNode(node, prefix = '', isLast = true) {
    const connector = isLast ? '\\-- ' : '+-- ';
    const childPrefix = isLast ? '    ' : '|   ';

    console.log(`${prefix}${connector}${node.id}${node.title ? ` (${node.title})` : ''}`);

    if (node.children && node.children.length > 0) {
      node.children.forEach((child, index) => {
        const isChildLast = index === node.children.length - 1;
        if (typeof child === 'string') {
          console.log(`${prefix}${childPrefix}${isChildLast ? '\\-- ' : '+-- '}${child}`);
        } else {
          printNode(child, prefix + childPrefix, isChildLast);
        }
      });
    }
  }

  hierarchy.forEach((node, index) => {
    printNode(node, '', index === hierarchy.length - 1);
  });
}

/**
 * Print next steps list
 * @param {string[]} steps - Array of next step descriptions
 */
export function printNextSteps(steps) {
  console.log('\n' + '='.repeat(80));
  console.log('NEXT STEPS');
  console.log('='.repeat(80));
  steps.forEach((step, index) => {
    console.log(`${index + 1}. ${step}`);
  });
}

/**
 * Print execution order
 * @param {Array<{id: string, priority?: string}>} executionOrder
 */
export function printExecutionOrder(executionOrder) {
  console.log('\nEXECUTION ORDER:');
  executionOrder.forEach((item, index) => {
    const priority = item.priority ? ` (${item.priority})` : '';
    const id = typeof item === 'string' ? item : item.id;
    console.log(`   ${index + 1}. ${id}${priority}`);
  });
}

/**
 * Print error and exit
 * @param {string} message - The error message
 * @param {Error} [error] - The error object
 */
export function printErrorAndExit(message, error) {
  console.error(`\n[FAIL] ${message}`);
  if (error) {
    console.error('Details:', error.message);
    if (error.details) console.error('More:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
  }
  process.exit(1);
}

/**
 * Print success message
 * @param {string} message - The success message
 */
export function printSuccess(message) {
  console.log(`\n[OK] ${message}`);
}
