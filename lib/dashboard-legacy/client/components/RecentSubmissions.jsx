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
  Filter
} from 'lucide-react';

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

  useEffect(() => {
    loadSubmissions();
  }, [showUncombinedOnly, refreshTrigger]);

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

  const handleCombineSelected = () => {
    if (selectedSubmissions.length >= 2) {
      onGroupCreate(selectedSubmissions);
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

  const getStepStatus = (submission) => {
    const step = submission.current_step || 1;
    const complete = submission.validation_complete;
    
    if (complete) return { text: 'Complete', color: 'text-green-600 bg-green-100' };
    if (step >= 6) return { text: 'Final Review', color: 'text-blue-600 bg-blue-100' };
    if (step >= 4) return { text: 'In Progress', color: 'text-yellow-600 bg-yellow-100' };
    return { text: 'Started', color: 'text-gray-600 bg-gray-100' };
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
          <button
            onClick={() => setShowUncombinedOnly(!showUncombinedOnly)}
            className={`p-1.5 rounded transition-colors ${
              showUncombinedOnly 
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
                : 'hover:bg-gray-100 text-gray-600 dark:hover:bg-gray-600 dark:text-gray-400'
            }`}
            title="Show uncombined only"
          >
            <Filter className="w-3 h-3" />
          </button>
          
          {selectedSubmissions.length >= 2 && (
            <button
              onClick={handleCombineSelected}
              className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
            >
              <Users className="w-3 h-3" />
              Combine ({selectedSubmissions.length})
            </button>
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
              const status = getStepStatus(submission);
              const isSelected = selectedSubmissions.includes(submission.id);
              const isActive = selectedSubmissionId === submission.id;
              
              return (
                <div
                  key={submission.id}
                  className={`p-2 mb-1.5 border rounded transition-all cursor-pointer ${
                    isActive 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* Selection Checkbox */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSubmissionCheck(submission.id);
                      }}
                      className="mt-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* Submission Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h5 className="font-medium text-gray-800 dark:text-gray-200 text-sm truncate leading-tight">
                          {submission.submission_title || 'Untitled Submission'}
                        </h5>
                        <span className={`px-1.5 py-0.5 text-xs rounded whitespace-nowrap ${status.color}`}>
                          {status.text}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">
                          {formatDate(submission.created_at)}
                        </span>
                        
                        <button
                          onClick={() => handleViewSubmission(submission)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          View
                        </button>
                      </div>

                      {/* Group indicator */}
                      {submission.group_id && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Users className="w-3 h-3" />
                          Group
                        </div>
                      )}
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