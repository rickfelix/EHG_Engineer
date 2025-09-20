# Deep Research Prompt: Multi-Database Architecture for EHG_Engineer

## Context & Problem Statement

**EHG_Engineer** is a meta-application that manages and operates on OTHER applications, each with their own Supabase instances. Currently facing critical limitations:

1. **Cannot programmatically create tables** in Supabase databases
2. **No dynamic database switching** mechanism 
3. **Hardcoded credentials** in .env file
4. **No separation** between EHG_Engineer's own database and target application databases

## Research Objectives

### 1. Database Connection Architecture
Research and design a solution that enables:
- **Dynamic database switching** at runtime
- **Programmatic table creation** without manual SQL editor intervention
- **Multi-tenancy support** for managing multiple application databases
- **Secure credential management** for multiple Supabase instances

### 2. Supabase API Capabilities Investigation
Determine:
- Can we use Supabase Management API to create tables programmatically?
- Is there a service role key that allows DDL operations?
- Can we use PostgreSQL connection strings directly for migrations?
- What are the limitations of Supabase client SDK vs direct PostgreSQL access?

### 3. Required Information to Provide

Please research and provide:

#### A. Supabase Connection Methods
```javascript
// Current method (limited):
const supabase = createClient(url, anonKey)

// What we need:
// - Method to execute DDL (CREATE TABLE, etc.)
// - Method to switch databases dynamically
// - Method to run migrations programmatically
```

#### B. Database URLs and Credentials Structure
```
For EACH Supabase instance, we need:
1. Project URL (https://[project-id].supabase.co)
2. Anon Key (public, limited permissions)
3. Service Role Key (admin permissions) 
4. Direct Database URL (postgresql://...)
5. Database password
6. Connection pooler URL (if available)
```

#### C. Multi-Database Configuration Schema
```javascript
// Proposed structure:
const databases = {
  ehg_engineer: {
    url: "...",
    anonKey: "...",
    serviceKey: "...",
    dbUrl: "postgresql://...",
    purpose: "LEO Protocol, validation rules, system state"
  },
  target_app_1: {
    url: "...",
    anonKey: "...", 
    serviceKey: "...",
    dbUrl: "postgresql://...",
    purpose: "Application being managed"
  },
  target_app_2: {
    // Another application's database
  }
}
```

### 4. Specific Technical Questions

1. **DDL Execution Methods**:
   - How to run CREATE TABLE via Supabase JS client?
   - Can service role key execute DDL?
   - Should we use pg library directly instead?

2. **Migration Strategies**:
   - Can Supabase CLI work with remote databases?
   - How to apply migrations without Docker/local setup?
   - Best practice for version-controlled migrations?

3. **Connection Pooling**:
   - How to manage multiple database connections efficiently?
   - Connection pool limits for Supabase?
   - Transaction management across databases?

4. **Security Considerations**:
   - How to securely store multiple database credentials?
   - Role-based access control between databases?
   - Audit logging for cross-database operations?

### 5. Implementation Requirements

The solution MUST support:

```javascript
class DatabaseManager {
  // Switch to a different database
  async switchDatabase(appName) { }
  
  // Execute DDL (CREATE TABLE, etc.)
  async executeDDL(sql) { }
  
  // Run migrations programmatically
  async runMigration(migrationFile) { }
  
  // Query across multiple databases
  async crossDatabaseQuery(query) { }
  
  // Manage credentials securely
  async addDatabase(config) { }
}
```

### 6. Use Cases to Support

1. **LEO Protocol Validation Tables**: Create validation schema in EHG_Engineer DB
2. **Target App Analysis**: Read schema from target application's Supabase
3. **Cross-App Orchestration**: Coordinate between multiple app databases
4. **Testing Infrastructure**: Spin up test databases programmatically
5. **Migration Management**: Apply schema changes across all managed apps

### 7. Research Deliverables Needed

Please provide:

1. **Working code example** that creates a table in Supabase programmatically
2. **Connection string format** for direct PostgreSQL access to Supabase
3. **Service role key location** and how to obtain it
4. **Supabase Management API** documentation for database operations
5. **Best practices** for multi-tenant database architecture
6. **Security guidelines** for managing multiple database credentials

### 8. Current Blockers

```bash
# This fails:
npx supabase db push --db-url "$DATABASE_URL" 

# Error: Cannot connect to the Docker daemon
# Need: Method that works without Docker

# This also fails:
const { error } = await supabase.rpc('exec_sql', { query: createTableSQL })

# Error: RPC function not found
# Need: Correct method to execute DDL
```

### 9. Success Criteria

The research is complete when we can:

1. ✅ Create tables programmatically in any Supabase instance
2. ✅ Switch between multiple databases at runtime
3. ✅ Run migrations without manual SQL editor intervention
4. ✅ Securely manage credentials for multiple databases
5. ✅ Execute cross-database queries and operations

### 10. Additional Context

- EHG_Engineer uses Node.js/JavaScript
- Must work in WSL/Linux environment
- Cannot rely on Docker being available
- Must support both development and production environments
- Should integrate with existing LEO Protocol architecture

## Research Starting Points

1. Supabase Management API: https://supabase.com/docs/reference/management-api
2. PostgreSQL wire protocol libraries (pg, postgres)
3. Database migration tools (node-pg-migrate, db-migrate)
4. Connection pooling solutions (pg-pool, pgbouncer)
5. Multi-tenant architecture patterns

## Expected Output

A comprehensive solution document with:
- Architectural diagram
- Code implementation
- Migration strategy
- Security model
- Testing approach
- Deployment guide

---

**Priority**: CRITICAL - This blocks proper implementation of validation rules and multi-app management