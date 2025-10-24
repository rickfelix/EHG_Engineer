/**
 * DirectiveLabForm Component
 * Handles form input for Steps 1, 2, and 7
 */

import React from 'react';
import {
  Camera,
  ArrowRight,
  ArrowLeft,
  Save,
  Check,
  Copy,
  RefreshCw,
  Send
} from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useToast } from '../ui/Toast';

/**
 * Step 1: Initial Feedback Form
 */
export const FeedbackForm = ({
  chairmanInput,
  screenshotUrl,
  fieldErrors,
  fieldSuccess,
  onChairmanInputChange,
  onScreenshotUrlChange,
  onSubmit,
  onSaveDraft,
  loading
}) => {
  return (
    <div className="space-y-3">
      <Input
        type="textarea"
        label="Chairman Feedback"
        name="chairmanInput"
        value={chairmanInput}
        onChange={onChairmanInputChange}
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
        value={screenshotUrl}
        onChange={onScreenshotUrlChange}
        placeholder="https://example.com/screenshot.png"
        error={fieldErrors.screenshotUrl}
        success={fieldSuccess.screenshotUrl}
        helpText="Optional: Add a screenshot URL to provide visual context"
        icon={Camera}
      />

      <div className="flex gap-3">
        <Button
          onClick={onSubmit}
          disabled={loading || !chairmanInput.trim()}
          loading={loading}
          variant="primary"
          icon={ArrowRight}
          iconPosition="right"
        >
          Submit & Analyze
        </Button>

        <Button
          onClick={onSaveDraft}
          variant="secondary"
          icon={Save}
        >
          Save Draft
        </Button>
      </div>
    </div>
  );
};

/**
 * Step 2: Intent Confirmation Form
 */
export const IntentConfirmationForm = ({
  intentSummary,
  onIntentChange,
  onBack,
  onConfirm,
  loading
}) => {
  return (
    <div className="space-y-3">
      <Input
        type="textarea"
        label="Extracted Intent Summary"
        name="intentSummary"
        value={intentSummary}
        onChange={onIntentChange}
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
        success={intentSummary.length > 0}
      />

      <div className="flex gap-3">
        <Button
          onClick={onBack}
          variant="ghost"
          icon={ArrowLeft}
        >
          Back
        </Button>

        <Button
          onClick={onConfirm}
          disabled={loading || !intentSummary}
          loading={loading}
          variant="success"
          icon={Check}
        >
          Confirm Intent
        </Button>
      </div>
    </div>
  );
};

/**
 * Step 7: Final Confirmation Form
 */
export const FinalConfirmationForm = ({
  submission,
  finalConfirmed,
  onFinalConfirmedChange,
  onBack,
  onSaveAndClose,
  onSubmitDirective,
  loading
}) => {
  const toast = useToast();

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
                // Placeholder for regenerate functionality
                toast.info('Regenerate functionality will be implemented');
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
                checked={finalConfirmed || false}
                onChange={(e) => onFinalConfirmedChange(e.target.checked)}
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
          onClick={onBack}
          variant="ghost"
          icon={ArrowLeft}
          className="order-3 sm:order-1"
        >
          Back
        </Button>

        <div className="flex gap-3 order-1 sm:order-2 flex-1">
          <Button
            onClick={onSaveAndClose}
            disabled={loading || !finalConfirmed}
            loading={loading}
            variant="secondary"
            icon={Save}
            className="flex-1"
          >
            Save & Close
          </Button>

          <Button
            onClick={onSubmitDirective}
            disabled={loading || !finalConfirmed}
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
};

const DirectiveLabForm = {
  FeedbackForm,
  IntentConfirmationForm,
  FinalConfirmationForm
};

export default DirectiveLabForm;
