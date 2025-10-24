import React, { useState } from 'react';
import { Bell, Check, X, AlertCircle, Info, CheckCircle, XCircle, Clock, Filter, Settings, Archive } from 'lucide-react';

const NotificationPanel = () => {
  const [notifications, setNotifications] = useState([
    {
      id: 'notif-001',
      type: 'approval_required',
      title: 'SD-006 Requires Approval',
      message: 'Settings Consolidation SD has completed verification and needs your approval',
      timestamp: '2025-01-27T11:30:00Z',
      read: false,
      priority: 'high',
      actionRequired: true,
      actor: 'PLAN Agent',
      target: 'SD-006'
    },
    {
      id: 'notif-002',
      type: 'handoff_created',
      title: 'New Handoff: EXEC → VERIFICATION',
      message: 'SD-PIPELINE-001 implementation complete, handoff created for verification',
      timestamp: '2025-01-27T11:15:00Z',
      read: false,
      priority: 'medium',
      actionRequired: false,
      actor: 'EXEC Agent',
      target: 'SD-PIPELINE-001'
    },
    {
      id: 'notif-003',
      type: 'gate_failed',
      title: 'Quality Gate Failed',
      message: 'Security vulnerabilities detected in SD-044 blocking deployment',
      timestamp: '2025-01-27T10:45:00Z',
      read: true,
      priority: 'high',
      actionRequired: true,
      actor: 'Security Scanner',
      target: 'SD-044'
    },
    {
      id: 'notif-004',
      type: 'sd_completed',
      title: 'SD-021 Completed Successfully',
      message: 'Gap Analysis System has been fully implemented and deployed',
      timestamp: '2025-01-27T10:00:00Z',
      read: true,
      priority: 'low',
      actionRequired: false,
      actor: 'LEO Orchestrator',
      target: 'SD-021'
    },
    {
      id: 'notif-005',
      type: 'prd_updated',
      title: 'PRD Updated',
      message: 'User stories added to SD-036 Strategic Naming PRD',
      timestamp: '2025-01-27T09:30:00Z',
      read: true,
      priority: 'medium',
      actionRequired: false,
      actor: 'Product Team',
      target: 'PRD-SD-036'
    },
    {
      id: 'notif-006',
      type: 'deadline_approaching',
      title: 'Sprint Deadline in 2 Days',
      message: 'SD-016 MVP Launch must be completed by end of sprint',
      timestamp: '2025-01-27T09:00:00Z',
      read: false,
      priority: 'high',
      actionRequired: true,
      actor: 'System',
      target: 'SD-016'
    }
  ]);

  const [filter, setFilter] = useState('all');
  const [showSettings, setShowSettings] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState({
    approval_required: true,
    handoff_created: true,
    gate_failed: true,
    sd_completed: true,
    prd_updated: false,
    deadline_approaching: true
  });

  const getTypeIcon = (type) => {
    switch (type) {
      case 'approval_required':
        return <Clock className="h-4 w-4 text-orange-500" />;
      case 'handoff_created':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'gate_failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'sd_completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'prd_updated':
        return <Info className="h-4 w-4 text-purple-500" />;
      case 'deadline_approaching':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'border-l-4 border-red-500';
      case 'medium':
        return 'border-l-4 border-yellow-500';
      case 'low':
        return 'border-l-4 border-green-500';
      default:
        return 'border-l-4 border-gray-300';
    }
  };

  const markAsRead = (notifId) => {
    setNotifications(notifications.map(n =>
      n.id === notifId ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const dismissNotification = (notifId) => {
    setNotifications(notifications.filter(n => n.id !== notifId));
  };

  const archiveRead = () => {
    setNotifications(notifications.filter(n => !n.read));
  };

  const handleKeyDown = (event, callback) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  };

  const filteredNotifications = filter === 'all'
    ? notifications
    : filter === 'unread'
    ? notifications.filter(n => !n.read)
    : filter === 'action'
    ? notifications.filter(n => n.actionRequired)
    : notifications.filter(n => n.priority === filter);

  const unreadCount = notifications.filter(n => !n.read).length;
  const actionCount = notifications.filter(n => n.actionRequired && !n.read).length;

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2 flex items-center justify-between">
          <span className="flex items-center">
            <Bell className="h-6 w-6 mr-2 text-orange-600" />
            Governance Notifications
          </span>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="px-2 py-1 bg-red-500 text-white text-xs rounded-full">
                {unreadCount} new
              </span>
            )}
            {actionCount > 0 && (
              <span className="px-2 py-1 bg-orange-500 text-white text-xs rounded-full">
                {actionCount} actions
              </span>
            )}
          </div>
        </h2>
        <p className="text-gray-600">Real-time notifications for governance events and actions</p>
        <div className="mt-2">
          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            SD-GOVERNANCE-UI-001
          </span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'unread' ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            Unread ({unreadCount})
          </button>
          <button
            onClick={() => setFilter('action')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'action' ? 'bg-gray-800 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            Actions ({actionCount})
          </button>
          <button
            onClick={() => setFilter('high')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'high' ? 'bg-red-600 text-white' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            High Priority
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={markAllAsRead}
            className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
          >
            Mark all read
          </button>
          <button
            onClick={archiveRead}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 flex items-center"
          >
            <Archive className="h-3 w-3 mr-1" />
            Archive read
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="Toggle notification settings"
          >
            <Settings className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-3">Notification Preferences</h3>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(notificationPreferences).map(([key, value]) => {
              const prefId = `notif-pref-${key}`;
              return (
                <label key={key} htmlFor={prefId} className="flex items-center text-sm cursor-pointer">
                  <input
                    id={prefId}
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setNotificationPreferences({
                      ...notificationPreferences,
                      [key]: e.target.checked
                    })}
                    className="mr-2"
                  />
                  <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Notifications List */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Bell className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No notifications to display</p>
          </div>
        ) : (
          filteredNotifications.map(notification => (
            <div
              key={notification.id}
              className={`p-4 rounded-lg transition-all ${
                notification.read ? 'bg-gray-50' : 'bg-blue-50'
              } ${getPriorityColor(notification.priority)} hover:shadow-md`}
              onClick={() => markAsRead(notification.id)}
              onKeyDown={(e) => handleKeyDown(e, () => markAsRead(notification.id))}
              tabIndex="0"
              role="button"
              aria-label={`Mark notification as read: ${notification.title}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start flex-1">
                  <div className="mr-3 mt-0.5">
                    {getTypeIcon(notification.type)}
                  </div>
                  <div className="flex-1">
                    <h4 className={`font-semibold text-sm ${notification.read ? 'text-gray-700' : 'text-gray-900'}`}>
                      {notification.title}
                      {notification.actionRequired && (
                        <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                          Action Required
                        </span>
                      )}
                    </h4>
                    <p className={`text-sm mt-1 ${notification.read ? 'text-gray-500' : 'text-gray-700'}`}>
                      {notification.message}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span>{notification.actor}</span>
                      <span>•</span>
                      <span className="font-mono">{notification.target}</span>
                      <span>•</span>
                      <span>{formatTimestamp(notification.timestamp)}</span>
                    </div>

                    {/* Action Buttons */}
                    {notification.actionRequired && !notification.read && (
                      <div className="mt-3 flex gap-2">
                        {notification.type === 'approval_required' && (
                          <>
                            <button className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700">
                              Approve
                            </button>
                            <button className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700">
                              Reject
                            </button>
                          </>
                        )}
                        {notification.type === 'gate_failed' && (
                          <button className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
                            View Details
                          </button>
                        )}
                        {notification.type === 'deadline_approaching' && (
                          <button className="px-3 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700">
                            View Sprint
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissNotification(notification.id);
                  }}
                  className="ml-2 p-1 hover:bg-gray-200 rounded"
                  aria-label={`Dismiss notification: ${notification.title}`}
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-gray-500">
        <span>Last updated: Just now</span>
        <button className="text-blue-600 hover:text-blue-800">
          View all notifications →
        </button>
      </div>
    </div>
  );
};

export default NotificationPanel;
