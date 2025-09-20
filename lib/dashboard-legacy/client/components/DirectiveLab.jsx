/**
 * Enhanced DirectiveLab Component - UI/UX Improvements
 * Implements unified design system with consistent components
 * Improved mobile experience and accessibility
 */

import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Check, 
  Lock, 
  AlertCircle,
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
  Clock
} from 'lucide-react';

// Import new UI components
import Button from './ui/Button';
import Input from './ui/Input';
import ProgressBar from './ui/ProgressBar';
import RecentSubmissions from './RecentSubmissions';
import GroupCreationModal from './GroupCreationModal';

// Import design tokens
import './ui/design-tokens.css';

const DirectiveLab = () => {
  const [activeStep, setActiveStep] = useState(1);
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedSubmissions, setSelectedSubmissions] = useState([]);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [refreshSubmissions, setRefreshSubmissions] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [activePanel, setActivePanel] = useState('submissions');
  const [showHelp, setShowHelp] = useState(false);
  
  // Form data with validation states
  const [formData, setFormData] = useState({
    chairmanInput: '',
    screenshotUrl: '',
    intentSummary: '',
    stratTacOverride: null,
    synthesisReviewed: false,
    questionAnswers: {},
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
    6: false
  });

  // Enhanced steps with time estimates
  const steps = [
    {
      id: 1,
      title: 'Input & Screenshot',
      icon: Camera,
      description: 'Provide feedback and optional screenshot',
      timeEstimate: 3 // minutes
    },
    {
      id: 2,
      title: 'Intent Confirmation',
      icon: Target,
      description: 'Review and confirm the extracted intent',
      timeEstimate: 2
    },
    {
      id: 3,
      title: 'Classification',
      icon: Layers,
      description: 'Review strategic vs tactical breakdown',
      timeEstimate: 2
    },
    {
      id: 4,
      title: 'Synthesis Review',
      icon: FileText,
      description: 'Review aligned, required, and recommended items',
      timeEstimate: 5
    },
    {
      id: 5,
      title: 'Questions',
      icon: MessageSquare,
      description: 'Answer questions to refine the directive',
      timeEstimate: 3
    },
    {
      id: 6,
      title: 'Confirmation',
      icon: CheckCircle,
      description: 'Review and confirm the final summary',
      timeEstimate: 2
    }
  ];

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile && submission) {
        setActivePanel('wizard');
      }
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
    if (!validateChairmanInput(formData.chairmanInput)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/sdip/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback: formData.chairmanInput,
          screenshot_url: formData.screenshotUrl
        })
      });

      if (!response.ok) throw new Error('Failed to submit feedback');

      const data = await response.json();
      setSubmission(data);
      setFormData({ ...formData, intentSummary: data.intent || '' });
      setGateStatus({ ...gateStatus, 1: true });
      setActiveStep(2);
      setSuccess('Feedback submitted successfully!');
      
      // Clear draft
      localStorage.removeItem('directiveLab_draft');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Complete a step
  const completeStep = async (stepId) => {
    setLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setGateStatus({ ...gateStatus, [stepId]: true });
      
      if (stepId < 6) {
        setActiveStep(stepId + 1);
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
        }, 2000);
      }
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
          <div className="space-y-6">
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
              rows={6}
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
          <div className="space-y-6">
            <Input
              type="textarea"
              label="Extracted Intent Summary"
              name="intentSummary"
              value={formData.intentSummary}
              onChange={(e) => setFormData({ ...formData, intentSummary: e.target.value })}
              rows={4}
              helpText="Review and edit if needed to accurately capture your intent"
              success={formData.intentSummary.length > 0}
            />
            
            <div className="flex gap-3">
              <Button
                onClick={() => setActiveStep(1)}
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
          <div className="space-y-6">
            {submission?.strat_tac && (
              <div className="p-6 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-around mb-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                      {submission.strat_tac.strategic_pct}%
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Strategic</div>
                  </div>
                  <div className="w-px bg-gray-300 dark:bg-gray-600" />
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                      {submission.strat_tac.tactical_pct}%
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Tactical</div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-700 p-4 rounded-lg">
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">Classification Rationale:</p>
                  <p className="text-gray-600 dark:text-gray-400">{submission.strat_tac.rationale}</p>
                </div>
              </div>
            )}
            
            <div className="flex gap-3">
              <Button
                onClick={() => setActiveStep(2)}
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
                Accept Classification
              </Button>
            </div>
          </div>
        );

      // Additional steps would follow similar patterns...
      default:
        return (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Step content for Step {stepId} coming soon...
          </div>
        );
    }
  };

  // Mobile navigation bar
  const MobileNavigation = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 z-50 md:hidden">
      <div className="flex justify-between items-center">
        <Button
          onClick={() => setActiveStep(Math.max(1, activeStep - 1))}
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header with Help */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Directive Lab</h1>
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
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-3">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-start">
              <HelpCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <p className="font-medium mb-1">Getting Started:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
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
        <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center text-green-800 dark:text-green-200">
            <CheckCircle className="w-5 h-5 mr-2" />
            {success}
          </div>
        </div>
      )}
      
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center text-red-800 dark:text-red-200">
            <AlertCircle className="w-5 h-5 mr-2" />
            {error}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-6">
        <div className="max-w-7xl mx-auto">
          <ProgressBar
            steps={steps}
            currentStep={activeStep}
            orientation={isMobile ? 'vertical' : 'horizontal'}
            showTimeEstimates
            compact={isMobile}
            onStepClick={setActiveStep}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Panel - Recent Submissions */}
          <div className={`${isMobile && activePanel !== 'submissions' ? 'hidden' : ''} md:block`}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Submissions</h2>
                <Button
                  onClick={() => setRefreshSubmissions(prev => prev + 1)}
                  variant="ghost"
                  size="small"
                  icon={RefreshCw}
                  ariaLabel="Refresh submissions"
                />
              </div>
              <RecentSubmissions
                onSelectSubmission={setSubmission}
                selectedSubmissions={selectedSubmissions}
                onToggleSelection={setSelectedSubmissions}
                refresh={refreshSubmissions}
              />
            </div>
          </div>

          {/* Right Panel - Step Content */}
          <div className={`md:col-span-2 ${isMobile && activePanel !== 'wizard' ? 'hidden' : ''} md:block`}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {steps[activeStep - 1].title}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {steps[activeStep - 1].description}
                </p>
              </div>
              
              {renderStepContent(activeStep)}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isMobile && <MobileNavigation />}

      {/* Group Creation Modal */}
      {showGroupModal && (
        <GroupCreationModal
          selectedSubmissions={selectedSubmissions}
          onClose={() => setShowGroupModal(false)}
          onSuccess={() => {
            setShowGroupModal(false);
            setRefreshSubmissions(prev => prev + 1);
          }}
        />
      )}
    </div>
  );
};

export default DirectiveLab;