/**
 * ANSI Terminal Colors for SD-Next Display
 * Part of SD-LEO-REFACTOR-SD-NEXT-001
 */

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
};

/**
 * Track-specific color mapping
 */
export const trackColors = {
  A: colors.magenta,
  B: colors.blue,
  C: colors.cyan,
  STANDALONE: colors.yellow,
  UNASSIGNED: colors.dim
};
