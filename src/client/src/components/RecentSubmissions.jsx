/**
 * RecentSubmissions Component
 * Displays list of submissions with selection and grouping capabilities
 * Left/top section of the DirectiveLab dual-layout
 */

import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  Square, 
  Eye, 
  Clock, 
  AlertCircle,
  Users,
  Filter,
  Trash2,
  Link,
  ChevronDown,
  FileText,
  ArrowRight
} from 'lucide-react';

// Import new UI components
import Button from './ui/Button';

const RecentSubmissions = ({ 
  onSubmissionSelect, 
  onGroupCreate, 
  selectedSubmissionId,
  onSelectionChange,
  refreshTrigger = 0
}) => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSubmissions, setSelectedSubmissions] = useState([]);
  const [showUncombinedOnly, setShowUncombinedOnly] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(null);
  const [combineMethodDropdown, setCombineMethodDropdown] = useState(false);

  useEffect(() => {
    loadSubmissions();
  }, [showUncombinedOnly, refreshTrigger]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setGroupDropdownOpen(null);
      setCombineMethodDropdown(false);
    };
    
    if (groupDropdownOpen || combineMethodDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [groupDropdownOpen, combineMethodDropdown]);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (showUncombinedOnly) params.append('uncombined', 'true');
      params.append('since', '30d'); // Last 30 days
      
      const response = await fetch(`/api/sdip/submissions?${params}`);
      if (!response.ok) throw new Error('Failed to load submissions');
      
      const data = await response.json();
      setSubmissions(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmissionCheck = (submissionId) => {
    const newSelection = selectedSubmissions.includes(submissionId)
      ? selectedSubmissions.filter(id => id !== submissionId)
      : [...selectedSubmissions, submissionId];
    
    setSelectedSubmissions(newSelection);
    onSelectionChange?.(newSelection);
  };

  const handleViewSubmission = (submission) => {
    onSubmissionSelect(submission);
  };

  const handleCombineSelected = (method = 'intelligent') => {
    if (selectedSubmissions.length >= 2) {
      onGroupCreate(selectedSubmissions, method);
    }
  };

  const handleDeleteSubmission = async (submissionId) => {
    if (!confirm('Are you sure you want to delete this submission?')) {
      return;
    }

    try {
      const response = await fetch(`/api/sdip/submissions/${submissionId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete submission');
      }
      
      // Remove from local state
      setSubmissions(prev => prev.filter(s => s.id !== submissionId));
      setSelectedSubmissions(prev => prev.filter(id => id !== submissionId));
      
      // Clear selection if this was the selected submission
      if (selectedSubmissionId === submissionId) {
        onSubmissionSelect(null);
      }
    } catch (error) {
      console.error('Error deleting submission:', error);
      alert('Failed to delete submission. Please try again.');
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString();
  };

  // Enhanced helper functions
  const getSubmissionTitle = (submission) => {
    // Extract title from intent_summary or chairman_input
    const title = submission.intent_summary || 
                 submission.chairman_input || 
                 submission.submission_title ||
                 'Untitled Submission';
    
    // Intelligently truncate
    return title.length > 60 ? title.substring(0, 57) + '...' : title;
  };

  const getSubmissionDescription = (submission) => {
    // Extract key points from synthesis or impact analysis
    let description = '';
    
    if (submission.synthesis?.aligned?.length > 0) {
      description = submission.synthesis.aligned[0]?.text || '';
    } else if (submission.impact_analysis?.summary) {
      description = submission.impact_analysis.summary;
    } else if (submission.strat_tac?.rationale) {
      description = submission.strat_tac.rationale;
    }
    
    // Fallback to chairman input excerpt
    if (!description && submission.chairman_input) {
      description = submission.chairman_input.substring(0, 100) + '...';
    }
    
    return description.length > 120 ? description.substring(0, 117) + '...' : description;
  };

  const getPrimaryPage = (submission) => {
    // Extract primary page from impact analysis
    const components = submission.impact_analysis?.affected_components || [];
    
    if (components.length === 0) return null;
    
    // Find the component with highest impact or first one
    const primaryComponent = components.find(c => c.impact_level === 'high') || components[0];
    return primaryComponent?.name || primaryComponent?.component || null;
  };

  const getSubmissionStatus = (submission) => {
    // Enhanced status system: Draft, Ready, Submitted
    const status = submission.status || 'draft';
    const step = submission.current_step || 1;
    const completedSteps = Array.isArray(submission.completed_steps) ? submission.completed_steps : [];
    
    // Priority: explicit status > database indicators > step-based fallback
    // Check both root level and gate_status for submitted state and SD ID
    if (status === 'submitted' || 
        submission.gate_status?.status === 'submitted' || 
        submission.gate_status?.resulting_sd_id || 
        submission.resulting_sd_id) {
      return { text: '🟢 Submitted', color: 'text-green-700 bg-green-100 dark:bg-green-900/20 dark:text-green-300', icon: '✓' };
    }
    
    if (status === 'ready' || completedSteps.includes(7) || (completedSteps.length === 7 && step === 7)) {
      return { text: '🔵 Ready', color: 'text-blue-700 bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300', icon: '→' };
    }
    
    return { text: '🟡 Draft', color: 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300', icon: '✏' };
  };

  const getGroupedSubmissions = (groupId) => {
    return submissions.filter(s => s.group_id === groupId);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-gray-800 dark:text-gray-200 text-sm">Recent Submissions</h3>
          {submissions.length > 0 && (
            <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded">
              {submissions.length}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            onClick={() => setShowUncombinedOnly(!showUncombinedOnly)}
            variant={showUncombinedOnly ? "primary" : "ghost"}
            size="small"
            icon={Filter}
            ariaLabel="Show uncombined only"
          />
          
          {selectedSubmissions.length >= 2 && (
            <div className="relative">
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setCombineMethodDropdown(!combineMethodDropdown);
                }}
                variant="primary"
                size="small"
                icon={Users}
              >
                Combine ({selectedSubmissions.length})
              </Button>
              
              {combineMethodDropdown && (
                <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-20 min-w-56">
                  <div className="p-2">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 px-2">
                      Combination Method:
                    </div>
                    {[
                      { id: 'intelligent', name: '🧠 Intelligent', desc: 'AI-driven optimal combination' },
                      { id: 'chronological', name: '📅 Chronological', desc: 'Preserve timeline order' },
                      { id: 'merge', name: '🔄 Smart Merge', desc: 'Deduplicate and consensus' },
                      { id: 'priority', name: '⭐ Priority-based', desc: 'Highest strategic impact first' },
                      { id: 'latest', name: '🕒 Latest Override', desc: 'Most recent takes precedence' }
                    ].map((method) => (
                      <button
                        key={method.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCombineSelected(method.id);
                          setCombineMethodDropdown(false);
                        }}
                        className="w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex flex-col gap-1"
                      >
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {method.name}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {method.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border-l-4 border-red-400 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <p className="text-red-700 font-medium">Failed to load submissions</p>
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={loadSubmissions}
              className="mt-1 text-red-700 underline text-sm hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Submissions List */}
      <div className="flex-1 overflow-y-auto">
        {submissions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <h4 className="font-medium text-gray-800 mb-2">No submissions yet</h4>
            <p className="text-gray-600 text-sm mb-4">
              Create your first submission to get started with the Directive Lab
            </p>
            <button
              onClick={() => onSubmissionSelect(null)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              New Submission
            </button>
          </div>
        ) : (
          <div className="p-2">
            {submissions.map((submission) => {
              const status = getSubmissionStatus(submission);
              const title = getSubmissionTitle(submission);
              const description = getSubmissionDescription(submission);
              const primaryPage = getPrimaryPage(submission);
              const isSelected = selectedSubmissions.includes(submission.id);
              const isActive = selectedSubmissionId === submission.id;
              const groupedSubmissions = submission.group_id ? getGroupedSubmissions(submission.group_id) : [];
              const isDropdownOpen = groupDropdownOpen === submission.id;
              
              return (
                <div
                  key={submission.id}
                  className={`p-3 mb-2 border rounded-lg transition-all cursor-pointer ${
                    isActive 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-700/50'
                  }`}
                  onClick={() => handleViewSubmission(submission)}
                >
                  <div className="flex items-start gap-3">
                    {/* Selection Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSubmissionCheck(submission.id);
                      }}
                      className="mt-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    {/* Submission Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header with Title and Status */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h5 className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-tight">
                          {title}
                        </h5>
                        <span className={`px-2 py-1 text-xs rounded-full whitespace-nowrap font-medium ${status.color}`}>
                          {status.text}
                        </span>
                      </div>
                      
                      {/* Description */}
                      {description && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-relaxed">
                          {description}
                        </p>
                      )}
                      
                      {/* Primary Page Affected */}
                      {primaryPage && (
                        <div className="flex items-center gap-1 mb-2">
                          <FileText className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Affects: <span className="font-medium">{primaryPage}</span>
                          </span>
                        </div>
                      )}
                      
                      {/* Footer: Date, Group, Actions */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500 dark:text-gray-400">
                            {formatDate(submission.created_at)}
                          </span>
                          
                          {/* Enhanced Group Navigation */}
                          {submission.group_id && groupedSubmissions.length > 1 && (
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGroupDropdownOpen(isDropdownOpen ? null : submission.id);
                                }}
                                className="flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                              >
                                <Link className="w-3 h-3" />
                                <span className="font-medium">{groupedSubmissions.length} items</span>
                                <ChevronDown className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                              </button>
                              
                              {/* Group Dropdown */}
                              {isDropdownOpen && (
                                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 min-w-48">
                                  <div className="p-2">
                                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 px-2">
                                      Linked Submissions:
                                    </div>
                                    {groupedSubmissions.map((groupSub) => {
                                      const groupStatus = getSubmissionStatus(groupSub);
                                      const groupTitle = getSubmissionTitle(groupSub);
                                      return (
                                        <button
                                          key={groupSub.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewSubmission(groupSub);
                                            setGroupDropdownOpen(null);
                                          }}
                                          className="w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center justify-between gap-2"
                                        >
                                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                                            {groupTitle}
                                          </span>
                                          <div className="flex items-center gap-1">
                                            <span className={`px-1 py-0.5 text-xs rounded ${groupStatus.color}`}>
                                              {groupStatus.icon}
                                            </span>
                                            <ArrowRight className="w-3 h-3 text-gray-400" />
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewSubmission(submission);
                            }}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </button>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSubmission(submission.id);
                            }}
                            className="flex items-center gap-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                            title="Delete submission"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selection Summary */}
      {selectedSubmissions.length > 0 && (
        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-700">
          <div className="flex items-center justify-between text-xs">
            <span className="text-blue-800 dark:text-blue-200 font-medium">
              {selectedSubmissions.length} selected
            </span>
            {selectedSubmissions.length >= 2 && (
              <span className="text-blue-600 dark:text-blue-400">Ready to combine →</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RecentSubmissions;