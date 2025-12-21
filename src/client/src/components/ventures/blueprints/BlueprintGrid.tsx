/**
 * BlueprintGrid Component
 * Grid display for blueprint cards with filtering
 * Enhanced with AI badge and opportunity box indicators
 *
 * Strategic Directive: SD-STAGE1-ENTRY-UX-001
 * User Story: US-004 - Blueprint Browse Path
 */

import React from 'react';
import { Search, X, Sparkles } from 'lucide-react';

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
  // AI Discovery fields
  source_type?: 'manual' | 'ai_generated' | 'hybrid';
  opportunity_box?: 'green' | 'yellow' | 'red';
  confidence_score?: number;
  chairman_status?: 'pending' | 'approved' | 'rejected';
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

// Get box indicator color classes
const getBoxColorClasses = (box?: string): string => {
  switch (box) {
    case 'green':
      return 'border-l-4 border-l-green-500';
    case 'yellow':
      return 'border-l-4 border-l-yellow-500';
    case 'red':
      return 'border-l-4 border-l-red-500';
    default:
      return '';
  }
};

// Get box label
const getBoxLabel = (box?: string): string => {
  switch (box) {
    case 'green':
      return 'Quick Win';
    case 'yellow':
      return 'Strategic';
    case 'red':
      return 'Defensive';
    default:
      return '';
  }
};

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
            const isAIGenerated = blueprint.source_type === 'ai_generated';
            const boxColorClasses = getBoxColorClasses(blueprint.opportunity_box);

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
                  ${boxColorClasses}
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
                  }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3
                    data-testid="blueprint-card-title"
                    className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 flex-1"
                  >
                    {blueprint.title}
                  </h3>
                  {/* AI Badge */}
                  {isAIGenerated && (
                    <div
                      data-testid="ai-badge"
                      className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30"
                      title={`AI-generated • ${blueprint.confidence_score}% confidence`}
                    >
                      <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                      <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                        {blueprint.confidence_score}%
                      </span>
                    </div>
                  )}
                </div>

                <p
                  data-testid="blueprint-card-summary"
                  className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3"
                >
                  {blueprint.summary}
                </p>

                <div className="flex flex-wrap gap-2">
                  {/* Category Badge */}
                  {blueprint.category && (
                    <span
                      data-testid="blueprint-card-category"
                      className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                    >
                      {blueprint.category}
                    </span>
                  )}

                  {/* Market Badge */}
                  {blueprint.market && (
                    <span
                      data-testid="blueprint-card-market"
                      className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                    >
                      {blueprint.market}
                    </span>
                  )}

                  {/* Opportunity Box Badge */}
                  {blueprint.opportunity_box && (
                    <span
                      data-testid="blueprint-card-box"
                      className={`px-2 py-0.5 text-xs font-medium rounded-full
                        ${blueprint.opportunity_box === 'green'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : blueprint.opportunity_box === 'yellow'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        }`}
                    >
                      {getBoxLabel(blueprint.opportunity_box)}
                    </span>
                  )}

                  {/* Pending Review Badge */}
                  {blueprint.chairman_status === 'pending' && (
                    <span
                      data-testid="blueprint-card-pending"
                      className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
                    >
                      Pending Review
                    </span>
                  )}
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
