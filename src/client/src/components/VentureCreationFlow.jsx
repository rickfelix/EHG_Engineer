/**
 * VentureCreationFlow Component
 * Handles the multi-step venture creation flow with path selection
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 * SD-IDEATION-GENESIS-AUDIT: Uses real competitor analysis with Four Buckets
 */

import React, { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import PathSelectorScreen from './ventures/PathSelectorScreen';
import ManualEntryForm from './ventures/ManualEntryForm';
import CompetitorCloneForm from './ventures/CompetitorCloneForm';
import { BlueprintBrowser } from './ventures/blueprints';

function VentureCreationFlow({ onCancel, onVentureCreated }) {
  const [currentStep, setCurrentStep] = useState('path-selection');
  const [selectedPath, setSelectedPath] = useState(null);

  const handlePathSelected = useCallback((path) => {
    setSelectedPath(path);

    // Navigate to the appropriate form based on path
    switch (path) {
      case 'manual-entry':
        setCurrentStep('manual-entry');
        break;
      case 'competitor-clone':
        setCurrentStep('competitor-clone');
        break;
      case 'blueprint-browse':
        setCurrentStep('blueprint-browse');
        break;
      default:
        break;
    }
  }, []);

  const handleBackToPathSelection = useCallback(() => {
    setCurrentStep('path-selection');
    setSelectedPath(null);
  }, []);

  const handleVentureSubmitted = useCallback(async (ventureData) => {
    try {
      const response = await fetch('/api/ventures', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...ventureData,
          origin_type: selectedPath?.replace('-', '_') || 'manual',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create venture');
      }

      const createdVenture = await response.json();
      onVentureCreated(createdVenture);
    } catch (error) {
      console.error('Error creating venture:', error);
      throw error;
    }
  }, [selectedPath, onVentureCreated]);

  // IDEATION-GENESIS-AUDIT: Real competitor analysis with Four Buckets
  const handleCompetitorAnalyze = useCallback(async (url) => {
    const response = await fetch('/api/competitor-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to analyze competitor');
    }

    const data = await response.json();

    // Return the venture suggestion from the analysis
    return {
      name: data.venture.name,
      problem_statement: data.venture.problem_statement,
      solution: data.venture.solution,
      target_market: data.venture.target_market,
      competitor_reference: data.venture.competitor_reference,
    };
  }, []);

  // Handler for creating venture from competitor analysis
  const handleCompetitorCreate = useCallback(async (ventureData) => {
    await handleVentureSubmitted({
      name: ventureData.name,
      problem_statement: ventureData.problem_statement,
      solution: ventureData.solution,
      target_market: ventureData.target_market,
      competitor_ref: ventureData.competitor_url,
    });
  }, [handleVentureSubmitted]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {currentStep === 'path-selection' && 'Create New Venture'}
            {currentStep === 'manual-entry' && 'Manual Idea Entry'}
            {currentStep === 'competitor-clone' && 'Competitor Clone'}
            {currentStep === 'blueprint-browse' && 'Browse Blueprint Ideas'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {currentStep === 'path-selection' && (
            <PathSelectorScreen
              onProceed={handlePathSelected}
              onCancel={onCancel}
            />
          )}

          {currentStep === 'manual-entry' && (
            <ManualEntryForm
              onSubmit={handleVentureSubmitted}
              onBack={handleBackToPathSelection}
              onCancel={onCancel}
            />
          )}

          {currentStep === 'competitor-clone' && (
            <CompetitorCloneForm
              onAnalyze={handleCompetitorAnalyze}
              onCreate={handleCompetitorCreate}
              onBack={handleBackToPathSelection}
            />
          )}

          {currentStep === 'blueprint-browse' && (
            <BlueprintBrowser
              onSelect={handleVentureSubmitted}
              onBack={handleBackToPathSelection}
              onCancel={onCancel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default VentureCreationFlow;
