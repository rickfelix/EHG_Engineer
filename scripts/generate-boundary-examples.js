#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

class BoundaryExamplesGenerator {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    this.scriptsDir = path.join(process.cwd(), 'scripts');
  }

  async generate() {
    const tables = await this.getDatabaseTables();
    const scripts = this.getRelevantScripts();

    const content = `# Boundary Examples - DO/DON'T Reference Guide

*Generated: ${new Date().toISOString()}*
*Source: Database + Codebase Analysis*

## 📋 Strategic Directive Statusing

| ✅ DO | ❌ DON'T | Why |
|-------|----------|-----|
| Use \`scripts/add-sd-to-database.js\` | Create SD markdown files in docs/ | Database-first architecture |
| Use \`scripts/query-active-sds.js\` | Query EHG app DB (liapbndqlqxdcgpwntbv) | Wrong database boundary |
| Use \`scripts/complete-sd-template.js\` | Manually UPDATE sd status in DB | Breaks audit trail |
| Store in \`strategic_directives_v2\` table | Create files like SD-001.md | Files aren't source of truth |
| Use \`scripts/lead-approve-sdip.js\` | Bypass LEAD approval phase | Violates LEO Protocol |

## 🔄 Retrospectives & Documentation

| ✅ DO | ❌ DON'T | Why |
|-------|----------|-----|
| Store retrospectives in DB tables | Create retrospective/*.md files | Database-first only |
| Use \`scripts/add-prd-to-database.js\` | Create PRD-*.md files | PRDs must be in DB |
| Generate docs via scripts | Manually maintain docs | Single source of truth |
| Use handoff tracking tables | Create handoff JSON/MD files | Handoffs tracked in DB |
| Run \`npm run docs:boundary\` | Edit boundary-examples.md | This file is generated |

## 🚨 Ask-Before-Act Triggers

These actions require explicit approval:

| Trigger | Example | Required Action |
|---------|---------|-----------------|
| Schema Change | \`CREATE TABLE ...\` | Get DB architect approval |
| New Dependency | \`npm install new-package\` | Justify necessity |
| Cross-Boundary | Access EHG app (liapbndqlqxdcgpwntbv) | Confirm separation |
| Security Operation | Auth/encryption changes | Security review required |
| File Creation | Creating *.md work artifacts | Use database instead |

## 📁 Real Script Paths

**SD Management:**
${scripts.sdScripts.map(s => `- \`${s}\``).join('\n')}

**PRD Management:**
${scripts.prdScripts.map(s => `- \`${s}\``).join('\n')}

**Database Tables (${tables.length} active):**
${tables.slice(0, 5).map(t => `- \`${t.table_name}\``).join('\n')}

## 🔒 Database Boundaries

| Database | ID | Purpose | Access |
|----------|-----|---------|--------|
| EHG_Engineer | dedlbzhpgkmetvhbkyzq | LEO Protocol Tool | ✅ Full |
| EHG App | liapbndqlqxdcgpwntbv | Target Application | ❌ Never |
`;

    return content;
  }

  async getDatabaseTables() {
    const { data } = await this.supabase.from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .like('table_name', '%directive%')
      .limit(10);
    return data || [];
  }

  getRelevantScripts() {
    const files = fs.readdirSync(this.scriptsDir);
    return {
      sdScripts: files.filter(f => f.match(/add-sd|complete-sd|query.*sd/)).slice(0, 5),
      prdScripts: files.filter(f => f.includes('prd')).slice(0, 5)
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new BoundaryExamplesGenerator();
  generator.generate()
    .then(content => {
      const outputPath = path.join(process.cwd(), 'docs', 'boundary-examples.md');
      fs.writeFileSync(outputPath, content);
      console.log(`✅ Generated ${outputPath}`);
    })
    .catch(err => console.error('Error:', err));
}