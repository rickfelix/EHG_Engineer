# Database Connection Guide - Multi-Database Architecture

## Overview

The EHG Engineer application is designed to manage multiple Supabase instances across different applications. This guide documents the successful solution for programmatic database management, including table creation and DDL operations.

## Key Discovery: Supabase Pooler Connection

### The Problem
- Supabase Client SDK cannot execute DDL commands (CREATE TABLE, ALTER, etc.)
- Direct PostgreSQL connections fail due to IPv6 connectivity issues in WSL
- Need for programmatic table creation across multiple Supabase instances

### The Solution
Use Supabase's **Pooler Connection** in Session Mode for DDL operations.

## Connection Architecture

### 1. Connection String Format
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-1-[REGION].pooler.supabase.com:5432/postgres
```

**Critical Components:**
- **Username**: `postgres.[PROJECT-REF]` (e.g., `postgres.dedlbzhpgkmetvhbkyzq`)
- **Hostname**: `aws-1-[REGION].pooler.supabase.com` (NOT `aws-0`)
- **Port**: `5432` (Session Mode - required for DDL)
- **Database**: `postgres`

### 2. Connection Modes

| Mode | Port | Use Case | DDL Support |
|------|------|----------|-------------|
| Session | 5432 | DDL operations, migrations | ✅ Yes |
| Transaction | 6543 | Application queries | ❌ No |

## DatabaseManager Service

### Core Implementation

```javascript
const { Pool } = require('pg');

class DatabaseManager {
  constructor() {
    this.connections = new Map();
    this.currentConnection = null;
  }

  async addConnection(name, config) {
    const poolConfig = {
      host: config.dbHost || 'aws-1-us-east-1.pooler.supabase.com',
      port: config.dbPort || 5432, // Session mode for DDL
      user: config.dbUser,
      password: config.dbPassword,
      database: config.dbName || 'postgres',
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    };

    const pool = new Pool(poolConfig);
    
    // Test connection
    const client = await pool.connect();
    const result = await client.query('SELECT version()');
    client.release();
    
    this.connections.set(name, {
      name,
      config,
      pool,
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey
    });

    if (!this.currentConnection) {
      this.currentConnection = name;
      this.currentPool = pool;
    }

    return { success: true, version: result.rows[0].version };
  }

