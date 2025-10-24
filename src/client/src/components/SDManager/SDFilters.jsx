import React, { useEffect } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Filter, X, Search } from 'lucide-react';

/**
 * SDFilters Component
 * Manages all filter controls for Strategic Directives including:
 * - Search query
 * - Status filter (with multi-select support)
 * - Priority filter (with multi-select support)
 * - Application filter
 * - Category filter
 * - Filter persistence via localStorage
 */
function SDFilters({
  // Search
  searchQuery,
  setSearchQuery,

  // Filters
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  applicationFilter,
  setApplicationFilter,
  categoryFilter,
  setCategoryFilter,

  // UI State
  showMetadataFilters,
  setShowMetadataFilters,

  // Data
  strategicDirectives,
  filteredDirectives,

  // Sizing
  isCompact = false
}) {
  // Save filter preferences to localStorage when they change
  useEffect(() => {
    localStorage.setItem('sd-status-filter', statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    localStorage.setItem('sd-priority-filter', priorityFilter);
  }, [priorityFilter]);

  useEffect(() => {
    localStorage.setItem('sd-application-filter', applicationFilter);
  }, [applicationFilter]);

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery('');
    setPriorityFilter('all');
    setStatusFilter('all');
    setApplicationFilter('all');
    setCategoryFilter('all');
  };

  // Apply filters (close the filter section)
  const applyFilters = () => {
    setShowMetadataFilters(false);
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery || priorityFilter !== 'all' || statusFilter !== 'all' || applicationFilter !== 'all' || categoryFilter !== 'all';

  // Extract unique categories from directives
  const uniqueCategories = [...new Set(strategicDirectives.map(sd => sd.category).filter(Boolean))];

  return (
    <div className="mt-4 space-y-3">
      {/* Search Bar */}
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
        <input
          type="text"
          placeholder="Search by ID, title, or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`w-full ${isCompact ? 'pl-9 pr-3 py-1.5 text-sm' : 'pl-10 pr-4 py-2'} bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200`}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
          </button>
        )}
      </div>

      {/* Collapsible Filters */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
        <button
          onClick={() => setShowMetadataFilters(!showMetadataFilters)}
          className={`flex items-center gap-2 ${isCompact ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-200 w-full justify-between bg-gray-50 dark:bg-gray-800/50 px-3 py-2 rounded-lg`}
        >
          <div className="flex items-center gap-2">
            {showMetadataFilters ?
              <ChevronDown className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} /> :
              <ChevronRight className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            }
            <Filter className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            <span className="font-medium">Filters</span>
          </div>

          <div className="flex items-center">
            <span className={`${isCompact ? 'text-sm' : 'text-sm'} text-blue-600 dark:text-blue-400 font-medium`}>
              {filteredDirectives.length} of {strategicDirectives.length}
              {filteredDirectives.filter(sd => sd.rolled_triage).length > 0 && (
                <span className="ml-1">
                  ({filteredDirectives.filter(sd => sd.rolled_triage === 'High').length}H /
                  {filteredDirectives.filter(sd => sd.rolled_triage === 'Medium').length}M /
                  {filteredDirectives.filter(sd => sd.rolled_triage === 'Low').length}L /
                  {filteredDirectives.filter(sd => sd.rolled_triage === 'Future').length}F)
                </span>
              )}
            </span>
          </div>
        </button>

        {showMetadataFilters && (
          <div className="mt-4 bg-gradient-to-br from-white via-gray-50 to-white dark:from-gray-800 dark:via-gray-750 dark:to-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow-lg transition-all duration-300 animate-in slide-in-from-top-2">
            {/* 2x2 Grid Layout for Filters */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              {/* Status Filter */}
              <div className="group">
                <label className={`block ${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-400`}>
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className={`w-full ${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 shadow-sm hover:shadow-md`}
                >
                  <option value="all">All Statuses</option>
                  <option value="active,draft">Active & Draft (Default)</option>
                  <option value="active">Active Only</option>
                  <option value="draft">Draft Only</option>
                  <option value="deferred">Deferred</option>
                  <option value="on_hold">On Hold</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="archived">Archived/Completed</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div className="group">
                <label className={`block ${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-400`}>
                  Priority
                </label>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className={`w-full ${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 shadow-sm hover:shadow-md`}
                >
                  <option value="all">All Priorities</option>
                  <option value="critical,high">Critical & High (Default)</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>

              {/* Application Filter */}
              <div className="group">
                <label className={`block ${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-400`}>
                  Application
                </label>
                <select
                  value={applicationFilter}
                  onChange={(e) => setApplicationFilter(e.target.value)}
                  className={`w-full ${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 shadow-sm hover:shadow-md`}
                >
                  <option value="all">All Applications</option>
                  <option value="EHG">EHG (Default)</option>
                  <option value="EHG_ENGINEER">EHG Engineer</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="group">
                <label className={`block ${isCompact ? 'text-xs' : 'text-sm'} font-semibold text-gray-700 dark:text-gray-300 mb-2 transition-colors duration-200 group-hover:text-primary-600 dark:group-hover:text-primary-400`}>
                  Category
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className={`w-full ${isCompact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-500 shadow-sm hover:shadow-md`}
                >
                  <option value="all">All Categories</option>
                  {uniqueCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400 flex items-center gap-1`}>
                    <Filter className="w-4 h-4" />
                    Filtering applied
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className={`${isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 flex items-center gap-2 font-medium border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500`}
                  >
                    <X className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                    Clear All
                  </button>
                )}

                <button
                  onClick={applyFilters}
                  className={`${isCompact ? 'px-4 py-1.5 text-xs' : 'px-6 py-2 text-sm'} bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white rounded-lg transition-all duration-200 flex items-center gap-2 font-medium shadow-md hover:shadow-lg transform hover:scale-105`}
                >
                  <ChevronUp className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SDFilters;
