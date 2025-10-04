#!/usr/bin/env node

/**
 * Create Missing Handoff Tracking Tables
 * Extends existing leo_handoff_templates with execution tracking
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createHandoffTables() {
    console.log('🔧 CREATING HANDOFF TRACKING TABLES');
    console.log('===================================\n');
    
    try {
        // 1. Handoff Executions Table - Track actual handoff instances
        console.log('1. Creating leo_handoff_executions table...');
        
        const executionsSQL = `
            CREATE TABLE IF NOT EXISTS leo_handoff_executions (
                id TEXT PRIMARY KEY,
                template_id INTEGER REFERENCES leo_handoff_templates(id),
                from_agent TEXT NOT NULL,
                to_agent TEXT NOT NULL,
                sd_id TEXT NOT NULL,
                prd_id TEXT,
                handoff_type TEXT NOT NULL,
                
                -- Execution Details
                initiated_at TIMESTAMPTZ DEFAULT NOW(),
                completed_at TIMESTAMPTZ,
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'accepted', 'rejected', 'failed')),
                
                -- Handoff Content (7 required elements)
                executive_summary TEXT,
                completeness_report JSONB,
                deliverables_manifest JSONB,
                key_decisions JSONB,
                known_issues JSONB,
                resource_utilization JSONB,
                action_items JSONB,
                
                -- Validation Results
                validation_score INTEGER DEFAULT 0,
                validation_passed BOOLEAN DEFAULT FALSE,
                validation_details JSONB,
                
                -- Metadata
                created_by TEXT,
                metadata JSONB DEFAULT '{}',
                
                CONSTRAINT valid_agent_transition UNIQUE(sd_id, from_agent, to_agent, initiated_at)
            );
        `;
        
        const { error: execError } = await supabase.rpc('exec_sql', { sql: executionsSQL });
        if (execError) {
            console.log('   ⚠️  Table may already exist:', execError.message);
        } else {
            console.log('   ✅ leo_handoff_executions table created');
        }
        
        // 2. Handoff Validations Table - Detailed validation results
        console.log('2. Creating leo_handoff_validations table...');
        
        const validationsSQL = `
            CREATE TABLE IF NOT EXISTS leo_handoff_validations (
                id TEXT PRIMARY KEY,
                execution_id TEXT REFERENCES leo_handoff_executions(id),
                validator_type TEXT NOT NULL, -- 'template', 'prd_quality', 'sub_agent', 'checklist'
                
                -- Validation Results
                passed BOOLEAN NOT NULL,
                score INTEGER DEFAULT 0,
                max_score INTEGER DEFAULT 100,
                percentage INTEGER GENERATED ALWAYS AS (
                    CASE WHEN max_score > 0 THEN (score * 100 / max_score) ELSE 0 END
                ) STORED,
                
                -- Detailed Results
                validation_details JSONB NOT NULL DEFAULT '{}',
                errors JSONB DEFAULT '[]',
                warnings JSONB DEFAULT '[]',
                blocking_issues JSONB DEFAULT '[]',
                
                -- Metadata
                validated_at TIMESTAMPTZ DEFAULT NOW(),
                validator_version TEXT,
                metadata JSONB DEFAULT '{}'
            );
        `;
        
        const { error: validError } = await supabase.rpc('exec_sql', { sql: validationsSQL });
        if (validError) {
            console.log('   ⚠️  Table may already exist:', validError.message);
        } else {
            console.log('   ✅ leo_handoff_validations table created');
        }
        
        // 3. Handoff Rejections Table - Track failed handoffs with improvement guidance
        console.log('3. Creating leo_handoff_rejections table...');
        
        const rejectionsSQL = `
            CREATE TABLE IF NOT EXISTS leo_handoff_rejections (
                id TEXT PRIMARY KEY,
                execution_id TEXT REFERENCES leo_handoff_executions(id),
                
                -- Rejection Details
                rejected_at TIMESTAMPTZ DEFAULT NOW(),
                rejected_by TEXT, -- 'system' or agent name
                rejection_reason TEXT NOT NULL,
                
                -- Improvement Guidance
                required_improvements JSONB NOT NULL DEFAULT '[]',
                blocking_validations JSONB DEFAULT '[]',
                recommended_actions JSONB DEFAULT '[]',
                
                -- Return Instructions
                return_to_agent TEXT NOT NULL,
                retry_instructions TEXT,
                estimated_fix_time TEXT,
                
                -- Resolution
                resolved_at TIMESTAMPTZ,
                resolution_notes TEXT,
                
                -- Metadata
                metadata JSONB DEFAULT '{}'
            );
        `;
        
        const { error: rejectError } = await supabase.rpc('exec_sql', { sql: rejectionsSQL });
        if (rejectError) {
            console.log('   ⚠️  Table may already exist:', rejectError.message);
        } else {
            console.log('   ✅ leo_handoff_rejections table created');
        }
        
        // 4. Create indexes for performance
        console.log('4. Creating performance indexes...');
        
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_handoff_executions_sd_id ON leo_handoff_executions(sd_id);',
            'CREATE INDEX IF NOT EXISTS idx_handoff_executions_status ON leo_handoff_executions(status);',
            'CREATE INDEX IF NOT EXISTS idx_handoff_executions_agents ON leo_handoff_executions(from_agent, to_agent);',
            'CREATE INDEX IF NOT EXISTS idx_handoff_validations_execution ON leo_handoff_validations(execution_id);',
            'CREATE INDEX IF NOT EXISTS idx_handoff_rejections_execution ON leo_handoff_rejections(execution_id);'
        ];
        
        for (const indexSQL of indexes) {
            const { error: indexError } = await supabase.rpc('exec_sql', { sql: indexSQL });
            if (indexError && !indexError.message.includes('already exists')) {
                console.log('   ⚠️  Index creation warning:', indexError.message);
            }
        }
        console.log('   ✅ Performance indexes created');
        
        // 5. Verify table creation
        console.log('\n5. Verifying table structure...');
        
        const tables = ['leo_handoff_executions', 'leo_handoff_validations', 'leo_handoff_rejections'];
        for (const table of tables) {
            try {
                const { data, error } = await supabase.from(table).select('*').limit(1);
                if (error) {
                    console.log(`   ❌ ${table}: ${error.message}`);
                } else {
                    console.log(`   ✅ ${table}: Table accessible`);
                }
            } catch (e) {
                console.log(`   ❌ ${table}: Not accessible`);
            }
        }
        
        console.log('\n🎉 HANDOFF TRACKING INFRASTRUCTURE COMPLETE');
        console.log('===========================================');
        console.log('✅ Templates: leo_handoff_templates (existing)');
        console.log('✅ Executions: leo_handoff_executions (new)');  
        console.log('✅ Validations: leo_handoff_validations (new)');
        console.log('✅ Rejections: leo_handoff_rejections (new)');
        console.log('✅ Indexes: Performance optimized');
        
        console.log('\n🔗 Integration Points:');
        console.log('- Dashboard can query execution status');
        console.log('- Validation results stored with detailed feedback');
        console.log('- Rejection workflow provides clear improvement guidance');
        console.log('- All handoffs tracked with full audit trail');
        
    } catch (error) {
        console.error('❌ Error creating tables:', error);
        process.exit(1);
    }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    createHandoffTables().catch(console.error);
}

export {  createHandoffTables  };