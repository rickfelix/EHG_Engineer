import { describe, it, expect } from 'vitest';
import { extractADRs } from '../../../lib/eva/adr-extractor.js';

const MOCK_STAGE14_OUTPUT = {
  architecture_summary: 'Modern web app with React frontend, Node.js API, PostgreSQL database',
  layers: {
    presentation: { technology: 'React 18', components: ['Dashboard', 'Settings'], rationale: 'Widely adopted, rich ecosystem' },
    api: { technology: 'Express.js REST', components: ['Auth API', 'Data API'], rationale: 'Simple, well-documented' },
    business_logic: { technology: 'Node.js', components: ['AuthService', 'DataService'], rationale: 'JavaScript full-stack consistency' },
    data: { technology: 'PostgreSQL 15', components: ['users', 'ventures'], rationale: 'Strong JSONB support, relational integrity' },
    infrastructure: { technology: 'Vercel + Supabase', components: ['CDN', 'Edge Functions'], rationale: 'Low-ops, managed services' },
  },
  security: {
    authStrategy: 'JWT with refresh tokens',
    dataClassification: 'internal',
    complianceRequirements: ['GDPR'],
  },
  dataEntities: [
    { name: 'User', description: 'Platform user', relationships: ['Venture'], estimatedVolume: '~1000/month' },
    { name: 'Venture', description: 'Business venture', relationships: ['User', 'Stage'], estimatedVolume: '~500/month' },
    { name: 'Stage', description: 'Evaluation stage', relationships: ['Venture'], estimatedVolume: '~5000/month' },
  ],
  integration_points: [
    { name: 'Frontend-API', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' },
  ],
  constraints: [
    { name: 'Response time', description: 'API < 200ms p95', category: 'performance' },
  ],
};

describe('extractADRs', () => {
  it('extracts ADR for each non-TBD layer', () => {
    const adrs = extractADRs(MOCK_STAGE14_OUTPUT);
    // 5 layers → 5 ADRs (data→data_model, api→api_design, rest→technical_choice)
    const layerAdrs = adrs.filter(a =>
      ['technical_choice', 'data_model', 'api_design'].includes(a.decision_type) &&
      a.title.includes('layer:')
    );
    expect(layerAdrs.length).toBe(5);
  });

  it('classifies data layer as data_model and api as api_design', () => {
    const adrs = extractADRs(MOCK_STAGE14_OUTPUT);
    const dataLayer = adrs.find(a => a.title.includes('data layer'));
    const apiLayer = adrs.find(a => a.title.includes('api layer'));
    expect(dataLayer.decision_type).toBe('data_model');
    expect(apiLayer.decision_type).toBe('api_design');
  });

  it('extracts security ADR', () => {
    const adrs = extractADRs(MOCK_STAGE14_OUTPUT);
    const secAdrs = adrs.filter(a => a.decision_type === 'security_architecture');
    expect(secAdrs.length).toBe(1);
    expect(secAdrs[0].decision).toContain('JWT with refresh tokens');
  });

  it('extracts data model entity ADR', () => {
    const adrs = extractADRs(MOCK_STAGE14_OUTPUT);
    const entityAdrs = adrs.filter(a => a.title.includes('entities'));
    expect(entityAdrs.length).toBe(1);
    expect(entityAdrs[0].decision).toContain('3 core data entities');
  });

  it('produces >=3 ADRs total (success criteria)', () => {
    const adrs = extractADRs(MOCK_STAGE14_OUTPUT);
    expect(adrs.length).toBeGreaterThanOrEqual(3);
  });

  it('generates sequential adr_numbers', () => {
    const adrs = extractADRs(MOCK_STAGE14_OUTPUT);
    const numbers = adrs.map(a => a.adr_number);
    expect(numbers[0]).toBe('ADR-001');
    expect(numbers[1]).toBe('ADR-002');
  });

  it('sets status to accepted for all ADRs', () => {
    const adrs = extractADRs(MOCK_STAGE14_OUTPUT);
    expect(adrs.every(a => a.status === 'accepted')).toBe(true);
  });

  it('skips TBD layers', () => {
    const output = {
      ...MOCK_STAGE14_OUTPUT,
      layers: {
        ...MOCK_STAGE14_OUTPUT.layers,
        presentation: { technology: 'TBD', components: ['TBD'], rationale: 'TBD' },
      },
    };
    const adrs = extractADRs(output);
    const layerAdrs = adrs.filter(a => a.title.includes('layer:'));
    expect(layerAdrs.length).toBe(4); // 5 - 1 TBD
  });

  it('handles empty/null input gracefully', () => {
    expect(extractADRs({})).toEqual([]);
    expect(extractADRs({ layers: null })).toEqual([]);
  });

  it('includes context from layer rationale', () => {
    const adrs = extractADRs(MOCK_STAGE14_OUTPUT);
    const reactAdr = adrs.find(a => a.title.includes('React'));
    expect(reactAdr.context).toBe('Widely adopted, rich ecosystem');
  });
});
