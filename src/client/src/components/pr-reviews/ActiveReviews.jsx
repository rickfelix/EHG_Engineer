import React from 'react';
import { motion } from 'framer-motion';
import {
  GitPullRequest,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  User,
  GitBranch,
  FileText,
  Shield,
  Zap,
  Database,
  TestTube
} from 'lucide-react';

function ActiveReviews({ reviews, loading }) {
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
        <GitPullRequest className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Active Reviews
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          All PR reviews have been completed or there are no PRs to review.
        </p>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'passed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getSubAgentIcon = (subAgent) => {
    const icons = {
      'security': Shield,
      'performance': Zap,
      'database': Database,
      'testing': TestTube
    };
    const Icon = icons[subAgent] || FileText;
    return <Icon className="w-4 h-4" />;
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.3 }
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-4"
    >
      {reviews.map((review, index) => (
        <motion.div
          key={review.id}
          variants={itemVariants}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              {getStatusIcon(review.status)}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  PR #{review.pr_number}: {review.pr_title}
                </h3>
                <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <span className="flex items-center space-x-1">
                    <GitBranch className="w-3 h-3" />
                    <span>{review.branch}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <User className="w-3 h-3" />
                    <span>{review.author}</span>
                  </span>
                  {review.sd_link && (
                    <span className="text-blue-600 dark:text-blue-400">
                      SD: {review.sd_link}
                    </span>
                  )}
                  {review.prd_link && (
                    <span className="text-purple-600 dark:text-purple-400">
                      PRD: {review.prd_link}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <a
              href={review.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="View on GitHub"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          </div>

          {/* Sub-agent reviews */}
          {review.sub_agent_reviews && review.sub_agent_reviews.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Sub-Agent Reviews
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {review.sub_agent_reviews.map((subReview) => (
                  <div
                    key={subReview.sub_agent}
                    className={`
                      flex items-center space-x-2 px-3 py-2 rounded-md text-sm
                      ${subReview.status === 'passed'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : subReview.status === 'failed'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                      }
                    `}
                  >
                    {getSubAgentIcon(subReview.sub_agent)}
                    <span className="capitalize">{subReview.sub_agent}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review summary */}
          {review.summary && (
            <div className="mb-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {review.summary}
              </p>
            </div>
          )}

          {/* Issues found */}
          {review.issues && review.issues.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-md p-3">
              <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">
                Issues Found ({review.issues.length})
              </h4>
              <ul className="space-y-1">
                {review.issues.slice(0, 3).map((issue, idx) => (
                  <li key={idx} className="text-sm text-yellow-700 dark:text-yellow-400">
                    • {issue}
                  </li>
                ))}
                {review.issues.length > 3 && (
                  <li className="text-sm text-yellow-600 dark:text-yellow-500 italic">
                    ... and {review.issues.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Review metadata */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
              <span>Started: {new Date(review.created_at).toLocaleTimeString()}</span>
              {review.review_time_ms && (
                <span>Duration: {(review.review_time_ms / 1000).toFixed(1)}s</span>
              )}
            </div>

            {review.status === 'pending' && (
              <div className="flex items-center space-x-1 text-xs text-yellow-600 dark:text-yellow-400">
                <Clock className="w-3 h-3 animate-pulse" />
                <span>In Progress</span>
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

export default ActiveReviews;