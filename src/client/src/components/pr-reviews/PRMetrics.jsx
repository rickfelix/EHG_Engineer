import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  PieChart,
  Calendar,
  Filter,
  Download,
  Info
} from 'lucide-react';

function PRMetrics({ metrics, reviews }) {
  const [timeRange, setTimeRange] = useState('7d');
  const [selectedMetric, setSelectedMetric] = useState('overview');

  // Calculate time-based metrics
  const timeBasedMetrics = useMemo(() => {
    if (!reviews || reviews.length === 0) return null;

    const now = new Date();
    const ranges = {
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };

    const cutoff = now - ranges[timeRange];
    const filteredReviews = reviews.filter(r => new Date(r.created_at) >= cutoff);

    // Group by day for chart data
    const dailyData = {};
    filteredReviews.forEach(review => {
      const date = new Date(review.created_at).toLocaleDateString();
      if (!dailyData[date]) {
        dailyData[date] = {
          total: 0,
          passed: 0,
          failed: 0,
          warnings: 0
        };
      }
      dailyData[date].total++;
      if (review.status === 'passed') dailyData[date].passed++;
      else if (review.status === 'failed') dailyData[date].failed++;
      else if (review.status === 'warning') dailyData[date].warnings++;
    });

    // Calculate sub-agent performance
    const subAgentStats = {};
    filteredReviews.forEach(review => {
      if (review.sub_agent_reviews) {
        review.sub_agent_reviews.forEach(subReview => {
          if (!subAgentStats[subReview.sub_agent]) {
            subAgentStats[subReview.sub_agent] = {
              total: 0,
              passed: 0,
              failed: 0,
              avgTime: []
            };
          }
          subAgentStats[subReview.sub_agent].total++;
          if (subReview.status === 'passed') {
            subAgentStats[subReview.sub_agent].passed++;
          } else {
            subAgentStats[subReview.sub_agent].failed++;
          }
          if (subReview.review_time_ms) {
            subAgentStats[subReview.sub_agent].avgTime.push(subReview.review_time_ms);
          }
        });
      }
    });

    // Calculate averages
    Object.keys(subAgentStats).forEach(agent => {
      const stats = subAgentStats[agent];
      stats.passRate = ((stats.passed / stats.total) * 100).toFixed(1);
      if (stats.avgTime.length > 0) {
        stats.avgTimeMs = stats.avgTime.reduce((a, b) => a + b, 0) / stats.avgTime.length;
      }
    });

    return {
      dailyData: Object.entries(dailyData).slice(-7),
      subAgentStats,
      totalReviews: filteredReviews.length,
      passRate: filteredReviews.length > 0
        ? ((filteredReviews.filter(r => r.status === 'passed').length / filteredReviews.length) * 100).toFixed(1)
        : 0
    };
  }, [reviews, timeRange]);

  const metricCards = [
    {
      id: 'compliance',
      title: 'Compliance Rate',
      value: `${metrics.complianceRate}%`,
      target: '95%',
      status: metrics.complianceRate >= 95 ? 'good' : 'warning',
      description: 'SD/PRD linkage compliance'
    },
    {
      id: 'false-positive',
      title: 'False Positive Rate',
      value: `${metrics.falsePositiveRate}%`,
      target: '<15%',
      status: metrics.falsePositiveRate <= 15 ? 'good' : 'warning',
      description: 'Reviews marked as false positives'
    },
    {
      id: 'avg-time',
      title: 'Avg Review Time',
      value: `${(metrics.avgTime / 1000).toFixed(1)}s`,
      target: '<5s',
      status: metrics.avgTime < 5000 ? 'good' : 'warning',
      description: 'Average time per review'
    },
    {
      id: 'coverage',
      title: 'Coverage',
      value: `${timeBasedMetrics?.totalReviews || 0}`,
      target: 'PRs',
      status: 'neutral',
      description: `Reviews in ${timeRange}`
    }
  ];

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Performance Metrics
        </h3>
        <div className="flex items-center space-x-2">
          <label htmlFor="time-range-select" className="sr-only">Time Range</label>
          <select id="time-range-select"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-1 text-sm border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button
            className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
            title="Export Metrics"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4"
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {card.title}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {card.value}
                </p>
              </div>
              <div className={`
                p-2 rounded-lg
                ${card.status === 'good' ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400' :
                  card.status === 'warning' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}
              `}>
                {card.status === 'good' ? <TrendingUp className="w-4 h-4" /> :
                 card.status === 'warning' ? <TrendingDown className="w-4 h-4" /> :
                 <Activity className="w-4 h-4" />}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                Target: {card.target}
              </span>
              <span className="text-gray-400 dark:text-gray-500" title={card.description}>
                <Info className="w-3 h-3" />
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Review Trend */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2" />
            Daily Review Trend
          </h4>
          {timeBasedMetrics?.dailyData && timeBasedMetrics.dailyData.length > 0 ? (
            <div className="space-y-3">
              {timeBasedMetrics.dailyData.map(([date, data]) => (
                <div key={date} className="flex items-center space-x-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-20">
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <div className="flex-1 flex items-center space-x-2">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                      <div className="h-full flex">
                        <div
                          className="bg-green-500 transition-all duration-300"
                          style={{ width: `${(data.passed / data.total) * 100}%` }}
                        />
                        <div
                          className="bg-red-500 transition-all duration-300"
                          style={{ width: `${(data.failed / data.total) * 100}%` }}
                        />
                        <div
                          className="bg-yellow-500 transition-all duration-300"
                          style={{ width: `${(data.warnings / data.total) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 w-10">
                      {data.total}
                    </span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-center space-x-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Passed</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Failed</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Warnings</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No data available for selected period
            </div>
          )}
        </div>

        {/* Sub-Agent Performance */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <PieChart className="w-5 h-5 mr-2" />
            Sub-Agent Performance
          </h4>
          {timeBasedMetrics?.subAgentStats && Object.keys(timeBasedMetrics.subAgentStats).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(timeBasedMetrics.subAgentStats).map(([agent, stats]) => (
                <div key={agent} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                      {agent}
                    </span>
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-gray-500 dark:text-gray-400">
                        {stats.total} reviews
                      </span>
                      <span className={`font-medium ${
                        parseFloat(stats.passRate) >= 85 ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'
                      }`}>
                        {stats.passRate}% pass
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        parseFloat(stats.passRate) >= 85 ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                      style={{ width: `${stats.passRate}%` }}
                    />
                  </div>
                  {stats.avgTimeMs && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Avg time: {(stats.avgTimeMs / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No sub-agent data available
            </div>
          )}
        </div>
      </div>

      {/* System Health Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6">
        <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
          System Health Summary
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Overall Status</p>
            <p className={`text-lg font-semibold ${
              metrics.falsePositiveRate <= 15 && metrics.complianceRate >= 95
                ? 'text-green-600 dark:text-green-400'
                : 'text-yellow-600 dark:text-yellow-400'
            }`}>
              {metrics.falsePositiveRate <= 15 && metrics.complianceRate >= 95 ? 'Healthy' : 'Needs Attention'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Today's Reviews</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {metrics.totalToday}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Pass Rate Trend</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
              {timeBasedMetrics?.passRate || metrics.passRate}%
              {timeBasedMetrics?.passRate > metrics.passRate ? (
                <TrendingUp className="w-4 h-4 ml-2 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 ml-2 text-red-500" />
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PRMetrics;