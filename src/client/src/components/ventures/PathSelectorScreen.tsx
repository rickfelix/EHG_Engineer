/**
 * PathSelectorScreen Component
 * Entry screen for venture creation with 3 path options
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 * User Story: US-001 - Path Selection Screen
 */

import React, { useState, useCallback } from 'react';
import { PenLine, Copy, Lightbulb } from 'lucide-react';

export type PathType = 'manual-entry' | 'competitor-clone' | 'blueprint-browse' | null;

interface PathOption {
  id: PathType;
  testIdSuffix: string;
  icon: React.ReactNode;
  iconTestId: string;
  title: string;
  titleTestId: string;
  description: string;
  descTestId: string;
}

interface PathSelectorScreenProps {
  onProceed: (path: PathType) => void;
  onCancel?: () => void;
}

const pathOptions: PathOption[] = [
  {
    id: 'manual-entry',
    testIdSuffix: 'manual-entry',
    icon: <PenLine className="w-8 h-8" />,
    iconTestId: 'path-icon-manual',
    title: 'Manual Idea Entry',
    titleTestId: 'path-title-manual',
    description: 'Describe your venture idea in your own words with full creative freedom.',
    descTestId: 'path-description-manual',
  },
  {
    id: 'competitor-clone',
    testIdSuffix: 'competitor-clone',
    icon: <Copy className="w-8 h-8" />,
    iconTestId: 'path-icon-clone',
    title: 'Competitor Clone',
    titleTestId: 'path-title-clone',
    description: 'Analyze an existing company and generate a differentiated venture idea.',
    descTestId: 'path-description-clone',
  },
  {
    id: 'blueprint-browse',
    testIdSuffix: 'blueprint-browse',
    icon: <Lightbulb className="w-8 h-8" />,
    iconTestId: 'path-icon-blueprint',
    title: 'Browse Blueprint Ideas',
    titleTestId: 'path-title-blueprint',
    description: 'Explore pre-built venture templates and customize them to your needs.',
    descTestId: 'path-description-blueprint',
  },
];

const PathSelectorScreen: React.FC<PathSelectorScreenProps> = ({ onProceed, onCancel }) => {
  const [selectedPath, setSelectedPath] = useState<PathType>(null);

  const handlePathSelect = useCallback((pathId: PathType) => {
    setSelectedPath(pathId);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, pathId: PathType) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedPath(pathId);
    }
  }, []);

  const handleProceed = useCallback(() => {
    if (selectedPath) {
      onProceed(selectedPath);
    }
  }, [selectedPath, onProceed]);

  return (
    <div
      data-testid="path-selector-screen"
      className="w-full max-w-4xl mx-auto p-6"
    >
      <h1
        data-testid="path-selector-heading"
        className="text-2xl md:text-3xl font-bold text-center text-gray-900 dark:text-gray-100 mb-8"
      >
        How would you like to start your venture?
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {pathOptions.map((option) => {
          const isSelected = selectedPath === option.id;
          return (
            <div
              key={option.id}
              data-testid={`path-card-${option.testIdSuffix}`}
              role="button"
              tabIndex={0}
              aria-selected={isSelected}
              onClick={() => handlePathSelect(option.id)}
              onKeyDown={(e) => handleKeyDown(e, option.id)}
              className={`
                flex flex-col items-center p-6 rounded-lg border-2 cursor-pointer
                transition-all duration-200 min-h-[200px]
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                ${isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-lg'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
                }
              `}
            >
              <div
                data-testid={option.iconTestId}
                className={`mb-4 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}
              >
                {option.icon}
              </div>
              <h2
                data-testid={option.titleTestId}
                className={`text-lg font-semibold text-center mb-2 ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}
              >
                {option.title}
              </h2>
              <p
                data-testid={option.descTestId}
                className="text-sm text-center text-gray-600 dark:text-gray-400"
              >
                {option.description}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex justify-center gap-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 rounded-lg font-medium text-gray-700 dark:text-gray-300
              bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
              transition-all duration-200 min-h-[44px]
              focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        )}
        <button
          data-testid="path-selector-proceed-btn"
          type="button"
          onClick={handleProceed}
          disabled={!selectedPath}
          className={`
            px-8 py-3 rounded-lg font-medium text-white min-h-[44px]
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            ${selectedPath
              ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 cursor-pointer'
              : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed opacity-50'
            }
          `}
        >
          Proceed
        </button>
      </div>
    </div>
  );
};

export default PathSelectorScreen;
