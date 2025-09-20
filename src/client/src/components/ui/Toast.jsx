/**
 * Toast Notification Component
 * Displays temporary notifications for user feedback
 * Auto-dismisses after specified duration
 */

import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const Toast = ({ 
  message, 
  type = 'info', 
  duration = 5000, 
  onClose,
  position = 'top-right' 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    setTimeout(() => setIsVisible(true), 10);
    
    // Auto-dismiss
    const timer = setTimeout(() => {
      handleClose();
    }, duration);
    
    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, 300);
  };

  const typeConfig = {
    success: {
      icon: CheckCircle,
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
      textColor: 'text-green-800 dark:text-green-200',
      iconColor: 'text-green-600 dark:text-green-400'
    },
    error: {
      icon: AlertCircle,
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      textColor: 'text-red-800 dark:text-red-200',
      iconColor: 'text-red-600 dark:text-red-400'
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      textColor: 'text-yellow-800 dark:text-yellow-200',
      iconColor: 'text-yellow-600 dark:text-yellow-400'
    },
    info: {
      icon: Info,
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
      textColor: 'text-blue-800 dark:text-blue-200',
      iconColor: 'text-blue-600 dark:text-blue-400'
    }
  };

  const config = typeConfig[type] || typeConfig.info;
  const Icon = config.icon;

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-center': 'top-4 left-1/2 transform -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2'
  };

  return (
    <div
      className={`
        fixed z-50 
        ${positionClasses[position]}
        transition-all duration-300 ease-in-out
        ${isVisible && !isLeaving ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}
      `}
    >
      <div
        className={`
          flex items-center gap-3 p-4 rounded-lg shadow-lg
          ${config.bgColor} ${config.borderColor} ${config.textColor}
          border min-w-[300px] max-w-md
        `}
      >
        <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0`} />
        <p className="flex-1 text-sm font-medium">{message}</p>
        <button
          onClick={handleClose}
          className={`${config.iconColor} hover:opacity-70 transition-opacity`}
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Toast Provider/Manager for multiple toasts
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info', duration = 5000) => {
    const id = Date.now();
    const newToast = { id, message, type, duration };
    setToasts(prev => [...prev, newToast]);
    return id;
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Make toast methods available globally
  useEffect(() => {
    window.showToast = addToast;
    return () => {
      delete window.showToast;
    };
  }, []);

  return (
    <>
      {children}
      <div className="fixed inset-0 pointer-events-none z-50">
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            className="pointer-events-auto"
            style={{ 
              position: 'fixed',
              top: `${20 + index * 80}px`,
              right: '20px',
              transition: 'all 0.3s ease-in-out'
            }}
          >
            <Toast
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              onClose={() => removeToast(toast.id)}
              position="none" // We're manually positioning
            />
          </div>
        ))}
      </div>
    </>
  );
};

// Utility hook for using toast
export const useToast = () => {
  const showToast = (message, type = 'info', duration = 5000) => {
    if (window.showToast) {
      return window.showToast(message, type, duration);
    }
    console.warn('Toast provider not found. Make sure ToastProvider is mounted.');
  };

  return {
    success: (message, duration) => showToast(message, 'success', duration),
    error: (message, duration) => showToast(message, 'error', duration),
    warning: (message, duration) => showToast(message, 'warning', duration),
    info: (message, duration) => showToast(message, 'info', duration),
    show: showToast
  };
};

export default Toast;