/**
 * BlueprintGrid Component
 * Grid display for blueprint cards with filtering
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 * User Story: US-004 - Blueprint Browse Path
 */

import React from 'react';
import { Search, X } from 'lucide-react';

export interface Blueprint {
  id: string;
  title: string;
  summary: string;
  problem: string;
  solution: string;
  target_market: string;
  category: string;
  market: string;
  differentiation?: string;
}

interface BlueprintGridProps {
  blueprints: Blueprint[];
  selectedId: string | null;
  onSelect: (blueprint: Blueprint) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  categoryFilter: string | null;
  onCategoryFilter: (category: string | null) => void;
  marketFilter: string | null;
  onMarketFilter: (market: string | null) => void;
  onClearFilters: () => void;
  isLoading: boolean;
}

const CATEGORIES = ['fintech', 'healthtech', 'edtech', 'saas', 'ecommerce'];
const MARKETS = ['B2B', 'B2C'];

const BlueprintGrid: React.FC<BlueprintGridProps> = ({
  blueprints,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryFilter,
  marketFilter,
  onMarketFilter,
  onClearFilters,
  isLoading,
}) => {
  const hasFilters = searchQuery || categoryFilter || marketFilter;

  return (
    <div className="flex flex-col h-full">
      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            data-testid="blueprint-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search blueprints..."
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder-gray-500 dark:placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Filter Buttons */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 self-center mr-2">Category:</span>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              data-testid={`filter-category-${cat}`}
              onClick={() => onCategoryFilter(categoryFilter === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${categoryFilter === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400 self-center mr-2">Market:</span>
          {MARKETS.map((mkt) => (
            <button
              key={mkt}
              data-testid={`filter-market-${mkt.toLowerCase()}`}
              onClick={() => onMarketFilter(marketFilter === mkt ? null : mkt)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                ${marketFilter === mkt
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
            >
              {mkt}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div data-testid="blueprint-loading" className="flex-1 flex items-center justify-center">
          <div className="animate-pulse space-y-4 w-full">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && blueprints.length === 0 && (
        <div
          data-testid="blueprint-empty-state"
          className="flex-1 flex flex-col items-center justify-center py-12 text-center"
        >
          <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No blueprints found
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Try a different search term or clear your filters
          </p>
          {hasFilters && (
            <button
              data-testid="clear-filters-btn"
              onClick={onClearFilters}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-blue-600 dark:text-blue-400
                hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
            >
              <X className="w-4 h-4" />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Blueprint Grid */}
      {!isLoading && blueprints.length > 0 && (
        <div
          data-testid="blueprint-grid"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {blueprints.map((blueprint) => {
            const isSelected = selectedId === blueprint.id;
            return (
              <div
                key={blueprint.id}
                data-testid={`blueprint-card-${blueprint.id}`}
                role="button"
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => onSelect(blueprint)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(blueprint);
                  }
                }}
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
                  }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3
                    data-testid="blueprint-card-title"
                    className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2"
                  >
                    {blueprint.title}
                  </h3>
                </div>
                <p
                  data-testid="blueprint-card-summary"
                  className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3"
                >
                  {blueprint.summary}
                </p>
                <div className="flex gap-2">
                  <span
                    data-testid="blueprint-card-category"
                    className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                  >
                    {blueprint.category}
                  </span>
                  <span
                    data-testid="blueprint-card-market"
                    className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  >
                    {blueprint.market}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BlueprintGrid;
