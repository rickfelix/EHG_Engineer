/**
 * Enhanced DirectiveLab Component - UI/UX Improvements
 * Implements unified design system with consistent components
 * Improved mobile experience and accessibility
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  ChevronDown, 
  ChevronRight, 
  Check, 
  Lock, 
  AlertCircle,
  AlertTriangle,
  Camera,
  MessageSquare,
  Target,
  Layers,
  FileText,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Plus,
  Copy,
  RefreshCw,
  Edit2,
  Save,
  HelpCircle,
  Clock,
  XCircle,
  Info,
  Send,
  Square,
  CheckSquare,
  X
} from 'lucide-react';

// Import new UI components
import Button from './ui/Button';
import Input from './ui/Input';
import ProgressBar from './ui/ProgressBar';
import RecentSubmissions from './RecentSubmissions';
import GroupCreationModal from './GroupCreationModal';
import ImpactAnalysisPanel from './ImpactAnalysisPanel';
import { PolicyBadgeSet, generatePolicyBadges } from './ui/PolicyBadge';
import { ToastProvider, useToast } from './ui/Toast';
import DarkModeToggle from './DarkModeToggle';

// Import design tokens
import './ui/design-tokens.css';

const DirectiveLab = () => {
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const initialMode = urlParams.get('mode') === 'quick' ? 'quick' : 'comprehensive';
  
  const [mode, setMode] = useState(initialMode);
  const [activeStep, setActiveStep] = useState(1);
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedSubmissions, setSelectedSubmissions] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [combineMethod, setCombineMethod] = useState('intelligent');
  const [refreshSubmissions, setRefreshSubmissions] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [showHelp, setShowHelp] = useState(false);
  const [recentSubmissionsCollapsed, setRecentSubmissionsCollapsed] = useState(true);
  // Impact analysis data
  const [impactAnalysis, setImpactAnalysis] = useState(null);
  const [consistencyValidation, setConsistencyValidation] = useState(null);
  const [questionAnswers, setQuestionAnswers] = useState({});
  const [synthesisReviewed, setSynthesisReviewed] = useState(false);
  const [summaryConfirmed, setSummaryConfirmed] = useState(false);
  const [editHistory, setEditHistory] = useState([]);
  const [criticalModeEnabled, setCriticalModeEnabled] = useState(false);
  const [criticalAnalysis, setCriticalAnalysis] = useState({});
  const toast = useToast();
  
  // Form data with validation states
  const [formData, setFormData] = useState({
    chairmanInput: '',
    screenshotUrl: '',
    intentSummary: '',
    stratTacOverride: null,
    synthesisReviewed: false,
    questionAnswers: {},
    finalConfirmed: false,
    summaryConfirmed: false
  });

  // Validation errors for each field
  const [fieldErrors, setFieldErrors] = useState({});
  const [fieldSuccess, setFieldSuccess] = useState({});

  // Validation gate states
  const [gateStatus, setGateStatus] = useState({
    1: false,
    2: false,
    3: false,
    4: false,
    5: false,
    6: false,
    7: false
  });

  // Define steps based on mode
  const getSteps = () => {
    if (mode === 'quick') {
      return [
        { id: 1, title: 'Input', icon: MessageSquare, description: 'Enter your directive idea', timeEstimate: 2 },
        { id: 3, title: 'Classification', icon: Target, description: 'Strategic or Tactical', timeEstimate: 1 },
        { id: 7, title: 'Confirmation', icon: CheckCircle, description: 'Review and submit', timeEstimate: 1 }
      ];
    }
    return [
      { id: 1, title: 'Input & Screenshot', icon: Camera, description: 'Provide feedback and optional screenshot', timeEstimate: 3 },
      { id: 2, title: 'Intent Confirmation', icon: Target, description: 'Review and confirm the extracted intent', timeEstimate: 2 },
      { id: 3, title: 'Classification', icon: Layers, description: 'Review strategic vs tactical breakdown', timeEstimate: 2 },
      { id: 4, title: 'Impact Analysis', icon: AlertTriangle, description: 'Review application impact and consistency validation', timeEstimate: 4 },
      { id: 5, title: 'Synthesis Review', icon: FileText, description: 'Review aligned, required, and recommended items', timeEstimate: 5 },
      { id: 6, title: 'Questions', icon: MessageSquare, description: 'Answer questions to refine the directive', timeEstimate: 3 },
      { id: 7, title: 'Confirmation', icon: CheckCircle, description: 'Review and confirm the final summary', timeEstimate: 2 }
    ];
  };

  // Edit invalidation warning function
  const checkEditInvalidation = (targetStep) => {
    const currentStep = activeStep;
    
    // If going back to edit a step that has downstream dependencies
    if (targetStep < currentStep && submission) {
      const invalidatedSteps = [];
      const dependencyMap = {
        1: [2, 3, 4, 5, 6, 7], // Input affects all downstream
        2: [3, 4, 5, 6, 7],    // Intent affects classification and beyond  
        3: [4, 5, 6, 7],       // Classification affects impact and beyond
        4: [5, 6, 7],          // Impact affects synthesis and beyond
        5: [6, 7],             // Synthesis affects questions and beyond
        6: [7]                 // Questions affect final summary
      };

      const affectedSteps = dependencyMap[targetStep] || [];
      const stepsWithData = affectedSteps.filter(step => {
        switch(step) {
          case 2: return submission.intent_summary;
          case 3: return submission.strat_tac;
          case 4: return submission.impact_analysis; 
          case 5: return submission.synthesis;
          case 6: return submission.questions;
          case 7: return submission.final_summary;
          default: return false;
        }
      });

      if (stepsWithData.length > 0) {
        const stepNames = {
          2: 'Intent Summary',
          3: 'Classification', 
          4: 'Impact Analysis',
          5: 'Synthesis',
          6: 'Clarifying Questions', 
          7: 'Final Summary'
        };
        
        const affectedStepNames = stepsWithData.map(s => stepNames[s]).join(', ');
        
        toast.warning(
          `Editing Step ${targetStep} may invalidate: ${affectedStepNames}`, 
          8000 // Show longer for important warnings
        );
        
        // Track edit for potential invalidation
        setEditHistory(prev => [...prev, {
          editedStep: targetStep,
          timestamp: new Date().toISOString(),
          affectedSteps: stepsWithData
        }]);
      }
    }
  };

  // Helper function to get next step in quick mode
  const getNextStep = (currentStep) => {
    if (mode === 'quick') {
      // In quick mode: 1 -> 3 -> 7
      if (currentStep === 1) return 3;
      if (currentStep === 3) return 7;
      return currentStep;
    }
    // In comprehensive mode: normal progression
    return currentStep < 7 ? currentStep + 1 : currentStep;
  };

  // Helper function to get previous step in quick mode
  const getPreviousStep = (currentStep) => {
    if (mode === 'quick') {
      // In quick mode: 7 -> 3 -> 1
      if (currentStep === 7) return 3;
      if (currentStep === 3) return 1;
      return currentStep;
    }
    // In comprehensive mode: normal regression
    return currentStep > 1 ? currentStep - 1 : currentStep;
  };

  // Wrapper function for setActiveStep with edit invalidation check
  const navigateToStep = (targetStep) => {
    checkEditInvalidation(targetStep);
    setActiveStep(targetStep);
  };

  // Use dynamic steps based on mode
  const steps = getSteps();

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [submission]);

  // Auto-save draft functionality
  useEffect(() => {
    const saveTimer = setTimeout(() => {
      if (formData.chairmanInput || formData.intentSummary) {
        localStorage.setItem('directiveLab_draft', JSON.stringify(formData));
        setSuccess('Draft saved');
        setTimeout(() => setSuccess(null), 3000);
      }
    }, 2000);

    return () => clearTimeout(saveTimer);
  }, [formData]);

  // Load draft on mount
  useEffect(() => {
    const draft = localStorage.getItem('directiveLab_draft');
    if (draft) {
      setFormData(JSON.parse(draft));
      setSuccess('Draft restored');
      setTimeout(() => setSuccess(null), 3000);
    }
  }, []);

  // Generate classification data when entering Step 3
  useEffect(() => {
    if (activeStep === 3 && submission?.id && !submission?.strat_tac) {
      console.log('🎯 [STEP 3] Generating classification data...');
      
      // Generate classification based on intent
      const intentText = formData.intentSummary || submission?.intent_summary || '';
      
      // Simple heuristic for strategic vs tactical classification
      const strategicKeywords = ['vision', 'strategy', 'long-term', 'transform', 'innovation', 'competitive advantage', 'market position', 'growth', 'expansion', 'culture'];
      const tacticalKeywords = ['fix', 'bug', 'update', 'modify', 'adjust', 'correct', 'improve', 'enhance', 'optimize', 'refactor'];
      
      let strategicScore = 0;
      let tacticalScore = 0;
      
      const lowerIntent = intentText.toLowerCase();
      strategicKeywords.forEach(keyword => {
        if (lowerIntent.includes(keyword)) strategicScore += 10;
      });
      tacticalKeywords.forEach(keyword => {
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
      
      // Update submission with classification data
      const classificationData = {
        strat_tac: {
          strategic_pct: strategicPct,
          tactical_pct: tacticalPct,
          rationale: rationale,
          generated_at: new Date().toISOString()
        }
      };
      
      // Update local state immediately
      setSubmission(prev => ({
        ...prev,
        ...classificationData
      }));
      
      console.log('✅ [STEP 3] Classification data generated locally');
    }
  }, [activeStep, submission, formData.intentSummary]);

  // Generate impact analysis data when entering Step 4
  useEffect(() => {
    if (activeStep === 4 && submission?.id && !submission?.impact_analysis) {
      console.log('🎯 [STEP 4] Generating impact analysis data...');
      
      // Get intent text for analysis
      const intentText = formData.intentSummary || submission?.intent_summary || '';
      const lowerIntent = intentText.toLowerCase();
      
      // Analyze component dependencies based on common UI patterns
      const componentKeywords = {
        'dashboard': [
          { name: 'Dashboard', risk_level: 'medium', confidence: 0.8, dependencies: ['MetricsCard', 'ChartComponent'] },
          { name: 'DashboardCard', risk_level: 'low', confidence: 0.7, dependencies: ['UI Components'] },
          { name: 'MetricsCard', risk_level: 'low', confidence: 0.6, dependencies: ['Data Fetcher'] }
        ],
        'form': [
          { name: 'Form', risk_level: 'medium', confidence: 0.9, dependencies: ['Input', 'Button', 'Validation'] },
          { name: 'Input', risk_level: 'low', confidence: 0.8, dependencies: ['Event Handlers'] },
          { name: 'Button', risk_level: 'low', confidence: 0.9, dependencies: ['UI Components'] },
          { name: 'Validation', risk_level: 'medium', confidence: 0.7, dependencies: ['Form State'] }
        ],
        'navigation': [
          { name: 'Navigation', risk_level: 'medium', confidence: 0.8, dependencies: ['Router', 'Auth Context'] },
          { name: 'Sidebar', risk_level: 'low', confidence: 0.7, dependencies: ['Navigation'] },
          { name: 'Menu', risk_level: 'low', confidence: 0.6, dependencies: ['Navigation'] }
        ],
        'table': [
          { name: 'Table', risk_level: 'medium', confidence: 0.8, dependencies: ['Data Fetcher', 'Pagination'] },
          { name: 'DataGrid', risk_level: 'high', confidence: 0.9, dependencies: ['Table', 'Virtual Scroller'] }
        ],
        'modal': [
          { name: 'Modal', risk_level: 'medium', confidence: 0.8, dependencies: ['Portal', 'Focus Trap'] },
          { name: 'Dialog', risk_level: 'medium', confidence: 0.7, dependencies: ['Modal'] },
          { name: 'Overlay', risk_level: 'low', confidence: 0.6, dependencies: ['Portal'] }
        ],
        'auth': [
          { name: 'Auth', risk_level: 'high', confidence: 0.9, dependencies: ['UserContext', 'Token Manager'] },
          { name: 'Login', risk_level: 'high', confidence: 0.8, dependencies: ['Auth', 'Form'] },
          { name: 'UserContext', risk_level: 'high', confidence: 0.9, dependencies: ['State Management'] }
        ],
        'theme': [
          { name: 'ThemeProvider', risk_level: 'medium', confidence: 0.8, dependencies: ['CSS Variables', 'Context API'] },
          { name: 'Dark Mode', risk_level: 'medium', confidence: 0.7, dependencies: ['ThemeProvider'] }
        ],
        'api': [
          { name: 'API Client', risk_level: 'high', confidence: 0.9, dependencies: ['HTTP Service', 'Error Handler'] },
          { name: 'Data Fetcher', risk_level: 'medium', confidence: 0.8, dependencies: ['API Client'] },
          { name: 'WebSocket', risk_level: 'high', confidence: 0.7, dependencies: ['Connection Manager'] }
        ]
      };
      
      const affectedComponents = [];
      Object.entries(componentKeywords).forEach(([category, components]) => {
        if (lowerIntent.includes(category) || 
            lowerIntent.includes(category.replace(/[aeiou]/gi, '')) || // shortened versions
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
      
      // Determine risk level based on keywords
      const highRiskKeywords = ['database', 'auth', 'security', 'payment', 'migration', 'breaking', 'major'];
      const mediumRiskKeywords = ['api', 'integration', 'workflow', 'validation', 'performance'];
      const lowRiskKeywords = ['ui', 'style', 'text', 'color', 'layout', 'visual'];
      
      let riskLevel = 'Low';
      let riskRationale = 'This change appears to be primarily cosmetic or minor functionality enhancement.';
      
      if (highRiskKeywords.some(keyword => lowerIntent.includes(keyword))) {
        riskLevel = 'High';
        riskRationale = 'This change affects critical system components that could impact security, data integrity, or core functionality.';
      } else if (mediumRiskKeywords.some(keyword => lowerIntent.includes(keyword))) {
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
          status: highRiskKeywords.some(k => lowerIntent.includes(k)) ? 'review_required' : 'compliant',
          details: highRiskKeywords.some(k => lowerIntent.includes(k)) ? 'Security review required before implementation' : 'No security concerns identified'
        }
      ];
      
      // Estimate effort and timeline
      const effortFactors = {
        'database': 3,
        'migration': 4,
        'api': 2,
        'auth': 3,
        'integration': 2,
        'ui': 1,
        'style': 0.5,
        'text': 0.5
      };
      
      let effortScore = 1; // base effort
      Object.entries(effortFactors).forEach(([keyword, factor]) => {
        if (lowerIntent.includes(keyword)) {
          effortScore += factor;
        }
      });
      
      const timeline = effortScore <= 2 ? '1-2 days' : 
                     effortScore <= 4 ? '3-5 days' : 
                     effortScore <= 6 ? '1-2 weeks' : '2-4 weeks';
      
      // Calculate impact score based on various factors
      const impactScore = Math.min(100, Math.round(
        (affectedComponents.length * 10) + 
        (effortScore * 5) + 
        (riskLevel === 'High' ? 30 : riskLevel === 'Medium' ? 15 : 5)
      ));
      
      const effortMultiplier = Math.round(effortScore * 10) / 10;
      
      // Create impact analysis object with the expected structure
      const impactAnalysisData = {
        affected_components: affectedComponents.slice(0, 8), // limit to 8 components
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
      
      // Create category scores for consistency validation
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
      
      // Update local state immediately
      setImpactAnalysis(impactAnalysisData);
      setConsistencyValidation(consistencyValidationData);
      
      // Generate Critical Mode Analysis (more skeptical/analytical tone)
      const criticalAnalysisData = {
        skeptical_assessment: [
          `Directive "${intentText.slice(0, 50)}..." may have hidden complexities not immediately apparent`,
          'Resource estimates are often underestimated by 40-60% in similar projects',
          'User requirements frequently change after initial implementation begins',
          'Integration points with existing systems pose higher risk than anticipated'
        ],
        potential_blockers: [
          'Insufficient technical specifications may delay development',
          'Dependency on external APIs or services may introduce instability',
          'Browser compatibility issues may emerge during testing',
          'Performance impact on larger datasets may require architectural changes'
        ],
        risk_factors: {
          technical_debt: riskLevel === 'High' ? 'Significant' : 'Moderate',
          change_resistance: 'Medium',
          rollback_difficulty: timeline.includes('week') ? 'Low' : 'High',
          maintenance_overhead: `${riskLevel} ongoing maintenance burden expected`
        },
        recommendations: [
          'Consider phased implementation approach to mitigate risks',
          'Establish clear rollback procedures before deployment',
          'Plan for 25% buffer time beyond initial estimates',
          'Document all assumptions and validate with stakeholders'
        ]
      };

      // Store critical analysis (hidden from UI, used for backend processing)
      setCriticalAnalysis(criticalAnalysisData);

      // Update submission with impact analysis data
      setSubmission(prev => ({
        ...prev,
        impact_analysis: impactAnalysisData,
        consistency_validation: consistencyValidationData,
        critical_analysis: criticalAnalysisData // Store but don't display
      }));
      
      console.log('✅ [STEP 4] Impact analysis data generated locally');
      console.log('📊 [STEP 4] Risk Level:', riskLevel);
      console.log('🔍 [STEP 4] Components affected:', affectedComponents.length);
      console.log('⏱️ [STEP 4] Estimated timeline:', timeline);
    }
  }, [activeStep, submission, formData.intentSummary]);

  // Step 5 Synthesis Generation and State Restoration
  useEffect(() => {
    if (activeStep === 5 && submission?.id) {
      // Restore checkbox state if it was previously saved
      if (submission?.gate_status?.synthesis_reviewed) {
        setSynthesisReviewed(true);
      }
      
      // Generate synthesis if not already present
      if (!submission?.synthesis) {
        console.log('🎯 [STEP 5] Generating synthesis data...');
      
      const intentText = submission?.intent_summary || formData.intentSummary || '';
      const classification = submission?.strat_tac || {};
      const impact = submission?.impact_analysis || {};
      
      // Generate synthesis based on intent and previous analyses
      const aligned = [];
      const required = [];
      const recommended = [];
      
      // Analyze for aligned requirements (things that match existing patterns)
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
      if (impact?.risk_level === 'High' || impact?.risk_level === 'Critical') {
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
      
      console.log('📊 [STEP 5] Synthesis generated:', synthesisData);
      setSubmission(prev => ({ ...prev, ...synthesisData }));
      }
    }
  }, [activeStep, submission, formData.intentSummary]);

  // Step 6 Questions Generation
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
      
      console.log('❓ [STEP 6] Questions generated:', questionsData);
      setSubmission(prev => ({ ...prev, ...questionsData }));
    }
  }, [activeStep, submission, formData.intentSummary]);

  // Step 7 Final Summary Generation
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
      
      console.log('📋 [STEP 7] Final summary generated:', summaryData);
      setSubmission(prev => ({ ...prev, ...summaryData }));
    }
  }, [activeStep, submission, formData.intentSummary]);

  // Auto-resize intent summary textarea when it changes or step changes
  useEffect(() => {
    if (activeStep === 2 && formData.intentSummary) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const textarea = document.querySelector('textarea[name="intentSummary"]');
        if (textarea) {
          textarea.style.height = 'auto';
          textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
        }
      }, 100);
    }
  }, [formData.intentSummary, activeStep]);

  // Validate chairman input
  const validateChairmanInput = (value) => {
    if (!value.trim()) {
      setFieldErrors(prev => ({ ...prev, chairmanInput: 'Feedback is required' }));
      setFieldSuccess(prev => ({ ...prev, chairmanInput: false }));
      return false;
    }
    if (value.length < 20) {
      setFieldErrors(prev => ({ ...prev, chairmanInput: 'Please provide more detailed feedback (min 20 characters)' }));
      setFieldSuccess(prev => ({ ...prev, chairmanInput: false }));
      return false;
    }
    setFieldErrors(prev => ({ ...prev, chairmanInput: null }));
    setFieldSuccess(prev => ({ ...prev, chairmanInput: true }));
    return true;
  };

  // Validate URL
  const validateUrl = (value) => {
    if (!value) return true; // Optional field
    
    try {
      new URL(value);
      setFieldErrors(prev => ({ ...prev, screenshotUrl: null }));
      setFieldSuccess(prev => ({ ...prev, screenshotUrl: true }));
      return true;
    } catch {
      setFieldErrors(prev => ({ ...prev, screenshotUrl: 'Please enter a valid URL' }));
      setFieldSuccess(prev => ({ ...prev, screenshotUrl: false }));
      return false;
    }
  };

  // Submit initial feedback
  const submitFeedback = async () => {
    console.log('🚀 [STEP 1] Starting feedback submission');
    console.log('📄 [STEP 1] Form data:', { 
      feedback: formData.chairmanInput?.substring(0, 50) + '...', 
      screenshotUrl: formData.screenshotUrl 
    });
    
    if (!validateChairmanInput(formData.chairmanInput)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sdip/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: formData.chairmanInput,
          screenshot_url: formData.screenshotUrl
        })
      });

      if (!response.ok) throw new Error('Failed to submit feedback');

      const data = await response.json();
      console.log('🎉 [STEP 1] Submission created successfully');
      console.log('🆔 [STEP 1] Submission ID:', data.submission?.id || data.id);
      console.log('📄 [STEP 1] Full submission data:', data);
      
      // The response is { success: true, submission: {...} }
      const submissionData = data.submission || data;
      setSubmission(submissionData); // Store the submission with its ID
      
      // Move to step 2 to generate intent
      setGateStatus({ ...gateStatus, 1: true });
      setActiveStep(2);
      setSuccess('Feedback submitted successfully!');
      
      // Clear draft
      localStorage.removeItem('directiveLab_draft');
      
      // Now trigger step 2 data generation (intent summary) if we have an ID
      if (submissionData.id) {
        console.log('🎯 [STEP 2] Triggering intent generation for submission:', submissionData.id);
        await updateSubmissionStep(submissionData.id, 2, {
          feedback: formData.chairmanInput, // Pass feedback for OpenAI generation
          chairman_input: formData.chairmanInput
        });
      } else {
        console.error('⚠️ [STEP 1] No submission ID received!');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // New function to update submission with step data
  const updateSubmissionStep = async (submissionId, stepNumber, stepData) => {
    console.log(`🔄 [STEP ${stepNumber}] Updating submission: ${submissionId}`);
    console.log(`📦 [STEP ${stepNumber}] Step data:`, stepData);
    
    try {
      const response = await fetch(`/api/sdip/submissions/${submissionId}/step/${stepNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stepData)
      });

      if (!response.ok) throw new Error(`Failed to update step ${stepNumber}`);

      const data = await response.json();
      console.log(`✅ [STEP ${stepNumber}] Update successful`);
      console.log(`📄 [STEP ${stepNumber}] Response data:`, data);
      
      const updatedSubmission = data.submission || data;
      
      // Update local state with the updated submission
      setSubmission(updatedSubmission);
      
      // Update form data based on step
      if (stepNumber === 2 && updatedSubmission.intent_summary) {
        console.log(`💡 [STEP 2] Intent summary received:`, updatedSubmission.intent_summary.substring(0, 50) + '...');
        setFormData({ ...formData, intentSummary: updatedSubmission.intent_summary });
      }
      
      return updatedSubmission;
    } catch (err) {
      console.error(`❌ [STEP ${stepNumber}] Update failed:`, err);
      console.error(`❌ [STEP ${stepNumber}] Error details:`, err.message);
      setError(err.message);
      throw err;
    }
  };

  // Complete a step and update submission
  const completeStep = async (stepId) => {
    console.log(`🎯 [STEP ${stepId}] Completing step`);
    console.log(`📄 [STEP ${stepId}] Current submission:`, submission);
    
    setLoading(true);
    setError(null);

    try {
      // Update submission with step data if we have a submission ID
      if (submission && submission.id && stepId > 1) {
        console.log(`📦 [STEP ${stepId}] Preparing step data for submission: ${submission.id}`);
        // Gather step-specific data
        let stepData = {};
        
        switch(stepId) {
          case 2: // Intent confirmation
            stepData = {
              intent_summary: formData.intentSummary
            };
            break;
          case 3: // Classification
            stepData = {
              strategic_pct: submission.strat_tac?.strategic_pct || 50,
              tactical_pct: submission.strat_tac?.tactical_pct || 50,
              override: formData.stratTacOverride
            };
            break;
          case 4: // Impact analysis
            stepData = {
              impact_analysis: impactAnalysis,
              consistency_validation: consistencyValidation
            };
            break;
          case 5: // Synthesis review
            stepData = {
              aligned: submission.synthesis?.aligned || [],
              required: submission.synthesis?.required || [],
              recommended: submission.synthesis?.recommended || [],
              synthesis_reviewed: synthesisReviewed // Save checkbox state
            };
            break;
          case 6: // Questions
            stepData = {
              questions_answers: formData.questionAnswers
            };
            break;
          case 7: // Final confirmation
            stepData = {
              final_summary: submission.final_summary || formData.intentSummary
            };
            break;
        }
        
        console.log(`📦 [STEP ${stepId}] Step data prepared:`, stepData);
        
        // Update the submission
        await updateSubmissionStep(submission.id, stepId, stepData);
      } else {
        console.log(`⚠️ [STEP ${stepId}] No submission ID, skipping update`);
      }
      
      setGateStatus({ ...gateStatus, [stepId]: true });
      
      const nextStep = getNextStep(stepId);
      if (nextStep !== stepId) {
        setActiveStep(nextStep);
        setSuccess(`Step ${stepId} completed!`);
      } else {
        setSuccess('Directive submitted successfully!');
        // Reset form
        setTimeout(() => {
          setFormData({
            chairmanInput: '',
            screenshotUrl: '',
            intentSummary: '',
            stratTacOverride: null,
            synthesisReviewed: false,
            questionAnswers: {},
            summaryConfirmed: false
          });
          setActiveStep(1);
          setGateStatus({});
          setSubmission(null);
          setImpactAnalysis(null);
          setConsistencyValidation(null);
        }, 2000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Save submission without creating Strategic Directive
  const saveAndClose = async () => {
    console.log('💾 [STEP 7] Saving submission and closing');
    setLoading(true);
    setError(null);

    try {
      // Update submission with final summary and mark as "ready"
      if (submission && submission.id) {
        const stepData = {
          final_summary: submission.final_summary || formData.intentSummary,
          status: 'ready', // Mark as ready for future submission
          completed_steps: [1, 2, 3, 4, 5, 6, 7] // All steps completed
        };
        
        await updateSubmissionStep(submission.id, 7, stepData);
        
        // Mark completion in gate status
        setGateStatus({ ...gateStatus, 7: true });
        
        setSuccess('Submission saved successfully! You can find it in Recent Submissions.');
        
        // Reset form and return to step 1 after a delay
        setTimeout(() => {
          setFormData({
            chairmanInput: '',
            screenshotUrl: '',
            intentSummary: '',
            stratTacOverride: null,
            synthesisReviewed: false,
            questionAnswers: {},
            finalConfirmed: false,
            summaryConfirmed: false
          });
          setActiveStep(1);
          setGateStatus({});
          setSubmission(null);
          setImpactAnalysis(null);
          setConsistencyValidation(null);
          setActiveTab('submissions'); // Switch to submissions tab to show saved item
        }, 2000);
      } else {
        throw new Error('No submission to save');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit directive and create Strategic Directive
  const submitDirective = async () => {
    console.log('🚀 [STEP 7] Submitting directive to create Strategic Directive');
    setLoading(true);
    setError(null);

    try {
      // First save the current step
      if (submission && submission.id) {
        const stepData = {
          final_summary: submission.final_summary || formData.intentSummary,
          status: 'submitted', // Mark as submitted
          completed_steps: [1, 2, 3, 4, 5, 6, 7]
        };
        
        await updateSubmissionStep(submission.id, 7, stepData);
      }
      
      // Now create Strategic Directive
      const response = await fetch('/api/sdip/create-strategic-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id: submission.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create Strategic Directive');
      }

      const result = await response.json();
      
      setGateStatus({ ...gateStatus, 7: true });
      setSuccess(`Strategic Directive created successfully! ID: ${result.sd_id}`);
      
      // Reset form after successful submission
      setTimeout(() => {
        setFormData({
          chairmanInput: '',
          screenshotUrl: '',
          intentSummary: '',
          stratTacOverride: null,
          synthesisReviewed: false,
          questionAnswers: {},
          finalConfirmed: false,
          summaryConfirmed: false
        });
        setActiveStep(1);
        setGateStatus({});
        setSubmission(null);
        setImpactAnalysis(null);
        setConsistencyValidation(null);
        setActiveTab('submissions'); // Switch to submissions tab
      }, 3000);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Render step content with enhanced UI components
  const renderStepContent = (stepId) => {
    switch (stepId) {
      case 1:
        return (
          <div className="space-y-3">
            <Input
              type="textarea"
              label="Chairman Feedback"
              name="chairmanInput"
              value={formData.chairmanInput}
              onChange={(e) => {
                setFormData({ ...formData, chairmanInput: e.target.value });
                validateChairmanInput(e.target.value);
              }}
              placeholder="Enter your feedback about the EHG application..."
              required
              rows={5}
              minLength={20}
              maxLength={1000}
              showCharCount
              error={fieldErrors.chairmanInput}
              success={fieldSuccess.chairmanInput}
              helpText="Provide detailed feedback about what you'd like to improve or add"
            />
            
            <Input
              type="url"
              label="Screenshot URL"
              name="screenshotUrl"
              value={formData.screenshotUrl}
              onChange={(e) => {
                setFormData({ ...formData, screenshotUrl: e.target.value });
                validateUrl(e.target.value);
              }}
              placeholder="https://example.com/screenshot.png"
              error={fieldErrors.screenshotUrl}
              success={fieldSuccess.screenshotUrl}
              helpText="Optional: Add a screenshot URL to provide visual context"
              icon={Camera}
            />
            
            <div className="flex gap-3">
              <Button
                onClick={submitFeedback}
                disabled={loading || !formData.chairmanInput.trim()}
                loading={loading}
                variant="primary"
                icon={ArrowRight}
                iconPosition="right"
              >
                Submit & Analyze
              </Button>
              
              <Button
                onClick={() => {
                  localStorage.setItem('directiveLab_draft', JSON.stringify(formData));
                  setSuccess('Draft saved');
                }}
                variant="secondary"
                icon={Save}
              >
                Save Draft
              </Button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-3">
            <Input
              type="textarea"
              label="Extracted Intent Summary"
              name="intentSummary"
              value={formData.intentSummary}
              onChange={(e) => {
                setFormData({ ...formData, intentSummary: e.target.value });
                // Auto-resize the textarea
                if (e.target) {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
                }
              }}
              rows={3}
              style={{
                minHeight: '80px',
                maxHeight: '300px',
                resize: 'vertical',
                overflow: 'auto'
              }}
              onFocus={(e) => {
                // Adjust height on focus
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
              }}
              helpText="Review and edit if needed to accurately capture your intent"
              success={formData.intentSummary.length > 0}
            />
            
            <div className="flex gap-3">
              <Button
                onClick={() => navigateToStep(1)}
                variant="ghost"
                icon={ArrowLeft}
              >
                Back
              </Button>
              
              <Button
                onClick={() => completeStep(2)}
                disabled={loading || !formData.intentSummary}
                loading={loading}
                variant="success"
                icon={Check}
              >
                Confirm Intent
              </Button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-3">
            {submission?.strat_tac ? (
              <>
                <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-around mb-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {formData.stratTacOverride?.strategic_pct ?? submission.strat_tac.strategic_pct}%
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Strategic</div>
                    </div>
                    <div className="w-px bg-gray-300 dark:bg-gray-600" />
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {formData.stratTacOverride?.tactical_pct ?? submission.strat_tac.tactical_pct}%
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Tactical</div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-700 p-3 rounded-lg">
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1 text-sm">Classification Rationale:</p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                      {formData.stratTacOverride?.rationale || submission.strat_tac.rationale}
                    </p>
                  </div>
                </div>

                {/* Adjustment Controls */}
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <Edit2 className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mr-2" />
                    <span className="font-medium text-yellow-900 dark:text-yellow-100 text-sm">
                      Adjust Classification (Optional)
                    </span>
                  </div>
                  
                  {/* Slider */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-2">
                      <span>More Tactical</span>
                      <span>More Strategic</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={formData.stratTacOverride?.strategic_pct ?? submission.strat_tac.strategic_pct}
                      onChange={(e) => {
                        const strategicPct = parseInt(e.target.value);
                        const tacticalPct = 100 - strategicPct;
                        
                        // Generate new rationale based on adjustment
                        let rationale = '';
                        if (strategicPct > 70) {
                          rationale = 'Manually classified as highly strategic - focusing on long-term architecture and business objectives.';
                        } else if (strategicPct > 50) {
                          rationale = 'Manually classified as moderately strategic - balancing long-term goals with immediate improvements.';
                        } else if (strategicPct > 30) {
                          rationale = 'Manually classified as balanced - containing both strategic elements and tactical improvements.';
                        } else {
                          rationale = 'Manually classified as primarily tactical - focusing on immediate fixes and improvements.';
                        }
                        
                        setFormData({
                          ...formData,
                          stratTacOverride: {
                            strategic_pct: strategicPct,
                            tactical_pct: tacticalPct,
                            rationale: rationale,
                            manually_adjusted: true,
                            adjusted_at: new Date().toISOString()
                          }
                        });
                      }}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 
                        [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-blue-600 
                        [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs font-medium text-green-600 dark:text-green-400">
                        {formData.stratTacOverride?.tactical_pct ?? submission.strat_tac.tactical_pct}% Tactical
                      </span>
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        {formData.stratTacOverride?.strategic_pct ?? submission.strat_tac.strategic_pct}% Strategic
                      </span>
                    </div>
                  </div>
                  
                  {/* Reset button */}
                  {formData.stratTacOverride && (
                    <Button
                      onClick={() => {
                        setFormData({ ...formData, stratTacOverride: null });
                      }}
                      variant="ghost"
                      size="small"
                      icon={RefreshCw}
                    >
                      Reset to Auto-Classification
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 dark:text-gray-400">Analyzing strategic vs tactical breakdown...</p>
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                onClick={() => navigateToStep(2)}
                variant="ghost"
                icon={ArrowLeft}
              >
                Back
              </Button>
              
              <Button
                onClick={() => completeStep(3)}
                disabled={loading}
                loading={loading}
                variant="success"
                icon={Check}
              >
                {formData.stratTacOverride ? 'Accept Adjusted Classification' : 'Accept Classification'}
              </Button>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-3">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                Application Impact Analysis
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Review the comprehensive analysis of how your proposed changes will affect the application, 
                including component dependencies, risk assessment, and consistency validation.
              </p>
            </div>
            
            <ImpactAnalysisPanel 
              impactAnalysis={impactAnalysis}
              consistencyValidation={consistencyValidation}
              submission={submission}
            />
            
            {/* Show blocking issues if any */}
            {consistencyValidation && !consistencyValidation.passed && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-2" />
                  <span className="font-medium text-red-900 dark:text-red-100">
                    Consistency Issues Found
                  </span>
                </div>
                <p className="text-sm text-red-800 dark:text-red-200 mb-3">
                  {consistencyValidation.blocking_issues?.length || 0} blocking issues must be resolved before proceeding.
                </p>
                <div className="text-xs text-red-700 dark:text-red-300">
                  Review the Impact Analysis above for detailed recommendations and mitigation strategies.
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                onClick={() => navigateToStep(3)}
                variant="ghost"
                icon={ArrowLeft}
              >
                Back
              </Button>
              
              <Button
                onClick={() => completeStep(4)}
                disabled={loading || (consistencyValidation && !consistencyValidation.passed)}
                loading={loading}
                variant={consistencyValidation?.passed === false ? "secondary" : "success"}
                icon={consistencyValidation?.passed === false ? AlertTriangle : Check}
              >
                {consistencyValidation?.passed === false ? 'Acknowledge Risks & Continue' : 'Accept Impact Analysis'}
              </Button>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-3">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                Synthesis Review
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Review the synthesized requirements and recommendations for your directive.
              </p>
            </div>
            
            {submission?.synthesis ? (
              <div className="space-y-3">
                {/* Aligned Requirements */}
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
                    <span className="font-medium text-green-900 dark:text-green-100">
                      Aligned Requirements ({submission.synthesis.aligned?.length || 0})
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {submission.synthesis.aligned?.map((item, idx) => {
                      const badges = typeof item === 'object' ? item.badges : generatePolicyBadges(item);
                      const text = typeof item === 'object' ? item.text : item;
                      return (
                        <li key={idx} className="text-sm text-green-800 dark:text-green-200">
                          <div className="flex items-start">
                            <span className="text-green-600 dark:text-green-400 mr-2">•</span>
                            <div className="flex-1">
                              <span>{text}</span>
                              <PolicyBadgeSet badges={badges} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                
                {/* Required Changes */}
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mr-2" />
                    <span className="font-medium text-yellow-900 dark:text-yellow-100">
                      Required Changes ({submission.synthesis.required?.length || 0})
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {submission.synthesis.required?.map((item, idx) => {
                      const badges = typeof item === 'object' ? item.badges : generatePolicyBadges(item);
                      const text = typeof item === 'object' ? item.text : item;
                      return (
                        <li key={idx} className="text-sm text-yellow-800 dark:text-yellow-200">
                          <div className="flex items-start">
                            <span className="text-yellow-600 dark:text-yellow-400 mr-2">•</span>
                            <div className="flex-1">
                              <span>{text}</span>
                              <PolicyBadgeSet badges={badges} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                
                {/* Recommended Enhancements */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2" />
                    <span className="font-medium text-blue-900 dark:text-blue-100">
                      Recommended Enhancements ({submission.synthesis.recommended?.length || 0})
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {submission.synthesis.recommended?.map((item, idx) => {
                      const badges = typeof item === 'object' ? item.badges : generatePolicyBadges(item);
                      const text = typeof item === 'object' ? item.text : item;
                      return (
                        <li key={idx} className="text-sm text-blue-800 dark:text-blue-200">
                          <div className="flex items-start">
                            <span className="text-blue-600 dark:text-blue-400 mr-2">•</span>
                            <div className="flex-1">
                              <span>{text}</span>
                              <PolicyBadgeSet badges={badges} />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 dark:text-gray-400">Synthesizing requirements and recommendations...</p>
                </div>
              </div>
            )}
            
            {/* Review Confirmation Checkbox */}
            {submission?.synthesis && (
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={synthesisReviewed}
                    onChange={(e) => setSynthesisReviewed(e.target.checked)}
                    className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <div className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">
                      I have reviewed the synthesis analysis
                    </span>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      I understand the aligned requirements ({submission.synthesis.aligned?.length || 0}), 
                      required changes ({submission.synthesis.required?.length || 0}), and 
                      recommended enhancements ({submission.synthesis.recommended?.length || 0}) for this directive.
                    </p>
                  </div>
                </label>
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                onClick={() => navigateToStep(4)}
                variant="ghost"
                icon={ArrowLeft}
              >
                Back
              </Button>
              
              <Button
                onClick={() => completeStep(5)}
                disabled={loading || !submission?.synthesis || !synthesisReviewed}
                loading={loading}
                variant="success"
                icon={Check}
              >
                Accept Synthesis
              </Button>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-3">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                Clarifying Questions
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Answer any clarifying questions about your directive to ensure accurate implementation.
              </p>
            </div>
            
            {submission?.questions && submission.questions.length > 0 ? (
              <div className="space-y-3">
                {submission.questions.map((question, idx) => (
                  <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex items-start mb-2">
                      <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2 mt-0.5" />
                      <label className="font-medium text-gray-900 dark:text-white text-sm">
                        {question.text}
                      </label>
                    </div>
                    <Input
                      type="textarea"
                      name={`question_${idx}`}
                      value={formData.questionAnswers?.[`question_${idx}`] || ''}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          questionAnswers: {
                            ...formData.questionAnswers,
                            [`question_${idx}`]: e.target.value
                          }
                        });
                      }}
                      placeholder="Your answer..."
                      rows={2}
                      helpText={question.context}
                    />
                  </div>
                ))}
              </div>
            ) : submission?.questions === undefined ? (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 dark:text-gray-400">Generating clarifying questions...</p>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
                  <p className="text-green-800 dark:text-green-200">No clarifying questions needed - your directive is clear!</p>
                </div>
              </div>
            )}
            
            {/* Review Confirmation Checkbox */}
            {submission?.questions !== undefined && (
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.questionsReviewed || false}
                    onChange={(e) => setFormData({...formData, questionsReviewed: e.target.checked})}
                    className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <div className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {submission?.questions?.length > 0 ? 
                        'I have provided complete answers to all questions' : 
                        'I confirm no additional questions are needed'
                      }
                    </span>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      {submission?.questions?.length > 0 ? 
                        `All ${submission.questions.length} clarifying questions have been answered to provide context for implementation.` :
                        'The directive is sufficiently clear and no additional clarification is required.'
                      }
                    </p>
                  </div>
                </label>
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                onClick={() => navigateToStep(5)}
                variant="ghost"
                icon={ArrowLeft}
              >
                Back
              </Button>
              
              <Button
                onClick={() => completeStep(6)}
                disabled={loading || !formData.questionsReviewed}
                loading={loading}
                variant="success"
                icon={Check}
              >
                {submission?.questions?.length > 0 ? 'Submit Answers' : 'Continue'}
              </Button>
            </div>
          </div>
        );

      case 7:
        return (
          <div className="space-y-3">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">
                Final Confirmation
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Review the final summary and choose your next action.
              </p>
            </div>
            
            {submission?.final_summary ? (
              <div className="bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="mb-3">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Directive Summary</h4>
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                    {submission.final_summary}
                  </p>
                </div>
                
                {/* Show key metrics */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {submission.strat_tac?.strategic_pct || 0}%
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Strategic</div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                      {submission.impact_analysis?.risk_level || 'Low'}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Risk Level</div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                      {submission.impact_analysis?.effort_estimate || 'Medium'}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">Effort</div>
                  </div>
                </div>
                
                {/* Copy and Regenerate Actions */}
                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(submission.final_summary);
                      toast.success('Summary copied to clipboard');
                    }}
                    variant="ghost"
                    size="small"
                    icon={Copy}
                  >
                    Copy Summary
                  </Button>
                  <Button
                    onClick={async () => {
                      // Regenerate final summary
                      setLoading(true);
                      try {
                        // Call API to regenerate final summary
                        const response = await fetch(`/api/directive-submissions/${submission.id}/regenerate-summary`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' }
                        });
                        if (response.ok) {
                          const updated = await response.json();
                          setSubmission({...submission, final_summary: updated.final_summary});
                          toast.success('Summary regenerated successfully');
                        }
                      } catch (error) {
                        toast.error('Failed to regenerate summary');
                      } finally {
                        setLoading(false);
                      }
                    }}
                    variant="ghost" 
                    size="small"
                    icon={RefreshCw}
                    disabled={loading}
                  >
                    Regenerate
                  </Button>
                </div>

                {/* Confirmation checkbox */}
                <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <label className="flex items-start cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.finalConfirmed || false}
                      onChange={(e) => setFormData({...formData, finalConfirmed: e.target.checked})}
                      className="mt-0.5 mr-2"
                    />
                    <span className="text-sm text-yellow-900 dark:text-yellow-100">
                      I confirm that this directive accurately represents my requirements.
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <p className="text-gray-600 dark:text-gray-400">Preparing final summary...</p>
                </div>
              </div>
            )}
            
            {/* Action explanation */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h5 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Choose Your Next Action</h5>
              <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                <div className="flex items-start gap-2">
                  <Save className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Save & Close:</strong> Save for later review or combine with other submissions</span>
                </div>
                <div className="flex items-start gap-2">
                  <Send className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Submit Directive:</strong> Create Strategic Directive and begin LEO Protocol workflow</span>
                </div>
              </div>
            </div>
            
            {/* Navigation and Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => navigateToStep(6)}
                variant="ghost"
                icon={ArrowLeft}
                className="order-3 sm:order-1"
              >
                Back
              </Button>
              
              <div className="flex gap-3 order-1 sm:order-2 flex-1">
                <Button
                  onClick={saveAndClose}
                  disabled={loading || !formData.finalConfirmed}
                  loading={loading}
                  variant="secondary"
                  icon={Save}
                  className="flex-1"
                >
                  Save & Close
                </Button>
                
                <Button
                  onClick={submitDirective}
                  disabled={loading || !formData.finalConfirmed}
                  loading={loading}
                  variant="primary"
                  icon={Send}
                  className="flex-1"
                >
                  Submit Directive
                </Button>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Step content for Step {stepId} coming soon...
          </div>
        );
    }
  };

  // Navigation bar for all screen sizes - Made more compact
  const NavigationBar = () => (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-1.5 px-4">
      <div className="flex justify-between items-center">
        <Button
          onClick={() => navigateToStep(Math.max(1, activeStep - 1))}
          disabled={activeStep === 1}
          variant="ghost"
          size="small"
          icon={ArrowLeft}
        >
          Previous
        </Button>
        
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
          Step {activeStep} of {steps.length}
        </span>
        
        <Button
          onClick={() => completeStep(activeStep)}
          disabled={!gateStatus[activeStep - 1] && activeStep > 1}
          variant="primary"
          size="small"
          icon={ArrowRight}
          iconPosition="right"
        >
          Next
        </Button>
      </div>
    </div>
  );

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header with Help - Compact */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-1.5">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <DarkModeToggle />
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Directive Lab</h1>
              {/* Mode Toggle */}
              <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setMode('quick')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    mode === 'quick'
                      ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Quick Mode
                </button>
                <button
                  onClick={() => setMode('comprehensive')}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    mode === 'comprehensive'
                      ? 'bg-white dark:bg-gray-800 text-primary-600 dark:text-primary-400 shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Comprehensive
                </button>
              </div>
            </div>
            <Button
              onClick={() => setShowHelp(!showHelp)}
              variant="ghost"
              size="small"
              icon={HelpCircle}
              ariaLabel="Toggle help"
            >
              Help
            </Button>
          </div>
          {/* Active Step Display */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">Active Step:</span>
            <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
              {steps[activeStep - 1]?.title || 'Unknown'}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({activeStep} of {steps.length})
            </span>
          </div>
        </div>
      </div>

      {/* Help Panel - Compact */}
      {showHelp && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-2">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start">
              <HelpCircle className="w-4 h-4 text-blue-600 mt-0.5 mr-2" />
              <div className="text-xs text-blue-900 dark:text-blue-100">
                <p className="font-medium mb-0.5">Getting Started:</p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-800 dark:text-blue-200">
                  <li>Provide detailed feedback about what you want to improve</li>
                  <li>Each step builds on the previous one</li>
                  <li>Your progress is automatically saved</li>
                  <li>You can navigate back to previous steps at any time</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success/Error Messages - Compact */}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center text-green-800 dark:text-green-200 text-sm">
            <CheckCircle className="w-4 h-4 mr-2" />
            {success}
          </div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex items-center text-red-800 dark:text-red-200 text-sm">
            <AlertCircle className="w-4 h-4 mr-2" />
            {error}
          </div>
        </div>
      )}

      {/* Progress Bar - Always Horizontal */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        <div className="max-w-7xl mx-auto">
          <ProgressBar
            steps={steps}
            currentStep={activeStep}
            orientation='horizontal'
            showTimeEstimates={!isMobile}
            compact={true}
            hideLabelsOnMobile={true}
            onStepClick={navigateToStep}
          />
        </div>
      </div>

      {/* Navigation Bar - Positioned between progress and tabs */}
      <NavigationBar />

      {/* Main Content - Full Width */}
      <div className="flex-1 px-4 py-2 flex flex-col min-h-0">
        {/* Tab Navigation */}
        <div className="bg-white dark:bg-gray-800 rounded-t-lg shadow-sm border border-gray-200 dark:border-gray-700 border-b-0 flex-shrink-0">
          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab('input')}
              className={`px-4 py-2.5 text-sm font-medium transition-all duration-300 ease-in-out relative ${
                activeTab === 'input'
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-b-2 border-blue-600'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Input & Screenshot
              </div>
              {activeTab === 'input' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300" />
              )}
            </button>
            
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-4 py-2.5 text-sm font-medium transition-all duration-300 ease-in-out relative ${
                activeTab === 'submissions'
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-b-2 border-blue-600'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Recent Submissions
                {submission && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                )}
              </div>
              {activeTab === 'submissions' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300" />
              )}
            </button>
          </div>
        </div>

        {/* Tab Content - Compact */}
        <div className="bg-white dark:bg-gray-800 rounded-b-lg shadow-sm border border-gray-200 dark:border-gray-700 border-t-0 flex-1 relative flex flex-col overflow-hidden">
          {/* Input & Screenshot Tab - Compact */}
          <div
            className={`absolute inset-0 p-4 transition-all duration-500 ease-in-out flex flex-col ${
              activeTab === 'input'
                ? 'translate-x-0 opacity-100'
                : 'translate-x-full opacity-0 pointer-events-none'
            }`}
          >
            {/* Header - Fixed */}
            <div className="mb-3 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {steps[activeStep - 1]?.title || 'Step ' + activeStep}
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                {steps[activeStep - 1]?.description || 'Loading...'}
              </p>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto pr-2">
              {renderStepContent(activeStep)}
            </div>
          </div>

          {/* Recent Submissions Tab - Compact */}
          <div
            className={`absolute inset-0 p-4 transition-all duration-500 ease-in-out ${
              activeTab === 'submissions'
                ? 'translate-x-0 opacity-100'
                : '-translate-x-full opacity-0 pointer-events-none'
            }`}
          >
            <div className="h-full">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Submissions</h2>
                <Button
                  onClick={() => setRefreshSubmissions(prev => prev + 1)}
                  variant="ghost"
                  size="small"
                  icon={RefreshCw}
                  ariaLabel="Refresh submissions"
                />
              </div>
              
              <div className="h-full bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                <RecentSubmissions
                  onSubmissionSelect={(submission) => {
                    setSubmission(submission);
                    // Auto-switch to input tab when submission is selected
                    if (submission) {
                      setTimeout(() => setActiveTab('input'), 300);
                    }
                  }}
                  selectedSubmissionId={submission?.id}
                  onSelectionChange={setSelectedSubmissions}
                  refreshTrigger={refreshSubmissions}
                  onGroupCreate={(submissions, method = 'intelligent') => {
                    setSelectedSubmissions(submissions);
                    setCombineMethod(method);
                    setShowGroupModal(true);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Group Creation Modal */}
      {showGroupModal && (
        <GroupCreationModal
          selectedSubmissions={selectedSubmissions}
          combineMethod={combineMethod}
          onClose={() => setShowGroupModal(false)}
          onSuccess={() => {
            setShowGroupModal(false);
            setRefreshSubmissions(prev => prev + 1);
          }}
        />
      )}
      </div>
    </ToastProvider>
  );
};

export default DirectiveLab;