/**
 * SmartNav Component
 * SD-002: AI Navigation Consolidated
 *
 * Main navigation component with AI-powered predictions and shortcuts
 * Enhanced with WCAG 2.1 AA accessibility features (Sprint 2: Story 8)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import '../styles/accessibility.css';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Command,
  TrendingUp,
  Zap,
  ChevronRight,
  Keyboard,
  Clock,
  Star,
  Navigation,
  Loader,
  AlertCircle,
  Settings,
  Edit
} from 'lucide-react';

const SmartNav = ({ userId, sessionId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [predictions, setPredictions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [shortcuts, setShortcuts] = useState([]);
  const [recentPaths, setRecentPaths] = useState([]);
  const [responseTime, setResponseTime] = useState(null);
  const [shortcutCustomizationOpen, setShortcutCustomizationOpen] = useState(false);
  const [availablePaths, setAvailablePaths] = useState([]);
  const [editingShortcut, setEditingShortcut] = useState(null);

  // Accessibility state
  const [highContrastMode, setHighContrastMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [screenReaderMode, setScreenReaderMode] = useState(false);
  const [focusedElement, setFocusedElement] = useState(null);

  const searchInputRef = useRef(null);
  const commandPaletteRef = useRef(null);

  // Initialize navigation engine
  useEffect(() => {
    loadPredictions();
    loadShortcuts();
    loadRecentPaths();
    loadAvailablePaths();
    setupKeyboardListeners();
    initializeAccessibility();

    return () => {
      removeKeyboardListeners();
    };
  }, [location.pathname]);

  // Initialize accessibility features
  const initializeAccessibility = () => {
    // Check for user preference for high contrast
    const highContrast = localStorage.getItem('highContrastMode') === 'true' ||
                        window.matchMedia('(prefers-contrast: high)').matches;
    setHighContrastMode(highContrast);

    // Check for reduced motion preference
    const reducedMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReducedMotion(reducedMotionPreference);

    // Detect screen reader usage
    const screenReader = localStorage.getItem('screenReaderMode') === 'true' ||
                         navigator.userAgent.includes('NVDA') ||
                         navigator.userAgent.includes('JAWS') ||
                         window.speechSynthesis?.getVoices().length > 0;
    setScreenReaderMode(screenReader);

    // Apply accessibility CSS classes to body
    document.body.classList.toggle('high-contrast', highContrast);
    document.body.classList.toggle('reduced-motion', reducedMotionPreference);
    document.body.classList.toggle('screen-reader', screenReader);
  };

  // Load AI predictions
  const loadPredictions = async () => {
    setIsLoading(true);
    const startTime = performance.now();

    try {
      const response = await fetch('/api/v1/navigation/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId,
          currentPath: location.pathname,
          context: {
            time: new Date().toISOString(),
            previousPath: sessionStorage.getItem('previousPath')
          }
        })
      });

      const data = await response.json();
      const endTime = performance.now();

      setPredictions(data.predictions || []);
      setResponseTime(Math.round(endTime - startTime));
    } catch (error) {
      console.error('Failed to load predictions:', error);
      // Fallback to static predictions
      setPredictions(getStaticPredictions());
    } finally {
      setIsLoading(false);
    }
  };

  // Load user shortcuts (now supports customization)
  const loadShortcuts = async () => {
    try {
      const response = await fetch('/api/v1/navigation/shortcuts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();
      setShortcuts(data.shortcuts || getDefaultShortcuts());
    } catch (error) {
      console.error('Failed to load shortcuts:', error);
      setShortcuts(getDefaultShortcuts());
    }
  };

  // Load available paths for customization
  const loadAvailablePaths = async () => {
    try {
      const response = await fetch('/api/v1/navigation/available-paths', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      setAvailablePaths(data.paths || []);
    } catch (error) {
      console.error('Failed to load available paths:', error);
      setAvailablePaths([]);
    }
  };

  // Load recent navigation paths
  const loadRecentPaths = () => {
    const recent = JSON.parse(localStorage.getItem('recentPaths') || '[]');
    setRecentPaths(recent.slice(0, 5));
  };

  // Keyboard event handlers
  const setupKeyboardListeners = () => {
    document.addEventListener('keydown', handleGlobalKeyDown);
  };

  const removeKeyboardListeners = () => {
    document.removeEventListener('keydown', handleGlobalKeyDown);
  };

  const handleGlobalKeyDown = (e) => {
    // Cmd/Ctrl + K for command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCommandPaletteOpen(true);

      // Announce to screen readers
      if (screenReaderMode) {
        announceToScreenReader('Command palette opened. Type to search or use arrow keys to navigate.');
      }
    }

    // Cmd/Ctrl + 1-9 for quick shortcuts (enhanced range)
    if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const shortcut = shortcuts.find(s => s.shortcut_key === e.key && s.is_enabled);
      if (shortcut) {
        navigateToPath(shortcut.target_path, 'keyboard_shortcut');

        // Announce navigation to screen readers
        if (screenReaderMode) {
          announceToScreenReader(`Navigating to ${shortcut.label}`);
        }
      }
    }

    // Cmd/Ctrl + Shift + K for shortcut customization
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'K') {
      e.preventDefault();
      setShortcutCustomizationOpen(true);

      if (screenReaderMode) {
        announceToScreenReader('Shortcut customization dialog opened');
      }
    }

    // Escape key handling for modals
    if (e.key === 'Escape') {
      if (commandPaletteOpen) {
        setCommandPaletteOpen(false);
        if (screenReaderMode) {
          announceToScreenReader('Command palette closed');
        }
      } else if (shortcutCustomizationOpen) {
        setShortcutCustomizationOpen(false);
        if (screenReaderMode) {
          announceToScreenReader('Shortcut customization closed');
        }
      }
    }
  };

  // Screen reader announcement utility
  const announceToScreenReader = (message) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);

    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  };

  // Navigation handler with telemetry
  const navigateToPath = async (path, source = 'click') => {
    // Record navigation
    await recordNavigation(location.pathname, path, source);

    // Update recent paths
    updateRecentPaths(path);

    // Store previous path
    sessionStorage.setItem('previousPath', location.pathname);

    // Navigate
    navigate(path);
  };

  // Record navigation telemetry
  const recordNavigation = async (from, to, source) => {
    try {
      await fetch('/api/v1/navigation/record', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId,
          sessionId,
          from,
          to,
          source,
          predictionUsed: predictions.some(p => p.path === to),
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Failed to record navigation:', error);
    }
  };

  // Update recent paths in localStorage
  const updateRecentPaths = (path) => {
    const recent = JSON.parse(localStorage.getItem('recentPaths') || '[]');
    const updated = [path, ...recent.filter(p => p !== path)].slice(0, 10);
    localStorage.setItem('recentPaths', JSON.stringify(updated));
  };

  // Get static predictions as fallback
  const getStaticPredictions = () => {
    const staticMap = {
      '/': [
        { path: '/dashboard', confidence: 0.8, reason: 'most_visited' },
        { path: '/strategic-directives', confidence: 0.6, reason: 'recent' },
        { path: '/reports', confidence: 0.4, reason: 'popular' }
      ],
      '/dashboard': [
        { path: '/strategic-directives', confidence: 0.7, reason: 'workflow' },
        { path: '/reports', confidence: 0.5, reason: 'related' },
        { path: '/settings', confidence: 0.3, reason: 'occasional' }
      ]
    };

    return staticMap[location.pathname] || staticMap['/'];
  };

  // Save custom shortcut
  const saveCustomShortcut = async (shortcutKey, targetPath, label, icon) => {
    try {
      const response = await fetch('/api/v1/navigation/shortcuts/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          userId,
          shortcutKey,
          targetPath,
          label,
          icon
        })
      });

      const data = await response.json();
      if (data.success) {
        await loadShortcuts(); // Reload shortcuts
        setEditingShortcut(null);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Failed to save shortcut:', error);
      return { success: false, error: error.message };
    }
  };

  // Reset shortcuts to defaults
  const resetShortcuts = async () => {
    try {
      const response = await fetch('/api/v1/navigation/shortcuts/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();
      if (data.success) {
        await loadShortcuts();
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Failed to reset shortcuts:', error);
      return { success: false, error: error.message };
    }
  };

  // Get default shortcuts
  const getDefaultShortcuts = () => [
    { shortcut_key: '1', label: 'Dashboard', target_path: '/dashboard', icon: 'home', is_enabled: true, display_order: 1, is_custom: false },
    { shortcut_key: '2', label: 'Strategic Directives', target_path: '/strategic-directives', icon: 'target', is_enabled: true, display_order: 2, is_custom: false },
    { shortcut_key: '3', label: 'PRDs', target_path: '/prds', icon: 'file-text', is_enabled: true, display_order: 3, is_custom: false },
    { shortcut_key: '4', label: 'Backlog', target_path: '/backlog', icon: 'list', is_enabled: true, display_order: 4, is_custom: false },
    { shortcut_key: '5', label: 'Stories', target_path: '/stories', icon: 'book', is_enabled: true, display_order: 5, is_custom: false }
  ];

  // Command palette search
  const handleCommandSearch = useCallback((query) => {
    setSearchQuery(query);
    // Implement fuzzy search logic here
  }, []);

  // Render prediction confidence indicator
  const renderConfidenceIndicator = (confidence) => {
    const percentage = Math.round(confidence * 100);
    const color = percentage > 70 ? 'text-green-500' : percentage > 40 ? 'text-yellow-500' : 'text-gray-400';

    return (
      <span className={`text-xs ${color} flex items-center`}>
        <TrendingUp className="w-3 h-3 mr-1" />
        {percentage}%
      </span>
    );
  };

  return (
    <div className="smart-nav relative" role="navigation" aria-label="AI-powered navigation">
      {/* AI Predictions Bar */}
      <div
        className={`bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-3 border-b border-indigo-200 dark:border-indigo-800 ${
          highContrastMode ? 'high-contrast-nav' : ''
        }`}
        role="banner"
        aria-label="AI navigation predictions and shortcuts"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center" role="group" aria-label="AI predictions status">
              <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mr-2" aria-hidden="true" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300" id="predictions-label">
                AI Predictions
              </span>
              {responseTime && (
                <span className="ml-2 text-xs text-gray-500" aria-label={`Response time: ${responseTime} milliseconds`}>
                  {responseTime}ms
                </span>
              )}
            </div>

            {isLoading ? (
              <div
                role="status"
                aria-live="polite"
                aria-label="Loading navigation predictions"
                className="flex items-center"
              >
                <Loader className="w-4 h-4 animate-spin text-indigo-600" aria-hidden="true" />
                <span className="sr-only">Loading predictions...</span>
              </div>
            ) : (
              <div
                className="flex items-center space-x-2"
                role="group"
                aria-labelledby="predictions-label"
                aria-live="polite"
                aria-atomic="true"
              >
                {predictions.map((prediction, index) => (
                  <button
                    key={index}
                    onClick={() => navigateToPath(prediction.path, 'prediction')}
                    className={`px-3 py-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                      reducedMotion ? '' : 'transition-all duration-200'
                    } flex items-center space-x-2 group`}
                    data-testid={`prediction-${index + 1}`}
                    aria-label={`Navigate to ${prediction.path}, ${Math.round(prediction.confidence * 100)}% confidence, ${prediction.reason}`}
                    tabIndex={0}
                  >
                    <ChevronRight className="w-3 h-3 text-gray-400 group-hover:text-indigo-600" aria-hidden="true" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {prediction.path}
                    </span>
                    {renderConfidenceIndicator(prediction.confidence)}
                  </button>
                ))}
                {predictions.length === 0 && (
                  <span className="text-sm text-gray-500 italic" role="status">
                    No predictions available
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2" role="group" aria-label="Quick navigation actions">
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className={`px-3 py-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                reducedMotion ? '' : 'transition-all duration-200'
              } flex items-center space-x-2`}
              aria-label="Open command palette (Command+K or Ctrl+K)"
              title="Open command palette (⌘K)"
            >
              <Command className="w-3 h-3" aria-hidden="true" />
              <span className="text-sm text-gray-600 dark:text-gray-400" aria-hidden="true">⌘K</span>
            </button>

            {shortcuts.slice(0, 5).map((shortcut) => (
              <button
                key={shortcut.shortcut_key}
                onClick={() => navigateToPath(shortcut.target_path, 'shortcut')}
                className={`relative px-2 py-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                  reducedMotion ? '' : 'transition-all duration-200'
                } ${shortcut.is_custom ? 'ring-1 ring-indigo-300' : ''}`}
                aria-label={`${shortcut.label} shortcut (Command+${shortcut.shortcut_key} or Ctrl+${shortcut.shortcut_key})${shortcut.is_custom ? ' - Custom shortcut' : ''}`}
                title={`${shortcut.label} (⌘${shortcut.shortcut_key})${shortcut.is_custom ? ' - Custom' : ''}`}
              >
                <span className="text-xs text-gray-600 dark:text-gray-400" aria-hidden="true">
                  ⌘{shortcut.shortcut_key}
                </span>
                {shortcut.is_custom && (
                  <div
                    className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full"
                    aria-hidden="true"
                    title="Custom shortcut indicator"
                  ></div>
                )}
              </button>
            ))}

            <button
              onClick={() => setShortcutCustomizationOpen(true)}
              className={`px-2 py-1 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                reducedMotion ? '' : 'transition-all duration-200'
              }`}
              aria-label="Customize keyboard shortcuts (Command+Shift+K or Ctrl+Shift+K)"
              title="Customize shortcuts (⌘⇧K)"
            >
              <Settings className="w-3 h-3 text-gray-500 hover:text-indigo-600" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Command Palette Modal */}
      {commandPaletteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20"
          role="dialog"
          aria-modal="true"
          aria-labelledby="command-palette-title"
          aria-describedby="command-palette-description"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCommandPaletteOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={commandPaletteRef}
            className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setCommandPaletteOpen(false);
              }
            }}
          >
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 id="command-palette-title" className="sr-only">
                Command Palette
              </h2>
              <p id="command-palette-description" className="sr-only">
                Search for pages, actions, or use keyboard shortcuts to navigate quickly
              </p>
              <div className="flex items-center">
                <Search className="w-5 h-5 text-gray-400 mr-3" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleCommandSearch(e.target.value)}
                  placeholder="Type to search or navigate..."
                  className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 focus:ring-0"
                  autoFocus
                  data-testid="command-input"
                  aria-label="Search for pages and actions"
                  role="combobox"
                  aria-expanded="true"
                  aria-autocomplete="list"
                  aria-controls="command-results"
                />
                <kbd
                  className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded"
                  aria-label="Press Escape to close"
                >
                  ESC
                </kbd>
              </div>
            </div>

            <div
              id="command-results"
              className="max-h-96 overflow-y-auto p-2"
              role="listbox"
              aria-label="Search results"
            >
              {/* Recent Paths */}
              {recentPaths.length > 0 && (
                <div className="mb-4" role="group" aria-labelledby="recent-heading">
                  <h3 id="recent-heading" className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">
                    Recent
                  </h3>
                  {recentPaths.map((path, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        navigateToPath(path, 'recent');
                        setCommandPaletteOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-800 rounded-lg flex items-center ${
                        reducedMotion ? '' : 'transition-colors duration-150'
                      }`}
                      role="option"
                      aria-label={`Navigate to recent page: ${path}`}
                    >
                      <Clock className="w-4 h-4 text-gray-400 mr-3" aria-hidden="true" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {path}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Shortcuts */}
              <div role="group" aria-labelledby="shortcuts-heading">
                <h3 id="shortcuts-heading" className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">
                  Quick Actions
                </h3>
                {shortcuts.map((shortcut, index) => (
                  <button
                    key={shortcut.shortcut_key}
                    onClick={() => {
                      navigateToPath(shortcut.target_path, 'command_palette');
                      setCommandPaletteOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:bg-gray-100 dark:focus:bg-gray-800 rounded-lg flex items-center justify-between ${
                      reducedMotion ? '' : 'transition-colors duration-150'
                    }`}
                    role="option"
                    aria-label={`${shortcut.label} shortcut (Command+${shortcut.shortcut_key} or Ctrl+${shortcut.shortcut_key})${shortcut.is_custom ? ' - Custom shortcut' : ''}`}
                    tabIndex={index === 0 ? 0 : -1}
                  >
                    <div className="flex items-center">
                      <Keyboard className="w-4 h-4 text-gray-400 mr-3" aria-hidden="true" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {shortcut.label}
                      </span>
                      {shortcut.is_custom && (
                        <span className="ml-2 px-1 py-0.5 text-xs bg-indigo-100 text-indigo-600 rounded" aria-label="Custom shortcut">
                          Custom
                        </span>
                      )}
                    </div>
                    <kbd
                      className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded"
                      aria-hidden="true"
                    >
                      ⌘{shortcut.shortcut_key}
                    </kbd>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shortcut Customization Modal */}
      {shortcutCustomizationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShortcutCustomizationOpen(false)}
          />
          <div className="relative w-full max-w-4xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl m-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Customize Keyboard Shortcuts
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Personalize your navigation shortcuts for quick access to frequently used pages
                  </p>
                </div>
                <button
                  onClick={() => setShortcutCustomizationOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                >
                  <span className="sr-only">Close</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Current Shortcuts */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                    Current Shortcuts
                  </h3>
                  <div className="space-y-2">
                    {Array.from({ length: 9 }, (_, i) => {
                      const key = (i + 1).toString();
                      const shortcut = shortcuts.find(s => s.shortcut_key === key);
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <kbd className="px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
                              ⌘{key}
                            </kbd>
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {shortcut ? shortcut.label : 'Unassigned'}
                              </div>
                              {shortcut && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {shortcut.target_path}
                                  {shortcut.is_custom && (
                                    <span className="ml-2 px-1 py-0.5 bg-indigo-100 text-indigo-600 rounded text-xs">
                                      Custom
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setEditingShortcut({ key, shortcut })}
                            className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded"
                            title="Edit shortcut"
                          >
                            <Edit className="w-4 h-4 text-gray-500 hover:text-indigo-600" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Edit Form */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                    {editingShortcut ? `Edit ⌘${editingShortcut.key}` : 'Select a shortcut to edit'}
                  </h3>

                  {editingShortcut ? (
                    <EditShortcutForm
                      shortcutKey={editingShortcut.key}
                      currentShortcut={editingShortcut.shortcut}
                      availablePaths={availablePaths}
                      onSave={saveCustomShortcut}
                      onCancel={() => setEditingShortcut(null)}
                    />
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <Keyboard className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Click the edit button next to any shortcut to customize it</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-between">
              <button
                onClick={async () => {
                  if (confirm('Reset all shortcuts to defaults? This will remove all customizations.')) {
                    await resetShortcuts();
                  }
                }}
                className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Reset to Defaults
              </button>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShortcutCustomizationOpen(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setShortcutCustomizationOpen(false)}
                  className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Edit Shortcut Form Component
const EditShortcutForm = ({ shortcutKey, currentShortcut, availablePaths, onSave, onCancel }) => {
  const [selectedPath, setSelectedPath] = useState(currentShortcut?.target_path || '');
  const [label, setLabel] = useState(currentShortcut?.label || '');
  const [selectedIcon, setSelectedIcon] = useState(currentShortcut?.icon || 'home');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedPath || !label) return;

    setSaving(true);
    const result = await onSave(shortcutKey, selectedPath, label, selectedIcon);
    setSaving(false);

    if (result.success) {
      onCancel(); // Close the form
    } else {
      alert(`Failed to save shortcut: ${result.error}`);
    }
  };

  const handlePathChange = (path) => {
    setSelectedPath(path);
    // Auto-populate label if empty
    const pathOption = availablePaths.find(p => p.path === path);
    if (pathOption && !label) {
      setLabel(pathOption.label);
      setSelectedIcon(pathOption.icon);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Target Path
        </label>
        <select
          value={selectedPath}
          onChange={(e) => handlePathChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Select a page...</option>
          {availablePaths.map(path => (
            <option key={path.path} value={path.path}>
              {path.label} ({path.path})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Display Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Enter display name..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Icon
        </label>
        <select
          value={selectedIcon}
          onChange={(e) => setSelectedIcon(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg focus:ring-2 focus:ring-indigo-500"
        >
          <option value="home">Home</option>
          <option value="target">Target</option>
          <option value="file-text">Document</option>
          <option value="list">List</option>
          <option value="book">Book</option>
          <option value="bar-chart">Chart</option>
          <option value="trending-up">Trending</option>
          <option value="settings">Settings</option>
          <option value="user">User</option>
          <option value="users">Users</option>
          <option value="folder">Folder</option>
          <option value="calendar">Calendar</option>
          <option value="bell">Bell</option>
          <option value="help-circle">Help</option>
        </select>
      </div>

      <div className="flex space-x-3 pt-4">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!selectedPath || !label || saving}
          className="flex-1 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Save Shortcut'}
        </button>
      </div>
    </div>
  );
};

export default SmartNav;