/**
 * Database Error Patterns
 * Part of SD-LEO-REFAC-ERR-PATTERN-004
 */

import { ERROR_CATEGORIES, SEVERITY_LEVELS } from '../constants.js';

export const DATABASE_PATTERNS = [
  {
    id: 'DB_CONNECTION_FAILED',
    category: ERROR_CATEGORIES.DATABASE,
    severity: SEVERITY_LEVELS.CRITICAL,
    patterns: [
      /connection.*refused/i,
      /ECONNREFUSED.*postgres/i,
      /could not connect to.*database/i,
      /connection.*timed out.*postgres/i,
      /database.*unavailable/i
    ],
    subAgents: ['DATABASE'],
    diagnosis: [
      'Check PostgreSQL service status',
      'Verify connection string configuration',
      'Check network connectivity to database server',
      'Verify database credentials',
      'Check firewall rules'
    ],
    autoRecovery: false,
    learningTags: ['database', 'connection', 'infrastructure']
  },

  {
    id: 'DB_QUERY_ERROR',
    category: ERROR_CATEGORIES.DATABASE,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /syntax error.*SQL/i,
      /column.*does not exist/i,
      /table.*does not exist/i,
      /relation.*does not exist/i,
      /invalid input syntax/i,
      /constraint.*violation/i,
      /foreign key constraint/i,
      /unique constraint/i,
      /null value.*not null constraint/i
    ],
    subAgents: ['DATABASE'],
    diagnosis: [
      'Review SQL query syntax',
      'Check table/column names against schema',
      'Verify data types match schema',
      'Check constraint definitions',
      'Review migration history'
    ],
    autoRecovery: false,
    learningTags: ['database', 'query', 'schema']
  },

  {
    id: 'DB_RLS_POLICY_ERROR',
    category: ERROR_CATEGORIES.DATABASE,
    severity: SEVERITY_LEVELS.HIGH,
    patterns: [
      /permission denied.*policy/i,
      /RLS.*policy.*failed/i,
      /row.*level.*security/i,
      /new row violates.*policy/i,
      /policy.*check.*failed/i
    ],
    subAgents: ['DATABASE', 'SECURITY'],
    diagnosis: [
      'Review RLS policy definitions',
      'Check user authentication context',
      'Verify policy expressions',
      'Test policy with current user role',
      'Check if RLS is enabled on table'
    ],
    autoRecovery: false,
    learningTags: ['database', 'rls', 'security', 'policy']
  },

  {
    id: 'DB_MIGRATION_ERROR',
    category: ERROR_CATEGORIES.DATABASE,
    severity: SEVERITY_LEVELS.CRITICAL,
    patterns: [
      /migration.*failed/i,
      /migration.*already.*applied/i,
      /migration.*out of order/i,
      /schema.*version.*mismatch/i,
      /duplicate.*migration/i
    ],
    subAgents: ['DATABASE'],
    diagnosis: [
      'Check migration version numbering',
      'Review migration history table',
      'Verify migration order',
      'Check for duplicate migrations',
      'Review rollback procedures'
    ],
    autoRecovery: false,
    learningTags: ['database', 'migration', 'schema']
  }
];
