/**
 * ProgressIndicator Component
 * Compact progress display for 6-step SDIP workflow
 * Shows current step and completion status in minimal space
 */

import React from 'react';
import { Check, Lock } from 'lucide-react';

const ProgressIndicator = ({ currentStep = 1, completedGates = {}, className = '' }) => {
  const steps = [
    { id: 1, name: 'Input', short: '1' },
    { id: 2, name: 'Intent', short: '2' },
    { id: 3, name: 'Classify', short: '3' },
    { id: 4, name: 'Synthesis', short: '4' },
    { id: 5, name: 'Questions', short: '5' },
    { id: 6, name: 'Summary', short: '6' }
  ];

  const getStepStatus = (stepId) => {
    if (completedGates[stepId]) return 'completed';
    if (stepId === currentStep) return 'active';
    if (stepId < currentStep) return 'available';
    return 'locked';
  };

  const getStepStyles = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-600 text-white border-green-600';
      case 'active':
        return 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-200';
      case 'available':
        return 'bg-gray-100 text-gray-600 border-gray-300 hover:border-gray-400';
      case 'locked':
      default:
        return 'bg-gray-50 text-gray-400 border-gray-200';
    }
  };

  const completedCount = Object.values(completedGates).filter(Boolean).length;
  const progressPercentage = (completedCount / 6) * 100;

  return (
    <div className={`bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Compact Header */}
      <div className="px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Step {currentStep} of 6
          </h2>
          <div className="text-xs text-gray-500">
            {completedCount}/6 gates complete
          </div>
        </div>
        
        {/* Compact progress bar */}
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-600 transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-600">
            {Math.round(progressPercentage)}%
          </span>
        </div>
      </div>

      {/* Compact step indicators */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const status = getStepStatus(step.id);
            const isLast = index === steps.length - 1;
            
            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  {/* Step circle */}
                  <div
                    className={`
                      w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium transition-all
                      ${getStepStyles(status)}
                    `}
                    title={`Step ${step.id}: ${step.name}`}
                  >
                    {status === 'completed' ? (
                      <Check className="w-3 h-3" />
                    ) : status === 'locked' ? (
                      <Lock className="w-3 h-3" />
                    ) : (
                      step.short
                    )}
                  </div>
                  
                  {/* Step label */}
                  <span className={`
                    text-xs mt-1 font-medium
                    ${status === 'completed' || status === 'active' 
                      ? 'text-gray-700 dark:text-gray-300' 
                      : 'text-gray-400'
                    }
                  `}>
                    {step.name}
                  </span>
                </div>
                
                {/* Connector line */}
                {!isLast && (
                  <div className={`
                    flex-1 h-px mx-2 mt-3 mb-auto
                    ${completedGates[step.id] ? 'bg-green-600' : 'bg-gray-200'}
                  `} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProgressIndicator;