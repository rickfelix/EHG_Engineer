import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Calendar,
  Clock,
  User,
  GitBranch,
  FileText
} from 'lucide-react';

function ReviewHistory({ reviews, loading }) {
  const [expandedRows, setExpandedRows] = useState(new Set());

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!reviews || reviews.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Review History
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Review history will appear here once PR reviews are completed.
        </p>
      </div>
    );
  }

  const toggleRow = (id) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const getStatusBadge = (status) => {
    const badges = {
      passed: {
        icon: CheckCircle,
        color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        label: 'Passed'
      },
      failed: {
        icon: XCircle,
        color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
        label: 'Failed'
      },
      warning: {
        icon: AlertTriangle,
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        label: 'Warning'
      }
    };

    const badge = badges[status] || badges.warning;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {badge.label}
      </span>
    );
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (ms) => {
    if (!ms) return 'N/A';
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toFixed(0);
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div className="overflow-hidden bg-white dark:bg-gray-800 shadow-md rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              PR Details
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Author
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Issues
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Links
            </th>
            <th className="relative px-6 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
          {reviews.map((review) => {
            const isExpanded = expandedRows.has(review.id);

            return (
              <React.Fragment key={review.id}>
                <motion.tr
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          PR #{review.pr_number}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">
                          {review.pr_title}
                        </div>
                        <div className="flex items-center space-x-1 mt-1">
                          <GitBranch className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {review.branch}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <User className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm text-gray-900 dark:text-white">
                        {review.author}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(review.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900 dark:text-white">
                      {review.issues?.length || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span>{formatDuration(review.review_time_ms)}</span>
                      </div>
                      <div className="flex items-center space-x-1 mt-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(review.created_at)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col space-y-1">
                      {review.github_url && (
                        <a
                          href={review.github_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                          title="View on GitHub"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <div className="flex items-center space-x-2 text-xs">
                        {review.sd_link && (
                          <span className="text-blue-600 dark:text-blue-400">
                            SD
                          </span>
                        )}
                        {review.prd_link && (
                          <span className="text-purple-600 dark:text-purple-400">
                            PRD
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => toggleRow(review.id)}
                      className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                </motion.tr>

                {/* Expanded details row */}
                {isExpanded && (
                  <tr className="bg-gray-50 dark:bg-gray-900">
                    <td colSpan="7" className="px-6 py-4">
                      <div className="space-y-4">
                        {/* Summary */}
                        {review.summary && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Review Summary
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {review.summary}
                            </p>
                          </div>
                        )}

                        {/* Sub-agent results */}
                        {review.sub_agent_reviews && review.sub_agent_reviews.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Sub-Agent Reviews
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {review.sub_agent_reviews.map((subReview) => (
                                <div
                                  key={subReview.sub_agent}
                                  className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700"
                                >
                                  <span className="text-sm capitalize text-gray-700 dark:text-gray-300">
                                    {subReview.sub_agent}
                                  </span>
                                  {getStatusBadge(subReview.status)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Issues detail */}
                        {review.issues && review.issues.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Issues Found
                            </h4>
                            <ul className="space-y-1">
                              {review.issues.map((issue, idx) => (
                                <li key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                                  • {issue}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Review metadata */}
                        {review.metadata && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">Commit</span>
                              <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
                                {review.commit_sha?.substring(0, 7) || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">Phase</span>
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {review.leo_phase || 'N/A'}
                              </p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">False Positive</span>
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {review.is_false_positive ? 'Yes' : 'No'}
                              </p>
                            </div>
                            <div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">Review ID</span>
                              <p className="text-sm font-mono text-gray-700 dark:text-gray-300">
                                {review.id.substring(0, 8)}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ReviewHistory;