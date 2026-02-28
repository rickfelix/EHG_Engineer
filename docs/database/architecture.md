---
category: database
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [database, auto-generated]
---
# Multi-Database Architecture for EHG_Engineer



## Table of Contents

- [Metadata](#metadata)
- [Executive Summary](#executive-summary)
- [Critical Table Relationships for SD/Backlog Operations](#critical-table-relationships-for-sdbacklog-operations)
  - [⚠️ IMPORTANT: Understanding Views vs Tables](#-important-understanding-views-vs-tables)
  - [Correct Data Flow](#correct-data-flow)
  - [Table Structure Details](#table-structure-details)
- [Architecture Overview](#architecture-overview)
  - [Core Components](#core-components)
- [Technical Implementation](#technical-implementation)
  - [Connection Configuration](#connection-configuration)
  - [Key Capabilities](#key-capabilities)
- [Credential Management](#credential-management)
  - [Required Credentials](#required-credentials)
  - [Security Best Practices](#security-best-practices)
- [Migration Strategy](#migration-strategy)
  - [File Structure](#file-structure)
  - [Migration Example](#migration-example)
- [Usage Examples](#usage-examples)
  - [Initial Setup](#initial-setup)
  - [Application Code](#application-code)
- [Cross-Database Operations](#cross-database-operations)
  - [Application-Level Joins](#application-level-joins)
- [Benefits](#benefits)
- [Security Considerations](#security-considerations)
  - [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
  - [Audit Logging](#audit-logging)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
- [Next Steps](#next-steps)
- [Conclusion](#conclusion)

## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2025-12-22
- **Tags**: database, api, migration, schema

> **ARCHITECTURE UPDATE (SD-ARCH-EHG-007)**: Both EHG and EHG_Engineer now use the **consolidated database** (`dedlbzhpgkmetvhbkyzq`). The old EHG database (`liapbndqlqxdcgpwntbv`) is DEPRECATED.

## Executive Summary

EHG_Engineer implements a robust multi-database architecture that enables programmatic table creation and dynamic database switching across multiple Supabase instances. This solution resolves the critical limitation of the Supabase client SDK's inability to execute DDL statements by implementing direct PostgreSQL connections using the `pg` library.

## Critical Table Relationships for SD/Backlog Operations

### ⚠️ IMPORTANT: Understanding Views vs Tables

The system uses a **view-based architecture** that can be confusing:

1. **`strategic_directives_v2`** (TABLE) - Base table for SDs
2. **`sd_backlog_map`** (TABLE) - Base table for backlog items  
3. **`strategic_directives_backlog`** (VIEW) - READ-ONLY view joining the above

**Common Error**: "cannot insert into column of view"
- **Cause**: Attempting to INSERT/UPDATE the view
- **Solution**: Always use base tables for mutations

### Correct Data Flow

```sql
-- ✅ CORRECT: Insert SD into base table
INSERT INTO strategic_directives_v2 (id, title, description, status)
VALUES ('SD-003A', 'EVA Integration', 'Description...', 'active');

-- ✅ CORRECT: Insert backlog items into mapping table
INSERT INTO sd_backlog_map (sd_id, backlog_id, backlog_title, extras)
VALUES ('SD-003A', 'BP-001', 'Voice Capture', '{"kpis": [...]}');

-- ✅ CORRECT: Query combined data from view
SELECT * FROM strategic_directives_backlog WHERE sd_id = 'SD-003A';

-- ❌ WRONG: Never insert into the view
-- INSERT INTO strategic_directives_backlog (...) -- This will fail!
```

### Table Structure Details

#### `strategic_directives_v2` (Base Table)
```sql
id VARCHAR(50) PRIMARY KEY       -- e.g., 'SD-003A'
title VARCHAR(500)               -- SD title
description TEXT                 -- Full description
status VARCHAR(50)               -- draft/active/completed
priority INTEGER                 -- 0-100 priority score
h_count, m_count, l_count       -- Backlog rollup counts
sequence_rank INTEGER            -- Display order
```

#### `sd_backlog_map` (Base Table)
```sql
sd_id VARCHAR(50)               -- FK to strategic_directives_v2
backlog_id VARCHAR(100)         -- e.g., 'BP-001'
backlog_title VARCHAR(500)      -- Item title
priority VARCHAR(20)            -- High/Medium/Low
extras JSONB                    -- Flexible metadata:
  - acceptance_criteria[]
  - kpis[]
  - dependencies[]
  - rationale
  - estimated_hours
PRIMARY KEY (sd_id, backlog_id)
```

## Architecture Overview

### Core Components

#### 1. DatabaseManager Service (`src/services/DatabaseManager.js`)
Central service that manages all database operations with dual-mode functionality:

- **Administrative Mode**: Direct PostgreSQL connections for DDL operations
- **Data Access Mode**: Supabase client for RLS-aware data operations

#### 2. Connection Management
- Multiple connection pools for different Supabase instances
- Dynamic switching between databases at runtime
- Efficient resource utilization with connection pooling

#### 3. Migration System
- Docker-free migrations using `node-pg-migrate`
- Programmatic migration execution
- Version-controlled schema changes
- Transactional DDL support

## Technical Implementation

### Connection Configuration

```javascript
const databaseConfigurations = {
  ehg_engineer: {
    appName: 'EHG Engineer Internal DB',
    purpose: 'LEO Protocol, validation rules, system state',
    
    // Supabase Client Credentials
    projectUrl: "https://[project-id].supabase.co",
    anonKey: "public_anon_key...",
    serviceRoleKey: "service_role_key...",
    
    // Direct PostgreSQL Connection
    dbHost: "db.[project-id].supabase.co",
    dbUser: "postgres",
    dbPassword: "database_password",
    dbPort: 5432,
    dbName: "postgres"
  },
  target_app_1: {
    // Configuration for managed application
  }
};
```

### Key Capabilities

#### 1. Programmatic DDL Execution
```javascript
// Create tables programmatically
await dbManager.executeDDL(`
  CREATE TABLE IF NOT EXISTS my_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL
  )
`);
```

#### 2. Dynamic Database Switching
```javascript
// Switch between databases at runtime
await dbManager.switchDatabase('target_app_1');
await dbManager.executeDDL(migrationSQL);

await dbManager.switchDatabase('ehg_engineer');
await dbManager.query('SELECT * FROM leo_protocols');
```

#### 3. Migration Management
```javascript
// Run migrations programmatically
await dbManager.runMigration('up'); // Apply migrations
await dbManager.runMigration('down', 1); // Rollback one migration
```

## Credential Management

### Required Credentials

| Credential | Location in Supabase | Purpose |
|------------|---------------------|---------|
| Project URL | Settings > API | Supabase client initialization |
| Anon Key | Settings > API | Public data access with RLS |
| Service Role Key | Settings > API | Bypass RLS for admin operations |
| Database Password | Settings > Database | Direct PostgreSQL connection |
| Connection String | Settings > Database | Full PostgreSQL connection details |

### Security Best Practices

1. **Environment Variables**: Store credentials in `.env` file
2. **Never Commit Passwords**: Use environment-specific configs
3. **Least Privilege**: Create dedicated roles for EHG_Engineer
4. **Audit Logging**: Enable pgAudit extension for tracking

## Migration Strategy

### File Structure
```
migrations/
├── 001_ui_validation_schema.js
├── 002_leo_protocol_tables.js
└── 003_performance_indexes.js
```

### Migration Example
```javascript
exports.up = (pgm) => {
  pgm.createTable('table_name', {
    id: { type: 'uuid', primaryKey: true },
    name: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('now()') }
  });
};

exports.down = (pgm) => {
  pgm.dropTable('table_name');
};
```

## Usage Examples

### Initial Setup
```bash
# Install dependencies
npm install pg node-pg-migrate dotenv

# Set database password in .env
echo "SUPABASE_DB_PASSWORD=your_password" >> .env

# Run setup script
node scripts/setup-database-manager.js
```

### Application Code
```javascript
import DatabaseManager from './src/services/DatabaseManager.js';

// Initialize
await databaseManager.loadConfigurations();
await databaseManager.initialize();

// Switch to target database
await databaseManager.switchDatabase('ehg_engineer');

// Create tables
await databaseManager.executeDDL(createTableSQL);

// Run migrations
await databaseManager.runMigration('up');

// Query data
const results = await databaseManager.query(
  'SELECT * FROM users WHERE active = $1',
  [true]
);
```

## Cross-Database Operations

### Application-Level Joins
```javascript
const crossDbResults = await databaseManager.crossDatabaseQuery({
  ehg_engineer: {
    sql: 'SELECT * FROM leo_protocols WHERE active = true',
    params: []
  },
  target_app_1: {
    sql: 'SELECT * FROM user_data WHERE created_at > $1',
    params: [lastWeek]
  }
});
```

## Benefits

1. **Full DDL Support**: CREATE TABLE, ALTER TABLE, DROP TABLE capabilities
2. **No Docker Required**: Pure Node.js solution
3. **Multi-Database Management**: Switch between instances at runtime
4. **Transactional DDL**: Atomic schema changes with rollback support
5. **Connection Pooling**: Efficient resource management
6. **Migration Control**: Version-controlled, programmatic migrations

## Security Considerations

### Role-Based Access Control (RBAC)
```sql
-- Create limited-privilege role
CREATE ROLE ehg_engineer_role NOLOGIN;
GRANT CONNECT ON DATABASE postgres TO ehg_engineer_role;
GRANT CREATE ON SCHEMA public TO ehg_engineer_role;

-- Create service user
CREATE USER ehg_engineer_user WITH LOGIN PASSWORD 'secure_password';
GRANT ehg_engineer_role TO ehg_engineer_user;
```

### Audit Logging
```sql
-- Enable pgAudit extension
CREATE EXTENSION IF NOT EXISTS pgaudit;
ALTER SYSTEM SET pgaudit.log = 'ALL';
SELECT pg_reload_conf();
```

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify SUPABASE_DB_PASSWORD is correct
   - Check password in Supabase Dashboard > Settings > Database

2. **Connection Refused**
   - Verify dbHost format: `db.[project-id].supabase.co`
   - Check network connectivity
   - Ensure SSL is enabled: `ssl: { rejectUnauthorized: false }`

3. **DDL Execution Failed**
   - Check user has CREATE privileges
   - Verify transaction rollback on error
   - Review PostgreSQL error logs

## Next Steps

1. **Add Target Databases**: Configure additional Supabase instances
2. **Create Migrations**: Build schema evolution scripts
3. **Implement RBAC**: Setup least-privilege access
4. **Enable Monitoring**: Configure audit logging and alerts
5. **Automate Deployments**: Integrate with CI/CD pipeline

## Conclusion

The DatabaseManager architecture provides EHG_Engineer with enterprise-grade database management capabilities, enabling it to fulfill its role as a meta-application that manages multiple target applications. This solution directly addresses the root cause of DDL limitations while maintaining security, scalability, and operational excellence.