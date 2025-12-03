/**
 * CompetitorCloneForm Component
 * Form for competitor-based venture creation with AI analysis
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 * User Story: US-003 - Competitor Cloning Path
 */

import React, { useState, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

interface AnalysisResult {
  name: string;
  problem_statement: string;
  solution: string;
  target_market: string;
  differentiation_points?: string[];
  competitor_reference?: string;
}

interface CompetitorCloneFormProps {
  onAnalyze: (url: string) => Promise<AnalysisResult>;
  onCreate: (data: AnalysisResult & { competitor_url: string }) => Promise<void>;
  onBack: () => void;
}

const isValidUrl = (str: string): boolean => {
  try {
    const url = new URL(str.startsWith('http') ? str : `https://${str}`);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const CompetitorCloneForm: React.FC<CompetitorCloneFormProps> = ({
  onAnalyze,
  onCreate,
  onBack,
}) => {
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleUrlChange = useCallback((value: string) => {
    setCompetitorUrl(value);
    if (urlError) setUrlError(null);
  }, [urlError]);

  const handleAnalyze = useCallback(async () => {
    setUrlError(null);
    setAnalysisError(null);

    if (!competitorUrl.trim()) {
      setUrlError('Please enter a company name or URL');
      return;
    }

    if (!isValidUrl(competitorUrl)) {
      setUrlError('Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    setIsAnalyzing(true);
    try {
      const result = await onAnalyze(competitorUrl);
      setAnalysisResult(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Unable to analyze competitor website');
    } finally {
      setIsAnalyzing(false);
    }
  }, [competitorUrl, onAnalyze]);

  const handleRetry = useCallback(() => {
    setAnalysisError(null);
    handleAnalyze();
  }, [handleAnalyze]);

  const handleFieldChange = useCallback((field: keyof AnalysisResult, value: string) => {
    if (analysisResult) {
      setAnalysisResult({ ...analysisResult, [field]: value });
    }
  }, [analysisResult]);

  const handleCreate = useCallback(async () => {
    if (!analysisResult) return;

    setIsCreating(true);
    try {
      await onCreate({
        ...analysisResult,
        competitor_url: competitorUrl,
      });
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Failed to create venture');
    } finally {
      setIsCreating(false);
    }
  }, [analysisResult, competitorUrl, onCreate]);

  return (
    <div
      data-testid="competitor-clone-form"
      className="w-full max-w-2xl mx-auto p-6"
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Clone from Competitor
      </h2>

      {/* URL Input Section */}
      <div className="mb-6">
        <label
          htmlFor="competitor-url"
          className="block mb-2 font-medium text-gray-700 dark:text-gray-300"
        >
          Company Name or URL
        </label>
        <div className="flex gap-3">
          <input
            id="competitor-url"
            data-testid="competitor-url-input"
            type="text"
            value={competitorUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="Enter company URL (e.g., https://stripe.com)"
            disabled={isAnalyzing || !!analysisResult}
            className={`flex-1 px-4 py-3 rounded-lg border transition-all duration-200 min-h-[48px]
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder-gray-500 dark:placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed
              ${urlError ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
            aria-invalid={!!urlError}
            aria-describedby={urlError ? 'error-competitor-url' : undefined}
          />
          <button
            type="button"
            data-testid="analyze-competitor-btn"
            onClick={handleAnalyze}
            disabled={isAnalyzing || !!analysisResult}
            className={`px-6 py-3 rounded-lg font-medium text-white min-h-[48px]
              transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${isAnalyzing || analysisResult
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'}`}
          >
            {isAnalyzing ? (
              <span className="flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing
              </span>
            ) : (
              'Analyze'
            )}
          </button>
        </div>
        {urlError && (
          <p
            id="error-competitor-url"
            data-testid="error-competitor-url"
            className="mt-2 text-sm text-red-600 dark:text-red-400"
            role="alert"
          >
            {urlError}
          </p>
        )}
      </div>

      {/* Loading State */}
      {isAnalyzing && (
        <div data-testid="analysis-loading" className="flex flex-col items-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p
            data-testid="analysis-progress-message"
            className="text-gray-600 dark:text-gray-400"
          >
            Analyzing competitor and generating venture idea...
          </p>
        </div>
      )}

      {/* Error State */}
      {analysisError && !isAnalyzing && (
        <div
          data-testid="analysis-error"
          className="p-6 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 mb-6"
          role="alert"
        >
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-700 dark:text-red-300 font-medium">Analysis Failed</p>
              <p className="text-red-600 dark:text-red-400 text-sm mt-1">{analysisError}</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              data-testid="retry-analysis-btn"
              onClick={handleRetry}
              className="flex items-center px-4 py-2 rounded-lg font-medium min-h-[44px]
                text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30
                hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
            <button
              type="button"
              data-testid="back-to-path-selection-btn"
              onClick={onBack}
              className="flex items-center px-4 py-2 rounded-lg font-medium min-h-[44px]
                text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800
                hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Path Selection
            </button>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResult && !isAnalyzing && (
        <div data-testid="analysis-results" className="space-y-6">
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 mb-6">
            <p className="text-green-700 dark:text-green-300 font-medium">
              Analysis complete! Review and customize your venture idea below.
            </p>
          </div>

          {/* Generated Name */}
          <div>
            <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
              Venture Name
            </label>
            <input
              data-testid="generated-name"
              type="text"
              value={analysisResult.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[48px]"
            />
          </div>

          {/* Generated Problem */}
          <div>
            <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
              Problem Statement
            </label>
            <textarea
              data-testid="generated-problem"
              value={analysisResult.problem_statement}
              onChange={(e) => handleFieldChange('problem_statement', e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Generated Solution */}
          <div>
            <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
              Solution
            </label>
            <textarea
              data-testid="generated-solution"
              value={analysisResult.solution}
              onChange={(e) => handleFieldChange('solution', e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Generated Market */}
          <div>
            <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
              Target Market
            </label>
            <input
              data-testid="generated-market"
              type="text"
              value={analysisResult.target_market}
              onChange={(e) => handleFieldChange('target_market', e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[48px]"
            />
          </div>

          {/* Differentiation Points */}
          {analysisResult.differentiation_points && analysisResult.differentiation_points.length > 0 && (
            <div data-testid="differentiation-points">
              <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
                Key Differentiators
              </label>
              <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                {analysisResult.differentiation_points.map((point, idx) => (
                  <li key={idx}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-3 rounded-lg font-medium min-h-[44px]
                text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700
                hover:bg-gray-300 dark:hover:bg-gray-600 transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="create-cloned-venture-btn"
              onClick={handleCreate}
              disabled={isCreating}
              className={`px-8 py-3 rounded-lg font-medium text-white min-h-[44px]
                transition-all duration-200
                focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
                ${isCreating
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 active:bg-green-800'}`}
            >
              {isCreating ? (
                <span className="flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </span>
              ) : (
                'Create Venture'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Initial State - No analysis yet */}
      {!analysisResult && !isAnalyzing && !analysisError && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="mb-2">Enter a competitor URL above to get started.</p>
          <p className="text-sm">We will analyze the company and generate a differentiated venture idea.</p>
        </div>
      )}
    </div>
  );
};

export default CompetitorCloneForm;
