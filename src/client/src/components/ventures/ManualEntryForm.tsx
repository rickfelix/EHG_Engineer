/**
 * ManualEntryForm Component
 * Form for manual venture entry with validation
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 * User Story: US-002 - Manual Entry Path
 */

import React, { useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

interface FormData {
  name: string;
  problem: string;
  solution: string;
  market: string;
}

interface FormErrors {
  name?: string;
  problem?: string;
  solution?: string;
  market?: string;
}

interface ManualEntryFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  onCancel: () => void;
}

const ManualEntryForm: React.FC<ManualEntryFormProps> = ({ onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    problem: '',
    solution: '',
    market: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  const hasUnsavedChanges = Object.values(formData).some((v) => v.trim() !== '');

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.name.trim()) newErrors.name = 'Venture name is required';
    if (!formData.problem.trim()) newErrors.problem = 'Problem statement is required';
    if (!formData.solution.trim()) newErrors.solution = 'Solution description is required';
    if (!formData.market.trim()) newErrors.market = 'Target market is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleChange = useCallback((field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setIsLoading(true);
    try {
      await onSubmit(formData);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create venture. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [formData, validate, onSubmit]);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
    } else {
      onCancel();
    }
  }, [hasUnsavedChanges, onCancel]);

  const confirmLeave = useCallback(() => {
    setShowUnsavedDialog(false);
    onCancel();
  }, [onCancel]);

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <form
        data-testid="manual-entry-form"
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          Describe Your Venture Idea
        </h2>

        {/* Venture Name */}
        <div>
          <label
            htmlFor="venture-name"
            className="block mb-2 font-medium text-gray-700 dark:text-gray-300"
          >
            Venture Name <span className="text-red-500">*</span>
          </label>
          <input
            id="venture-name"
            data-testid="manual-entry-name-input"
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Enter your venture name"
            className={`w-full px-4 py-3 rounded-lg border transition-all duration-200 min-h-[48px]
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder-gray-500 dark:placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              ${errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'error-venture-name' : undefined}
          />
          {errors.name && (
            <p id="error-venture-name" data-testid="error-venture-name" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
              {errors.name}
            </p>
          )}
        </div>

        {/* Problem Statement */}
        <div>
          <label
            htmlFor="problem-statement"
            className="block mb-2 font-medium text-gray-700 dark:text-gray-300"
          >
            Problem Statement <span className="text-red-500">*</span>
          </label>
          <textarea
            id="problem-statement"
            data-testid="manual-entry-problem-input"
            value={formData.problem}
            onChange={(e) => handleChange('problem', e.target.value)}
            placeholder="What problem does your venture solve?"
            rows={4}
            className={`w-full px-4 py-3 rounded-lg border transition-all duration-200
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder-gray-500 dark:placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              ${errors.problem ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            aria-invalid={!!errors.problem}
            aria-describedby={errors.problem ? 'error-problem-statement' : 'problem-char-count'}
          />
          <div className="flex justify-between mt-1">
            {errors.problem ? (
              <p id="error-problem-statement" data-testid="error-problem-statement" className="text-sm text-red-600 dark:text-red-400" role="alert">
                {errors.problem}
              </p>
            ) : <span />}
            <span data-testid="problem-char-count" className="text-sm text-gray-500 dark:text-gray-400">
              {formData.problem.length}
            </span>
          </div>
        </div>

        {/* Solution Description */}
        <div>
          <label
            htmlFor="solution-description"
            className="block mb-2 font-medium text-gray-700 dark:text-gray-300"
          >
            Solution Description <span className="text-red-500">*</span>
          </label>
          <textarea
            id="solution-description"
            data-testid="manual-entry-solution-input"
            value={formData.solution}
            onChange={(e) => handleChange('solution', e.target.value)}
            placeholder="How does your venture solve this problem?"
            rows={4}
            className={`w-full px-4 py-3 rounded-lg border transition-all duration-200
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder-gray-500 dark:placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              ${errors.solution ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            aria-invalid={!!errors.solution}
            aria-describedby={errors.solution ? 'error-solution-description' : 'solution-char-count'}
          />
          <div className="flex justify-between mt-1">
            {errors.solution ? (
              <p id="error-solution-description" data-testid="error-solution-description" className="text-sm text-red-600 dark:text-red-400" role="alert">
                {errors.solution}
              </p>
            ) : <span />}
            <span data-testid="solution-char-count" className="text-sm text-gray-500 dark:text-gray-400">
              {formData.solution.length}
            </span>
          </div>
        </div>

        {/* Target Market */}
        <div>
          <label
            htmlFor="target-market"
            className="block mb-2 font-medium text-gray-700 dark:text-gray-300"
          >
            Target Market <span className="text-red-500">*</span>
          </label>
          <input
            id="target-market"
            data-testid="manual-entry-market-input"
            type="text"
            value={formData.market}
            onChange={(e) => handleChange('market', e.target.value)}
            placeholder="Who is your target customer?"
            className={`w-full px-4 py-3 rounded-lg border transition-all duration-200 min-h-[48px]
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder-gray-500 dark:placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              ${errors.market ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            aria-invalid={!!errors.market}
            aria-describedby={errors.market ? 'error-target-market' : undefined}
          />
          {errors.market && (
            <p id="error-target-market" data-testid="error-target-market" className="mt-1 text-sm text-red-600 dark:text-red-400" role="alert">
              {errors.market}
            </p>
          )}
        </div>

        {/* Submission Error */}
        {submitError && (
          <div data-testid="submission-error-message" className="p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800" role="alert">
            <p className="text-red-700 dark:text-red-300">{submitError}</p>
          </div>
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div data-testid="manual-entry-loading" className="flex items-center justify-center py-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600 dark:text-gray-400">Creating venture...</span>
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-4 pt-4">
          <button
            type="button"
            data-testid="manual-entry-cancel-btn"
            onClick={handleCancel}
            className="px-6 py-3 rounded-lg font-medium min-h-[44px]
              text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700
              hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-testid="manual-entry-submit-btn"
            disabled={isLoading}
            className={`px-8 py-3 rounded-lg font-medium text-white min-h-[44px]
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`}
          >
            {isLoading ? 'Creating...' : 'Create Venture'}
          </button>
        </div>
      </form>

      {/* Unsaved Changes Dialog */}
      {showUnsavedDialog && (
        <div
          data-testid="unsaved-changes-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 id="dialog-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Unsaved Changes
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You have unsaved changes. Are you sure you want to leave?
            </p>
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => setShowUnsavedDialog(false)}
                className="px-4 py-2 rounded-lg font-medium min-h-[44px]
                  text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700
                  hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200"
              >
                Stay
              </button>
              <button
                type="button"
                data-testid="confirm-leave-btn"
                onClick={confirmLeave}
                className="px-4 py-2 rounded-lg font-medium text-white min-h-[44px]
                  bg-red-600 hover:bg-red-700 transition-all duration-200"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManualEntryForm;
