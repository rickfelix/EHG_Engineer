/**
 * BlueprintDetailPanel Component
 * Side panel showing blueprint details and venture creation form
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 * User Story: US-004 - Blueprint Browse Path
 */

import React, { useState, useCallback, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import type { Blueprint } from './BlueprintGrid';

interface FormData {
  name: string;
  problem: string;
  solution: string;
  market: string;
}

interface BlueprintDetailPanelProps {
  blueprint: Blueprint;
  onClose: () => void;
  onCreateVenture: (data: FormData & { blueprintId: string }) => Promise<void>;
}

const BlueprintDetailPanel: React.FC<BlueprintDetailPanelProps> = ({
  blueprint,
  onClose,
  onCreateVenture,
}) => {
  const [isSelected, setIsSelected] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    problem: '',
    solution: '',
    market: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when blueprint changes
  useEffect(() => {
    setIsSelected(false);
    setFormData({
      name: blueprint.title,
      problem: blueprint.problem,
      solution: blueprint.solution,
      market: blueprint.target_market,
    });
    setError(null);
  }, [blueprint]);

  const handleSelect = useCallback(() => {
    setIsSelected(true);
  }, []);

  const handleChange = useCallback((field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleCreate = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      await onCreateVenture({
        ...formData,
        blueprintId: blueprint.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create venture');
    } finally {
      setIsLoading(false);
    }
  }, [formData, blueprint.id, onCreateVenture]);

  return (
    <div
      data-testid="blueprint-detail-panel"
      className="fixed inset-y-0 right-0 w-full sm:w-96 md:w-[480px] bg-white dark:bg-gray-800
        shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col
        transform transition-transform duration-300 ease-out z-40"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
          {blueprint.title}
        </h2>
        <button
          data-testid="close-detail-panel-btn"
          onClick={onClose}
          aria-label="Close panel"
          className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400
            dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!isSelected ? (
          /* Blueprint Details View */
          <>
            <div>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Summary</h3>
              <p className="text-gray-900 dark:text-gray-100">{blueprint.summary}</p>
            </div>

            <div data-testid="blueprint-detail-problem">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Problem</h3>
              <p className="text-gray-900 dark:text-gray-100">{blueprint.problem}</p>
            </div>

            <div data-testid="blueprint-detail-solution">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Solution</h3>
              <p className="text-gray-900 dark:text-gray-100">{blueprint.solution}</p>
            </div>

            <div data-testid="blueprint-detail-market">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Target Market</h3>
              <p className="text-gray-900 dark:text-gray-100">{blueprint.target_market}</p>
            </div>

            {blueprint.differentiation && (
              <div data-testid="blueprint-detail-differentiation">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Differentiation</h3>
                <p className="text-gray-900 dark:text-gray-100">{blueprint.differentiation}</p>
              </div>
            )}

            <div className="flex gap-2">
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                {blueprint.category}
              </span>
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                {blueprint.market}
              </span>
            </div>
          </>
        ) : (
          /* Venture Creation Form */
          <form data-testid="blueprint-venture-form" className="space-y-4">
            <div>
              <label htmlFor="bp-name" className="block mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Venture Name
              </label>
              <input
                id="bp-name"
                data-testid="blueprint-form-name"
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="bp-problem" className="block mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Problem Statement
              </label>
              <textarea
                id="bp-problem"
                data-testid="blueprint-form-problem"
                value={formData.problem}
                onChange={(e) => handleChange('problem', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="bp-solution" className="block mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Solution
              </label>
              <textarea
                id="bp-solution"
                data-testid="blueprint-form-solution"
                value={formData.solution}
                onChange={(e) => handleChange('solution', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="bp-market" className="block mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
                Target Market
              </label>
              <input
                id="bp-market"
                data-testid="blueprint-form-market"
                type="text"
                value={formData.market}
                onChange={(e) => handleChange('market', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800" role="alert">
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}
          </form>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        {!isSelected ? (
          <button
            data-testid="select-blueprint-btn"
            onClick={handleSelect}
            className="w-full py-3 px-4 rounded-lg font-medium text-white min-h-[44px]
              bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition-colors
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Select This Blueprint
          </button>
        ) : (
          <button
            data-testid="create-blueprint-venture-btn"
            onClick={handleCreate}
            disabled={isLoading}
            className={`w-full py-3 px-4 rounded-lg font-medium text-white min-h-[44px]
              transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
              }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating...
              </span>
            ) : (
              'Create Venture'
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default BlueprintDetailPanel;
