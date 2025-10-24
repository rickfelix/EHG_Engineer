/**
 * Data Generation Hooks for DirectiveLab
 * Handles automatic generation of classification, impact analysis, synthesis, questions, and final summary
 */

import { useEffect } from 'react';
import {
  STRATEGIC_KEYWORDS,
  TACTICAL_KEYWORDS,
  COMPONENT_KEYWORDS,
  HIGH_RISK_KEYWORDS,
  MEDIUM_RISK_KEYWORDS,
  LOW_RISK_KEYWORDS,
  EFFORT_FACTORS
} from '../types';

/**
 * Step 3: Classification Generator
 */
export const useClassificationGenerator = (activeStep, submission, formData, setSubmission) => {
  useEffect(() => {
    if (activeStep === 3 && submission?.id && !submission?.strat_tac) {
      console.log('🎯 [STEP 3] Generating classification data...');

      const intentText = formData.intentSummary || submission?.intent_summary || '';

      let strategicScore = 0;
      let tacticalScore = 0;

      const lowerIntent = intentText.toLowerCase();
      STRATEGIC_KEYWORDS.forEach(keyword => {
        if (lowerIntent.includes(keyword)) strategicScore += 10;
      });
      TACTICAL_KEYWORDS.forEach(keyword => {
        if (lowerIntent.includes(keyword)) tacticalScore += 10;
      });

      // Default to 50/50 if no keywords found
      if (strategicScore === 0 && tacticalScore === 0) {
        strategicScore = 50;
        tacticalScore = 50;
      }

      const total = strategicScore + tacticalScore;
      const strategicPct = Math.round((strategicScore / total) * 100);
      const tacticalPct = 100 - strategicPct;

      const rationale = strategicPct > 60
        ? 'This initiative focuses on strategic goals that will shape long-term direction and capabilities.'
        : tacticalPct > 60
        ? 'This initiative addresses immediate operational needs and improvements.'
        : 'This initiative balances both strategic vision and tactical execution needs.';

      const classificationData = {
        strat_tac: {
          strategic_pct: strategicPct,
          tactical_pct: tacticalPct,
          rationale: rationale,
          generated_at: new Date().toISOString()
        }
      };

      setSubmission(prev => ({
        ...prev,
        ...classificationData
      }));

      console.log('✅ [STEP 3] Classification data generated locally');
    }
  }, [activeStep, submission, formData.intentSummary, setSubmission]);
};

/**
 * Step 4: Impact Analysis Generator
 */
