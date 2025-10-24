import React from 'react';
import { Filter, ChevronDown } from 'lucide-react';
import { UAT_SECTIONS } from '../../../config/uat-sections';

export function UATFilters({
  testCases,
  priorityFilter,
  setPriorityFilter,
  statusFilter,
  setStatusFilter,
  sectionFilter,
  setSectionFilter,
  testTypeFilter,
  setTestTypeFilter,
  searchQuery,
  setSearchQuery,
  filtersExpanded,
  setFiltersExpanded,
  clearFilters,
  hasActiveFilters,
  filteredTestCases,
  searchInputId = 'uat-search-input'
}) {
  // Count statistics for filters
  const statusCounts = {
    all: testCases.length,
    PASS: testCases.filter(t => t.status === 'PASS').length,
    FAIL: testCases.filter(t => t.status === 'FAIL').length,
    BLOCKED: testCases.filter(t => t.status === 'BLOCKED').length,
    NA: testCases.filter(t => t.status === 'NA').length,
    not_tested: testCases.filter(t => !t.status).length
  };

  const priorityCounts = {
    all: testCases.length,
    critical: testCases.filter(t => t.priority === 'critical').length,
    high: testCases.filter(t => t.priority === 'high').length,
    medium: testCases.filter(t => t.priority === 'medium').length,
    low: testCases.filter(t => t.priority === 'low').length
  };

  // Helper function to get count for a section based on current filters
  const getSectionCount = (section) => {
    return testCases.filter(test => {
      // Apply all filters except section filter
      if (priorityFilter !== 'all' && test.priority !== priorityFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'not_tested' && test.status) return false;
        if (statusFilter !== 'not_tested' && test.status !== statusFilter) return false;
      }
      if (testTypeFilter !== 'all' && test.test_type !== testTypeFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!test.id.toLowerCase().includes(query) &&
            !test.title.toLowerCase().includes(query) &&
            !(test.section || '').toLowerCase().includes(query)) {
          return false;
        }
      }
      // Check section (case-insensitive)
      if (section === 'all') return true;
      const testSection = (test.section || '').toLowerCase();
      const filterSection = section.toLowerCase();
      return testSection === filterSection;
    }).length;
  };

  // Helper function to get count for test type based on current filters
  const getTestTypeCount = (type) => {
    return testCases.filter(test => {
      // Apply all filters except test type filter
      if (priorityFilter !== 'all' && test.priority !== priorityFilter) return false;
      if (statusFilter !== 'all') {
        if (statusFilter === 'not_tested' && test.status) return false;
        if (statusFilter !== 'not_tested' && test.status !== statusFilter) return false;
      }
      // Section filter (case-insensitive)
      if (sectionFilter !== 'all') {
        const testSection = (test.section || '').toLowerCase();
        const filterSection = sectionFilter.toLowerCase();
        if (testSection !== filterSection) return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!test.id.toLowerCase().includes(query) &&
            !test.title.toLowerCase().includes(query) &&
            !(test.section || '').toLowerCase().includes(query)) {
          return false;
        }
      }
      // Check test type
      if (type === 'all') return true;
      if (type === 'automatic') return test.test_type === 'automatic' || !test.test_type;
      if (type === 'manual') return test.test_type === 'manual';
      return false;
    }).length;
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
      {/* Filter Toggle Header */}
      <button
        onClick={() => setFiltersExpanded(!filtersExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          <span className="font-semibold text-gray-700 dark:text-gray-300">
            Filters
            {hasActiveFilters && (
              <span className="ml-2 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                Active
              </span>
            )}
          </span>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-600 dark:text-gray-400 transition-transform ${filtersExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Collapsible Filter Content */}
      {filtersExpanded && (
        <div className="p-4 pt-0">
          {/* Priority Filters */}
          <div className="mb-3">
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">Priority</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPriorityFilter('all')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  priorityFilter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                All ({priorityCounts.all})
              </button>
              <button
                onClick={() => setPriorityFilter('critical')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  priorityFilter === 'critical'
                    ? 'bg-red-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                Critical ({priorityCounts.critical})
              </button>
              <button
                onClick={() => setPriorityFilter('high')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  priorityFilter === 'high'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                }`}
              >
                High ({priorityCounts.high})
              </button>
              <button
                onClick={() => setPriorityFilter('medium')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  priorityFilter === 'medium'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`}
              >
                Medium ({priorityCounts.medium})
              </button>
            </div>
          </div>

          {/* Status Filters */}
          <div className="mb-3">
            <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">Status</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                All ({statusCounts.all})
              </button>
              <button
                onClick={() => setStatusFilter('PASS')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === 'PASS'
                    ? 'bg-green-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                }`}
              >
                Pass ({statusCounts.PASS})
              </button>
              <button
                onClick={() => setStatusFilter('FAIL')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === 'FAIL'
                    ? 'bg-red-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                Fail ({statusCounts.FAIL})
              </button>
              <button
                onClick={() => setStatusFilter('not_tested')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  statusFilter === 'not_tested'
                    ? 'bg-gray-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                }`}
              >
                Not Tested ({statusCounts.not_tested})
              </button>
              {statusCounts.BLOCKED > 0 && (
                <button
                  onClick={() => setStatusFilter('BLOCKED')}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    statusFilter === 'BLOCKED'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                  }`}
                >
                  Blocked ({statusCounts.BLOCKED})
                </button>
              )}
            </div>
          </div>

          {/* Section and Test Type Filters Row */}
          <div className="mb-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Section Filter */}
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">Section</label>
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All Sections ({getSectionCount('all')})</option>
                {Object.entries(UAT_SECTIONS).map(([category, sections]) => (
                  <optgroup key={category} label={category}>
                    {sections.map(section => {
                      const count = getSectionCount(section.value);
                      return (
                        <option key={section.value} value={section.value}>
                          {section.label} ({count})
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Test Type Filter */}
            <div>
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase mb-2 block">Test Type</label>
              <select
                value={testTypeFilter}
                onChange={(e) => setTestTypeFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All Types ({getTestTypeCount('all')})</option>
                <option value="automatic">
                  Automatic ({getTestTypeCount('automatic')})
                </option>
                <option value="manual">
                  Manual ({getTestTypeCount('manual')})
                </option>
              </select>
            </div>
          </div>

          {/* Search and Clear */}
          <div className="flex gap-2">
            <input
              type="text"
              id={searchInputId}
              aria-label="Search test cases"
              placeholder="Search test ID, title, or section..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-1.5 text-sm bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Filter Summary */}
          {hasActiveFilters && (
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Showing {filteredTestCases.length} of {testCases.length} tests
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default UATFilters;
