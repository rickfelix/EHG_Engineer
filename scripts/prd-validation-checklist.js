#!/usr/bin/env node

/**
 * PRD Validation and Completion Checklist
 * Ensures PRDs meet LEO Protocol professional standards
 * Based on lessons learned from SDIP PRD process gap
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class PRDValidator {
    constructor() {
        this.criticalFields = [
            'title',
            'executive_summary', 
            'business_context',
            'technical_context',
            'functional_requirements',
            'non_functional_requirements',
            'technical_requirements',
            'acceptance_criteria',
            'performance_requirements',
            'risks'
        ];
        
        this.qualityThresholds = {
            excellent: 95,
            good: 80,
            acceptable: 65,
            needsWork: 50
        };
    }
    
    async validatePRD(prdId) {
        console.log(`🔍 VALIDATING PRD: ${prdId}`);
        console.log('=====================================\n');
        
        const { data: prd, error } = await supabase
            .from('product_requirements_v2')
            .select('*')
            .eq('id', prdId)
            .single();
            
        if (error || !prd) {
            console.log('❌ PRD not found:', error?.message || 'No data');
            return { passed: false, score: 0 };
        }
        
        const results = {
            prd,
            checks: {},
            score: 0,
            maxScore: 0,
            passed: false,
            level: 'needs-work'
        };
        
        // Critical Field Validation
        console.log('📋 CRITICAL FIELD VALIDATION:');
        console.log('------------------------------');
        
        this.criticalFields.forEach(field => {
            const value = prd[field];
            const isPresent = this.validateField(field, value);
            results.checks[field] = isPresent;
            results.maxScore += 10;
            
            if (isPresent.passed) {
                results.score += isPresent.score;
                console.log(`✅ ${field}: ${isPresent.message}`);
            } else {
                console.log(`❌ ${field}: ${isPresent.message}`);
            }
        });
        
        // Content Quality Assessment
        console.log('\n📊 CONTENT QUALITY ASSESSMENT:');
        console.log('--------------------------------');
        
        const qualityChecks = this.assessContentQuality(prd);
        Object.entries(qualityChecks).forEach(([check, result]) => {
            results.checks[`quality_${check}`] = result;
            results.maxScore += 5;
            if (result.passed) {
                results.score += result.score;
                console.log(`✅ ${result.message}`);
            } else {
                console.log(`⚠️  ${result.message}`);
            }
        });
        
        // Sub-agent Activation Check
        console.log('\n🤖 SUB-AGENT ACTIVATION CHECK:');
        console.log('--------------------------------');
        
        const subAgentChecks = this.checkSubAgentActivation(prd);
        Object.entries(subAgentChecks).forEach(([agent, result]) => {
            results.checks[`subagent_${agent}`] = result;
            console.log(`${result.required ? '🔴' : '🟡'} ${agent}: ${result.message}`);
        });
        
        // Calculate Final Score
        const percentage = Math.round((results.score / results.maxScore) * 100);
        results.percentage = percentage;
        results.passed = percentage >= this.qualityThresholds.acceptable;
        
        if (percentage >= this.qualityThresholds.excellent) {
            results.level = 'excellent';
        } else if (percentage >= this.qualityThresholds.good) {
            results.level = 'good';
        } else if (percentage >= this.qualityThresholds.acceptable) {
            results.level = 'acceptable';
        }
        
        // Final Report
        console.log('\n🎯 VALIDATION SUMMARY:');
        console.log('=======================');
        console.log(`Score: ${results.score}/${results.maxScore} (${percentage}%)`);
        console.log(`Level: ${results.level.toUpperCase()}`);
        console.log(`Status: ${results.passed ? '✅ PASSED' : '❌ NEEDS IMPROVEMENT'}`);
        
        if (results.level === 'excellent') {
            console.log('\n🎉 OUTSTANDING PRD! Ready for production implementation.');
        } else if (results.level === 'good') {
            console.log('\n✅ SOLID PRD. Minor improvements could enhance quality.');
        } else if (results.level === 'acceptable') {
            console.log('\n⚠️  PRD meets minimum standards but could be improved.');
        } else {
            console.log('\n❌ PRD requires significant improvement before implementation.');
        }
        
        return results;
    }
    
    validateField(fieldName, value) {
        if (!value) {
            return { passed: false, score: 0, message: 'Missing or empty' };
        }
        
        switch (fieldName) {
            case 'executive_summary':
                return value.length > 100 
                    ? { passed: true, score: 10, message: `Present (${value.length} chars)` }
                    : { passed: false, score: 3, message: 'Too brief (needs 100+ chars)' };
                    
            case 'functional_requirements':
                const count = Array.isArray(value) ? value.length : (value ? 1 : 0);
                return count >= 5
                    ? { passed: true, score: 10, message: `${count} requirements defined` }
                    : { passed: false, score: count * 2, message: `Only ${count} requirements (need 5+)` };
                    
            case 'technical_requirements':
                return typeof value === 'object' && value.components
                    ? { passed: true, score: 10, message: 'Comprehensive technical specs' }
                    : { passed: false, score: 2, message: 'Lacks detailed technical specifications' };
                    
            case 'acceptance_criteria':
                const criteriaCount = Array.isArray(value) ? value.length : 0;
                return criteriaCount >= 5
                    ? { passed: true, score: 10, message: `${criteriaCount} criteria defined` }
                    : { passed: false, score: criteriaCount * 2, message: `Only ${criteriaCount} criteria (need 5+)` };
                    
            default:
                return { passed: true, score: 8, message: 'Present' };
        }
    }
    
    assessContentQuality(prd) {
        return {
            strategic_alignment: prd.directive_id 
                ? { passed: true, score: 5, message: 'Linked to Strategic Directive' }
                : { passed: false, score: 0, message: 'No Strategic Directive link' },
                
            risk_assessment: (prd.risks?.length || 0) >= 3
                ? { passed: true, score: 5, message: `${prd.risks.length} risks identified` }
                : { passed: false, score: 2, message: 'Insufficient risk analysis (need 3+)' },
                
            performance_defined: prd.performance_requirements
                ? { passed: true, score: 5, message: 'Performance requirements specified' }
                : { passed: false, score: 0, message: 'No performance requirements' },
                
            timeline_realistic: prd.metadata?.estimated_effort
                ? { passed: true, score: 5, message: 'Effort estimation provided' }
                : { passed: false, score: 1, message: 'No effort estimation' }
        };
    }
    
    checkSubAgentActivation(prd) {
        const checks = {};
        
        // Database Sub-agent (required if schema changes)
        checks.database = {
            required: prd.technical_requirements?.database_schema || false,
            message: prd.technical_requirements?.database_schema 
                ? 'Database changes detected - Database Sub-agent should be activated'
                : 'No database changes - Database Sub-agent not required'
        };
        
        // Design Sub-agent (required if 2+ UI components)
        const uiCount = prd.technical_requirements?.components?.filter(c => 
            c.name.includes('UI') || c.name.includes('Interface') || c.name.includes('Dashboard')
        ).length || 0;
        checks.design = {
            required: uiCount >= 2,
            message: uiCount >= 2
                ? `${uiCount} UI components - Design Sub-agent should be activated`
                : `${uiCount} UI components - Design Sub-agent optional`
        };
        
        // Security Sub-agent (required if security mentioned)
        const securityMentioned = JSON.stringify(prd).toLowerCase().includes('security');
        checks.security = {
            required: securityMentioned,
            message: securityMentioned
                ? 'Security requirements detected - Security Sub-agent should be activated'
                : 'No explicit security requirements - Security Sub-agent optional'
        };
        
        // Testing Sub-agent (required if coverage >80% or E2E)
        const testingRequired = prd.non_functional_requirements?.some(req => 
            req.agent === 'Testing' || req.tasks?.some(task => task.includes('E2E'))
        );
        checks.testing = {
            required: testingRequired,
            message: testingRequired
                ? 'Comprehensive testing required - Testing Sub-agent should be activated'
                : 'Standard testing - Testing Sub-agent optional'
        };
        
        return checks;
    }
}

// CLI Interface
async function main() {
    const prdId = process.argv[2];
    
    if (!prdId) {
        console.log('Usage: node prd-validation-checklist.js <PRD_ID>');
        console.log('Example: node prd-validation-checklist.js PRD-1756934172732');
        process.exit(1);
    }
    
    const validator = new PRDValidator();
    const results = await validator.validatePRD(prdId);
    
    // Exit with appropriate code
    process.exit(results.passed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export {  PRDValidator  };