export const useImpactAnalysisGenerator = (activeStep, submission, formData, setImpactAnalysis, setConsistencyValidation, setSubmission) => {
  useEffect(() => {
    if (activeStep === 4 && submission?.id && !submission?.impact_analysis) {
      console.log('🎯 [STEP 4] Generating impact analysis data...');

      const intentText = formData.intentSummary || submission?.intent_summary || '';
      const lowerIntent = intentText.toLowerCase();

      // Analyze affected components
      const affectedComponents = [];
      Object.entries(COMPONENT_KEYWORDS).forEach(([category, components]) => {
        if (lowerIntent.includes(category) ||
            lowerIntent.includes(category.replace(/[aeiou]/gi, '')) ||
            components.some(comp => lowerIntent.includes(comp.name.toLowerCase()))) {
          affectedComponents.push(...components);
        }
      });

      // Default components if none detected
      if (affectedComponents.length === 0) {
        affectedComponents.push(
          { name: 'UI Components', risk_level: 'low', confidence: 0.5, dependencies: ['React Components'] },
          { name: 'State Management', risk_level: 'medium', confidence: 0.6, dependencies: ['React Hooks'] },
          { name: 'Event Handlers', risk_level: 'low', confidence: 0.7, dependencies: ['DOM Events'] }
        );
      }

      // Determine risk level
      let riskLevel = 'Low';
      let riskRationale = 'This change appears to be primarily cosmetic or minor functionality enhancement.';

      if (HIGH_RISK_KEYWORDS.some(keyword => lowerIntent.includes(keyword))) {
        riskLevel = 'High';
        riskRationale = 'This change affects critical system components that could impact security, data integrity, or core functionality.';
      } else if (MEDIUM_RISK_KEYWORDS.some(keyword => lowerIntent.includes(keyword))) {
        riskLevel = 'Medium';
        riskRationale = 'This change affects system integrations or business logic that requires careful testing and validation.';
      }

      // Generate consistency validation points
      const validationPoints = [
        {
          category: 'Design System',
          status: 'compliant',
          details: 'Change adheres to existing design tokens and component patterns'
        },
        {
          category: 'Accessibility',
          status: riskLevel === 'High' ? 'review_required' : 'compliant',
          details: riskLevel === 'High' ? 'WCAG compliance review needed for this change' : 'No accessibility concerns identified'
        },
        {
          category: 'Performance',
          status: lowerIntent.includes('performance') ? 'improvement' : 'neutral',
          details: lowerIntent.includes('performance') ? 'Change should improve application performance' : 'No significant performance impact expected'
        },
        {
          category: 'Security',
          status: HIGH_RISK_KEYWORDS.some(k => lowerIntent.includes(k)) ? 'review_required' : 'compliant',
          details: HIGH_RISK_KEYWORDS.some(k => lowerIntent.includes(k)) ? 'Security review required before implementation' : 'No security concerns identified'
        }
      ];

      // Estimate effort and timeline
      let effortScore = 1; // base effort
      Object.entries(EFFORT_FACTORS).forEach(([keyword, factor]) => {
        if (lowerIntent.includes(keyword)) {
          effortScore += factor;
        }
      });

      const timeline = effortScore <= 2 ? '1-2 days' :
                     effortScore <= 4 ? '3-5 days' :
                     effortScore <= 6 ? '1-2 weeks' : '2-4 weeks';

      // Calculate impact score
      const impactScore = Math.min(100, Math.round(
        (affectedComponents.length * 10) +
        (effortScore * 5) +
        (riskLevel === 'High' ? 30 : riskLevel === 'Medium' ? 15 : 5)
      ));

      const effortMultiplier = Math.round(effortScore * 10) / 10;

      // Create impact analysis object
      const impactAnalysisData = {
        affected_components: affectedComponents.slice(0, 8),
        risk_level: riskLevel.toLowerCase(),
        risk_rationale: riskRationale,
        impact_score: impactScore,
        effort_multiplier: effortMultiplier,
        estimated_effort: Math.ceil(effortScore),
        estimated_timeline: timeline,
        consistency_validation: validationPoints,
        recommendations: [
          {
            type: 'Testing',
            description: `Ensure comprehensive testing for ${affectedComponents.length} affected components`,
            effort_reduction: '15-20%'
          },
          {
            type: 'Documentation',
            description: 'Update component documentation and integration guides',
            effort_reduction: '10-15%'
          }
        ],
        mitigation_strategies: [
          'Implement feature flags to control rollout',
          'Create comprehensive test suite before deployment',
          'Monitor performance metrics during implementation',
          'Prepare rollback strategy for critical issues'
        ],
        generated_at: new Date().toISOString()
      };

      // Add breaking changes if high risk
      if (riskLevel === 'High') {
        impactAnalysisData.breaking_changes = [
          {
            type: 'API Change',
            description: 'Potential modifications to component interfaces',
            keyword: lowerIntent.match(/(auth|api|database)/)?.[0] || 'system'
          }
        ];
      }

      // Create category scores
      const categoryScores = {};
      validationPoints.forEach(vp => {
        const score = vp.status === 'compliant' ? 85 :
                     vp.status === 'improvement' ? 95 :
                     vp.status === 'review_required' ? 25 :
                     vp.status === 'warning' ? 60 : 75;
        categoryScores[vp.category.toLowerCase().replace(' ', '_')] = score;
      });

      // Create consistency validation summary
      const consistencyValidationData = {
        passed: !validationPoints.some(vp => vp.status === 'review_required'),
        blocking_issues: validationPoints.filter(vp => vp.status === 'review_required').map(vp => ({
          message: `${vp.category}: ${vp.details}`,
          suggestion: vp.status === 'review_required' ? 'Consider professional review before implementation' : null
        })),
        warnings: validationPoints.filter(vp => vp.status === 'warning'),
        score: Math.round((validationPoints.filter(vp => vp.status === 'compliant' || vp.status === 'improvement').length / validationPoints.length) * 100),
        category_scores: categoryScores,
        recommendations: validationPoints
          .filter(vp => vp.status === 'improvement' || vp.status === 'compliant')
          .map(vp => ({
            message: vp.details,
            priority: vp.status === 'improvement' ? 'medium' : 'low'
          }))
      };

      setImpactAnalysis(impactAnalysisData);
      setConsistencyValidation(consistencyValidationData);

      setSubmission(prev => ({
        ...prev,
        impact_analysis: impactAnalysisData,
        consistency_validation: consistencyValidationData
      }));

      console.log('✅ [STEP 4] Impact analysis data generated locally');
    }
  }, [activeStep, submission, formData.intentSummary, setImpactAnalysis, setConsistencyValidation, setSubmission]);
};

