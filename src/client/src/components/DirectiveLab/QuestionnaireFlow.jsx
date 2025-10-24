/**
 * QuestionnaireFlow Component
 * Handles the question/answer workflow for Step 6
 */

import React from 'react';
import {
  HelpCircle,
  CheckCircle,
  ArrowLeft,
  Check
} from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';

const QuestionnaireFlow = ({
  submission,
  questionAnswers,
  onAnswerChange,
  questionsReviewed,
  onQuestionsReviewedChange,
  onBack,
  onComplete,
  loading
}) => {
  // Check if we have questions
  const hasQuestions = submission?.questions && submission.questions.length > 0;
  const isGenerating = submission?.questions === undefined;

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

      {/* Loading State */}
      {isGenerating && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <p className="text-gray-600 dark:text-gray-400">Generating clarifying questions...</p>
          </div>
        </div>
      )}

      {/* Questions Display */}
      {hasQuestions && (
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
                value={questionAnswers?.[`question_${idx}`] || ''}
                onChange={(e) => {
                  onAnswerChange(`question_${idx}`, e.target.value);
                }}
                placeholder="Your answer..."
                rows={2}
                helpText={question.context}
              />
            </div>
          ))}
        </div>
      )}

      {/* No Questions State */}
      {!isGenerating && !hasQuestions && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 mr-2" />
            <p className="text-green-800 dark:text-green-200">No clarifying questions needed - your directive is clear!</p>
          </div>
        </div>
      )}

      {/* Review Confirmation Checkbox */}
      {!isGenerating && (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={questionsReviewed || false}
              onChange={(e) => onQuestionsReviewedChange(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            />
            <div className="text-sm">
              <span className="font-medium text-gray-900 dark:text-white">
                {hasQuestions ?
                  'I have provided complete answers to all questions' :
                  'I confirm no additional questions are needed'
                }
              </span>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {hasQuestions ?
                  `All ${submission.questions.length} clarifying questions have been answered to provide context for implementation.` :
                  'The directive is sufficiently clear and no additional clarification is required.'
                }
              </p>
            </div>
          </label>
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
          disabled={loading || !questionsReviewed}
          loading={loading}
          variant="success"
          icon={Check}
        >
          {hasQuestions ? 'Submit Answers' : 'Continue'}
        </Button>
      </div>
    </div>
  );
};

export default QuestionnaireFlow;
