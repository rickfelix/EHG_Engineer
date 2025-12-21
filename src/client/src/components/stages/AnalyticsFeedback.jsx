/**
 * AnalyticsFeedback Component - Stage 24
 * Analytics & User Feedback Loop
 *
 * SD: SD-IND-D-STAGES-22-25 (Block D: Infrastructure & Exit)
 * Phase: LAUNCH & LEARN
 */

import React, { useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Users, DollarSign, ChevronRight, ChevronLeft, RefreshCw, MessageSquare, Star, AlertCircle, Save, Loader2 } from 'lucide-react';
import { useStageArtifacts } from '../../hooks/useStageArtifacts';

const AARRR_METRICS = [
  { stage: 'Acquisition', value: '12,450', change: '+24%', trend: 'up', color: 'bg-blue-500' },
  { stage: 'Activation', value: '8,320', change: '+18%', trend: 'up', color: 'bg-green-500' },
  { stage: 'Retention', value: '6,100', change: '+5%', trend: 'up', color: 'bg-purple-500' },
  { stage: 'Revenue', value: '$45.2K', change: '+32%', trend: 'up', color: 'bg-amber-500' },
  { stage: 'Referral', value: '890', change: '-2%', trend: 'down', color: 'bg-red-500' }
];

const USER_FEEDBACK = [
  { id: 1, rating: 5, comment: 'Love the new dashboard! Very intuitive.', user: 'Sarah K.', date: '2h ago' },
  { id: 2, rating: 4, comment: 'Great product, but checkout could be faster.', user: 'Mike T.', date: '5h ago' },
  { id: 3, rating: 5, comment: 'Customer support was incredibly helpful!', user: 'Emma L.', date: '1d ago' },
  { id: 4, rating: 3, comment: 'Mobile app needs some improvements.', user: 'John D.', date: '2d ago' }
];

const KEY_INSIGHTS = [
  { type: 'success', title: 'Checkout conversion up 15%', detail: 'New one-click purchase feature is working' },
  { type: 'warning', title: 'Mobile bounce rate high', detail: '42% of mobile users leave after landing page' },
  { type: 'success', title: 'NPS score: 72', detail: 'Above industry average of 55' },
  { type: 'info', title: 'Peak usage: 2-4 PM EST', detail: 'Consider scaling infrastructure during peak hours' }
];

const DEFAULT_ANALYTICS_DATA = { metrics: AARRR_METRICS, feedback: USER_FEEDBACK, insights: KEY_INSIGHTS };

export default function AnalyticsFeedback({ venture, artifacts = [], onStageComplete, onPrevious }) {
  const {
    data: analyticsData,
    setData: setAnalyticsData,
    loading,
    saving,
    saveArtifact,
    lastSaved
  } = useStageArtifacts(venture?.id, 24, 'analytics_dashboard', DEFAULT_ANALYTICS_DATA);

  const [activeTab, setActiveTab] = useState('metrics');
  const [refreshing, setRefreshing] = useState(false);

  const refreshData = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  };

  const handleSave = async () => {
    await saveArtifact(analyticsData || DEFAULT_ANALYTICS_DATA, 'Analytics Dashboard');
  };

  const handleComplete = async () => {
    await saveArtifact(analyticsData || DEFAULT_ANALYTICS_DATA, 'Analytics Dashboard');
    onStageComplete?.();
  };

  const avgRating = (USER_FEEDBACK.reduce((sum, f) => sum + f.rating, 0) / USER_FEEDBACK.length).toFixed(1);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12">
        <div className="flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          <p className="text-gray-500 dark:text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30">
              <BarChart3 className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Stage 24: Analytics & Feedback</h2>
              <span className="inline-block px-2 py-1 text-xs rounded-full mt-1 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">LAUNCH & LEARN</span>
            </div>
          </div>
          <button
            onClick={refreshData}
            disabled={refreshing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${refreshing ? 'bg-gray-100' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex -mb-px">
          {['metrics', 'feedback', 'insights'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${activeTab === tab ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500'}`}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="p-6">
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-5 gap-4">
              {AARRR_METRICS.map((metric, idx) => (
                <div key={idx} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className={`w-full h-1 ${metric.color} rounded mb-3`} />
                  <div className="text-xs text-gray-500 mb-1">{metric.stage}</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{metric.value}</div>
                  <div className={`flex items-center gap-1 text-sm ${
                    metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {metric.trend === 'up' ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {metric.change}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-red-500" /> User Growth (7 days)
                </h4>
                <div className="h-32 flex items-end gap-1">
                  {[45, 52, 48, 68, 72, 65, 85].map((val, idx) => (
                    <div key={idx} className="flex-1 bg-red-400 rounded-t" style={{ height: `${val}%` }} />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-500" /> Revenue (7 days)
                </h4>
                <div className="h-32 flex items-end gap-1">
                  {[35, 42, 55, 48, 62, 78, 92].map((val, idx) => (
                    <div key={idx} className="flex-1 bg-green-400 rounded-t" style={{ height: `${val}%` }} />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
              <div className="flex items-center gap-3">
                <Star className="w-6 h-6 text-amber-500 fill-amber-500" />
                <div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{avgRating}</div>
                  <div className="text-xs text-gray-500">Average Rating</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className={`w-5 h-5 ${
                    star <= Math.round(avgRating) ? 'text-amber-500 fill-amber-500' : 'text-gray-300'
                  }`} />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {USER_FEEDBACK.map((feedback) => (
                <div key={feedback.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">{feedback.user}</span>
                      <span className="text-xs text-gray-500">{feedback.date}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`w-4 h-4 ${
                          star <= feedback.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'
                        }`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{feedback.comment}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'insights' && (
          <div className="space-y-4">
            {KEY_INSIGHTS.map((insight, idx) => (
              <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                insight.type === 'success' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' :
                insight.type === 'warning' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' :
                'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              }`}>
                <div className="flex items-start gap-3">
                  {insight.type === 'success' && <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />}
                  {insight.type === 'warning' && <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />}
                  {insight.type === 'info' && <BarChart3 className="w-5 h-5 text-blue-600 mt-0.5" />}
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">{insight.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{insight.detail}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Recommended Actions</h4>
              <div className="space-y-2">
                {[
                  'Optimize mobile landing page to reduce bounce rate',
                  'Add referral incentive program to boost word-of-mouth',
                  'Schedule infrastructure scaling for peak hours',
                  'Implement in-app feedback prompts for feature requests'
                ].map((action, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                    {action}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
        <button onClick={onPrevious} className="flex items-center gap-2 px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <ChevronLeft className="w-4 h-4" /> Previous
        </button>
        <div className="flex items-center gap-3">
          {lastSaved && <span className="text-xs text-gray-400">Last saved: {lastSaved.toLocaleTimeString()}</span>}
          <button onClick={handleSave} disabled={saving || loading} className="flex items-center gap-2 px-3 py-2 text-sm border rounded-lg hover:bg-gray-100 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
        <button onClick={handleComplete} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  );
}
