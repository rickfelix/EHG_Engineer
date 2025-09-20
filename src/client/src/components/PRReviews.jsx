import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  GitPullRequest,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  Filter,
  RefreshCw,
  Settings
} from 'lucide-react';
import PRReviewSummary from './pr-reviews/PRReviewSummary';
import ActiveReviews from './pr-reviews/ActiveReviews';
import ReviewHistory from './pr-reviews/ReviewHistory';
import PRMetrics from './pr-reviews/PRMetrics';

function PRReviews({ state, isConnected, refreshData }) {
  const [reviews, setReviews] = useState([]);
  const [metrics, setMetrics] = useState({
    totalToday: 0,
    passRate: 0,
    avgTime: 0,
    falsePositiveRate: 0,
    complianceRate: 0
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const [filterStatus, setFilterStatus] = useState('all');

  // Load PR reviews from API
  useEffect(() => {
    loadPRReviews();
    loadMetrics();
  }, []);

  // Listen for real-time updates from state
  useEffect(() => {
    if (state?.prReviews) {
      if (state.prReviews.reviews) {
        setReviews(state.prReviews.reviews);
      }
      if (state.prReviews.metrics) {
        setMetrics(state.prReviews.metrics);
      }
    }
  }, [state?.prReviews]);

  const loadPRReviews = async () => {
    try {
      const response = await fetch('/api/pr-reviews');
      const data = await response.json();
      setReviews(data || []);
    } catch (error) {
      console.error('Failed to load PR reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const response = await fetch('/api/pr-reviews/metrics');
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([loadPRReviews(), loadMetrics()]);
    setLoading(false);
  };

  // Filter reviews
  const activeReviews = reviews.filter(r => r.status === 'pending');
  const recentReviews = reviews.filter(r => r.status !== 'pending');

  const filteredReviews = filterStatus === 'all'
    ? reviews
    : reviews.filter(r => r.status === filterStatus);

  // Animation variants
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
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center space-x-3">
          <GitPullRequest className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            PR Reviews
          </h1>
          {isConnected && (
            <span className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full dark:bg-green-900 dark:text-green-300">
              Live
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleRefresh}
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <PRReviewSummary
        metrics={metrics}
        activeCount={activeReviews.length}
        totalReviews={reviews.length}
      />

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {['active', 'history', 'metrics'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                py-2 px-1 border-b-2 font-medium text-sm capitalize
                ${activeTab === tab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              {tab === 'active' && `Active (${activeReviews.length})`}
              {tab === 'history' && 'Review History'}
              {tab === 'metrics' && 'Metrics & Trends'}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="min-h-[400px]"
      >
        {activeTab === 'active' && (
          <ActiveReviews
            reviews={activeReviews}
            loading={loading}
          />
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Filter:
              </span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600"
              >
                <option value="all">All Reviews</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="warning">Warnings</option>
              </select>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Showing {filteredReviews.length} reviews
              </span>
            </div>

            <ReviewHistory
              reviews={filteredReviews.filter(r => r.status !== 'pending')}
              loading={loading}
            />
          </div>
        )}

        {activeTab === 'metrics' && (
          <PRMetrics
            metrics={metrics}
            reviews={reviews}
          />
        )}
      </motion.div>

      {/* Status Bar */}
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center space-x-6 text-sm">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600 dark:text-gray-400">
              {metrics.totalToday} reviews today
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-gray-600 dark:text-gray-400">
              {metrics.passRate}% pass rate
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-gray-600 dark:text-gray-400">
              {(metrics.avgTime / 1000).toFixed(1)}s avg time
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {metrics.falsePositiveRate > 15 ? (
            <span className="flex items-center space-x-1 text-sm text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="w-4 h-4" />
              <span>High false positive rate</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 text-sm text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>System healthy</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default PRReviews;