  async executeDDL(ddlSql, useTransaction = true) {
    const client = await this.currentPool.connect();
    try {
      if (useTransaction) await client.query('BEGIN');
      const result = await client.query(ddlSql);
      if (useTransaction) await client.query('COMMIT');
      return result;
    } catch (error) {
      if (useTransaction) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

## Environment Configuration

### Required Environment Variables
```bash
# .env file
SUPABASE_URL=https://dedlbzhpgkmetvhbkyzq.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_DB_PASSWORD=your_database_password_here

# Optional: Multiple database support
DATABASE_1_URL=https://project1.supabase.co
DATABASE_1_PASSWORD=password1
DATABASE_2_URL=https://project2.supabase.co
DATABASE_2_PASSWORD=password2
```

## Usage Examples

### 1. Single Database Connection
```javascript
const DatabaseManager = require('./services/DatabaseManager');

async function setupDatabase() {
  const dbManager = new DatabaseManager();
  
  await dbManager.addConnection('main', {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY,
    dbHost: 'aws-1-us-east-1.pooler.supabase.com',
    dbPort: 5432,
    dbUser: 'postgres.dedlbzhpgkmetvhbkyzq',
    dbPassword: process.env.SUPABASE_DB_PASSWORD,
    dbName: 'postgres'
  });
  
  // Now you can create tables
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  
  await dbManager.executeDDL(createTableSQL);
}
```

### 2. Multiple Database Management
```javascript
async function manageMultipleDatabases() {
  const dbManager = new DatabaseManager();
  
  // Add multiple connections
  const databases = [
    { name: 'app1', projectRef: 'abc123', password: 'pass1' },
    { name: 'app2', projectRef: 'def456', password: 'pass2' },
    { name: 'app3', projectRef: 'ghi789', password: 'pass3' }
  ];
  
  for (const db of databases) {
    await dbManager.addConnection(db.name, {
      dbHost: 'aws-1-us-east-1.pooler.supabase.com',
      dbUser: `postgres.${db.projectRef}`,
      dbPassword: db.password,
      dbPort: 5432
    });
  }
  
  // Switch between databases
  await dbManager.switchConnection('app2');
  await dbManager.executeDDL('CREATE TABLE app2_specific_table ...');
  
  await dbManager.switchConnection('app1');
  await dbManager.executeDDL('CREATE TABLE app1_specific_table ...');
}
```

### 3. Migration Support
```javascript
async function runMigrations(dbManager) {
  const migrations = [
    {
      version: '001',
      sql: `
        CREATE TABLE IF NOT EXISTS migrations (
          version VARCHAR(10) PRIMARY KEY,
          applied_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    },
    {
      version: '002',
      sql: `
        CREATE TABLE IF NOT EXISTS projects (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name TEXT NOT NULL,
          database_url TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `
    }
  ];
  
  for (const migration of migrations) {
    try {
      await dbManager.executeDDL(migration.sql);
      await dbManager.executeDDL(
        `INSERT INTO migrations (version) VALUES ('${migration.version}')`
      );
      console.log(`✅ Applied migration ${migration.version}`);
    } catch (error) {
      if (!error.message.includes('duplicate key')) {
        throw error;
      }
    }
  }
}
```

## Troubleshooting

### Common Issues and Solutions

#### 1. "Tenant or user not found" Error
**Cause**: Incorrect username format or wrong pooler hostname
**Solution**: 
- Ensure username is `postgres.[PROJECT-REF]` format
- Use `aws-1-[REGION]` not `aws-0-[REGION]` in hostname

#### 2. IPv6 Connection Failures
**Cause**: WSL doesn't support IPv6 to external hosts
**Solution**: Always use pooler connection (IPv4) instead of direct connection

#### 3. "Cannot execute DDL" with Supabase Client
**Cause**: Supabase JS client uses Transaction mode pooler
**Solution**: Use node-postgres (pg) library with Session mode pooler

#### 4. SSL Certificate Errors
**Cause**: Self-signed certificates in development
**Solution**: Set `ssl: { rejectUnauthorized: false }` in pool config

## Security Considerations

### 1. Password Management
- **NEVER** commit passwords to version control
- Use environment variables for all credentials
- Consider using secret management services in production

### 2. Connection Pooling
- Set appropriate pool sizes (max: 5-20 connections)
- Configure timeout values to prevent connection leaks
- Always release connections after use

### 3. SQL Injection Prevention
- Use parameterized queries for dynamic values
- Validate and sanitize all user inputs
- Use prepared statements where possible

## Best Practices

### 1. Connection Management
```javascript
// Always use try-finally for connection cleanup
const client = await pool.connect();
try {
  // Do work
} finally {
  client.release();
}
```

### 2. Transaction Handling
```javascript
// Wrap DDL in transactions when possible
await client.query('BEGIN');
try {
  await client.query(ddl1);
  await client.query(ddl2);
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
}
```

### 3. Error Handling
```javascript
// Provide meaningful error messages
try {
  await dbManager.executeDDL(sql);
} catch (error) {
  console.error(`DDL Execution Failed:
    SQL: ${sql.substring(0, 100)}...
    Error: ${error.message}
    Hint: Check table names, column types, and permissions
  `);
}
```

## Testing the Connection

### Quick Test Script
```javascript
// test-connection.js
const DatabaseManager = require('./services/DatabaseManager');
require('dotenv').config();

async function test() {
  const dbManager = new DatabaseManager();
  
  try {
    const result = await dbManager.addConnection('test', {
      dbHost: 'aws-1-us-east-1.pooler.supabase.com',
      dbPort: 5432,
      dbUser: 'postgres.YOUR_PROJECT_REF',
      dbPassword: process.env.SUPABASE_DB_PASSWORD
    });
    
    console.log('✅ Connected successfully');
    console.log('PostgreSQL Version:', result.version);
    
    // Test DDL capability
    await dbManager.executeDDL(`
      CREATE TABLE IF NOT EXISTS connection_test (
        id SERIAL PRIMARY KEY,
        test_time TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ DDL execution successful');
    
    // Clean up
    await dbManager.executeDDL('DROP TABLE IF EXISTS connection_test;');
    console.log('✅ Cleanup successful');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test();
```

## Migration from Hardcoded Paths

### Before (Hardcoded)
```javascript
// Old approach - limited to single database
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// Cannot create tables programmatically
```

### After (Dynamic)
```javascript
// New approach - multi-database support
const dbManager = new DatabaseManager();
await dbManager.addConnection(name, config);
await dbManager.executeDDL(createTableSQL);
// Full DDL support across multiple databases
```

## Integration with Sub-Agents

All sub-agents now support dynamic paths and database connections:

```javascript
const { DynamicSubAgentWrapper } = require('./lib/agents/dynamic-sub-agent-wrapper');
const DatabaseSubAgent = require('./lib/agents/database-sub-agent');

const agent = new DynamicSubAgentWrapper(DatabaseSubAgent, 'Database');
const results = await agent.execute({
  path: '/path/to/project',
  dbConfig: {
    host: 'aws-1-us-east-1.pooler.supabase.com',
    user: 'postgres.PROJECT_REF',
    password: process.env.DB_PASSWORD
  }
});
```

## Conclusion

This architecture provides:
1. **Programmatic DDL Support**: Full table creation and schema management
2. **Multi-Database Management**: Handle multiple Supabase instances
3. **Dynamic Path Support**: No more hardcoded locations
4. **Security**: Proper credential management and connection pooling
5. **Scalability**: Easy to add new databases and switch between them

The key insight was discovering the Supabase Pooler's Session Mode, which provides the missing DDL capabilities while solving the IPv6 connectivity issues in WSL environments.

---

*Last Updated: 2025-09-04*
*Version: 1.0.0*
*Status: Production Ready*