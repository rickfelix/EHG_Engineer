/**
 * CapabilitiesBrowser - UI for browsing EHG platform capabilities
 * SD: SD-EHG-CAPABILITIES-001
 *
 * Displays CrewAI agents, tools, and crews with search/filter functionality
 */

import React, { useState, useMemo } from 'react';
import { Search, Bot, Wrench, Users, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { useCapabilities } from '../hooks/useCapabilities';

const CAPABILITY_TYPE_CONFIG = {
  agent: {
    label: 'Agents',
    icon: Bot,
    color: 'blue',
    bgClass: 'bg-blue-500/10 dark:bg-blue-500/20',
    textClass: 'text-blue-600 dark:text-blue-400',
    borderClass: 'border-blue-500/30'
  },
  tool: {
    label: 'Tools',
    icon: Wrench,
    color: 'green',
    bgClass: 'bg-green-500/10 dark:bg-green-500/20',
    textClass: 'text-green-600 dark:text-green-400',
    borderClass: 'border-green-500/30'
  },
  crew: {
    label: 'Crews',
    icon: Users,
    color: 'purple',
    bgClass: 'bg-purple-500/10 dark:bg-purple-500/20',
    textClass: 'text-purple-600 dark:text-purple-400',
    borderClass: 'border-purple-500/30'
  }
};

const CapabilityCard = ({ capability }) => {
  const [expanded, setExpanded] = useState(false);
  const config = CAPABILITY_TYPE_CONFIG[capability.capability_type] || CAPABILITY_TYPE_CONFIG.agent;
  const Icon = config.icon;

  return (
    <div
      className={`
        border rounded-lg p-4 transition-all duration-200
        bg-white dark:bg-gray-800
        hover:shadow-md dark:hover:shadow-gray-900/50
        ${config.borderClass}
      `}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${config.bgClass}`}>
          <Icon className={`w-5 h-5 ${config.textClass}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {capability.capability_name}
            </h3>
            <span className={`
              px-2 py-0.5 text-xs rounded-full
              ${config.bgClass} ${config.textClass}
            `}>
              {capability.capability_type}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {capability.description}
          </p>

          {capability.capability_role && capability.capability_role !== 'N/A' && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Role: {capability.capability_role}
            </p>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 mt-2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {expanded ? 'Less' : 'More'}
          </button>

          {expanded && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2 text-xs">
              <div>
                <span className="text-gray-400">Key:</span>
                <code className="ml-2 px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                  {capability.capability_key}
                </code>
              </div>
              {capability.implementation_model && (
                <div>
                  <span className="text-gray-400">Model:</span>
                  <span className="ml-2 text-gray-600 dark:text-gray-300">{capability.implementation_model}</span>
                </div>
              )}
              {capability.implementation_tools?.length > 0 && (
                <div>
                  <span className="text-gray-400">Tools:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {capability.implementation_tools.map((tool, i) => (
                      <span key={i} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-300">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const CapabilitiesBrowser = ({ className = '' }) => {
  const { capabilities, counts, loading, error, refresh, search } = useCapabilities();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const handleSearch = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    search(query);
  };

  const filteredCapabilities = useMemo(() => {
    if (activeFilter === 'all') return capabilities;
    return capabilities.filter(c => c.capability_type === activeFilter);
  }, [capabilities, activeFilter]);

  const totalCount = counts.agent + counts.tool + counts.crew;

  return (
    <div className={`bg-gray-50 dark:bg-gray-900 rounded-xl p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Platform Capabilities
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Browse CrewAI agents, tools, and crews available for Blueprint Generation
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className={`
            p-2 rounded-lg transition-colors
            bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700
            text-gray-600 dark:text-gray-300
            ${loading ? 'animate-spin' : ''}
          `}
          title="Refresh capabilities"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <button
          onClick={() => setActiveFilter('all')}
          className={`
            p-4 rounded-lg text-center transition-all
            ${activeFilter === 'all'
              ? 'bg-gray-200 dark:bg-gray-700 ring-2 ring-gray-400'
              : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
            }
          `}
        >
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalCount}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Total</div>
        </button>
        {Object.entries(CAPABILITY_TYPE_CONFIG).map(([type, config]) => (
          <button
            key={type}
            onClick={() => setActiveFilter(type)}
            className={`
              p-4 rounded-lg text-center transition-all
              ${activeFilter === type
                ? `${config.bgClass} ring-2 ${config.borderClass}`
                : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
              }
            `}
          >
            <div className={`text-2xl font-bold ${config.textClass}`}>
              {counts[type] || 0}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{config.label}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search capabilities by name or description..."
          className="
            w-full pl-10 pr-4 py-3 rounded-lg
            bg-white dark:bg-gray-800
            border border-gray-200 dark:border-gray-700
            text-gray-900 dark:text-gray-100
            placeholder-gray-400
            focus:outline-none focus:ring-2 focus:ring-blue-500/50
          "
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
          Error loading capabilities: {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 mx-auto text-gray-400 animate-spin" />
          <p className="mt-2 text-gray-500 dark:text-gray-400">Loading capabilities...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredCapabilities.length === 0 && (
        <div className="text-center py-12">
          <Bot className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            {searchQuery ? 'No capabilities match your search' : 'No capabilities found'}
          </p>
        </div>
      )}

      {/* Capability grid */}
      {!loading && filteredCapabilities.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCapabilities.map((capability) => (
            <CapabilityCard key={capability.capability_id} capability={capability} />
          ))}
        </div>
      )}
    </div>
  );
};

export default CapabilitiesBrowser;
