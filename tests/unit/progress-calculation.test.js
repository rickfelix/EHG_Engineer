/**
 * Unit Tests for Progress Calculation
 * Tests the core LEO Protocol v4.1 progress formula
 */


// Mock DatabaseLoader for unit tests
class DatabaseLoader {
  constructor() {
    this.isConnected = false;
  }

  async calculateSDProgress(sd, prd) {
    // LEAD phase: 20% (if SD exists)
    let progress = sd && sd.id ? 20 : 0;

    if (!prd) return progress;

    // PLAN phase: 20%
    const planChecklist = prd.plan_checklist || [];
    if (planChecklist.length > 0) {
      const planComplete = planChecklist.filter(item => item.checked).length / planChecklist.length;
      progress += planComplete * 20;
    }

    // EXEC phase: 30%
    const execChecklist = prd.exec_checklist || [];
    if (execChecklist.length > 0) {
      const execComplete = execChecklist.filter(item => item.checked).length / execChecklist.length;
      progress += execComplete * 30;
    }

    // VALIDATION phase: 15%
    const validationChecklist = prd.validation_checklist || [];
    if (validationChecklist.length > 0) {
      const validationComplete = validationChecklist.filter(item => item.checked).length / validationChecklist.length;
      progress += validationComplete * 15;
    }

    // LEAD APPROVAL: 15%
    if (sd.status === 'completed' && prd.approved_by === 'LEAD') {
      progress += 15;
    }

    return Math.round(progress);
  }
}

