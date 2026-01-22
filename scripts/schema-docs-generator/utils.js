/**
 * Schema Documentation Generator - Utilities
 * Helper functions for file operations and data grouping
 */

import fs from 'fs';
import { CONFIG } from './config.js';

/**
 * Ensure output directories exist
 */
export function ensureDirectories() {
  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }
  if (!fs.existsSync(CONFIG.tablesDir)) {
    fs.mkdirSync(CONFIG.tablesDir, { recursive: true });
  }
}

/**
 * Group foreign keys by table name
 * @param {Array} foreignKeys - Array of foreign key info
 * @returns {Object} Foreign keys grouped by table name
 */
export function groupForeignKeysByTable(foreignKeys) {
  const grouped = {};

  for (const fk of foreignKeys) {
    if (!grouped[fk.table_name]) {
      grouped[fk.table_name] = [];
    }
    grouped[fk.table_name].push(fk);
  }

  return grouped;
}

/**
 * Log message with verbosity check
 * @param {string} message - Message to log
 */
export function log(message) {
  if (CONFIG.verbose || !message.startsWith('  ')) {
    console.log(message);
  }
}