/**
 * Step 5: Synthesis Generator
 */
export const useSynthesisGenerator = (activeStep, submission, formData, setSubmission) => {
  useEffect(() => {
    if (activeStep === 5 && submission?.id && !submission?.synthesis) {
      console.log('🎯 [STEP 5] Generating synthesis data...');

      const intentText = submission?.intent_summary || formData.intentSummary || '';
      const classification = submission?.strat_tac || {};
      const impact = submission?.impact_analysis || {};

      const aligned = [];
      const required = [];
      const recommended = [];

      // Analyze for aligned requirements
      if (intentText.toLowerCase().includes('dark mode') || intentText.toLowerCase().includes('theme')) {
        aligned.push('UI theming system already supports dark/light mode switching');
        aligned.push('CSS variables are in place for theme customization');
      }
      if (intentText.toLowerCase().includes('dashboard') || intentText.toLowerCase().includes('ui')) {
        aligned.push('Component architecture supports modular UI updates');
        aligned.push('Existing design system can be extended');
      }

      // Analyze for required changes
      if (classification.strategic_pct > 50) {
        required.push('Architecture review and approval from technical lead');
        required.push('Comprehensive testing strategy for new features');
        required.push('Documentation updates for significant changes');
      }
      if (impact?.risk_level === 'high' || impact?.risk_level === 'critical') {
        required.push('Risk mitigation plan implementation');
        required.push('Rollback strategy preparation');
      }
      if (intentText.toLowerCase().includes('performance')) {
        required.push('Performance benchmarking before and after implementation');
      }
      if (intentText.toLowerCase().includes('security') || intentText.toLowerCase().includes('auth')) {
        required.push('Security audit and penetration testing');
      }

      // Generate recommendations
      if (classification.tactical_pct > 60) {
        recommended.push('Incremental deployment with feature flags');
        recommended.push('A/B testing for user-facing changes');
      }
      if (impact?.affected_components?.length > 5) {
        recommended.push('Phased implementation to minimize disruption');
        recommended.push('Component isolation testing');
      }
      recommended.push('User acceptance testing with stakeholder group');
      recommended.push('Performance monitoring post-deployment');

      // Default items if none were generated
      if (aligned.length === 0) {
        aligned.push('Existing infrastructure supports proposed changes');
        aligned.push('Current tooling and frameworks are compatible');
      }
      if (required.length === 0) {
        required.push('Standard code review process');
        required.push('Unit and integration test coverage');
      }
      if (recommended.length === 0) {
        recommended.push('Progressive rollout strategy');
        recommended.push('User feedback collection mechanism');
      }

      const synthesisData = {
        synthesis: {
          aligned,
          required,
          recommended,
          generated_at: new Date().toISOString()
        }
      };

      setSubmission(prev => ({ ...prev, ...synthesisData }));
      console.log('✅ [STEP 5] Synthesis generated');
    }
  }, [activeStep, submission, formData.intentSummary, setSubmission]);
};

/**
 * Step 6: Questions Generator
 */