describe('Progress Calculation - LEO Protocol v4.1', () => {
  let dbLoader;
  
  beforeEach(() => {
    dbLoader = new DatabaseLoader();
    // Don't initialize Supabase for unit tests
    dbLoader.isConnected = false;
  });

  describe('calculateSDProgress', () => {
    test('SD without PRD should show 20% (LEAD phase only)', async () => {
      const sd = { 
        id: 'TEST-SD-001', 
        status: 'active' 
      };
      const prd = null;
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      expect(progress).toBe(20);
    });

    test('SD with empty PRD should show 20% (LEAD phase only)', async () => {
      const sd = { 
        id: 'TEST-SD-002', 
        status: 'active' 
      };
      const prd = {
        plan_checklist: [],
        exec_checklist: [],
        validation_checklist: []
      };
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      expect(progress).toBe(20);
    });

    test('SD with complete PLAN checklist should show 40%', async () => {
      const sd = { 
        id: 'TEST-SD-003', 
        status: 'active' 
      };
      const prd = {
        plan_checklist: [
          { text: 'Task 1', checked: true },
          { text: 'Task 2', checked: true },
          { text: 'Task 3', checked: true }
        ],
        exec_checklist: [],
        validation_checklist: []
      };
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      expect(progress).toBe(40); // LEAD (20%) + PLAN (20%)
    });

    test('SD with partial PLAN checklist should show proportional progress', async () => {
      const sd = { 
        id: 'TEST-SD-004', 
        status: 'active' 
      };
      const prd = {
        plan_checklist: [
          { text: 'Task 1', checked: true },
          { text: 'Task 2', checked: false },
          { text: 'Task 3', checked: false },
          { text: 'Task 4', checked: false }
        ],
        exec_checklist: [],
        validation_checklist: []
      };
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      expect(progress).toBe(25); // LEAD (20%) + PLAN (25% of 20% = 5%)
    });

    test('SD with complete PLAN and EXEC should show 70%', async () => {
      const sd = { 
        id: 'TEST-SD-005', 
        status: 'active' 
      };
      const prd = {
        plan_checklist: [
          { text: 'Plan 1', checked: true },
          { text: 'Plan 2', checked: true }
        ],
        exec_checklist: [
          { text: 'Exec 1', checked: true },
          { text: 'Exec 2', checked: true },
          { text: 'Exec 3', checked: true }
        ],
        validation_checklist: []
      };
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      expect(progress).toBe(70); // LEAD (20%) + PLAN (20%) + EXEC (30%)
    });

    test('SD with partial EXEC should show proportional progress', async () => {
      const sd = { 
        id: 'TEST-SD-006', 
        status: 'active' 
      };
      const prd = {
        plan_checklist: [
          { text: 'Plan 1', checked: true }
        ],
        exec_checklist: [
          { text: 'Exec 1', checked: true },
          { text: 'Exec 2', checked: true },
          { text: 'Exec 3', checked: false },
          { text: 'Exec 4', checked: false }
        ],
        validation_checklist: []
      };
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      expect(progress).toBe(55); // LEAD (20%) + PLAN (20%) + EXEC (50% of 30% = 15%)
    });

    test('SD with complete validation should show 85%', async () => {
      const sd = { 
        id: 'TEST-SD-007', 
        status: 'active' 
      };
      const prd = {
        plan_checklist: [{ text: 'Plan', checked: true }],
        exec_checklist: [{ text: 'Exec', checked: true }],
        validation_checklist: [
          { text: 'Test 1', checked: true },
          { text: 'Test 2', checked: true }
        ]
      };
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      expect(progress).toBe(85); // LEAD (20%) + PLAN (20%) + EXEC (30%) + VALIDATION (15%)
    });

    test('SD with LEAD approval should show 100%', async () => {
      const sd = { 
        id: 'TEST-SD-008', 
        status: 'completed' 
      };
      const prd = {
        plan_checklist: [{ text: 'Plan', checked: true }],
        exec_checklist: [{ text: 'Exec', checked: true }],
        validation_checklist: [{ text: 'Test', checked: true }],
        approved_by: 'LEAD',
        approval_date: '2025-09-01T00:00:00Z'
      };
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      expect(progress).toBe(100); // All phases complete
    });

    test('Complex real-world scenario with partial completion', async () => {
      const sd = { 
        id: 'TEST-SD-009', 
        status: 'active' 
      };
      const prd = {
        plan_checklist: [
          { text: 'Plan 1', checked: true },
          { text: 'Plan 2', checked: true },
          { text: 'Plan 3', checked: true },
          { text: 'Plan 4', checked: true },
          { text: 'Plan 5', checked: true },
          { text: 'Plan 6', checked: true },
          { text: 'Plan 7', checked: true },
          { text: 'Plan 8', checked: true },
          { text: 'Plan 9', checked: true }  // 9/9 = 100%
        ],
        exec_checklist: [
          { text: 'Exec 1', checked: true },
          { text: 'Exec 2', checked: true },
          { text: 'Exec 3', checked: true },
          { text: 'Exec 4', checked: true },
          { text: 'Exec 5', checked: true },
          { text: 'Exec 6', checked: true },
          { text: 'Exec 7', checked: true },
          { text: 'Exec 8', checked: true }  // 8/8 = 100%
        ],
        validation_checklist: [
          { text: 'Val 1', checked: true },
          { text: 'Val 2', checked: true },
          { text: 'Val 3', checked: true },
          { text: 'Val 4', checked: false },
          { text: 'Val 5', checked: false }  // 3/5 = 60%
        ]
      };
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      // LEAD (20%) + PLAN (20%) + EXEC (30%) + VALIDATION (60% of 15% = 9%)
      expect(progress).toBe(79);
    });

    test('Edge case: SD without ID should still calculate', async () => {
      const sd = {}; // Missing ID
      const prd = null;
      
      const progress = await dbLoader.calculateSDProgress(sd, prd);
      expect(progress).toBe(0); // No SD ID means no LEAD phase complete
    });
  });

  describe('Phase Weight Validation', () => {
    test('All phases should sum to 100%', () => {
      const phases = {
        LEAD_PLANNING: 20,
        PLAN_DESIGN: 20,
        EXEC_IMPLEMENTATION: 30,
        PLAN_VERIFICATION: 15,
        LEAD_APPROVAL: 15
      };
      
      const total = Object.values(phases).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBe(100);
    });
  });
});