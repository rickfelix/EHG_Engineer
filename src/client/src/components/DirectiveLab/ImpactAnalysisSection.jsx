/**
 * ImpactAnalysisSection Component
 * Displays impact analysis and consistency validation for Step 4
 */

import React from 'react';
import {
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Check
} from 'lucide-react';
import Button from '../ui/Button';
import ImpactAnalysisPanel from '../ImpactAnalysisPanel';

const ImpactAnalysisSection = ({
  impactAnalysis,
  consistencyValidation,
  submission,
  onBack,
  onComplete,
  loading
}) => {
  const hasBlockingIssues = consistencyValidation && !consistencyValidation.passed;

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

      {/* Impact Analysis Panel */}
      <ImpactAnalysisPanel
        impactAnalysis={impactAnalysis}
        consistencyValidation={consistencyValidation}
        submission={submission}
      />

      {/* Blocking Issues Warning */}
      {hasBlockingIssues && (
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

      {/* Navigation Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={onBack}
          variant="ghost"
          icon={ArrowLeft}
        >
          Back
        </Button>

        <Button
          onClick={onComplete}
          disabled={loading || (consistencyValidation && !consistencyValidation.passed)}
          loading={loading}
          variant={hasBlockingIssues ? "secondary" : "success"}
          icon={hasBlockingIssues ? AlertTriangle : Check}
        >
          {hasBlockingIssues ? 'Acknowledge Risks & Continue' : 'Accept Impact Analysis'}
        </Button>
      </div>
    </div>
  );
};

export default ImpactAnalysisSection;
