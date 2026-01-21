/**
 * Database Sub-Agent - SQL Parser Module
 *
 * Utility functions for parsing SQL content.
 *
 * @module lib/agents/modules/database-sub-agent/sql-parser
 */

/**
 * Extract tables from SQL content
 *
 * @param {string} sql - SQL content
 * @returns {Array<Object>} Extracted table definitions
 */
export function extractTablesFromSQL(sql) {
  const tables = [];
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s*\(/gi;

  let match;
  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const tableContent = extractTableContent(sql, match.index);

    const columns = extractColumns(tableContent);
    const hasPrimaryKey = /PRIMARY\s+KEY/i.test(tableContent);
    const hasForeignKeys = /FOREIGN\s+KEY/i.test(tableContent) || /REFERENCES/i.test(tableContent);
    const hasIndexes = /CREATE\s+INDEX/i.test(sql);

    tables.push({
      name: tableName,
      columns: columns.length,
      columnList: columns,
      hasPrimaryKey,
      hasForeignKeys,
      hasIndexes
    });
  }

  return tables;
}

/**
 * Extract table content from CREATE TABLE statement
 *
 * @param {string} sql - Full SQL content
 * @param {number} startIndex - Start index of CREATE TABLE
 * @returns {string} Table definition content
 */
export function extractTableContent(sql, startIndex) {
  let depth = 0;
  let i = startIndex;
  let start = -1;

  while (i < sql.length) {
    if (sql[i] === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (sql[i] === ')') {
      depth--;
      if (depth === 0 && start !== -1) {
        return sql.substring(start, i + 1);
      }
    }
    i++;
  }

  return '';
}

/**
 * Extract columns from table content
 *
 * @param {string} tableContent - Table definition content
 * @returns {Array<Object>} Column definitions
 */
export function extractColumns(tableContent) {
  const columns = [];
  const lines = tableContent.split(',');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip constraints
    if (/^(PRIMARY|FOREIGN|UNIQUE|CHECK|INDEX)/i.test(trimmed)) continue;

    const columnMatch = trimmed.match(/^["']?(\w+)["']?\s+(\w+)/);
    if (columnMatch) {
      columns.push({
        name: columnMatch[1],
        type: columnMatch[2]
      });
    }
  }

  return columns;
}

/**
 * Analyze SQL for issues
 *
 * @param {string} sql - SQL content to analyze
 * @returns {Array<Object>} Detected issues
 */
export function analyzeSQLForIssues(sql) {
  const issues = [];

  // Check for missing created_at/updated_at
  const tables = sql.match(/CREATE\s+TABLE[^;]+;/gi) || [];

  for (const table of tables) {
    const tableName = table.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/i);

    if (tableName) {
      if (!table.includes('created_at')) {
        issues.push({
          type: 'MISSING_TIMESTAMP',
          table: tableName[1],
          column: 'created_at',
          severity: 'LOW',
          fix: `ALTER TABLE ${tableName[1]} ADD COLUMN created_at TIMESTAMP DEFAULT NOW();`
        });
      }

      if (!table.includes('updated_at')) {
        issues.push({
          type: 'MISSING_TIMESTAMP',
          table: tableName[1],
          column: 'updated_at',
          severity: 'LOW',
          fix: `ALTER TABLE ${tableName[1]} ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();`
        });
      }

      // Check for VARCHAR without length
      if (/VARCHAR(?!\s*\()/i.test(table)) {
        issues.push({
          type: 'VARCHAR_WITHOUT_LENGTH',
          table: tableName[1],
          severity: 'MEDIUM',
          fix: 'Specify VARCHAR length: VARCHAR(255)'
        });
      }

      // Check for missing NOT NULL on important columns
      if (/id\s+\w+(?!\s+NOT\s+NULL)/i.test(table)) {
        issues.push({
          type: 'NULLABLE_ID',
          table: tableName[1],
          severity: 'HIGH',
          fix: 'ID columns should be NOT NULL'
        });
      }
    }
  }

  // Check for missing indexes on foreign keys
  const foreignKeys = sql.match(/FOREIGN\s+KEY\s*\((\w+)\)/gi) || [];
  const indexes = sql.match(/CREATE\s+INDEX[^;]+;/gi) || [];

  for (const fk of foreignKeys) {
    const column = fk.match(/\((\w+)\)/)[1];
    const hasIndex = indexes.some(idx => idx.includes(column));

    if (!hasIndex) {
      issues.push({
        type: 'UNINDEXED_FOREIGN_KEY',
        column,
        severity: 'MEDIUM',
        fix: `CREATE INDEX idx_${column} ON table_name(${column});`
      });
    }
  }

  return issues;
}
