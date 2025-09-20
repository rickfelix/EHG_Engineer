import React from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  Shield
} from 'lucide-react';

function PRReviewSummary({ metrics, activeCount, totalReviews }) {
  const summaryCards = [
    {
      title: 'Active Reviews',
      value: activeCount,
      icon: Activity,
      color: 'blue',
      trend: null
    },
    {
      title: 'Pass Rate',
      value: `${metrics.passRate}%`,
      icon: CheckCircle,
      color: 'green',
      trend: metrics.passRate > 85 ? 'up' : 'down',
      trendValue: metrics.passRate > 85 ? 'Good' : 'Needs Improvement'
    },
    {
      title: 'Avg Review Time',
      value: `${(metrics.avgTime / 1000).toFixed(1)}s`,
      icon: Clock,
      color: 'purple',
      trend: metrics.avgTime < 5000 ? 'up' : 'down',
      trendValue: metrics.avgTime < 5000 ? 'Fast' : 'Slow'
    },
    {
      title: 'False Positive Rate',
      value: `${metrics.falsePositiveRate}%`,
      icon: AlertTriangle,
      color: metrics.falsePositiveRate > 15 ? 'yellow' : 'green',
      trend: metrics.falsePositiveRate < 15 ? 'up' : 'down',
      trendValue: metrics.falsePositiveRate < 15 ? 'On Target' : 'High'
    },
    {
      title: 'Compliance Rate',
      value: `${metrics.complianceRate}%`,
      icon: Shield,
      color: metrics.complianceRate >= 95 ? 'green' : 'yellow',
      trend: metrics.complianceRate >= 95 ? 'up' : 'down',
      trendValue: `${totalReviews} total reviews`
    }
  ];

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {summaryCards.map((card, index) => {
        const Icon = card.icon;
        const colorClasses = {
          blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400',
          green: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400',
          purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400',
          yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400'
        };

        return (
          <motion.div
            key={card.title}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            transition={{ delay: index * 0.05 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`p-2 rounded-lg ${colorClasses[card.color]}`}>
                <Icon className="w-5 h-5" />
              </div>
              {card.trend && (
                <div className="flex items-center space-x-1">
                  {card.trend === 'up' ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {card.value}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {card.title}
              </p>
              {card.trendValue && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {card.trendValue}
                </p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default PRReviewSummary;