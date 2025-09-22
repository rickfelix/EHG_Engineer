#!/usr/bin/env node

/**
 * Intelligent Documentation Sub-Agent Runner
 * Can document specific features, architectures, or entire codebases
 */

import DocumentationSubAgent from '../lib/agents/documentation-sub-agent';
import path from 'path';
import fs from 'fs';

async function documentFeature(options = {}) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const params = {};
  
  args.forEach(arg => {
    const [key, value] = arg.split('=');
    params[key.replace('--', '')] = value;
  });

  // Merge with provided options
  const config = {
    path: params.path || options.path || process.cwd(),
    feature: params.feature || options.feature || 'general',
    output: params.output || options.output || 'docs',
    format: params.format || options.format || 'markdown',
    ...params
  };

  console.log('📚 Intelligent Documentation Sub-Agent');
  console.log('=====================================\n');
  console.log(`📁 Target Path: ${config.path}`);
  console.log(`🎯 Feature: ${config.feature}`);
  console.log(`📝 Output: ${config.output}`);
  console.log(`📄 Format: ${config.format}\n`);

  const agent = new DocumentationSubAgent();

  // Check if path exists
  if (!fs.existsSync(config.path)) {
    console.error(`❌ Path does not exist: ${config.path}`);
    process.exit(1);
  }

  try {
    // Feature-specific documentation
    if (config.feature === 'database-architecture') {
      await documentDatabaseArchitecture(config);
    } else if (config.feature === 'multi-database') {
      await documentMultiDatabaseSetup(config);
    } else if (config.feature === 'api') {
      await documentAPI(config, agent);
    } else {
      // General documentation analysis
      console.log('📊 Running general documentation analysis...\n');
      const results = await agent.execute({ path: config.path });
      
      console.log('\n📚 Documentation Analysis Complete!');
      console.log(`Score: ${results.score}/100`);
      
      // Save report
      const reportPath = path.join(config.output, `documentation-report-${Date.now()}.json`);
      ensureDirectoryExists(config.output);
      fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
      console.log(`\n💾 Report saved to: ${reportPath}`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function documentDatabaseArchitecture(config) {
  console.log('📊 Documenting Database Architecture...\n');
  
  const documentation = {
    title: 'Multi-Database Architecture Documentation',
    generated: new Date().toISOString(),
    sections: []
  };

  // 1. Overview
  documentation.sections.push({
    title: 'Overview',
    content: `
# Multi-Database Architecture for EHG_Engineer

## Problem Solved
EHG_Engineer needed to manage multiple Supabase instances programmatically but was blocked by:
- Inability to execute DDL through Supabase client SDK
- IPv6-only direct connections not working in WSL
- No dynamic database switching capability

## Solution Implemented
A comprehensive DatabaseManager service that uses Supabase's connection pooler to:
- Execute any DDL statement programmatically
- Bypass IPv6 issues using pooler's IPv4 endpoint
- Switch between multiple databases at runtime
- Manage connections efficiently with pooling
`
  });

  // 2. Architecture
  documentation.sections.push({
    title: 'Architecture Components',
    content: `
## Core Components

### 1. DatabaseManager Service
- **Location**: \`src/services/DatabaseManager.js\`
- **Purpose**: Central service for all database operations
- **Capabilities**:
  - Direct PostgreSQL connections via pg library
  - Supabase client connections for RLS operations
  - Dynamic database switching
  - Connection pool management
  - Migration execution

### 2. Connection Configuration
\`\`\`javascript
{
  dbHost: 'aws-1-us-east-1.pooler.supabase.com',
  dbPort: 5432,
  dbUser: 'postgres.dedlbzhpgkmetvhbkyzq',
  dbPassword: process.env.SUPABASE_DB_PASSWORD,
  dbName: 'postgres'
}
\`\`\`

### 3. Key Scripts
- \`scripts/setup-database-manager.js\` - Initial setup and testing
- \`scripts/create-ui-validation-tables.js\` - Table creation example
- \`scripts/find-pooler-region.js\` - Region discovery utility
`
  });

  // 3. Connection Process
  documentation.sections.push({
    title: 'Connection Process',
    content: `
## How to Connect to Supabase

### Step 1: Get Connection String
1. Go to Supabase Dashboard
2. Click "Connect" button in top bar (not in settings)
3. Select "Session" mode for DDL operations
4. Copy the connection string

### Step 2: Extract Components
From: \`postgres://postgres.PROJECT_REF:PASSWORD@aws-1-REGION.pooler.supabase.com:5432/postgres\`
Extract:
- Host: \`aws-1-REGION.pooler.supabase.com\`
- User: \`postgres.PROJECT_REF\`
- Port: \`5432\` (Session mode)

### Step 3: Configure DatabaseManager
\`\`\`javascript
const dbConfig = {
  appName: {
    dbHost: 'aws-1-us-east-1.pooler.supabase.com',
    dbUser: 'postgres.dedlbzhpgkmetvhbkyzq',
    dbPassword: process.env.SUPABASE_DB_PASSWORD,
    dbPort: 5432,
    dbName: 'postgres'
  }
};
\`\`\`

### Step 4: Use DatabaseManager
\`\`\`javascript
const dbManager = new DatabaseManager(dbConfig);
await dbManager.initialize();
await dbManager.switchDatabase('appName');
await dbManager.executeDDL('CREATE TABLE ...');
\`\`\`
`
  });

  // 4. Database Switching
  documentation.sections.push({
    title: 'Database Switching',
    content: `
## Dynamic Database Switching

### Adding Multiple Databases
\`\`\`javascript
const configs = {
  ehg_engineer: {
    // Main database config
  },
  target_app_1: {
    // Another Supabase instance
  },
  target_app_2: {
    // Yet another instance
  }
};
\`\`\`

### Switching Between Databases
\`\`\`javascript
// Switch to target app 1
await dbManager.switchDatabase('target_app_1');
await dbManager.executeDDL(createTableSQL);

// Switch to target app 2
await dbManager.switchDatabase('target_app_2');
await dbManager.query('SELECT * FROM users');

// Switch back to main
await dbManager.switchDatabase('ehg_engineer');
\`\`\`

### Cross-Database Operations
\`\`\`javascript
// Query multiple databases
const results = await dbManager.crossDatabaseQuery({
  base: { app: 'app1', query: 'SELECT ...' },
  join: { app: 'app2', query: 'SELECT ...' }
});
\`\`\`
`
  });

  // 5. Troubleshooting
  documentation.sections.push({
    title: 'Troubleshooting',
    content: `
## Common Issues and Solutions

### IPv6 Connection Error
**Error**: \`ENETUNREACH 2600:1f18:...\`
**Solution**: Use the pooler connection instead of direct connection

### Tenant or User Not Found
**Error**: \`Tenant or user not found\`
**Causes & Solutions**:
1. Wrong region in hostname → Get exact hostname from dashboard
2. Wrong username format → Use \`postgres.PROJECT_REF\`
3. Wrong pooler version → Use \`aws-1-*\` not \`aws-0-*\`

### Cannot Execute DDL
**Error**: DDL statements fail
**Solution**: Use Session mode (port 5432) not Transaction mode (port 6543)

### Authentication Failed
**Error**: Password authentication failed
**Solution**: 
1. Check SUPABASE_DB_PASSWORD in .env
2. Reset password in Supabase Dashboard > Settings > Database
`
  });

  // Save documentation
  const outputPath = path.join(config.output, 'DATABASE_ARCHITECTURE.md');
  ensureDirectoryExists(config.output);
  
  let markdown = '';
  documentation.sections.forEach(section => {
    markdown += section.content + '\n\n';
  });
  
  fs.writeFileSync(outputPath, markdown);
  console.log(`✅ Database architecture documented in: ${outputPath}`);
  
  // Also save as JSON for programmatic access
  const jsonPath = path.join(config.output, 'database-architecture.json');
  fs.writeFileSync(jsonPath, JSON.stringify(documentation, null, 2));
  console.log(`✅ JSON version saved to: ${jsonPath}`);
}

async function documentMultiDatabaseSetup(config) {
  console.log('📊 Documenting Multi-Database Setup...\n');
  
  const setupGuide = `
# Multi-Database Setup Guide

## Prerequisites
- Node.js installed
- Supabase project(s) created
- Database passwords available

## Installation

### 1. Install Dependencies
\`\`\`bash
npm install pg node-pg-migrate dotenv @supabase/supabase-js
\`\`\`

### 2. Environment Setup
Create \`.env\` file:
\`\`\`env
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_DB_PASSWORD=your_database_password
\`\`\`

### 3. Database Configuration
Create \`config/databases.json\`:
\`\`\`json
{
  "app1": {
    "dbHost": "aws-1-REGION.pooler.supabase.com",
    "dbUser": "postgres.PROJECT_REF",
    "dbPort": 5432,
    "dbName": "postgres"
  }
}
\`\`\`

## Usage Examples

### Create Tables
\`\`\`javascript
import { DatabaseManager } from './src/services/DatabaseManager.js';

const dbManager = new DatabaseManager();
await dbManager.loadConfigurations();
await dbManager.initialize();
await dbManager.switchDatabase('app1');

await dbManager.executeDDL(\`
  CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
\`);
\`\`\`

### Run Migrations
\`\`\`javascript
await dbManager.runMigration('up'); // Apply migrations
await dbManager.runMigration('down', 1); // Rollback one
\`\`\`

## Best Practices
1. Always use environment variables for passwords
2. Use connection pooling for efficiency
3. Wrap DDL in transactions when possible
4. Test connections before critical operations
5. Implement proper error handling
`;

  const outputPath = path.join(config.output, 'MULTI_DATABASE_SETUP.md');
  ensureDirectoryExists(config.output);
  fs.writeFileSync(outputPath, setupGuide);
  console.log(`✅ Setup guide created: ${outputPath}`);
}

async function documentAPI(config, agent) {
  console.log('📊 Documenting API endpoints...\n');
  // This would analyze and document API endpoints
  // Implementation depends on your API structure
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  documentFeature();
}

export {  documentFeature  };