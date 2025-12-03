/**
 * BlueprintBrowser Component
 * Main container orchestrating blueprint grid and detail panel
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 * User Story: US-004 - Blueprint Browse Path
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import BlueprintGrid, { type Blueprint } from './BlueprintGrid';
import BlueprintDetailPanel from './BlueprintDetailPanel';

interface BlueprintBrowserProps {
  onVentureCreated: (ventureId: string) => void;
  onCancel?: () => void;
}

interface VenturePayload {
  name: string;
  problem: string;
  solution: string;
  market: string;
  blueprintId: string;
}

const BlueprintBrowser: React.FC<BlueprintBrowserProps> = ({
  onVentureCreated,
  onCancel,
}) => {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [marketFilter, setMarketFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch blueprints on mount
  useEffect(() => {
    const fetchBlueprints = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (categoryFilter) params.set('category', categoryFilter);
        if (marketFilter) params.set('market', marketFilter);

        const url = `/api/blueprints${params.toString() ? `?${params}` : ''}`;
        const res = await fetch(url);

        if (!res.ok) {
          throw new Error('Failed to fetch blueprints');
        }

        const data = await res.json();
        setBlueprints(data.blueprints || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setBlueprints([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBlueprints();
  }, [categoryFilter, marketFilter]);

  // Filter blueprints by search query (client-side)
  const filteredBlueprints = useMemo(() => {
    if (!searchQuery.trim()) return blueprints;

    const query = searchQuery.toLowerCase();
    return blueprints.filter(
      (bp) =>
        bp.title.toLowerCase().includes(query) ||
        bp.summary.toLowerCase().includes(query) ||
        bp.problem.toLowerCase().includes(query) ||
        bp.solution.toLowerCase().includes(query)
    );
  }, [blueprints, searchQuery]);

  const handleSelect = useCallback((blueprint: Blueprint) => {
    setSelectedBlueprint(blueprint);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedBlueprint(null);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setCategoryFilter(null);
    setMarketFilter(null);
  }, []);

  const handleCreateVenture = useCallback(
    async (data: VenturePayload) => {
      const res = await fetch('/api/ventures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          problem_statement: data.problem,
          solution: data.solution,
          target_market: data.market,
          origin_type: 'blueprint',
          blueprint_id: data.blueprintId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create venture');
      }

      const venture = await res.json();
      onVentureCreated(venture.id);
    },
    [onVentureCreated]
  );

  return (
    <div data-testid="blueprint-browser" className="w-full max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">
          Browse Blueprint Ideas
        </h1>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg font-medium text-gray-700 dark:text-gray-300
              bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600
              transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Back
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800" role="alert">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className={`${selectedBlueprint ? 'mr-0 sm:mr-96 md:mr-[480px]' : ''} transition-all duration-300`}>
        <BlueprintGrid
          blueprints={filteredBlueprints}
          selectedId={selectedBlueprint?.id || null}
          onSelect={handleSelect}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          categoryFilter={categoryFilter}
          onCategoryFilter={setCategoryFilter}
          marketFilter={marketFilter}
          onMarketFilter={setMarketFilter}
          onClearFilters={handleClearFilters}
          isLoading={isLoading}
        />
      </div>

      {/* Overlay for mobile */}
      {selectedBlueprint && (
        <div
          className="fixed inset-0 bg-black/30 z-30 sm:hidden"
          onClick={handleClosePanel}
          aria-hidden="true"
        />
      )}

      {/* Detail Panel */}
      {selectedBlueprint && (
        <BlueprintDetailPanel
          blueprint={selectedBlueprint}
          onClose={handleClosePanel}
          onCreateVenture={handleCreateVenture}
        />
      )}
    </div>
  );
};

export default BlueprintBrowser;
