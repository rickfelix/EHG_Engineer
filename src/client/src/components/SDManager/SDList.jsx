import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FileText,
  ChevronRight,
  CheckSquare,
  Square,
  Target,
  Copy,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Zap,
  Package,
  Edit3,
  X,
  AlertCircle,
  ChevronDown,
  Brain,
  RefreshCw,
  Database
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

/**
 * SDList Component
 * Displays list of Strategic Directives with:
 * - Expand/collapse functionality
 * - Checklist display
 * - Progress bars
 * - Status badges
 * - Priority indicators
 * - Copy ID functionality
 * - AI backlog summaries
 */
function SDList({
  strategicDirectives,
  expandedSD,
  setExpandedSD,
  onUpdateChecklist,
  onSelectSD,
  copiedId,
  setCopiedId,
  currentSD,
  onSetActiveSD,
  onUpdateStatus,
  onUpdatePriority,
  isCompact = false
}) {
  const navigate = useNavigate();

  // State for AI backlog summaries
  const [backlogSummaries, setBacklogSummaries] = useState({});
  const [loadingSummaries, setLoadingSummaries] = useState(new Set());
  const [collapsedBacklogSections, setCollapsedBacklogSections] = useState(new Set());
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(null);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(null);

  // Close priority dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (priorityDropdownOpen && !event.target.closest('.priority-dropdown-container')) {
        setPriorityDropdownOpen(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [priorityDropdownOpen]);

  const toggleExpand = (sdId) => {
    setExpandedSD(expandedSD === sdId ? null : sdId);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const viewDetail = (sd) => {
    if (!sd || !sd.id) {
      console.error('Invalid SD for navigation:', sd);
      return;
    }

    try {
      navigate(`/strategic-directives/${sd.id}`);
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  const handleChecklistToggle = (documentId, itemIndex) => {
    const sd = strategicDirectives.find(d => d.id === documentId);
    if (sd && sd.checklist && sd.checklist[itemIndex]) {
      onUpdateChecklist(documentId, itemIndex, !sd.checklist[itemIndex].checked);
    }
  };

  const getPriorityBorderColor = (priority) => {
    switch(priority?.toLowerCase()) {
      case 'critical': return 'border-l-4 border-l-red-500';
      case 'high': return 'border-l-4 border-l-orange-500';
      case 'medium': return 'border-l-4 border-l-yellow-500';
      case 'low': return 'border-l-4 border-l-gray-400';
      default: return 'border-l-4 border-l-gray-300';
    }
  };

  const getPriorityBadgeColor = (priority) => {
    switch(priority?.toLowerCase()) {
      case 'critical': return 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700';
      case 'high': return 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-700';
      case 'medium': return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-700';
      case 'low': return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600';
      default: return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
    }
  };

  const updatePriority = (sdId, newPriority) => {
    if (onUpdatePriority) {
      onUpdatePriority(sdId, newPriority);
    }
    setPriorityDropdownOpen(null);
  };

  const getProgressBarGradient = (progress) => {
    if (progress === 100) return 'bg-gradient-to-r from-green-400 to-green-600 animate-pulse';
    if (progress >= 76) return 'bg-gradient-to-r from-blue-400 to-blue-600';
    if (progress >= 51) return 'bg-gradient-to-r from-yellow-400 to-yellow-600';
    if (progress >= 26) return 'bg-gradient-to-r from-orange-400 to-orange-600';
    return 'bg-gradient-to-r from-red-400 to-red-600';
  };

  const getStatusBadge = (status) => {
    const lowerStatus = status?.toLowerCase();

    if (lowerStatus === 'archived' || lowerStatus === 'completed' || lowerStatus === 'complete') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 transition-all duration-200 hover:scale-105">
          <Package className="w-3 h-3 mr-1" />
          Archived
        </span>
      );
    } else if (lowerStatus === 'draft') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 transition-all duration-200 hover:scale-105">
          <Edit3 className="w-3 h-3 mr-1" />
          Draft
        </span>
      );
    } else if (lowerStatus === 'on_hold') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 transition-all duration-200 hover:scale-105">
          <AlertCircle className="w-3 h-3 mr-1" />
          On Hold
        </span>
      );
    } else if (lowerStatus === 'cancelled') {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 transition-all duration-200 hover:scale-105">
          <X className="w-3 h-3 mr-1" />
          Cancelled
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 transition-all duration-200 hover:scale-105">
        <Zap className="w-3 h-3 mr-1 animate-pulse" />
        Active
      </span>
    );
  };

  const fetchBacklogSummary = async (sdId, forceRefresh = false) => {
    if (!forceRefresh && backlogSummaries[sdId] && backlogSummaries[sdId].summary) {
      return;
    }

    if (loadingSummaries.has(sdId)) {
      return;
    }

    setLoadingSummaries(prev => new Set(prev).add(sdId));

    try {
      const url = `/api/strategic-directives/${sdId}/backlog-summary${forceRefresh ? '?force_refresh=true' : ''}`;
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setBacklogSummaries(prev => ({
          ...prev,
          [sdId]: {
            ...data,
            timestamp: Date.now()
          }
        }));
      } else {
        console.warn(`Failed to fetch backlog summary for ${sdId}:`, data.error);
        setBacklogSummaries(prev => ({
          ...prev,
          [sdId]: {
            summary: data.fallback || 'Backlog summary unavailable.',
            itemCount: 0,
            cached: false
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching backlog summary:', error);
      setBacklogSummaries(prev => ({
        ...prev,
        [sdId]: {
          summary: 'Unable to load backlog summary.',
          itemCount: 0,
          cached: false
        }
      }));
    } finally {
      setLoadingSummaries(prev => {
        const newSet = new Set(prev);
        newSet.delete(sdId);
        return newSet;
      });
    }
  };

  // Placeholder for story generation - would need to be passed as prop
  const generateStoriesForSD = (sdKey) => {
    console.log('Generate stories for:', sdKey);
  };

  if (strategicDirectives.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
        <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">
          No strategic directives found
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {strategicDirectives.map((sd) => (
        <div
          key={sd.id}
          className={`group bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 ${getPriorityBorderColor(sd.priority)}`}
        >
          <div className={`${isCompact ? 'p-3' : 'p-6'} relative`}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center">
                  <button
                    onClick={() => toggleExpand(sd.id)}
                    className="mr-2 p-1 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-primary-100 dark:hover:bg-primary-900/20 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all duration-200 transform hover:scale-105"
                    aria-label={expandedSD === sd.id ? 'Collapse' : 'Expand'}
                  >
                    <ChevronRight
                      className={`w-4 h-4 transition-transform duration-200 ease-in-out ${
                        expandedSD === sd.id ? 'rotate-90' : ''
                      }`}
                    />
                  </button>
                  <div className="space-y-2">
                    {/* SD ID and sequence rank */}
                    <div className="flex items-center">
                      <span className="inline-flex items-center group">
                        <span className="text-primary-600 dark:text-primary-400 font-mono text-lg font-bold">{sd.id}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(sd.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded ml-2"
                          title="Copy ID"
                        >
                          {copiedId === sd.id ? (
                            <CheckSquare className="w-3 h-3 text-green-500" />
                          ) : (
                            <Copy className="w-3 h-3 text-gray-500" />
                          )}
                        </button>
                      </span>
                    </div>

                    {/* SD Title on separate line */}
                    <h2 className={`${isCompact ? 'text-base' : 'text-xl'} font-semibold text-gray-900 dark:text-white ${isCompact ? 'line-clamp-2' : ''}`}>
                      {sd.title || 'Untitled'}
                    </h2>
                  </div>
                </div>

                {/* Enhanced Progress Bar */}
                <div className={`${isCompact ? 'mt-2' : 'mt-4'}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400 flex items-center`}>
                      Progress
                      {sd.progressTrend && (
                        sd.progressTrend > 0 ?
                          <TrendingUp className="w-3 h-3 ml-1 text-green-500" /> :
                          <TrendingDown className="w-3 h-3 ml-1 text-red-500" />
                      )}
                    </span>
                    <span className={`${isCompact ? 'text-xs' : 'text-sm'} font-semibold flex items-center`}>
                      {sd.progress}%
                      {sd.progress === 100 && <Sparkles className="w-3 h-3 ml-1 text-green-500 animate-pulse" />}
                    </span>
                  </div>
                  <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${isCompact ? 'h-2' : 'h-3'} shadow-inner`}>
                    <div
                      className={`${isCompact ? 'h-2' : 'h-3'} rounded-full transition-all duration-1000 ease-out ${getProgressBarGradient(sd.progress)}`}
                      style={{
                        width: `${sd.progress}%`,
                        boxShadow: sd.progress === 100 ? '0 0 10px rgba(34, 197, 94, 0.5)' : 'none'
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className={`${isCompact ? 'ml-2' : 'ml-4'} flex flex-col items-end ${isCompact ? 'space-y-1' : 'space-y-2'}`}>
                <div className={`flex ${isCompact ? 'space-x-1' : 'space-x-2'}`}>
                  {currentSD === sd.id ? (
                    <button
                      disabled
                      className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-4 py-2'} bg-green-500 text-white rounded flex items-center`}
                    >
                      <Target className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} mr-1`} />
                      {isCompact ? '✓ Working' : '✓ Working On'}
                    </button>
                  ) : (
                    <button
                      onClick={() => onSetActiveSD && onSetActiveSD(sd.id)}
                      className={`${isCompact ? 'px-2 py-1 text-xs' : 'px-4 py-2'} bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg flex items-center`}
                    >
                      <Target className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'} ${isCompact ? '' : 'mr-1'} animate-pulse`} />
                      {isCompact ? 'Work On' : 'Work On This'}
                    </button>
                  )}
                </div>

                {/* Metadata Badges */}
                <div className={`${isCompact ? 'mt-2 gap-1' : 'mt-3 gap-2'} flex flex-wrap items-end justify-end`}>
                  {/* Status badge with edit capability */}
                  <div className="relative inline-block">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusDropdownOpen(statusDropdownOpen === sd.id ? null : sd.id);
                      }}
                      className="group flex items-center gap-1 hover:opacity-80 transition-opacity"
                    >
                      {getStatusBadge(sd.status)}
                      <Edit3 className="w-3 h-3 text-gray-500 dark:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                    </button>

                    {statusDropdownOpen === sd.id && (
                      <div className="absolute left-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                        <div className="py-1">
                          {['active', 'draft', 'on_hold', 'cancelled', 'archived'].map(status => (
                            <button
                              key={status}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onUpdateStatus) {
                                  onUpdateStatus(sd.id, status);
                                }
                                setStatusDropdownOpen(null);
                              }}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between ${
                                sd.status === status ? 'bg-gray-50 dark:bg-gray-700/50 text-primary-600' : 'text-gray-700 dark:text-gray-200'
                              }`}
                            >
                              <span className="capitalize">{status}</span>
                              {sd.status === status && <CheckSquare className="w-3 h-3" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Target Application badge */}
                  {sd.targetApplication && (
                    <span className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
                      {sd.targetApplication.replace('_', ' ')}
                    </span>
                  )}

                  {/* View Backlog */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/backlog?sd=${sd.sd_id || sd.id}`);
                    }}
                    className={`flex items-center ${isCompact ? 'px-2 py-0.5 text-xs' : 'px-2 py-1 text-xs'} transition-all duration-200 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded`}
                    title={`${sd.total_backlog_items || sd.total_items || sd.backlog_count || 0} backlog items`}
                  >
                    <Package className={`${isCompact ? 'w-3 h-3' : 'w-4 h-4'}`} />
                    <span className="ml-1 text-xs">
                      {sd.total_backlog_items || sd.total_items || sd.backlog_count || 0}
                    </span>
                  </button>

                  {/* Priority - Clickable Badge */}
                  {(sd.priority || sd.rolled_triage) && (
                    <div className="relative priority-dropdown-container">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPriorityDropdownOpen(priorityDropdownOpen === sd.id ? null : sd.id);
                        }}
                        className={`${isCompact ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs'} font-medium rounded cursor-pointer transition-all hover:shadow-md ${getPriorityBadgeColor(sd.priority || sd.rolled_triage)}`}
                        title="Click to change priority"
                      >
                        {isCompact ?
                          (sd.priority?.[0]?.toUpperCase() || sd.rolled_triage?.[0]) :
                          `${sd.priority || sd.rolled_triage}`
                        }
                      </button>

                      {/* Priority Dropdown */}
                      {priorityDropdownOpen === sd.id && (
                        <div
                          className="absolute z-[9999] mt-1 left-0 w-32 rounded-md shadow-xl bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 border-2 border-gray-200 dark:border-gray-700"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="py-1">
                            {['critical', 'high', 'medium', 'low'].map((priority) => (
                              <button
                                key={priority}
                                onClick={() => updatePriority(sd.id, priority)}
                                className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                                  (sd.priority || sd.rolled_triage)?.toLowerCase() === priority
                                    ? 'font-bold bg-gray-50 dark:bg-gray-700'
                                    : ''
                                }`}
                              >
                                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                                  priority === 'critical' ? 'bg-red-500' :
                                  priority === 'high' ? 'bg-orange-500' :
                                  priority === 'medium' ? 'bg-yellow-500' :
                                  'bg-gray-400'
                                }`}></span>
                                {priority.charAt(0).toUpperCase() + priority.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Category */}
                  {sd.category && (
                    <span className={`px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded`}>
                      {sd.category}
                    </span>
                  )}
                </div>

                {sd.checklist && sd.checklist.length > 0 && (
                  <div className="text-sm text-gray-600">
                    <span className="flex items-center">
                      <CheckSquare className="w-4 h-4 mr-1" />
                      {sd.checklist.filter(item => item.checked).length}/{sd.checklist.length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* AI-Generated Backlog Summary */}
            {sd.hasBacklogItems && (
              <div className={`${isCompact ? 'mt-3' : 'mt-4'} pt-3 border-t border-gray-200 dark:border-gray-700`}>
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => {
                      setCollapsedBacklogSections(prev => {
                        const next = new Set(prev);
                        if (next.has(sd.id)) {
                          next.delete(sd.id);
                        } else {
                          next.add(sd.id);
                        }
                        return next;
                      });
                    }}
                    className={`${isCompact ? 'text-xs' : 'text-sm'} font-medium text-gray-700 dark:text-gray-300 flex items-center hover:text-purple-600 dark:hover:text-purple-400 transition-colors`}
                  >
                    {collapsedBacklogSections.has(sd.id) ? (
                      <ChevronRight className="w-4 h-4 mr-1" />
                    ) : (
                      <ChevronDown className="w-4 h-4 mr-1" />
                    )}
                    <Brain className="w-4 h-4 mr-1" />
                    Backlog Overview
                  </button>
                  <div className="flex items-center gap-2">
                    {backlogSummaries[sd.id] && !collapsedBacklogSections.has(sd.id) && (
                      <button
                        onClick={() => fetchBacklogSummary(sd.id, true)}
                        disabled={loadingSummaries.has(sd.id)}
                        className={`p-1 text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors ${loadingSummaries.has(sd.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Refresh summary"
                      >
                        <RefreshCw className={`w-4 h-4 ${loadingSummaries.has(sd.id) ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                    <span className={`${isCompact ? 'text-xs' : 'text-sm'} bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 px-2 py-1 rounded-full`}>
                      {sd.backlogItemCount}
                    </span>
                  </div>
                </div>

                {!collapsedBacklogSections.has(sd.id) && (
                  <>
                    {backlogSummaries[sd.id] ? (
                      <div className="space-y-2">
                        <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-700 dark:text-gray-300 leading-relaxed`}>
                          {backlogSummaries[sd.id].summary}
                        </div>
                        {(backlogSummaries[sd.id].generated_at || backlogSummaries[sd.id].from_database) && (
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                              {backlogSummaries[sd.id].from_database && (
                                <>
                                  <Database className="w-3 h-3 mr-1" />
                                  Stored in database
                                </>
                              )}
                              {backlogSummaries[sd.id].generated_at && (
                                <span className="ml-2">
                                  Generated: {new Date(backlogSummaries[sd.id].generated_at).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        <div className={`flex items-center space-x-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
                          <span className="text-red-600 dark:text-red-400">🔥 {sd.h_count} High</span>
                          <span className="text-orange-600 dark:text-orange-400">📋 {sd.m_count} Medium</span>
                          <span className="text-blue-600 dark:text-blue-400">📝 {sd.l_count} Low</span>
                          <span className="text-gray-600 dark:text-gray-400">🔮 {sd.future_count} Future</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {loadingSummaries.has(sd.id) ? (
                          <div className={`${isCompact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-gray-400 flex items-center`}>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-500 mr-2"></div>
                            Generating AI summary...
                          </div>
                        ) : (
                          <button
                            onClick={() => fetchBacklogSummary(sd.id)}
                            className={`inline-flex items-center ${isCompact ? 'text-xs px-2 py-1' : 'text-sm px-3 py-1'} bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-800/30 text-purple-800 dark:text-purple-300 rounded transition-colors`}
                          >
                            <Brain className="w-3 h-3 mr-1" />
                            Generate AI Summary
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Expanded Content */}
            {expandedSD === sd.id && (
              <div className="mt-6 border-t pt-6">
                {/* Consolidated Backlog Summary */}
                {(sd.h_count > 0 || sd.m_count > 0 || sd.l_count > 0 || sd.future_count > 0) && (
                  <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                        <FileText className="w-4 h-4 mr-2 text-blue-600" />
                        Backlog Details
                      </span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        H: {sd.h_count || 0} • M: {sd.m_count || 0} • L: {sd.l_count || 0}
                        {sd.future_count > 0 && ` • Future: ${sd.future_count}`}
                        {sd.must_have_count > 0 && ` • Must-have: ${sd.must_have_count}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Checklist Preview */}
                {sd.checklist && sd.checklist.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3 flex items-center">
                      <Target className="w-5 h-5 mr-2" />
                      Requirements Checklist
                    </h3>
                    <div className="space-y-2">
                      {sd.checklist.slice(0, 5).map((item, index) => (
                        <label
                          key={index}
                          className="flex items-center p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => handleChecklistToggle(sd.id, index)}
                            className="mr-3 w-4 h-4 text-primary-600 rounded"
                          />
                          <span className={`${item.checked ? 'line-through text-gray-500' : ''}`}>
                            {item.text}
                          </span>
                        </label>
                      ))}
                      {sd.checklist && sd.checklist.length > 5 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          +{sd.checklist.length - 5} more items
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Content Preview */}
                <div className="prose dark:prose-invert max-w-none">
                  <h3 className="text-lg font-semibold mb-3">Content Preview</h3>
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded max-h-64 overflow-y-auto">
                    <ReactMarkdown>
                      {sd.content.substring(0, 500) + (sd.content.length > 500 ? '...' : '')}
                    </ReactMarkdown>
                  </div>
                  <span className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                    Full content available in detail view
                  </span>
                </div>
              </div>
            )}

            {/* Consolidated Action Bar */}
            {expandedSD === sd.id && (
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap gap-2 justify-between items-center">
                  {/* Secondary Actions */}
                  <div className="flex flex-wrap gap-2">
                    {/* User Stories Action */}
                    {sd.storyCount > 0 ? (
                      <Link
                        to={`/stories/${sd.sdKey}`}
                        className="inline-flex items-center px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200"
                      >
                        📚 View {sd.storyCount} Stories
                      </Link>
                    ) : (
                      <button
                        onClick={() => generateStoriesForSD(sd.sdKey)}
                        className="inline-flex items-center px-3 py-1.5 text-sm text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-all duration-200"
                      >
                        ✨ Generate Stories
                      </button>
                    )}

                    {/* Checklist Action */}
                    {sd.checklist && sd.checklist.length > 0 && (
                      <button
                        onClick={() => viewDetail(sd)}
                        className="inline-flex items-center px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200"
                      >
                        ✅ View All {sd.checklist.length} Tasks
                      </button>
                    )}

                    {/* Content Action */}
                    <button
                      onClick={() => viewDetail(sd)}
                      className="inline-flex items-center px-3 py-1.5 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all duration-200"
                    >
                      📄 Full Document
                    </button>
                  </div>

                  {/* Tertiary Action */}
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Updated {new Date(sd.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default SDList;
