/**
 * Enhanced Progress Bar Component
 * Displays multi-step progress with time estimates and clear visual indicators
 * Supports both horizontal (desktop) and vertical (mobile) layouts
 */

import React from 'react';
import { Check, Clock, Lock } from 'lucide-react';

const ProgressBar = ({
  steps = [],
  currentStep = 1,
  orientation = 'horizontal', // 'horizontal' or 'vertical'
  showTimeEstimates = true,
  showStepNumbers = true,
  compact = false,
  onStepClick,
  className = ''
}) => {
  // Calculate overall progress percentage
  const progressPercentage = ((currentStep - 1) / (steps.length - 1)) * 100;

  // Calculate total time estimate
  const totalTimeMinutes = steps.reduce((total, step) => total + (step.timeEstimate || 0), 0);
  const completedTimeMinutes = steps
    .slice(0, currentStep - 1)
    .reduce((total, step) => total + (step.timeEstimate || 0), 0);
  
  const formatTime = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getStepStatus = (stepIndex) => {
    if (stepIndex < currentStep - 1) return 'completed';
    if (stepIndex === currentStep - 1) return 'current';
    if (stepIndex === currentStep) return 'upcoming';
    return 'locked';
  };

  const getStepIcon = (status, stepNumber) => {
    switch (status) {
      case 'completed':
        return <Check className="w-4 h-4" />;
      case 'current':
        return showStepNumbers ? stepNumber : null;
      case 'upcoming':
        return showStepNumbers ? stepNumber : null;
      case 'locked':
        return <Lock className="w-3 h-3" />;
      default:
        return stepNumber;
    }
  };

  const handleStepClick = (index) => {
    const status = getStepStatus(index);
    if (onStepClick && (status === 'completed' || status === 'current')) {
      onStepClick(index + 1);
    }
  };

  const isClickable = (index) => {
    const status = getStepStatus(index);
    return onStepClick && (status === 'completed' || status === 'current');
  };

  if (orientation === 'vertical') {
    return (
      <div className={`${className}`}>
        {/* Overall progress header */}
        {showTimeEstimates && !compact && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Progress</span>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                {Math.round(progressPercentage)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
                role="progressbar"
                aria-valuenow={progressPercentage}
                aria-valuemin="0"
                aria-valuemax="100"
              />
            </div>
            <div className="flex justify-between items-center mt-2 text-xs text-gray-600 dark:text-gray-400">
              <span>{formatTime(completedTimeMinutes)} completed</span>
              <span>{formatTime(totalTimeMinutes - completedTimeMinutes)} remaining</span>
            </div>
          </div>
        )}

        {/* Vertical steps */}
        <div className="relative">
          {steps.map((step, index) => {
            const status = getStepStatus(index);
            const isLast = index === steps.length - 1;
            
            return (
              <div key={index} className="flex items-start mb-8 last:mb-0">
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-600" />
                )}
                
                {/* Step indicator */}
                <button
                  onClick={() => handleStepClick(index)}
                  disabled={!isClickable(index)}
                  className={`
                    relative z-10 flex items-center justify-center
                    w-12 h-12 rounded-full border-2 transition-all
                    ${isClickable(index) ? 'cursor-pointer' : 'cursor-default'}
                    ${status === 'completed' ? 'bg-green-500 border-green-500 text-white' : ''}
                    ${status === 'current' ? 'bg-blue-600 border-blue-600 text-white animate-pulse' : ''}
                    ${status === 'upcoming' ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400' : ''}
                    ${status === 'locked' ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500' : ''}
                  `}
                  aria-label={`Step ${index + 1}: ${step.title} - ${status}`}
                >
                  {getStepIcon(status, index + 1)}
                </button>
                
                {/* Step content */}
                <div className="ml-4 flex-1">
                  <h3 className={`
                    font-medium text-base
                    ${status === 'current' ? 'text-blue-600' : ''}
                    ${status === 'completed' ? 'text-green-600' : ''}
                    ${status === 'locked' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}
                  `}>
                    {step.title}
                  </h3>
                  {step.description && !compact && (
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{step.description}</p>
                  )}
                  {showTimeEstimates && step.timeEstimate && (
                    <div className="mt-2 flex items-center text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatTime(step.timeEstimate)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Horizontal layout (default)
  return (
    <div className={`${className}`}>
      {/* Overall progress header */}
      {showTimeEstimates && !compact && (
        <div className="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Clock className="w-4 h-4 mr-2 text-blue-600" />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Time: <span className="font-medium">{formatTime(completedTimeMinutes)}</span> of{' '}
                <span className="font-medium">{formatTime(totalTimeMinutes)}</span>
              </span>
            </div>
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              {Math.round(progressPercentage)}% Complete
            </span>
          </div>
        </div>
      )}

      {/* Horizontal progress bar */}
      <div className="relative">
        {/* Background line */}
        <div className="absolute top-6 left-0 right-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
        
        {/* Progress line */}
        <div 
          className="absolute top-6 left-0 h-0.5 bg-blue-600 dark:bg-blue-500 transition-all duration-300"
          style={{ width: `${progressPercentage}%` }}
        />
        
        {/* Steps */}
        <div className="relative flex justify-between">
          {steps.map((step, index) => {
            const status = getStepStatus(index);
            
            return (
              <div 
                key={index} 
                className={`flex flex-col items-center ${compact ? 'flex-1' : ''}`}
              >
                {/* Step indicator */}
                <button
                  onClick={() => handleStepClick(index)}
                  disabled={!isClickable(index)}
                  className={`
                    relative z-10 flex items-center justify-center
                    w-12 h-12 rounded-full border-2 transition-all
                    ${isClickable(index) ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                    ${status === 'completed' ? 'bg-green-500 border-green-500 text-white' : ''}
                    ${status === 'current' ? 'bg-blue-600 border-blue-600 text-white animate-pulse' : ''}
                    ${status === 'upcoming' ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400' : ''}
                    ${status === 'locked' ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500' : ''}
                  `}
                  aria-label={`Step ${index + 1}: ${step.title} - ${status}`}
                >
                  {getStepIcon(status, index + 1)}
                </button>
                
                {/* Step label */}
                <div className="mt-3 text-center">
                  <p className={`
                    text-sm font-medium
                    ${status === 'current' ? 'text-blue-600' : ''}
                    ${status === 'completed' ? 'text-green-600' : ''}
                    ${status === 'locked' ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}
                  `}>
                    {step.title}
                  </p>
                  {showTimeEstimates && step.timeEstimate && !compact && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formatTime(step.timeEstimate)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;