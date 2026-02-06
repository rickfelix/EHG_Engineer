/**
 * Integration Tests for Database Operations
 * Tests Supabase database interactions
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { vi } from 'vitest';

dotenv.config();

// Mock DatabaseLoader - replace with actual import when available
class DatabaseLoader {
  constructor() {
    this.isConnected = !!(process.env.NEXT_PUBLIC_SUPABASE_URL &&
                          process.env.NEXT_PUBLIC_SUPABASE_URL !== 'your_supabase_url_here');
  }

  async loadStrategicDirectives() {
    if (!this.isConnected) return [];
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data } = await supabase.from('strategic_directives_v2').select('*');
    return data || [];
  }

  async loadPRDs() {
    if (!this.isConnected) return [];
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data } = await supabase.from('product_requirements_v2').select('*');
    return (data || []).map(prd => ({
      ...prd,
      checklist: [
        ...(prd.plan_checklist || []),
        ...(prd.exec_checklist || []),
        ...(prd.validation_checklist || [])
      ]
    }));
  }

  async loadExecutionSequences() {
    if (!this.isConnected) return [];
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    const { data } = await supabase.from('execution_sequences').select('*');
    return data || [];
  }

  async updateChecklistItem(docType, docId, checklistType, index, checked) {
    if (!this.isConnected) return false;
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const table = docType === 'PRD' ? 'product_requirements_v2' : 'strategic_directives_v2';

    // Get current checklist
    const { data: doc } = await supabase.from(table).select(checklistType).eq('id', docId).single();
    if (!doc) return false;

    const checklist = doc[checklistType] || [];
    if (index >= checklist.length) return false;

    checklist[index].checked = checked;

    // Update
    const { error } = await supabase.from(table).update({ [checklistType]: checklist }).eq('id', docId);
    return !error;
  }
}

describe('Database Operations Integration', () => {
  let dbLoader;
  let supabase;
  const testSDId = 'TEST-SD-' + Date.now();
  const testPRDId = 'PRD-' + testSDId;
  
  beforeAll(() => {
    // Only run if we have database credentials
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || 
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'your_supabase_url_here') {
      console.warn('Skipping database tests - no Supabase credentials');
      return;
    }
    
    dbLoader = new DatabaseLoader();
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  });

  afterAll(async () => {
    // Cleanup test data
    if (supabase) {
      await supabase.from('product_requirements_v2').delete().eq('id', testPRDId);
      await supabase.from('strategic_directives_v2').delete().eq('id', testSDId);
    }
  });

  describe('Database Connection', () => {
    test('should connect to Supabase successfully', () => {
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || 
          process.env.NEXT_PUBLIC_SUPABASE_URL === 'your_supabase_url_here') {
        expect(dbLoader.isConnected).toBe(false);
        return;
      }
      expect(dbLoader.isConnected).toBe(true);
    });
  });

  describe('Strategic Directives Operations', () => {
    test('should load Strategic Directives from database', async () => {
      if (!dbLoader.isConnected) {
        console.warn('Skipping - database not connected');
        return;
      }
      
      const sds = await dbLoader.loadStrategicDirectives();
      expect(Array.isArray(sds)).toBe(true);
      
      if (sds.length > 0) {
        const sd = sds[0];
        expect(sd).toHaveProperty('id');
        expect(sd).toHaveProperty('title');
        expect(sd).toHaveProperty('status');
        expect(sd).toHaveProperty('progress');
        expect(typeof sd.progress).toBe('number');
      }
    });

    test('should create and retrieve a test SD', async () => {
      if (!dbLoader.isConnected) {
        console.warn('Skipping - database not connected');
        return;
      }
      
      // Create test SD
      const { data: newSD, error: createError } = await supabase
        .from('strategic_directives_v2')
        .insert({
          id: testSDId,
          title: 'Test Strategic Directive',
          status: 'active',
          category: 'test',
          priority: 'high',
          description: 'Test SD for automated testing',
          rationale: 'Testing database operations',
          scope: 'Unit test scope',
          created_by: 'TEST'
        })
        .select()
        .single();
      
      expect(createError).toBeNull();
      expect(newSD).toBeDefined();
      expect(newSD.id).toBe(testSDId);
      
      // Load and verify
      const sds = await dbLoader.loadStrategicDirectives();
      const foundSD = sds.find(sd => sd.id === testSDId);
      expect(foundSD).toBeDefined();
      expect(foundSD.title).toBe('Test Strategic Directive');
    });
  });

  describe('PRD Operations', () => {
    test('should load PRDs from database', async () => {
      if (!dbLoader.isConnected) {
        console.warn('Skipping - database not connected');
        return;
      }
      
      const prds = await dbLoader.loadPRDs();
      expect(Array.isArray(prds)).toBe(true);
      
      if (prds.length > 0) {
        const prd = prds[0];
        expect(prd).toHaveProperty('id');
        expect(prd).toHaveProperty('directiveId');
        expect(prd).toHaveProperty('checklist');
        expect(Array.isArray(prd.checklist)).toBe(true);
      }
    });

    test('should create and retrieve a test PRD', async () => {
      if (!dbLoader.isConnected) {
        console.warn('Skipping - database not connected');
        return;
      }
      
      // Create test PRD
      const { data: newPRD, error: createError } = await supabase
        .from('product_requirements_v2')
        .insert({
          id: testPRDId,
          directive_id: testSDId,
          title: 'Test PRD',
          status: 'planning',
          category: 'test',
          priority: 'high',
          executive_summary: 'Test PRD for automated testing',
          plan_checklist: [
            { text: 'Test item 1', checked: true },
            { text: 'Test item 2', checked: false }
          ],
          exec_checklist: [
            { text: 'Exec item 1', checked: false }
          ],
          validation_checklist: [
            { text: 'Val item 1', checked: false }
          ],
          created_by: 'TEST'
        })
        .select()
        .single();
      
      expect(createError).toBeNull();
      expect(newPRD).toBeDefined();
      expect(newPRD.id).toBe(testPRDId);
      
      // Load and verify
      const prds = await dbLoader.loadPRDs();
      const foundPRD = prds.find(prd => prd.id === testPRDId);
      expect(foundPRD).toBeDefined();
      expect(foundPRD.title).toBe('Test PRD');
      expect(foundPRD.checklist.length).toBe(4); // 2 plan + 1 exec + 1 validation
    });
  });

  describe('Checklist Persistence', () => {
    test('should update checklist item in PRD', async () => {
      if (!dbLoader.isConnected) {
        console.warn('Skipping - database not connected');
        return;
      }
      
      // Update checklist item
      const success = await dbLoader.updateChecklistItem(
        'PRD',
        testPRDId,
        'plan_checklist',
        1, // Second item (index 1)
        true // Set to checked
      );
      
      expect(success).toBe(true);
      
      // Verify update
      const { data: updatedPRD } = await supabase
        .from('product_requirements_v2')
        .select('plan_checklist')
        .eq('id', testPRDId)
        .single();
      
      expect(updatedPRD.plan_checklist[1].checked).toBe(true);
    });

    test('should handle invalid document ID gracefully', async () => {
      if (!dbLoader.isConnected) {
        console.warn('Skipping - database not connected');
        return;
      }
      
      const success = await dbLoader.updateChecklistItem(
        'PRD',
        'INVALID-ID',
        'plan_checklist',
        0,
        true
      );
      
      expect(success).toBe(false);
    });
  });

  describe('Progress Calculation with Database', () => {
    test('should calculate progress for SD with associated PRD', async () => {
      if (!dbLoader.isConnected) {
        console.warn('Skipping - database not connected');
        return;
      }
      
      // Load our test SD
      const sds = await dbLoader.loadStrategicDirectives();
      const testSD = sds.find(sd => sd.id === testSDId);
      
      if (testSD) {
        // Progress should reflect PRD checklists
        // LEAD (20%) + PLAN (50% of 20% = 10%) + EXEC (0%) + VAL (0%) = 30%
        expect(testSD.progress).toBeGreaterThanOrEqual(20);
        expect(testSD.progress).toBeLessThanOrEqual(40);
      }
    });
  });

  describe('Execution Sequences', () => {
    test('should load execution sequences', async () => {
      if (!dbLoader.isConnected) {
        console.warn('Skipping - database not connected');
        return;
      }
      
      const ees = await dbLoader.loadExecutionSequences();
      expect(Array.isArray(ees)).toBe(true);
      
      if (ees.length > 0) {
        const sequence = ees[0];
        expect(sequence).toHaveProperty('id');
        expect(sequence).toHaveProperty('directive_id');
        expect(sequence).toHaveProperty('sequence_number');
      }
    });
  });
});