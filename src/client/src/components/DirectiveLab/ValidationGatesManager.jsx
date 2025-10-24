/**
 * ValidationGatesManager Component
 * Handles validation gate state and Step 3 (Classification) & Step 5 (Synthesis)
 */

import React from 'react';
import {
  Edit2,
  RefreshCw,
  ArrowLeft,
  Check,
  CheckCircle,
  AlertTriangle,
  Info
} from 'lucide-react';
import Button from '../ui/Button';
import { PolicyBadgeSet, generatePolicyBadges } from '../ui/PolicyBadge';

/**
 * Step 3: Classification Review
 */
export const ClassificationStep = ({
  submission,
  stratTacOverride,
  onStratTacChange,
  onResetOverride,
  onBack,
  onComplete,
  loading
}) => {
  const strategicPct = stratTacOverride?.strategic_pct ?? submission?.strat_tac?.strategic_pct ?? 50;
  const tacticalPct = stratTacOverride?.tactical_pct ?? submission?.strat_tac?.tactical_pct ?? 50;
  const rationale = stratTacOverride?.rationale || submission?.strat_tac?.rationale;

  const handleSliderChange = (e) => {
    const strategicPct = parseInt(e.target.value);
    const tacticalPct = 100 - strategicPct;

    // Generate new rationale based on adjustment
    let newRationale = '';
    if (strategicPct > 70) {
      newRationale = 'Manually classified as highly strategic - focusing on long-term architecture and business objectives.';
    } else if (strategicPct > 50) {
      newRationale = 'Manually classified as moderately strategic - balancing long-term goals with immediate improvements.';
    } else if (strategicPct > 30) {
      newRationale = 'Manually classified as balanced - containing both strategic elements and tactical improvements.';
    } else {
      newRationale = 'Manually classified as primarily tactical - focusing on immediate fixes and improvements.';
    }

    onStratTacChange({
      strategic_pct: strategicPct,
      tactical_pct: tacticalPct,
      rationale: newRationale,
      manually_adjusted: true,
      adjusted_at: new Date().toISOString()
    });
  };

  return (
    <div className="space-y-3">
      {submission?.strat_tac ? (
        <>
          <div className="p-4 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex justify-around mb-3">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {strategicPct}%
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Strategic</div>
              </div>
              <div className="w-px bg-gray-300 dark:bg-gray-600" />
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {tacticalPct}%
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Tactical</div>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-700 p-3 rounded-lg">
              <p className="font-medium text-gray-700 dark:text-gray-300 mb-1 text-sm">Classification Rationale:</p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {rationale}
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
                value={strategicPct}
                onChange={handleSliderChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:bg-blue-600
                  [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  {tacticalPct}% Tactical
                </span>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {strategicPct}% Strategic
                </span>
              </div>
            </div>

            {/* Reset button */}
            {stratTacOverride && (
              <Button
                onClick={onResetOverride}
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
          onClick={onBack}
          variant="ghost"
          icon={ArrowLeft}
        >
          Back
        </Button>

        <Button
          onClick={onComplete}
          disabled={loading}
          loading={loading}
          variant="success"
          icon={Check}
        >
          {stratTacOverride ? 'Accept Adjusted Classification' : 'Accept Classification'}
        </Button>
      </div>
    </div>
  );
};

/**
 * Step 5: Synthesis Review
 */
export const SynthesisStep = ({
  submission,
  synthesisReviewed,
  onSynthesisReviewedChange,
  onBack,
  onComplete,
  loading
}) => {
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
              onChange={(e) => onSynthesisReviewedChange(e.target.checked)}
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
          onClick={onBack}
          variant="ghost"
          icon={ArrowLeft}
        >
          Back
        </Button>

        <Button
          onClick={onComplete}
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
};

const ValidationGatesManager = {
  ClassificationStep,
  SynthesisStep
};

export default ValidationGatesManager;
