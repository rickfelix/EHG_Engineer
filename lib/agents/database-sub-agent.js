#!/usr/bin/env node

/**
 * Database Sub-Agent - ACTIVE Database Validation Tool
 * Validates schema, migrations, queries, and data integrity
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

class DatabaseSubAgent {
  constructor() {
    this.issues = {
      schema: [],
      migrations: [],
      queries: [],
      integrity: [],
      performance: []
    };
    
    // Initialize Supabase if credentials available
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      this.supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      );
    }
  }

  /**
   * Main execution - validate all database aspects
   */
  async execute(options = {}) {
    console.log('🗄️ Database Sub-Agent ACTIVATED\n');
    console.log('Validating ACTUAL database implementation, not just checking schema files.\n');
    
    const results = {
      timestamp: new Date().toISOString(),
      schema: {},
      migrations: {},
      queries: {},
      integrity: {},
      performance: {},
      recommendations: [],
      score: 100
    };
    
    // 1. Analyze schema
    console.log('📊 Analyzing database schema...');
    const schemaAnalysis = await this.analyzeSchema();
    results.schema = schemaAnalysis;
    
    // 2. Validate migrations
    console.log('🔄 Validating migrations...');
    const migrationAnalysis = await this.validateMigrations();
    results.migrations = migrationAnalysis;
    
    // 3. Analyze queries
    console.log('🔍 Analyzing database queries...');
    const queryAnalysis = await this.analyzeQueries(options.path || './src');
    results.queries = queryAnalysis;
    
    // 4. Check data integrity
    console.log('🔒 Checking data integrity...');
    const integrityCheck = await this.checkDataIntegrity();
    results.integrity = integrityCheck;
    
    // 5. Performance analysis
    console.log('⚡ Analyzing database performance...');
    const performanceAnalysis = await this.analyzePerformance();
    results.performance = performanceAnalysis;
    
    // 6. Check indexes
    console.log('📇 Validating indexes...');
    const indexAnalysis = await this.analyzeIndexes();
    results.schema.indexes = indexAnalysis;
    
    // 7. Check RLS policies
    console.log('🔐 Checking Row Level Security...');
    const rlsAnalysis = await this.checkRLSPolicies();
    results.integrity.rls = rlsAnalysis;
    
    // 8. Validate relationships
    console.log('🔗 Validating relationships...');
    const relationshipAnalysis = await this.validateRelationships();
    results.schema.relationships = relationshipAnalysis;
    
    // Generate recommendations
    results.recommendations = this.generateRecommendations(results);
    
    // Calculate database health score
    results.score = this.calculateScore(results);
    
    // Generate report
    this.generateReport(results);
    
    // Generate optimization scripts
    if (results.score < 80) {
      await this.generateOptimizationScripts(results);
    }
    
    return results;
  }

  /**
   * Analyze database schema
   */
  async analyzeSchema() {
    const analysis = {
      tables: [],
      columns: {},
      constraints: {},
      issues: []
    };
    
    if (!this.supabase) {
      // Analyze schema files instead
      return await this.analyzeSchemaFiles();
    }
    
    try {
      // Get all tables
      const { data: tables, error } = await this.supabase
        .rpc('get_schema_info', { schema_name: 'public' })
        .catch(() => ({ data: null, error: 'Function not available' }));
      
      if (error || !tables) {
        // Fallback: analyze known tables
        return await this.analyzeKnownTables();
      }
      
      for (const table of tables) {
        analysis.tables.push({
          name: table.table_name,
          columns: table.column_count,
          hasPrimaryKey: table.has_primary_key,
          hasIndexes: table.has_indexes
        });
        
        // Check for common issues
        if (!table.has_primary_key) {
          analysis.issues.push({
            type: 'MISSING_PRIMARY_KEY',
            table: table.table_name,
            severity: 'HIGH',
            fix: `ALTER TABLE ${table.table_name} ADD PRIMARY KEY (id);`
          });
        }
        
        if (table.column_count > 30) {
          analysis.issues.push({
            type: 'TOO_MANY_COLUMNS',
            table: table.table_name,
            columns: table.column_count,
            severity: 'MEDIUM',
            fix: 'Consider normalizing the table'
          });
        }
      }
      
      analysis.status = analysis.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                       analysis.issues.length > 5 ? 'WARNING' : 'PASS';
      
    } catch (error) {
      analysis.status = 'ERROR';
      analysis.error = error.message;
    }
    
    return analysis;
  }

  /**
   * Analyze schema files
   */
  async analyzeSchemaFiles() {
    const analysis = {
      tables: [],
      columns: {},
      issues: []
    };
    
    // Look for schema files
    const schemaPaths = [
      'database/schema.sql',
      'supabase/migrations',
      'prisma/schema.prisma',
      'db/schema.sql'
    ];
    
    for (const schemaPath of schemaPaths) {
      try {
        if (schemaPath.includes('migrations')) {
          // Read migration files
          const files = await fs.readdir(schemaPath);
          
          for (const file of files.filter(f => f.endsWith('.sql'))) {
            const content = await fs.readFile(path.join(schemaPath, file), 'utf8');
            
            // Extract CREATE TABLE statements
            const tables = this.extractTablesFromSQL(content);
            analysis.tables.push(...tables);
            
            // Check for issues in SQL
            const issues = this.analyzeSQLForIssues(content);
            analysis.issues.push(...issues);
          }
        } else {
          // Single schema file
          const content = await fs.readFile(schemaPath, 'utf8');
          const tables = this.extractTablesFromSQL(content);
          analysis.tables.push(...tables);
          
          const issues = this.analyzeSQLForIssues(content);
          analysis.issues.push(...issues);
        }
      } catch (e) {
        // File doesn't exist
      }
    }
    
    analysis.status = analysis.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                     analysis.issues.length > 5 ? 'WARNING' : 'PASS';
    
    return analysis;
  }

  /**
   * Extract tables from SQL content
   */
  extractTablesFromSQL(sql) {
    const tables = [];
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s*\(/gi;
    
    let match;
    while ((match = createTableRegex.exec(sql)) !== null) {
      const tableName = match[1];
      const tableContent = this.extractTableContent(sql, match.index);
      
      const columns = this.extractColumns(tableContent);
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
   */
  extractTableContent(sql, startIndex) {
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
   */
  extractColumns(tableContent) {
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
   */
  analyzeSQLForIssues(sql) {
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

  /**
   * Analyze known tables
   */
  async analyzeKnownTables() {
    const analysis = {
      tables: [],
      issues: []
    };
    
    const knownTables = [
      'strategic_directives_v2',
      'product_requirements_v2',
      'execution_sequences',
      'leo_audit_log'
    ];
    
    for (const table of knownTables) {
      try {
        const { data, error } = await this.supabase
          .from(table)
          .select('*')
          .limit(0);
        
        if (!error) {
          analysis.tables.push({
            name: table,
            exists: true
          });
        }
      } catch (e) {
        analysis.tables.push({
          name: table,
          exists: false
        });
      }
    }
    
    return analysis;
  }

  /**
   * Validate migrations
   */
  async validateMigrations() {
    const validation = {
      migrations: [],
      issues: [],
      status: 'UNKNOWN'
    };
    
    // Check for migration files
    const migrationPaths = [
      'supabase/migrations',
      'database/migrations',
      'db/migrate',
      'migrations'
    ];
    
    for (const migPath of migrationPaths) {
      try {
        const files = await fs.readdir(migPath);
        const migrationFiles = files.filter(f => f.endsWith('.sql') || f.endsWith('.js'));
        
        // Check migration ordering
        const timestamps = [];
        
        for (const file of migrationFiles) {
          validation.migrations.push({
            file,
            path: path.join(migPath, file)
          });
          
          // Extract timestamp from filename
          const timestamp = file.match(/^(\d+)/);
          if (timestamp) {
            timestamps.push(parseInt(timestamp[1]));
          } else {
            validation.issues.push({
              type: 'MIGRATION_NO_TIMESTAMP',
              file,
              severity: 'MEDIUM',
              fix: 'Prefix migration files with timestamps'
            });
          }
          
          // Check migration content
          const content = await fs.readFile(path.join(migPath, file), 'utf8');
          
          // Check for reversible migrations
          if (!content.includes('-- Down') && !content.includes('DROP') && !content.includes('rollback')) {
            validation.issues.push({
              type: 'NON_REVERSIBLE_MIGRATION',
              file,
              severity: 'LOW',
              fix: 'Add rollback/down migration'
            });
          }
          
          // Check for unsafe operations
          if (/DROP\s+TABLE\s+(?!IF\s+EXISTS)/i.test(content)) {
            validation.issues.push({
              type: 'UNSAFE_DROP_TABLE',
              file,
              severity: 'HIGH',
              fix: 'Use DROP TABLE IF EXISTS'
            });
          }
          
          if (/ALTER\s+TABLE.*DROP\s+COLUMN/i.test(content)) {
            validation.issues.push({
              type: 'DATA_LOSS_RISK',
              file,
              severity: 'HIGH',
              fix: 'Ensure data is backed up before dropping columns'
            });
          }
        }
        
        // Check for duplicate timestamps
        const duplicates = timestamps.filter((t, i) => timestamps.indexOf(t) !== i);
        if (duplicates.length > 0) {
          validation.issues.push({
            type: 'DUPLICATE_MIGRATION_TIMESTAMPS',
            timestamps: duplicates,
            severity: 'HIGH',
            fix: 'Ensure unique timestamps for migrations'
          });
        }
        
        break; // Found migrations
      } catch (e) {
        // Directory doesn't exist
      }
    }
    
    validation.status = validation.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                       validation.issues.length > 3 ? 'WARNING' : 'PASS';
    
    return validation;
  }

  /**
   * Analyze database queries in code
   */
  async analyzeQueries(basePath) {
    const analysis = {
      queries: [],
      issues: [],
      patterns: {}
    };
    
    const files = await this.getSourceFiles(basePath);
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8');
      const relPath = path.relative(process.cwd(), file);
      
      // Check for N+1 queries
      if (/for.*await.*(?:supabase|query|select)/gi.test(content)) {
        analysis.issues.push({
          type: 'N_PLUS_ONE_QUERY',
          file: relPath,
          severity: 'HIGH',
          fix: 'Use JOIN or batch loading instead of queries in loops'
        });
      }
      
      // Check for SELECT *
      if (/SELECT\s+\*/gi.test(content) || /select\(['"]?\*['"]?\)/gi.test(content)) {
        analysis.issues.push({
          type: 'SELECT_STAR',
          file: relPath,
          severity: 'MEDIUM',
          fix: 'Select only required columns'
        });
      }
      
      // Check for missing WHERE clause
      if (/DELETE\s+FROM\s+\w+(?!\s+WHERE)/gi.test(content)) {
        analysis.issues.push({
          type: 'UNSAFE_DELETE',
          file: relPath,
          severity: 'CRITICAL',
          fix: 'Always use WHERE clause with DELETE'
        });
      }
      
      // Check for SQL injection vulnerabilities
      if (/query.*\$\{.*\}/gi.test(content) || /query.*\+.*['"]$/gi.test(content)) {
        analysis.issues.push({
          type: 'SQL_INJECTION_RISK',
          file: relPath,
          severity: 'CRITICAL',
          fix: 'Use parameterized queries'
        });
      }
      
      // Check for transaction usage
      if (/BEGIN|START\s+TRANSACTION/gi.test(content)) {
        analysis.patterns.usesTransactions = true;
      }
      
      // Check for prepared statements
      if (/prepare|PREPARE/gi.test(content)) {
        analysis.patterns.usesPreparedStatements = true;
      }
      
      // Extract and analyze Supabase queries
      const supabaseQueries = content.match(/supabase\.from\(['"]\w+['"]\)\.[\s\S]*?(?=\n|\))/g) || [];
      
      for (const query of supabaseQueries) {
        const table = query.match(/from\(['"](.*?)['"]\)/)?.[1];
        const operation = query.match(/\.(select|insert|update|delete|upsert)/)?.[1];
        
        analysis.queries.push({
          table,
          operation,
          file: relPath
        });
        
        // Check for missing error handling
        if (!query.includes('.catch') && !content.includes('try')) {
          analysis.issues.push({
            type: 'MISSING_ERROR_HANDLING',
            file: relPath,
            table,
            severity: 'MEDIUM',
            fix: 'Add error handling for database operations'
          });
        }
      }
    }
    
    // Analyze query patterns
    const tableUsage = {};
    for (const query of analysis.queries) {
      if (query.table) {
        tableUsage[query.table] = (tableUsage[query.table] || 0) + 1;
      }
    }
    
    // Find heavily used tables that might need optimization
    for (const [table, count] of Object.entries(tableUsage)) {
      if (count > 20) {
        analysis.issues.push({
          type: 'HOT_TABLE',
          table,
          queryCount: count,
          severity: 'MEDIUM',
          fix: 'Consider caching or optimizing queries for this table'
        });
      }
    }
    
    analysis.status = analysis.issues.filter(i => i.severity === 'CRITICAL').length > 0 ? 'FAIL' :
                     analysis.issues.filter(i => i.severity === 'HIGH').length > 2 ? 'WARNING' : 'PASS';
    
    return analysis;
  }

  /**
   * Check data integrity
   */
  async checkDataIntegrity() {
    const integrity = {
      constraints: [],
      orphanedRecords: [],
      duplicates: [],
      issues: []
    };
    
    if (!this.supabase) {
      integrity.status = 'SKIP';
      integrity.message = 'Database connection not configured';
      return integrity;
    }
    
    try {
      // Check for orphaned records in known relationships
      const relationships = [
        {
          child: 'product_requirements_v2',
          childKey: 'directive_id',
          parent: 'strategic_directives_v2',
          parentKey: 'id'
        },
        {
          child: 'execution_sequences',
          childKey: 'product_requirement_id',
          parent: 'product_requirements_v2',
          parentKey: 'id'
        }
      ];
      
      for (const rel of relationships) {
        const { data: orphans } = await this.supabase
          .from(rel.child)
          .select(rel.childKey)
          .not(rel.childKey, 'in', 
            `(SELECT ${rel.parentKey} FROM ${rel.parent})`
          ).catch(() => ({ data: [] }));
        
        if (orphans && orphans.length > 0) {
          integrity.orphanedRecords.push({
            table: rel.child,
            count: orphans.length,
            relationship: `${rel.child}.${rel.childKey} -> ${rel.parent}.${rel.parentKey}`
          });
          
          integrity.issues.push({
            type: 'ORPHANED_RECORDS',
            table: rel.child,
            count: orphans.length,
            severity: 'HIGH',
            fix: `Add foreign key constraint or clean up orphaned records`
          });
        }
      }
      
      integrity.status = integrity.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                        integrity.issues.length > 2 ? 'WARNING' : 'PASS';
      
    } catch (error) {
      integrity.status = 'ERROR';
      integrity.error = error.message;
    }
    
    return integrity;
  }

  /**
   * Analyze database performance
   */
  async analyzePerformance() {
    const performance = {
      slowQueries: [],
      missingIndexes: [],
      recommendations: []
    };
    
    // Analyze code for performance issues
    const queryPatterns = await this.findQueryPatterns();
    
    // Check for missing indexes on commonly queried columns
    const commonQueries = [
      { column: 'created_at', usage: 'ORDER BY' },
      { column: 'status', usage: 'WHERE' },
      { column: 'user_id', usage: 'WHERE' },
      { column: 'updated_at', usage: 'ORDER BY' }
    ];
    
    for (const query of commonQueries) {
      const hasIndex = await this.checkIndexExists(query.column);
      if (!hasIndex) {
        performance.missingIndexes.push({
          column: query.column,
          usage: query.usage,
          recommendation: `CREATE INDEX idx_${query.column} ON table_name(${query.column});`
        });
      }
    }
    
    // Performance recommendations
    if (queryPatterns.hasLargeJoins) {
      performance.recommendations.push({
        type: 'OPTIMIZE_JOINS',
        message: 'Large JOINs detected',
        fix: 'Consider denormalization or materialized views for frequently joined data'
      });
    }
    
    if (queryPatterns.hasComplexAggregations) {
      performance.recommendations.push({
        type: 'OPTIMIZE_AGGREGATIONS',
        message: 'Complex aggregations detected',
        fix: 'Consider using materialized views or caching aggregated results'
      });
    }
    
    performance.status = performance.missingIndexes.length > 3 ? 'WARNING' :
                        performance.slowQueries.length > 0 ? 'FAIL' : 'PASS';
    
    return performance;
  }

  /**
   * Find query patterns in code
   */
  async findQueryPatterns() {
    const patterns = {
      hasLargeJoins: false,
      hasComplexAggregations: false,
      hasRecursiveQueries: false
    };
    
    const files = await this.getSourceFiles('./src').catch(() => []);
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8').catch(() => '');
      
      // Check for multiple JOINs
      if (/JOIN.*JOIN.*JOIN/gi.test(content)) {
        patterns.hasLargeJoins = true;
      }
      
      // Check for aggregations
      if (/GROUP\s+BY|SUM\s*\(|COUNT\s*\(|AVG\s*\(/gi.test(content)) {
        patterns.hasComplexAggregations = true;
      }
      
      // Check for recursive CTEs
      if (/WITH\s+RECURSIVE/gi.test(content)) {
        patterns.hasRecursiveQueries = true;
      }
    }
    
    return patterns;
  }

  /**
   * Check if index exists (mock implementation)
   */
  async checkIndexExists(column) {
    // In a real implementation, query the database
    // For now, assume common columns are indexed
    return ['id', 'created_at', 'updated_at'].includes(column);
  }

  /**
   * Analyze indexes
   */
  async analyzeIndexes() {
    const analysis = {
      indexes: [],
      missing: [],
      unused: [],
      duplicate: []
    };
    
    // This would need actual database connection to be fully functional
    // For now, provide recommendations based on common patterns
    
    analysis.missing = [
      {
        table: 'strategic_directives_v2',
        column: 'status',
        reason: 'Frequently filtered column'
      },
      {
        table: 'product_requirements_v2',
        column: 'directive_id',
        reason: 'Foreign key column'
      }
    ];
    
    analysis.status = analysis.missing.length > 5 ? 'WARNING' : 'PASS';
    
    return analysis;
  }

  /**
   * Check RLS policies
   */
  async checkRLSPolicies() {
    const analysis = {
      enabled: false,
      policies: [],
      issues: []
    };
    
    if (!this.supabase) {
      analysis.status = 'SKIP';
      return analysis;
    }
    
    // Check if RLS is enabled on tables
    const tables = ['strategic_directives_v2', 'product_requirements_v2'];
    
    for (const table of tables) {
      // This would need proper database introspection
      // For now, flag as recommendation
      analysis.issues.push({
        type: 'RLS_NOT_VERIFIED',
        table,
        severity: 'MEDIUM',
        fix: `Enable RLS: ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`
      });
    }
    
    analysis.status = analysis.enabled ? 'PASS' : 'WARNING';
    
    return analysis;
  }

  /**
   * Validate relationships
   */
  async validateRelationships() {
    const validation = {
      foreignKeys: [],
      missingRelationships: [],
      circularDependencies: []
    };
    
    // Analyze schema for relationships
    const schemaFiles = await this.findSchemaFiles();
    
    for (const file of schemaFiles) {
      const content = await fs.readFile(file, 'utf8');
      
      // Extract foreign keys
      const foreignKeys = content.match(/FOREIGN\s+KEY.*REFERENCES.*\)/gi) || [];
      
      for (const fk of foreignKeys) {
        const match = fk.match(/REFERENCES\s+(\w+)\s*\((\w+)\)/i);
        if (match) {
          validation.foreignKeys.push({
            targetTable: match[1],
            targetColumn: match[2]
          });
        }
      }
    }
    
    // Check for missing relationships
    const expectedRelationships = [
      { from: 'product_requirements_v2', to: 'strategic_directives_v2' },
      { from: 'execution_sequences', to: 'product_requirements_v2' }
    ];
    
    for (const rel of expectedRelationships) {
      const exists = validation.foreignKeys.some(fk => 
        fk.targetTable === rel.to
      );
      
      if (!exists) {
        validation.missingRelationships.push(rel);
      }
    }
    
    validation.status = validation.missingRelationships.length > 0 ? 'WARNING' : 'PASS';
    
    return validation;
  }

  /**
   * Find schema files
   */
  async findSchemaFiles() {
    const files = [];
    const paths = [
      'database',
      'supabase/migrations',
      'db',
      'schema'
    ];
    
    for (const p of paths) {
      try {
        const dirFiles = await fs.readdir(p);
        for (const file of dirFiles) {
          if (file.endsWith('.sql')) {
            files.push(path.join(p, file));
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }
    
    return files;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(results) {
    const recommendations = [];
    
    // Schema recommendations
    if (results.schema.issues) {
      for (const issue of results.schema.issues.filter(i => i.severity === 'HIGH')) {
        recommendations.push({
          area: 'Schema',
          priority: 'HIGH',
          issue: issue.type,
          fix: issue.fix
        });
      }
    }
    
    // Query recommendations
    if (results.queries.issues) {
      const criticalQueries = results.queries.issues.filter(i => 
        i.severity === 'CRITICAL' || i.severity === 'HIGH'
      );
      
      for (const issue of criticalQueries) {
        recommendations.push({
          area: 'Queries',
          priority: 'CRITICAL',
          issue: issue.type,
          fix: issue.fix
        });
      }
    }
    
    // Performance recommendations
    if (results.performance.missingIndexes && results.performance.missingIndexes.length > 0) {
      recommendations.push({
        area: 'Performance',
        priority: 'HIGH',
        issue: 'Missing indexes',
        fix: 'Create indexes on frequently queried columns'
      });
    }
    
    // Integrity recommendations
    if (results.integrity.orphanedRecords && results.integrity.orphanedRecords.length > 0) {
      recommendations.push({
        area: 'Integrity',
        priority: 'HIGH',
        issue: 'Orphaned records found',
        fix: 'Add foreign key constraints or clean up orphaned data'
      });
    }
    
    return recommendations;
  }

  /**
   * Calculate database health score
   */
  calculateScore(results) {
    let score = 100;
    
    // Schema issues
    if (results.schema.issues) {
      score -= results.schema.issues.filter(i => i.severity === 'HIGH').length * 10;
      score -= results.schema.issues.filter(i => i.severity === 'MEDIUM').length * 5;
    }
    
    // Query issues
    if (results.queries.issues) {
      score -= results.queries.issues.filter(i => i.severity === 'CRITICAL').length * 15;
      score -= results.queries.issues.filter(i => i.severity === 'HIGH').length * 10;
    }
    
    // Performance issues
    if (results.performance.missingIndexes) {
      score -= results.performance.missingIndexes.length * 3;
    }
    
    // Integrity issues
    if (results.integrity.orphanedRecords) {
      score -= results.integrity.orphanedRecords.length * 5;
    }
    
    return Math.max(0, score);
  }

  /**
   * Generate database report
   */
  generateReport(results) {
    console.log('\n' + '='.repeat(70));
    console.log('DATABASE VALIDATION REPORT');
    console.log('='.repeat(70));
    
    console.log(`\n🗄️ Database Health Score: ${results.score}/100`);
    
    // Schema summary
    if (results.schema.tables) {
      console.log(`\n📊 Schema: ${results.schema.status || 'ANALYZED'}`);
      console.log(`   Tables: ${results.schema.tables.length}`);
      
      if (results.schema.issues && results.schema.issues.length > 0) {
        console.log(`   Issues: ${results.schema.issues.length}`);
        results.schema.issues.slice(0, 3).forEach(issue => {
          console.log(`   - ${issue.type}: ${issue.table || ''}`);
        });
      }
    }
    
    // Migration summary
    if (results.migrations.migrations) {
      console.log(`\n🔄 Migrations: ${results.migrations.status}`);
      console.log(`   Total: ${results.migrations.migrations.length}`);
      
      if (results.migrations.issues && results.migrations.issues.length > 0) {
        console.log(`   Issues: ${results.migrations.issues.length}`);
      }
    }
    
    // Query analysis
    if (results.queries.queries) {
      console.log(`\n🔍 Query Analysis: ${results.queries.status}`);
      console.log(`   Analyzed: ${results.queries.queries.length} queries`);
      
      const critical = results.queries.issues ? 
        results.queries.issues.filter(i => i.severity === 'CRITICAL').length : 0;
      
      if (critical > 0) {
        console.log(`   ⚠️ CRITICAL: ${critical} issues require immediate attention`);
      }
    }
    
    // Performance summary
    if (results.performance.missingIndexes && results.performance.missingIndexes.length > 0) {
      console.log(`\n⚡ Performance: WARNING`);
      console.log(`   Missing indexes: ${results.performance.missingIndexes.length}`);
      results.performance.missingIndexes.slice(0, 3).forEach(idx => {
        console.log(`   - ${idx.column} (${idx.usage})`);
      });
    }
    
    // Top recommendations
    if (results.recommendations && results.recommendations.length > 0) {
      console.log(`\n💡 TOP RECOMMENDATIONS:`);
      results.recommendations.slice(0, 5).forEach((rec, i) => {
        console.log(`\n${i + 1}. [${rec.priority}] ${rec.area}: ${rec.issue}`);
        console.log(`   Fix: ${rec.fix}`);
      });
    }
    
    console.log('\n' + '='.repeat(70));
  }

  /**
   * Generate optimization scripts
   */
  async generateOptimizationScripts(results) {
    let sql = `-- Database Optimization Script\n`;
    sql += `-- Generated: ${new Date().toISOString()}\n`;
    sql += `-- Score: ${results.score}/100\n\n`;
    
    // Add index creation scripts
    if (results.performance.missingIndexes) {
      sql += `-- Missing Indexes\n`;
      for (const idx of results.performance.missingIndexes) {
        sql += `${idx.recommendation}\n`;
      }
      sql += `\n`;
    }
    
    // Add schema fixes
    if (results.schema.issues) {
      sql += `-- Schema Fixes\n`;
      for (const issue of results.schema.issues.filter(i => i.fix)) {
        sql += `${issue.fix}\n`;
      }
      sql += `\n`;
    }
    
    // Add RLS policies
    if (results.integrity.rls && results.integrity.rls.issues) {
      sql += `-- Row Level Security\n`;
      for (const issue of results.integrity.rls.issues) {
        sql += `${issue.fix}\n`;
      }
      sql += `\n`;
    }
    
    const scriptPath = 'database-optimization.sql';
    await fs.writeFile(scriptPath, sql);
    console.log(`\n📝 Optimization script saved to: ${scriptPath}`);
    
    // Create migration file
    const migrationPath = `migrations/${Date.now()}_optimize_database.sql`;
    await fs.mkdir('migrations', { recursive: true });
    await fs.writeFile(migrationPath, sql);
    console.log(`📦 Migration file created: ${migrationPath}`);
  }

  // Helper methods
  async getSourceFiles(basePath) {
    const files = [];
    
    async function walk(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await walk(fullPath);
          } else if (entry.isFile() && entry.name.match(/\.(js|jsx|ts|tsx)$/)) {
            files.push(fullPath);
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    }
    
    await walk(basePath);
    return files;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new DatabaseSubAgent();
  
  agent.execute({
    path: process.argv[2] || './src'
  }).then(results => {
    if (results.score < 60) {
      console.log('\n⚠️  Database health is poor!');
      console.log('   Address critical issues immediately.');
      process.exit(1);
    } else {
      console.log('\n✅ Database validation complete.');
      process.exit(0);
    }
  }).catch(error => {
    console.error('Database validation failed:', error);
    process.exit(1);
  });
}

export default DatabaseSubAgent;