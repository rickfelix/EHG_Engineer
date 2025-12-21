/**
 * Database Architect: Minimal PRD Insertion (Essential Fields Only)
 * SD-EVA-CONTENT-001
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function createPRD() {
  console.log('🗄️ DATABASE ARCHITECT: Minimal PRD Creation\n');

  const prdId = `PRD-EVA-CONTENT-001-${Date.now()}`;

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected\n');

    // Use ONLY essential fields
    const insertSQL = `
      INSERT INTO product_requirements_v2 (
        id,
        directive_id,
        sd_id,
        title,
        version,
        status,
        category,
        priority,
        executive_summary,
        content,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, title, sd_id, status;
    `;

    const values = [
      prdId,
      'SD-EVA-CONTENT-001',
      'SD-EVA-CONTENT-001',
      'EVA Content Catalogue & Dynamic Presentation System MVP',
      '1.0',
      'approved',
      'AI & Automation',
      'high',
      'Build dynamic content management system integrated with EVA for creating/presenting structured content (text, tables, charts) via natural language at http://localhost:8080/eva-assistant. Approved scope: 92h across 5 backlog items (Database Schema 16h, Content Types 20h, Presentation Layout 18h, EVA Integration 22h, Testing 16h). Deferred: Version History, Pan/Zoom Canvas.',
      `# PRD: EVA Content Catalogue MVP

## Target
http://localhost:8080/eva-assistant (EHG app, port 8080)

## Scope (92h, 5 items)
1. BP-EVA-CONTENT-001: Database Schema (16h) - 9 tables, RLS, seed data
2. BP-EVA-CONTENT-002: Content Types (20h) - 3 renderers + service
3. BP-EVA-CONTENT-004: Presentation Layout (18h) - Slides + keyboard shortcuts
4. BP-EVA-CONTENT-006: EVA Integration (22h) - Natural language content creation
5. BP-EVA-CONTENT-007: Settings & Testing (16h) - E2E with Playwright

## EXEC Checklist (MANDATORY)
1. Verify: /mnt/c/_EHG/EHG (NOT EHG_Engineer)
2. Apply migration: 20251011_eva_content_catalogue_mvp.sql to EHG DB
3. Navigate: http://localhost:8080/eva-assistant (verify accessible)
4. Install: react-markdown, react-table, recharts, framer-motion
5. Implement 8 components (~3000 LOC total)
6. Test: npm run test:unit AND npm run test:e2e (BOTH must pass)
7. Coverage: 100% user stories (MANDATORY)

## Architecture
- TextBlockRenderer.tsx (~300 LOC)
- DataTableRenderer.tsx (~400 LOC)
- ChartRenderer.tsx (~350 LOC)
- LayoutEngine.tsx (~500 LOC)
- PresentationMode.tsx (~400 LOC)
- EVASettingsPanel.tsx (~350 LOC)
- contentTypeService.ts (~400 LOC)
- evaContentService.ts (~300 LOC)

## Acceptance Criteria (ALL must pass)
- Migration applied: 9 tables exist with RLS
- Content renders: text/table/chart functional
- Presentation mode: keyboard navigation works
- EVA integration: "create pitch deck" recognized
- Tests pass: Unit AND E2E at 100% coverage

Full details in PLAN→EXEC handoff.`,
      'PLAN_AGENT'
    ];

    const result = await client.query(insertSQL, values);
    const data = result.rows[0];

    console.log('✅ PRD CREATED!\n');
    console.log('ID:', data.id);
    console.log('Title:', data.title);
    console.log('SD:', data.sd_id);
    console.log('Status:', data.status);
    console.log('\n✅ Database Architect: PRD insertion successful');
    console.log('➡️ Next: User stories + PLAN→EXEC handoff\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

createPRD();
