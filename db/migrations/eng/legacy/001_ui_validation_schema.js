/**
 * Migration: UI Validation Schema
 * Purpose: Create tables for mandatory UI testing validation
 * LEO Protocol v4.3.1 Enhancement
 */

exports.shorthands = {
  id: { type: 'uuid', primaryKey: true, default: pgm => pgm.func('gen_random_uuid()') },
  created_at: { 
    type: 'timestamp with time zone', 
    notNull: true, 
    default: pgm => pgm.func('CURRENT_TIMESTAMP') 
  },
  updated_at: { 
    type: 'timestamp with time zone', 
    notNull: true, 
    default: pgm => pgm.func('CURRENT_TIMESTAMP') 
  }
};

exports.up = (pgm) => {
  console.log('Creating UI validation schema...');

  // 1. UI Validation Results Table
  pgm.createTable('ui_validation_results', {
    id: 'id',
    prd_id: { type: 'varchar(255)', notNull: true },
    sd_id: { type: 'varchar(255)' },
    test_run_id: { type: 'varchar(255)', notNull: true, unique: true },
    test_type: { 
      type: 'varchar(50)', 
      notNull: true,
      comment: 'playwright, visual_regression, prd_validation' 
    },
    
    // Test Results
    total_tests: { type: 'integer', default: 0 },
    passed_tests: { type: 'integer', default: 0 },
    failed_tests: { type: 'integer', default: 0 },
    warnings: { type: 'integer', default: 0 },
    success_rate: { type: 'decimal(5,2)', default: 0 },
    
    // Validation Status
    validation_status: { 
      type: 'varchar(50)', 
      notNull: true,
      comment: 'passed, failed, partial, blocked' 
    },
    ui_complete: { type: 'boolean', default: false },
    gaps_detected: { type: 'jsonb', default: '[]' },
    
    // Evidence
    screenshots: { type: 'jsonb', default: '[]' },
    test_report: { type: 'jsonb' },
    error_logs: { type: 'text' },
    
    // Metadata
    tested_by: { type: 'varchar(100)', default: 'Testing Sub-Agent' },
    test_duration_ms: { type: 'integer' },
    created_at: 'created_at',
    updated_at: 'updated_at'
  });

  // 2. PRD to UI Mappings Table
  pgm.createTable('prd_ui_mappings', {
    id: 'id',
    prd_id: { type: 'varchar(255)', notNull: true },
    requirement_id: { type: 'varchar(255)', notNull: true },
    requirement_text: { type: 'text', notNull: true },
    
    // UI Element Mapping
    ui_component: { type: 'varchar(255)' },
    ui_selector: { type: 'varchar(255)' },
    ui_testid: { type: 'varchar(255)' },
    expected_behavior: { type: 'text' },
    
    // Validation Status
    is_implemented: { type: 'boolean', default: false },
    is_validated: { type: 'boolean', default: false },
    validation_date: { type: 'timestamp with time zone' },
    validation_screenshot: { type: 'varchar(500)' },
    
    // Metadata
    priority: { type: 'varchar(20)', default: 'medium' },
    created_at: 'created_at',
    updated_at: 'updated_at'
  });

  // Add unique constraint for prd_id + requirement_id
  pgm.addConstraint('prd_ui_mappings', 'unique_prd_requirement', {
    unique: ['prd_id', 'requirement_id']
  });

  // 3. Validation Evidence Table
  pgm.createTable('validation_evidence', {
    id: 'id',
    validation_id: { 
      type: 'uuid', 
      references: 'ui_validation_results(id)',
      onDelete: 'CASCADE'
    },
    evidence_type: { 
      type: 'varchar(50)', 
      notNull: true,
      comment: 'screenshot, report, video, log' 
    },
    
    // Evidence Data
    file_path: { type: 'varchar(500)' },
    file_name: { type: 'varchar(255)' },
    file_size: { type: 'integer' },
    mime_type: { type: 'varchar(100)' },
    
    // Evidence Context
    component_name: { type: 'varchar(255)' },
    test_case: { type: 'varchar(255)' },
    viewport_size: { 
      type: 'varchar(50)',
      comment: 'mobile, tablet, desktop, 1920x1080' 
    },
    
    // Analysis Results
    elements_found: { type: 'jsonb', default: '[]' },
    elements_missing: { type: 'jsonb', default: '[]' },
    accessibility_issues: { type: 'jsonb', default: '[]' },
    performance_metrics: { type: 'jsonb' },
    
    // Metadata
    captured_at: { 
      type: 'timestamp with time zone', 
      default: pgm => pgm.func('CURRENT_TIMESTAMP') 
    },
    created_at: 'created_at'
  });

  // 4. Validation Checkpoints Table
  pgm.createTable('ui_validation_checkpoints', {
    id: 'id',
    checkpoint_name: { type: 'varchar(255)', notNull: true },
    checkpoint_type: { 
      type: 'varchar(50)', 
      notNull: true,
      comment: 'pre_completion, post_implementation, regression' 
    },
    
    // Checkpoint Configuration
    required_tests: { type: 'jsonb', default: '[]' },
    required_coverage: { type: 'decimal(5,2)', default: 80.0 },
    required_screenshots: { type: 'integer', default: 3 },
    block_on_failure: { type: 'boolean', default: true },
    
    // Status
    active: { type: 'boolean', default: true },
    created_at: 'created_at',
    updated_at: 'updated_at'
  });

  // Insert default checkpoints
  pgm.sql(`
    INSERT INTO ui_validation_checkpoints (checkpoint_name, checkpoint_type, required_tests, block_on_failure) VALUES
    ('UI Implementation Validation', 'post_implementation', '["component_render", "responsive_design", "accessibility"]', TRUE),
    ('PRD Requirement Verification', 'pre_completion', '["prd_mapping", "feature_coverage", "gap_analysis"]', TRUE),
    ('Visual Regression Check', 'regression', '["screenshot_comparison", "layout_stability"]', FALSE);
  `);

  // Create indexes for performance
  pgm.createIndex('ui_validation_results', 'prd_id');
  pgm.createIndex('ui_validation_results', 'validation_status');
  pgm.createIndex('prd_ui_mappings', 'prd_id');
  pgm.createIndex('prd_ui_mappings', 'is_implemented');
  pgm.createIndex('validation_evidence', 'validation_id');
  pgm.createIndex('validation_evidence', 'evidence_type');

  // Create validation summary view
  pgm.createView('ui_validation_summary', {}, `
    SELECT 
      v.prd_id,
      v.sd_id,
      v.validation_status,
      v.success_rate,
      v.total_tests,
      v.passed_tests,
      v.failed_tests,
      COUNT(DISTINCT e.id) as evidence_count,
      COUNT(DISTINCT CASE WHEN e.evidence_type = 'screenshot' THEN e.id END) as screenshot_count,
      COALESCE(
        (SELECT COUNT(*) FROM prd_ui_mappings WHERE prd_id = v.prd_id AND is_implemented = true),
        0
      ) as implemented_requirements,
      COALESCE(
        (SELECT COUNT(*) FROM prd_ui_mappings WHERE prd_id = v.prd_id),
        0
      ) as total_requirements,
      v.created_at as last_validation_date
    FROM ui_validation_results v
    LEFT JOIN validation_evidence e ON e.validation_id = v.id
    GROUP BY v.id, v.prd_id, v.sd_id, v.validation_status, v.success_rate, 
             v.total_tests, v.passed_tests, v.failed_tests, v.created_at
    ORDER BY v.created_at DESC
  `);

  // Add trigger to update timestamps
  pgm.createFunction(
    'update_ui_validation_timestamp',
    [],
    {
      returns: 'trigger',
      language: 'plpgsql',
      replace: true
    },
    `
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    `
  );

  pgm.createTrigger('ui_validation_results', 'update_ui_validation_results_timestamp', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_ui_validation_timestamp',
    level: 'ROW'
  });

  pgm.createTrigger('prd_ui_mappings', 'update_prd_ui_mappings_timestamp', {
    when: 'BEFORE', 
    operation: 'UPDATE',
    function: 'update_ui_validation_timestamp',
    level: 'ROW'
  });

  // Add validation enforcement function
  pgm.createFunction(
    'enforce_ui_validation',
    [
      { name: 'p_prd_id', type: 'varchar(255)' },
      { name: 'p_mark_complete', type: 'boolean', default: false }
    ],
    {
      returns: 'jsonb',
      language: 'plpgsql',
      replace: true
    },
    `
    DECLARE
      v_validation_result JSONB;
      v_has_validation BOOLEAN;
      v_validation_passed BOOLEAN;
      v_gaps_found INTEGER;
    BEGIN
      -- Check if validation exists
      SELECT EXISTS(
        SELECT 1 FROM ui_validation_results 
        WHERE prd_id = p_prd_id 
        AND created_at > (CURRENT_TIMESTAMP - INTERVAL '24 hours')
      ) INTO v_has_validation;
      
      -- Check if validation passed
      SELECT validation_status = 'passed', 
             COALESCE(jsonb_array_length(gaps_detected), 0)
      INTO v_validation_passed, v_gaps_found
      FROM ui_validation_results 
      WHERE prd_id = p_prd_id
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- Build result
      v_validation_result := jsonb_build_object(
        'prd_id', p_prd_id,
        'has_validation', v_has_validation,
        'validation_passed', COALESCE(v_validation_passed, FALSE),
        'gaps_found', COALESCE(v_gaps_found, -1),
        'can_complete', v_has_validation AND COALESCE(v_validation_passed, FALSE),
        'message', CASE
          WHEN NOT v_has_validation THEN 'No UI validation found - Testing Sub-Agent must validate first'
          WHEN v_gaps_found > 0 THEN format('Cannot complete - %s UI gaps detected', v_gaps_found)
          WHEN NOT v_validation_passed THEN 'UI validation failed - fix issues and retest'
          ELSE 'UI validation passed - can proceed to completion'
        END
      );
      
      -- If attempting to mark complete, enforce validation
      IF p_mark_complete AND NOT (v_has_validation AND COALESCE(v_validation_passed, FALSE)) THEN
        RAISE EXCEPTION 'Cannot mark UI task complete without passed validation. %', 
          v_validation_result->>'message';
      END IF;
      
      RETURN v_validation_result;
    END;
    `
  );

  // Add validation rules to leo_validation_rules if table exists
  pgm.sql(`
    DO $$ 
    BEGIN
      IF EXISTS (SELECT FROM information_schema.tables 
                 WHERE table_schema = 'public' 
                 AND table_name = 'leo_validation_rules') THEN
        
        INSERT INTO leo_validation_rules (rule_code, rule_name, description, enforcement_level, active) VALUES
        ('UI_REQUIRES_TESTING', 'UI Implementation Requires Testing Validation', 'All UI implementations must be validated by Testing Sub-Agent before completion', 'mandatory', true),
        ('SCREENSHOT_EVIDENCE', 'Screenshot Evidence Mandatory', 'UI tasks require screenshot evidence from automated testing', 'mandatory', true),
        ('DESIGN_NEEDS_VERIFICATION', 'Design Output Requires Testing Verification', 'Design Sub-Agent outputs must be verified by Testing Sub-Agent', 'mandatory', true),
        ('PRD_UI_GAP_CHECK', 'PRD to UI Gap Analysis Required', 'Testing must validate all PRD UI requirements are implemented', 'mandatory', true),
        ('VISUAL_REGRESSION', 'Visual Regression Testing for UI Changes', 'UI changes require visual regression testing against baseline', 'recommended', true)
        ON CONFLICT (rule_code) DO UPDATE SET
          active = true,
          enforcement_level = EXCLUDED.enforcement_level,
          updated_at = CURRENT_TIMESTAMP;
      END IF;
    END $$;
  `);

  console.log('UI validation schema created successfully');
};

exports.down = (pgm) => {
  console.log('Dropping UI validation schema...');
  
  // Drop in reverse order due to dependencies
  pgm.dropView('ui_validation_summary');
  pgm.dropFunction('enforce_ui_validation', [
    { name: 'p_prd_id', type: 'varchar(255)' },
    { name: 'p_mark_complete', type: 'boolean' }
  ]);
  pgm.dropFunction('update_ui_validation_timestamp', []);
  pgm.dropTable('validation_evidence');
  pgm.dropTable('ui_validation_checkpoints');
  pgm.dropTable('prd_ui_mappings');
  pgm.dropTable('ui_validation_results');
  
  console.log('UI validation schema dropped');
};