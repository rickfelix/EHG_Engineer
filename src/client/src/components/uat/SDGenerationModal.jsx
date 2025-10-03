import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Loader,
  CheckCircle,
  AlertCircle,
  Brain,
  FileText,
  Zap,
  ArrowRight
} from 'lucide-react';

export function SDGenerationModal({ testResult, onClose, onSuccess }) {
  const [status, setStatus] = useState('idle'); // idle, analyzing, generating, validating, complete, error
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [error, setError] = useState(null);
  const [submission, setSubmission] = useState(null);

  useEffect(() => {
    if (status === 'idle') {
      startConversion();
    }
  }, []);

  const startConversion = async () => {
    try {
      setStatus('analyzing');
      setProgress(10);
      setCurrentStep('Analyzing test failure and business impact...');

      // Convert test result to proper format for API
      const payload = {
        case_id: testResult.id || testResult.case_id,
        title: testResult.title,
        section: testResult.section,
        priority: testResult.priority,
        status: testResult.status || 'FAIL',
        description: testResult.description
      };

      // Simulate API call to conversion script
      const response = await fetch('/api/uat/convert-to-sd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to convert to Strategic Directive');
      }

      setProgress(40);
      setStatus('generating');
      setCurrentStep('Generating Strategic Directive components...');

      await new Promise(resolve => setTimeout(resolve, 1500));

      setProgress(70);
      setStatus('validating');
      setCurrentStep('Validating quality and completeness...');

      await new Promise(resolve => setTimeout(resolve, 1000));

      setProgress(90);
      setCurrentStep('Creating submission in database...');

      const result = await response.json();

      setProgress(100);
      setStatus('complete');
      setCurrentStep('Strategic Directive created successfully!');
      setSubmission(result);

      // Auto-close after 3 seconds or call success callback
      setTimeout(() => {
        if (onSuccess) {
          onSuccess(result);
        } else {
          onClose();
        }
      }, 3000);

    } catch (err) {
      console.error('Conversion failed:', err);
      setStatus('error');
      setError(err.message || 'Failed to convert test failure to Strategic Directive');
      setCurrentStep('');
    }
  };

  const getStepIcon = () => {
    switch (status) {
      case 'analyzing':
        return <Brain className="h-6 w-6 text-blue-500 animate-pulse" />;
      case 'generating':
        return <Sparkles className="h-6 w-6 text-purple-500 animate-pulse" />;
      case 'validating':
        return <Zap className="h-6 w-6 text-yellow-500 animate-pulse" />;
      case 'complete':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-6 w-6 text-red-500" />;
      default:
        return <FileText className="h-6 w-6 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'analyzing':
        return 'from-blue-600 to-blue-500';
      case 'generating':
        return 'from-purple-600 to-purple-500';
      case 'validating':
        return 'from-yellow-600 to-yellow-500';
      case 'complete':
        return 'from-green-600 to-green-500';
      case 'error':
        return 'from-red-600 to-red-500';
      default:
        return 'from-gray-600 to-gray-500';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60] overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`bg-gradient-to-r ${getStatusColor()} text-white p-6 rounded-t-xl`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStepIcon()}
              <div>
                <h2 className="text-2xl font-bold">
                  {status === 'complete' ? 'Strategic Directive Created!' : 'Creating Strategic Directive'}
                </h2>
                <p className="text-white/90 text-sm mt-1">
                  AI-powered conversion from UAT test failure
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              disabled={status !== 'complete' && status !== 'error'}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Test Information */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                  Test Case: {testResult.case_id}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {testResult.title}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`text-xs px-2 py-1 rounded font-semibold ${
                    testResult.priority === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                    testResult.priority === 'high' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                  }`}>
                    {testResult.priority} priority
                  </span>
                  <span className="text-xs px-2 py-1 rounded font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    FAILED
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="space-y-3">
            <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              status === 'analyzing' || progress >= 10 ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-700'
            }`}>
              {progress >= 10 ? (
                <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              ) : status === 'analyzing' ? (
                <Loader className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  status === 'analyzing' || progress >= 10 ? 'text-blue-800 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  Analyze Test Failure
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-500">
                  Determine business impact and strategic importance
                </p>
              </div>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              status === 'generating' || progress >= 40 ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-gray-50 dark:bg-gray-700'
            }`}>
              {progress >= 40 ? (
                <CheckCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              ) : status === 'generating' ? (
                <Loader className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-spin" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  status === 'generating' || progress >= 40 ? 'text-purple-800 dark:text-purple-300' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  Generate SD Components
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-500">
                  Create comprehensive documentation and requirements
                </p>
              </div>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              status === 'validating' || progress >= 70 ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-gray-50 dark:bg-gray-700'
            }`}>
              {progress >= 70 ? (
                <CheckCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              ) : status === 'validating' ? (
                <Loader className="h-5 w-5 text-yellow-600 dark:text-yellow-400 animate-spin" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  status === 'validating' || progress >= 70 ? 'text-yellow-800 dark:text-yellow-300' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  Validate Quality
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-500">
                  Ensure completeness and actionability
                </p>
              </div>
            </div>

            <div className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
              progress >= 90 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-700'
            }`}>
              {progress >= 90 ? (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : progress >= 70 ? (
                <Loader className="h-5 w-5 text-green-600 dark:text-green-400 animate-spin" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  progress >= 90 ? 'text-green-800 dark:text-green-300' : 'text-gray-500 dark:text-gray-400'
                }`}>
                  Create Submission
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-500">
                  Store in database and link to UAT
                </p>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative">
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${getStatusColor()} transition-all duration-500`}
                style={{ width: `${progress}%` }}
              />
            </div>
            {currentStep && status !== 'complete' && status !== 'error' && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 text-center">
                {currentStep}
              </p>
            )}
          </div>

          {/* Success Message */}
          {status === 'complete' && submission && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-green-800 dark:text-green-300 mb-2">
                    Strategic Directive Created Successfully!
                  </p>
                  <div className="space-y-1 text-sm text-green-700 dark:text-green-400">
                    <p>• Submission ID: <code className="font-mono bg-green-100 dark:bg-green-900/30 px-1 rounded">{submission.id}</code></p>
                    <p>• SD ID: <code className="font-mono bg-green-100 dark:bg-green-900/30 px-1 rounded">{submission.sd_id}</code></p>
                    <p>• AI Confidence: <span className="font-semibold">{(submission.confidence_score * 100).toFixed(1)}%</span></p>
                    <p>• Status: <span className="font-semibold">Pending Review</span></p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {status === 'error' && error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-800 dark:text-red-300 mb-1">
                    Conversion Failed
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          {status === 'complete' ? (
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                The Strategic Directive has been created and is pending review
              </p>
              <button
                onClick={() => onSuccess(submission)}
                className="px-6 py-2 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 transition-colors flex items-center gap-2"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : status === 'error' ? (
            <div className="flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Close
              </button>
              <button
                onClick={startConversion}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                <Loader className="h-5 w-5 animate-spin" />
                <span className="text-sm">Processing... Please wait</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}