export const useQuestionsGenerator = (activeStep, submission, formData, setSubmission) => {
  useEffect(() => {
    if (activeStep === 6 && submission?.id && submission?.questions === undefined) {
      console.log('🎯 [STEP 6] Generating clarifying questions...');

      const intentText = submission?.intent_summary || formData.intentSummary || '';
      const classification = submission?.strat_tac || {};
      const synthesis = submission?.synthesis || {};

      const questions = [];

      // Generate questions based on intent and context
      if (intentText.toLowerCase().includes('ui') || intentText.toLowerCase().includes('interface')) {
        questions.push({
          text: 'What specific UI components or pages should be affected by these changes?',
          context: 'Help us scope the implementation correctly'
        });
        questions.push({
          text: 'Do you have any specific design preferences or brand guidelines to follow?',
          context: 'Ensures visual consistency with your requirements'
        });
      }

      if (classification.strategic_pct > 60) {
        questions.push({
          text: 'What is the expected timeline for this strategic initiative?',
          context: 'Helps with resource allocation and planning'
        });
        questions.push({
          text: 'Are there any dependencies or prerequisites we should be aware of?',
          context: 'Identifies potential blockers early'
        });
      }

      if (synthesis.required?.some(r => r.includes('performance'))) {
        questions.push({
          text: 'What are your specific performance targets or requirements?',
          context: 'Define measurable success criteria'
        });
      }

      if (intentText.toLowerCase().includes('data') || intentText.toLowerCase().includes('database')) {
        questions.push({
          text: 'What data retention and backup policies should be considered?',
          context: 'Ensures compliance with data governance'
        });
      }

      // Add a general question if we have few specific ones
      if (questions.length < 2) {
        questions.push({
          text: 'Are there any specific edge cases or scenarios we should consider?',
          context: 'Helps identify potential issues early'
        });
      }

      const questionsData = {
        questions: questions.length > 0 ? questions : [],
        questions_generated_at: new Date().toISOString()
      };

      setSubmission(prev => ({ ...prev, ...questionsData }));
      console.log('✅ [STEP 6] Questions generated');
    }
  }, [activeStep, submission, formData.intentSummary, setSubmission]);
};

/**
 * Step 7: Final Summary Generator
 */
export const useFinalSummaryGenerator = (activeStep, submission, formData, setSubmission) => {
  useEffect(() => {
    if (activeStep === 7 && submission?.id && !submission?.final_summary) {
      console.log('🎯 [STEP 7] Generating final summary...');

      const intentText = submission?.intent_summary || formData.intentSummary || '';
      const classification = submission?.strat_tac || {};
      const impact = submission?.impact_analysis || {};
      const synthesis = submission?.synthesis || {};

      // Build comprehensive final summary
      let summary = `This directive focuses on: ${intentText}. `;

      // Add classification context
      if (classification.strategic_pct > 60) {
        summary += `This is primarily a strategic initiative (${classification.strategic_pct}% strategic) that will shape long-term architecture. `;
      } else {
        summary += `This is primarily a tactical improvement (${classification.tactical_pct}% tactical) focusing on immediate enhancements. `;
      }

      // Add impact summary
      if (impact.affected_components?.length > 0) {
        summary += `The implementation will affect ${impact.affected_components.length} components with ${impact.risk_level || 'moderate'} risk level. `;
      }

      // Add synthesis highlights
      if (synthesis.required?.length > 0) {
        summary += `Key requirements include: ${synthesis.required[0]}. `;
      }
      if (synthesis.recommended?.length > 0) {
        summary += `Recommended approach: ${synthesis.recommended[0]}. `;
      }

      // Add effort estimate
      if (impact.effort_estimate) {
        summary += `Estimated effort: ${impact.effort_estimate}. `;
      }

      summary += 'Upon approval, this directive will be converted into a formal PRD and assigned to the implementation team.';

      const summaryData = {
        final_summary: summary,
        final_summary_generated_at: new Date().toISOString()
      };

      setSubmission(prev => ({ ...prev, ...summaryData }));
      console.log('✅ [STEP 7] Final summary generated');
    }
  }, [activeStep, submission, formData.intentSummary, setSubmission]);
};
