/**
 * Phase 4: THE BLUEPRINT - Venture Lifecycle E2E Tests (Stages 13-16)
 * "Kochel Firewall" - Technical specification phase
 *
 * Tests the technical planning phase:
 * - Stage 13: Product Roadmap (DECISION_GATE, requires: blueprint_product_roadmap)
 * - Stage 14: Technical Architecture (SD_REQUIRED, requires: blueprint_data_model, blueprint_erd_diagram)
 * - Stage 15: Risk Register (SD_REQUIRED, requires: blueprint_user_story_pack)
 * - Stage 16: Financial Projections (DECISION_GATE, SD_REQUIRED, requires: blueprint_api_contract, blueprint_schema_spec)
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { getStageForArtifactType } from '../../../lib/eva/artifact-types.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

test.describe('Phase 4: THE BLUEPRINT (Stages 13-16)', () => {
  // fullyParallel:true (playwright.config.js) schedules tests within a file across
  // workers unless pinned serial -- these tests share mutable venture state
  // (testVentureId, advancing stage-by-stage) and MUST run in declaration order.
  test.describe.configure({ mode: 'serial' });

  let supabase: any;
  let testVentureId: string;
  let testCompanyId: string;

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY!);

    const { data: company } = await supabase
      .from('companies')
      .insert({ name: `Phase4 Test Company ${Date.now()}` })
      .select('id')
      .single();

    if (company) testCompanyId = company.id;

    const { data: venture } = await supabase
      .from('ventures')
      .insert({
        name: `Phase 4 Test Venture ${Date.now()}`,
        company_id: testCompanyId,
        problem_statement: 'Test problem statement for E2E lifecycle testing',
        current_lifecycle_stage: 12,
        description: 'Testing THE BLUEPRINT phase lifecycle'
      })
      .select('id')
      .single();

    if (venture) testVentureId = venture.id;

    // Seed Stage 12's own exit artifact — STAGE_ADVANCEMENT_ARTIFACT_GATE requires it
    // to already exist before the venture can advance past the stage it was born at.
    if (testVentureId) {
      await supabase.from('venture_artifacts').insert([
        {
          venture_id: testVentureId,
          artifact_type: 'identity_brand_guidelines',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('identity_brand_guidelines'),
          title: 'Seed artifact for Stage 12',
          artifact_data: { placeholder: true }
        },
        {
          venture_id: testVentureId,
          artifact_type: 'identity_gtm_sales_strategy',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('identity_gtm_sales_strategy'),
          title: 'Seed artifact for Stage 12',
          artifact_data: { placeholder: true }
        }
      ]);
    }
  });

  test.afterAll(async () => {
    if (testVentureId) {
      await supabase.from('venture_artifacts').delete().eq('venture_id', testVentureId);
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  // =========================================================================
  // STAGE 13: Product Roadmap (Decision Gate)
  // =========================================================================
  test.describe('Stage 13: Product Roadmap', () => {
    test('S13-001: should advance to Stage 13', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 13 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S13-002: should create tech_stack_decision with AI interrogation', async () => {
      const techStackDecision = {
        interrogation_results: {
          ai_challenger: {
            questions_asked: 15,
            concerns_raised: [
              'React may have performance issues at scale',
              'PostgreSQL may need sharding for high write loads',
              'Node.js single-thread limitation'
            ],
            alternatives_suggested: [
              { original: 'React', suggested: 'Vue.js', reason: 'Smaller bundle size' },
              { original: 'PostgreSQL', suggested: 'CockroachDB', reason: 'Built-in sharding' }
            ]
          },
          resolution: {
            concerns_addressed: true,
            rationale: 'Team expertise and ecosystem support outweigh concerns'
          }
        },
        final_stack: {
          frontend: {
            framework: 'React 18',
            state: 'Zustand',
            styling: 'Tailwind CSS',
            build: 'Vite'
          },
          backend: {
            runtime: 'Node.js 20',
            framework: 'Express',
            api: 'REST + WebSocket'
          },
          database: {
            primary: 'PostgreSQL 15',
            cache: 'Redis',
            search: 'Elasticsearch'
          },
          infrastructure: {
            cloud: 'AWS',
            container: 'Docker',
            orchestration: 'ECS',
            ci_cd: 'GitHub Actions'
          },
          ai_ml: {
            llm_provider: 'Anthropic Claude',
            embeddings: 'OpenAI',
            vector_db: 'pgvector'
          }
        },
        trade_offs: [
          {
            decision: 'PostgreSQL over NoSQL',
            pros: ['ACID compliance', 'Complex queries', 'pgvector support'],
            cons: ['Horizontal scaling complexity'],
            mitigation: 'Use read replicas and connection pooling'
          },
          {
            decision: 'Monolith first',
            pros: ['Faster development', 'Simpler deployment', 'Easier debugging'],
            cons: ['Future scaling challenges'],
            mitigation: 'Design with clear module boundaries for future extraction'
          }
        ],
        decision_gate_status: 'approved',
        approved_by: 'CTO',
        approved_at: new Date().toISOString()
      };

      const { data: artifact, error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: 'blueprint_product_roadmap',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('blueprint_product_roadmap'),
          title: 'Tech Stack Decision',
          artifact_data: techStackDecision,
        })
        .select('id')
        .single();

      expect(error).toBeNull();
      expect(techStackDecision.interrogation_results.ai_challenger).toBeDefined();
      expect(techStackDecision.decision_gate_status).toBe('approved');
    });
  });

  // =========================================================================
  // STAGE 14: Technical Architecture (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 14: Technical Architecture', () => {
    test('S14-001: should advance to Stage 14', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 14 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S14-002: should create data_model artifact', async () => {
      const dataModel = {
        entities: [
          {
            name: 'users',
            description: 'Application users',
            fields: [
              { name: 'id', type: 'UUID', primary_key: true },
              { name: 'email', type: 'VARCHAR(255)', unique: true, not_null: true },
              { name: 'name', type: 'VARCHAR(255)' },
              { name: 'created_at', type: 'TIMESTAMPTZ', default: 'NOW()' }
            ]
          },
          {
            name: 'ventures',
            description: 'Venture projects',
            fields: [
              { name: 'id', type: 'UUID', primary_key: true },
              { name: 'name', type: 'VARCHAR(255)', not_null: true },
              { name: 'owner_id', type: 'UUID', foreign_key: 'users.id' },
              { name: 'current_stage', type: 'INTEGER', default: 1 },
              { name: 'created_at', type: 'TIMESTAMPTZ', default: 'NOW()' }
            ]
          },
          {
            name: 'documents',
            description: 'Venture documents and artifacts',
            fields: [
              { name: 'id', type: 'UUID', primary_key: true },
              { name: 'venture_id', type: 'UUID', foreign_key: 'ventures.id' },
              { name: 'type', type: 'VARCHAR(50)', not_null: true },
              { name: 'content', type: 'JSONB' },
              { name: 'created_at', type: 'TIMESTAMPTZ', default: 'NOW()' }
            ]
          }
        ],
        relationships: [
          { from: 'ventures.owner_id', to: 'users.id', type: 'many-to-one' },
          { from: 'documents.venture_id', to: 'ventures.id', type: 'many-to-one' }
        ],
        indexes: [
          { table: 'users', columns: ['email'], type: 'unique' },
          { table: 'ventures', columns: ['owner_id'], type: 'btree' },
          { table: 'documents', columns: ['venture_id', 'type'], type: 'btree' }
        ]
      };

      const { error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: 'blueprint_data_model',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('blueprint_data_model'),
          title: 'Data Model',
          artifact_data: dataModel,
        });

      expect(error).toBeNull();
    });

    test('S14-003: should create erd_diagram artifact', async () => {
      const erdDiagram = {
        format: 'mermaid',
        diagram: `
erDiagram
    users ||--o{ ventures : owns
    ventures ||--o{ documents : contains

    users {
        uuid id PK
        string email UK
        string name
        timestamp created_at
    }

    ventures {
        uuid id PK
        string name
        uuid owner_id FK
        int current_stage
        timestamp created_at
    }

    documents {
        uuid id PK
        uuid venture_id FK
        string type
        jsonb content
        timestamp created_at
    }
`,
        last_updated: new Date().toISOString()
      };

      const { error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: 'blueprint_erd_diagram',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('blueprint_erd_diagram'),
          title: 'ERD Diagram',
          artifact_data: erdDiagram,
        });

      expect(error).toBeNull();
    });

    test('S14-004: should seed the remaining Stage 14 required artifacts', async () => {
      // Stage 14 canonically requires the full 5-artifact set (lib/eva/artifact-types.js
      // ARTIFACT_TYPE_BY_STAGE[14]): blueprint_technical_architecture, blueprint_data_model,
      // blueprint_erd_diagram, blueprint_api_contract, blueprint_schema_spec. This file
      // originally created only 2 of the 5 at Stage 14 -- api_contract/schema_spec were
      // (incorrectly, per the canonical registry) created later under "Stage 16", and
      // blueprint_technical_architecture was never created anywhere. Seeded here as
      // placeholders; S16-002/S16-003 below enrich the api_contract/schema_spec rows via
      // update() (not a second insert, which would collide on the partial unique index).
      const { error } = await supabase.from('venture_artifacts').insert([
        {
          venture_id: testVentureId,
          artifact_type: 'blueprint_technical_architecture',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('blueprint_technical_architecture'),
          title: 'Technical Architecture (seed)',
          artifact_data: { placeholder: true },
        },
        {
          venture_id: testVentureId,
          artifact_type: 'blueprint_api_contract',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('blueprint_api_contract'),
          title: 'API Contract (seed)',
          artifact_data: { placeholder: true },
        },
        {
          venture_id: testVentureId,
          artifact_type: 'blueprint_schema_spec',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('blueprint_schema_spec'),
          title: 'Schema Specification (seed)',
          artifact_data: { placeholder: true },
        },
      ]);

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // STAGE 15: Risk Register (SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 15: Risk Register', () => {
    test('S15-001: should advance to Stage 15', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 15 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S15-002: should create user_story_pack with INVEST compliance', async () => {
      const userStoryPack = {
        epics: [
          {
            id: 'EPIC-001',
            title: 'User Authentication',
            description: 'Secure user authentication and authorization system',
            stories: [
              {
                id: 'US-001',
                title: 'User Registration',
                as_a: 'new user',
                i_want: 'to register with my email',
                so_that: 'I can access the platform',
                acceptance_criteria: [
                  'Given valid email and password, When I submit registration, Then account is created',
                  'Given invalid email format, When I submit, Then error message is shown',
                  'Given existing email, When I submit, Then duplicate error is shown'
                ],
                story_points: 3,
                invest_compliant: true
              },
              {
                id: 'US-002',
                title: 'User Login',
                as_a: 'registered user',
                i_want: 'to log in with my credentials',
                so_that: 'I can access my ventures',
                acceptance_criteria: [
                  'Given valid credentials, When I submit login, Then I am authenticated',
                  'Given invalid credentials, When I submit, Then error message is shown',
                  'Given locked account, When I submit, Then locked message is shown'
                ],
                story_points: 2,
                invest_compliant: true
              }
            ]
          },
          {
            id: 'EPIC-002',
            title: 'Venture Management',
            description: 'Core venture lifecycle management features',
            stories: [
              {
                id: 'US-003',
                title: 'Create Venture',
                as_a: 'logged in user',
                i_want: 'to create a new venture',
                so_that: 'I can track my business idea',
                acceptance_criteria: [
                  'Given I am on dashboard, When I click Create Venture, Then form opens',
                  'Given valid venture details, When I submit, Then venture is created at Stage 1',
                  'Given missing required fields, When I submit, Then validation errors show'
                ],
                story_points: 5,
                invest_compliant: true
              }
            ]
          }
        ],
        summary: {
          total_epics: 2,
          total_stories: 3,
          total_points: 10,
          invest_compliance_rate: 1.0
        }
      };

      const { error } = await supabase
        .from('venture_artifacts')
        .insert({
          venture_id: testVentureId,
          artifact_type: 'blueprint_user_story_pack',
          is_current: true,
          lifecycle_stage: getStageForArtifactType('blueprint_user_story_pack'),
          title: 'User Story Pack',
          artifact_data: userStoryPack,
        });

      expect(error).toBeNull();

      // Validate INVEST compliance
      const allStoriesCompliant = userStoryPack.epics.every(epic =>
        epic.stories.every(story => story.invest_compliant)
      );
      expect(allStoriesCompliant).toBe(true);
    });

    test('S15-003: should create wireframe_screens artifact', async () => {
      // venture_stages.required_artifacts[15] = [wireframe_screens, blueprint_user_story_pack]
      // -- wireframe_screens was never created anywhere in this file (verified live).
      const wireframeScreens = {
        screens: [
          { id: 'dashboard', name: 'Dashboard', layout: 'sidebar-main', components: ['NavBar', 'VentureList', 'StatsPanel'] },
          { id: 'venture-detail', name: 'Venture Detail', layout: 'full-width', components: ['StageTracker', 'ArtifactList', 'ActionPanel'] }
        ]
      };

      const { error } = await supabase.from('venture_artifacts').insert({
        venture_id: testVentureId,
        artifact_type: 'wireframe_screens',
        is_current: true,
        lifecycle_stage: getStageForArtifactType('wireframe_screens'),
        title: 'Wireframe Screens',
        artifact_data: wireframeScreens,
      });

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // STAGE 16: Financial Projections (Decision Gate, SD_REQUIRED)
  // =========================================================================
  test.describe('Stage 16: Financial Projections', () => {
    test('S16-001: should advance to Stage 16', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 16 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    test('S16-002: should create api_contract artifact', async () => {
      const apiContract = {
        openapi: '3.0.0',
        info: {
          title: 'VentureForge API',
          version: '1.0.0',
          description: 'API for venture lifecycle management'
        },
        paths: {
          '/api/v1/ventures': {
            get: {
              summary: 'List all ventures',
              responses: { '200': { description: 'List of ventures' } }
            },
            post: {
              summary: 'Create a new venture',
              requestBody: {
                content: {
                  'application/json': {
                    schema: { '$ref': '#/components/schemas/CreateVenture' }
                  }
                }
              },
              responses: { '201': { description: 'Venture created' } }
            }
          },
          '/api/v1/ventures/{id}': {
            get: {
              summary: 'Get venture by ID',
              parameters: [{ name: 'id', in: 'path', required: true }],
              responses: { '200': { description: 'Venture details' } }
            }
          }
        },
        components: {
          schemas: {
            CreateVenture: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 255 },
                description: { type: 'string' }
              }
            }
          }
        }
      };

      // Enriches the row seeded in S14-004 (update, not insert -- a second
      // insert would collide on the partial unique index).
      const { error } = await supabase
        .from('venture_artifacts')
        .update({
          title: 'API Contract',
          artifact_data: apiContract,
        })
        .eq('venture_id', testVentureId)
        .eq('artifact_type', 'blueprint_api_contract')
        .eq('is_current', true);

      expect(error).toBeNull();
    });

    test('S16-003: should create schema_spec with checklist compliance', async () => {
      // Schema checklist from lifecycle_stage_config:
      // - All entities named
      // - All relationships explicit
      // - All fields typed
      // - All constraints stated
      // - API contracts generated
      // - TypeScript interfaces generated

      const schemaSpec = {
        sql_schema: `
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_id UUID REFERENCES users(id),
  current_stage INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
`,
        typescript_interfaces: `
export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: Date;
}

export interface Venture {
  id: string;
  name: string;
  owner_id: string;
  current_stage: number;
  created_at: Date;
}
`,
        checklist: {
          all_entities_named: true,
          all_relationships_explicit: true,
          all_fields_typed: true,
          all_constraints_stated: true,
          api_contracts_generated: true,
          typescript_interfaces_generated: true
        },
        decision_gate_status: 'approved'
      };

      // Enriches the row seeded in S14-004 (update, not insert -- a second
      // insert would collide on the partial unique index).
      const { error } = await supabase
        .from('venture_artifacts')
        .update({
          title: 'Schema Specification',
          artifact_data: schemaSpec,
        })
        .eq('venture_id', testVentureId)
        .eq('artifact_type', 'blueprint_schema_spec')
        .eq('is_current', true);

      expect(error).toBeNull();

      // Validate all checklist items
      const checklist = schemaSpec.checklist;
      expect(checklist.all_entities_named).toBe(true);
      expect(checklist.all_relationships_explicit).toBe(true);
      expect(checklist.all_fields_typed).toBe(true);
      expect(checklist.all_constraints_stated).toBe(true);
      expect(checklist.api_contracts_generated).toBe(true);
      expect(checklist.typescript_interfaces_generated).toBe(true);
    });

    test('S16-004: should create financial_projection artifact', async () => {
      // venture_stages.required_artifacts[16] = [blueprint_financial_projection] (verified
      // live) -- api_contract/schema_spec canonically belong to Stage 14 (see S14-004),
      // not Stage 16. This artifact was never created anywhere in this file.
      const financialProjection = {
        revenue_projections: { year1: 500000, year2: 1500000, year3: 4000000 },
        unit_economics: { gross_margin: 0.72, cac_ltv_ratio: 3.98 },
        breakeven_analysis: { breakeven_months: 14 },
        decision_gate_status: 'approved'
      };

      const { error } = await supabase.from('venture_artifacts').insert({
        venture_id: testVentureId,
        artifact_type: 'blueprint_financial_projection',
        is_current: true,
        lifecycle_stage: getStageForArtifactType('blueprint_financial_projection'),
        title: 'Financial Projections',
        artifact_data: financialProjection,
      });

      expect(error).toBeNull();
    });

    test('S16-005: should complete Phase 4 (Kochel Firewall)', async () => {
      const { data: artifacts } = await supabase
        .from('venture_artifacts')
        .select('artifact_type')
        .eq('venture_id', testVentureId)
        .in('artifact_type', [
          'blueprint_product_roadmap',
          'blueprint_technical_architecture',
          'blueprint_data_model',
          'blueprint_erd_diagram',
          'blueprint_api_contract',
          'blueprint_schema_spec',
          'wireframe_screens',
          'blueprint_user_story_pack',
          'blueprint_financial_projection'
        ]);

      expect(artifacts?.length).toBe(9);

      // Ready for Phase 5 (Stage 17)
      const { error } = await supabase
        .from('ventures')
        .update({ current_lifecycle_stage: 17 })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });
  });
});
