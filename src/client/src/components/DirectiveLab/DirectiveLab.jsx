/**
 * DirectiveLab Main Orchestrator Component
 * Manages top-level state and coordinates all sub-components
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  HelpCircle,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Camera,
  FileText
} from 'lucide-react';

// Import UI components
import Button from '../ui/Button';
import ProgressBar from '../ui/ProgressBar';
import RecentSubmissions from '../RecentSubmissions';
import GroupCreationModal from '../GroupCreationModal';
import { ToastProvider, useToast } from '../ui/Toast';

// Import DirectiveLab sub-components
import { FeedbackForm, IntentConfirmationForm, FinalConfirmationForm } from './DirectiveLabForm';
import { ClassificationStep, SynthesisStep } from './ValidationGatesManager';
import ImpactAnalysisSection from './ImpactAnalysisSection';
import QuestionnaireFlow from './QuestionnaireFlow';

// Import types and utilities
import {
  getSteps,
  getNextStep,
  getPreviousStep,
  DEPENDENCY_MAP,
  STEP_NAMES,
  getStepsWithData,
  validateChairmanInput,
  validateUrl,
  AUTO_SAVE_DELAY,
  DRAFT_STORAGE_KEY,
  TOAST_DURATION,
  TOAST_DURATION_LONG
} from './types';

// Import design tokens
import '../ui/design-tokens.css';

// Import data generation hooks
// Import data generation hooks
import {
  useClassificationGenerator,
  useImpactAnalysisGenerator,
  useSynthesisGenerator,
  useQuestionsGenerator,
  useFinalSummaryGenerator
} from './hooks/useDataGenerators';

const DirectiveLab = () => {
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const initialMode = urlParams.get('mode') === 'quick' ? 'quick' : 'comprehensive';
  const toast = useToast();

  // Core state
  const [mode, setMode] = useState(initialMode);
  const [activeStep, setActiveStep] = useState(1);
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // UI state
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState('input');
  const [showHelp, setShowHelp] = useState(false);

  // Group/submissions state
  const [selectedSubmissions, setSelectedSubmissions] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [combineMethod, setCombineMethod] = useState('intelligent');
  const [refreshSubmissions, setRefreshSubmissions] = useState(0);

  // Form data
  const [formData, setFormData] = useState({
    chairmanInput: '',
    screenshotUrl: '',
    intentSummary: '',
    stratTacOverride: null,
    synthesisReviewed: false,
    questionAnswers: {},
    questionsReviewed: false,
    finalConfirmed: false,
    summaryConfirmed: false
  });

  // Validation state
  const [fieldErrors, setFieldErrors] = useState({});
  const [fieldSuccess, setFieldSuccess] = useState({});
  const [gateStatus, setGateStatus] = useState({
    1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false
  });

  // Analysis state
  const [impactAnalysis, setImpactAnalysis] = useState(null);
  const [consistencyValidation, setConsistencyValidation] = useState(null);
  const [synthesisReviewed, setSynthesisReviewed] = useState(false);
  const [editHistory, setEditHistory] = useState([]);

  // Dynamic steps based on mode
  const steps = getSteps(mode);

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

  // Auto-save draft
  useEffect(() => {
    const saveTimer = setTimeout(() => {
      if (formData.chairmanInput || formData.intentSummary) {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
        setSuccess('Draft saved');
        setTimeout(() => setSuccess(null), TOAST_DURATION);
      }
    }, AUTO_SAVE_DELAY);

    return () => clearTimeout(saveTimer);
  }, [formData]);

  // Load draft on mount
  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (draft) {
      setFormData(JSON.parse(draft));
      setSuccess('Draft restored');
      setTimeout(() => setSuccess(null), TOAST_DURATION);
    }
  }, []);

  // Auto-resize intent summary textarea
  useEffect(() => {
    if (activeStep === 2 && formData.intentSummary) {
      setTimeout(() => {
        const textarea = document.querySelector('textarea[name="intentSummary"]');
        if (textarea) {
          textarea.style.height = 'auto';
          textarea.style.height = Math.min(textarea.scrollHeight, 300) + 'px';
        }
      }, 100);
    }
  }, [formData.intentSummary, activeStep]);

  // Step 5 State Restoration
  useEffect(() => {
    if (activeStep === 5 && submission?.id) {
      if (submission?.gate_status?.synthesis_reviewed) {
        setSynthesisReviewed(true);
      }
    }
  }, [activeStep, submission]);

  // Use custom hooks for data generation
  useClassificationGenerator(activeStep, submission, formData, setSubmission);
  useImpactAnalysisGenerator(activeStep, submission, formData, setImpactAnalysis, setConsistencyValidation, setSubmission);
  useSynthesisGenerator(activeStep, submission, formData, setSubmission);
  useQuestionsGenerator(activeStep, submission, formData, setSubmission);
  useFinalSummaryGenerator(activeStep, submission, formData, setSubmission);

  // Edit invalidation warning
  const checkEditInvalidation = (targetStep) => {
    const currentStep = activeStep;

    if (targetStep < currentStep && submission) {
      const affectedSteps = DEPENDENCY_MAP[targetStep] || [];
      const stepsWithData = getStepsWithData(submission, affectedSteps);

      if (stepsWithData.length > 0) {
        const affectedStepNames = stepsWithData.map(s => STEP_NAMES[s]).join(', ');

        toast.warning(
          `Editing Step ${targetStep} may invalidate: ${affectedStepNames}`,
          TOAST_DURATION_LONG
        );

        setEditHistory(prev => [...prev, {
          editedStep: targetStep,
          timestamp: new Date().toISOString(),
          affectedSteps: stepsWithData
        }]);
      }
    }
  };

  // Navigation with edit invalidation check
  const navigateToStep = (targetStep) => {
    checkEditInvalidation(targetStep);
    setActiveStep(targetStep);
  };

  // API: Submit initial feedback
  const submitFeedback = async () => {
    const validation = validateChairmanInput(formData.chairmanInput);
    if (!validation.valid) {
      setFieldErrors({ ...fieldErrors, chairmanInput: validation.error });
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
      const submissionData = data.submission || data;
      setSubmission(submissionData);

      setGateStatus({ ...gateStatus, 1: true });
      setActiveStep(2);
      setSuccess('Feedback submitted successfully!');

      localStorage.removeItem(DRAFT_STORAGE_KEY);

      if (submissionData.id) {
        await updateSubmissionStep(submissionData.id, 2, {
          feedback: formData.chairmanInput,
          chairman_input: formData.chairmanInput
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // API: Update submission step
  const updateSubmissionStep = async (submissionId, stepNumber, stepData) => {
    try {
      const response = await fetch(`/api/sdip/submissions/${submissionId}/step/${stepNumber}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stepData)
      });

      if (!response.ok) throw new Error(`Failed to update step ${stepNumber}`);

      const data = await response.json();
      const updatedSubmission = data.submission || data;

      setSubmission(updatedSubmission);

      if (stepNumber === 2 && updatedSubmission.intent_summary) {
        setFormData({ ...formData, intentSummary: updatedSubmission.intent_summary });
      }

      return updatedSubmission;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  // Complete a step
  const completeStep = async (stepId) => {
    setLoading(true);
    setError(null);

    try {
      if (submission && submission.id && stepId > 1) {
        let stepData = {};

        switch(stepId) {
          case 2:
            stepData = { intent_summary: formData.intentSummary };
            break;
          case 3:
            stepData = {
              strategic_pct: submission.strat_tac?.strategic_pct || 50,
              tactical_pct: submission.strat_tac?.tactical_pct || 50,
              override: formData.stratTacOverride
            };
            break;
          case 4:
            stepData = {
              impact_analysis: impactAnalysis,
              consistency_validation: consistencyValidation
            };
            break;
          case 5:
            stepData = {
              aligned: submission.synthesis?.aligned || [],
              required: submission.synthesis?.required || [],
              recommended: submission.synthesis?.recommended || [],
              synthesis_reviewed: synthesisReviewed
            };
            break;
          case 6:
            stepData = { questions_answers: formData.questionAnswers };
            break;
          case 7:
            stepData = { final_summary: submission.final_summary || formData.intentSummary };
            break;
        }

        await updateSubmissionStep(submission.id, stepId, stepData);
      }

      setGateStatus({ ...gateStatus, [stepId]: true });

      const nextStep = getNextStep(stepId, mode);
      if (nextStep !== stepId) {
        setActiveStep(nextStep);
        setSuccess(`Step ${stepId} completed!`);
      } else {
        setSuccess('Directive submitted successfully!');
        setTimeout(() => {
          resetForm();
        }, 2000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Save and close
  const saveAndClose = async () => {
    setLoading(true);
    setError(null);

    try {
      if (submission && submission.id) {
        const stepData = {
          final_summary: submission.final_summary || formData.intentSummary,
          status: 'ready',
          completed_steps: [1, 2, 3, 4, 5, 6, 7]
        };

        await updateSubmissionStep(submission.id, 7, stepData);

        setGateStatus({ ...gateStatus, 7: true });
        setSuccess('Submission saved successfully! You can find it in Recent Submissions.');

        setTimeout(() => {
          resetForm();
          setActiveTab('submissions');
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

  // Submit directive
  const submitDirective = async () => {
    setLoading(true);
    setError(null);

    try {
      if (submission && submission.id) {
        const stepData = {
          final_summary: submission.final_summary || formData.intentSummary,
          status: 'submitted',
          completed_steps: [1, 2, 3, 4, 5, 6, 7]
        };

        await updateSubmissionStep(submission.id, 7, stepData);
      }

      const response = await fetch('/api/sdip/create-strategic-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: submission.id })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create Strategic Directive');
      }

      const result = await response.json();

      setGateStatus({ ...gateStatus, 7: true });
      setSuccess(`Strategic Directive created successfully! ID: ${result.sd_id}`);

      setTimeout(() => {
        resetForm();
        setActiveTab('submissions');
      }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      chairmanInput: '',
      screenshotUrl: '',
      intentSummary: '',
      stratTacOverride: null,
      synthesisReviewed: false,
      questionAnswers: {},
      questionsReviewed: false,
      finalConfirmed: false,
      summaryConfirmed: false
    });
    setActiveStep(1);
    setGateStatus({});
    setSubmission(null);
    setImpactAnalysis(null);
    setConsistencyValidation(null);
  };

  // Render step content
  const renderStepContent = (stepId) => {
    switch (stepId) {
      case 1:
        return (
          <FeedbackForm
            chairmanInput={formData.chairmanInput}
            screenshotUrl={formData.screenshotUrl}
            fieldErrors={fieldErrors}
            fieldSuccess={fieldSuccess}
            onChairmanInputChange={(e) => {
              setFormData({ ...formData, chairmanInput: e.target.value });
              const validation = validateChairmanInput(e.target.value);
              setFieldErrors({ ...fieldErrors, chairmanInput: validation.error });
              setFieldSuccess({ ...fieldSuccess, chairmanInput: validation.valid });
            }}
            onScreenshotUrlChange={(e) => {
              setFormData({ ...formData, screenshotUrl: e.target.value });
              const validation = validateUrl(e.target.value);
              setFieldErrors({ ...fieldErrors, screenshotUrl: validation.error });
              setFieldSuccess({ ...fieldSuccess, screenshotUrl: validation.valid });
            }}
            onSubmit={submitFeedback}
            onSaveDraft={() => {
              localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
              setSuccess('Draft saved');
            }}
            loading={loading}
          />
        );

      case 2:
        return (
          <IntentConfirmationForm
            intentSummary={formData.intentSummary}
            onIntentChange={(e) => {
              setFormData({ ...formData, intentSummary: e.target.value });
              if (e.target) {
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
              }
            }}
            onBack={() => navigateToStep(1)}
            onConfirm={() => completeStep(2)}
            loading={loading}
          />
        );

      case 3:
        return (
          <ClassificationStep
            submission={submission}
            stratTacOverride={formData.stratTacOverride}
            onStratTacChange={(override) => setFormData({ ...formData, stratTacOverride: override })}
            onResetOverride={() => setFormData({ ...formData, stratTacOverride: null })}
            onBack={() => navigateToStep(2)}
            onComplete={() => completeStep(3)}
            loading={loading}
          />
        );

      case 4:
        return (
          <ImpactAnalysisSection
            impactAnalysis={impactAnalysis}
            consistencyValidation={consistencyValidation}
            submission={submission}
            onBack={() => navigateToStep(3)}
            onComplete={() => completeStep(4)}
            loading={loading}
          />
        );

      case 5:
        return (
          <SynthesisStep
            submission={submission}
            synthesisReviewed={synthesisReviewed}
            onSynthesisReviewedChange={setSynthesisReviewed}
            onBack={() => navigateToStep(4)}
            onComplete={() => completeStep(5)}
            loading={loading}
          />
        );

      case 6:
        return (
          <QuestionnaireFlow
            submission={submission}
            questionAnswers={formData.questionAnswers}
            onAnswerChange={(key, value) => {
              setFormData({
                ...formData,
                questionAnswers: {
                  ...formData.questionAnswers,
                  [key]: value
                }
              });
            }}
            questionsReviewed={formData.questionsReviewed}
            onQuestionsReviewedChange={(checked) => setFormData({ ...formData, questionsReviewed: checked })}
            onBack={() => navigateToStep(5)}
            onComplete={() => completeStep(6)}
            loading={loading}
          />
        );

      case 7:
        return (
          <FinalConfirmationForm
            submission={submission}
            finalConfirmed={formData.finalConfirmed}
            onFinalConfirmedChange={(checked) => setFormData({ ...formData, finalConfirmed: checked })}
            onBack={() => navigateToStep(6)}
            onSaveAndClose={saveAndClose}
            onSubmitDirective={submitDirective}
            loading={loading}
          />
        );

      default:
        return (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Step content for Step {stepId} coming soon...
          </div>
        );
    }
  };

  // Navigation bar
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
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-1.5">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
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

        {/* Help Panel */}
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

        {/* Success/Error Messages */}
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

        {/* Progress Bar */}
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

        {/* Navigation Bar */}
        <NavigationBar />

        {/* Main Content */}
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

          {/* Tab Content */}
          <div className="bg-white dark:bg-gray-800 rounded-b-lg shadow-sm border border-gray-200 dark:border-gray-700 border-t-0 flex-1 relative flex flex-col overflow-hidden">
            {/* Input Tab */}
            <div
              className={`absolute inset-0 p-4 transition-all duration-500 ease-in-out flex flex-col ${
                activeTab === 'input'
                  ? 'translate-x-0 opacity-100'
                  : 'translate-x-full opacity-0 pointer-events-none'
              }`}
            >
              <div className="mb-3 flex-shrink-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {steps[activeStep - 1]?.title || 'Step ' + activeStep}
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                  {steps[activeStep - 1]?.description || 'Loading...'}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto pr-2">
                {renderStepContent(activeStep)}
              </div>
            </div>

            {/* Recent Submissions Tab */}
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
