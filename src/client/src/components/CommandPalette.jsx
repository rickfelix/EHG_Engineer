/**
 * Command Palette Component - Sprint 4 Implementation
 * SD-002: AI Navigation - Enhanced Command Interface
 * 
 * Unified command interface with smart search integration
 * Keyboard shortcut: Cmd+K (Mac) / Ctrl+K (Windows/Linux)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './CommandPalette.css';

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Command types
const COMMAND_TYPES = {
  NAVIGATION: 'navigation',
  ACTION: 'action',
  SEARCH: 'search',
  AI_QUERY: 'ai_query',
  SHORTCUT: 'shortcut',
  RECENT: 'recent'
};

// Icon component for command types
const CommandIcon = ({ type }) => {
  const icons = {
    navigation: '📍',
    action: '⚡',
    search: '🔍',
    ai_query: '🤖',
    shortcut: '⌨️',
    recent: '🕐'
  };
  return <span className="command-icon">{icons[type] || '📄'}</span>;
};

const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchTime, setSearchTime] = useState(null);
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const resultsRef = useRef(null);

  // Keyboard shortcut to open/close palette
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(prev => !prev);
        if (!isOpen) {
          setQuery('');
          setResults([]);
          setSelectedIndex(0);
        }
      }
      
      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Smart search integration
  const performSearch = useCallback(
    debounce(async (searchQuery) => {
      if (!searchQuery || searchQuery.trim().length === 0) {
        setResults(getDefaultCommands());
        setSearchTime(null);
        return;
      }

      setLoading(true);
      const startTime = Date.now();
      
      try {
        const response = await fetch('/api/v1/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: searchQuery,
            context: {
              currentPath: window.location.pathname,
              source: 'command_palette'
            }
          })
        });

        if (response.ok) {
          const data = await response.json();
          const commandResults = data.results.map(result => ({
            ...result,
            type: result.content_type || COMMAND_TYPES.SEARCH,
            label: result.title,
            action: () => executeCommand(result)
          }));
          
          setResults(commandResults);
          setSearchTime(data.searchTime);
        } else {
          console.error('Search failed:', response.status);
          setResults(getDefaultCommands());
        }
      } catch (error) {
        console.error('Search error:', error);
        setResults(getDefaultCommands());
      } finally {
        setLoading(false);
      }
    }, 300),
    []
  );

  // Get default commands when no query
  const getDefaultCommands = () => [
    {
      type: COMMAND_TYPES.NAVIGATION,
      label: 'Dashboard',
      description: 'Go to dashboard',
      content_id: 'nav_dashboard',
      action: () => navigate('/')
    },
    {
      type: COMMAND_TYPES.NAVIGATION,
      label: 'Portfolio',
      description: 'View your portfolio',
      content_id: 'nav_portfolio',
      action: () => navigate('/portfolio')
    },
    {
      type: COMMAND_TYPES.NAVIGATION,
      label: 'Settings',
      description: 'Application settings',
      content_id: 'nav_settings',
      action: () => navigate('/settings')
    },
    {
      type: COMMAND_TYPES.ACTION,
      label: 'Clear Cache',
      description: 'Clear application cache',
      content_id: 'cmd_clear_cache',
      action: async () => {
        await fetch('/api/v1/search/cache/clear', { method: 'POST' });
        console.log('Cache cleared');
      }
    },
    {
      type: COMMAND_TYPES.ACTION,
      label: 'Refresh',
      description: 'Refresh current view',
      content_id: 'cmd_refresh',
      action: () => window.location.reload()
    }
  ];

  // Execute selected command
  const executeCommand = async (command) => {
    console.log('Executing command:', command);
    
    // Record feedback for learning
    if (query) {
      fetch('/api/v1/search/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          selectedResult: command.content_id,
          shownResults: results.map(r => ({ id: r.content_id }))
        })
      }).catch(console.error);
    }

    // Close palette
    setIsOpen(false);
    setQuery('');
    setResults([]);

    // Execute command action
    if (command.action) {
      command.action();
    } else {
      // Default navigation action
      switch (command.content_type || command.type) {
        case COMMAND_TYPES.NAVIGATION:
        case 'navigation':
          if (command.target_path) {
            navigate(command.target_path);
          }
          break;
        case COMMAND_TYPES.SEARCH:
        case 'search':
          // Open in search view if available
          console.log('Search result selected:', command);
          break;
        default:
          console.log('Unknown command type:', command);
      }
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < results.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : results.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (results[selectedIndex]) {
            executeCommand(results[selectedIndex]);
          }
          break;
        case 'Tab':
          e.preventDefault();
          // Tab cycles through results
          if (e.shiftKey) {
            setSelectedIndex(prev => 
              prev > 0 ? prev - 1 : results.length - 1
            );
          } else {
            setSelectedIndex(prev => 
              prev < results.length - 1 ? prev + 1 : 0
            );
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedElement = resultsRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedIndex, results]);

  // Handle input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(0);
    performSearch(value);
  };

  // Initialize with default commands
  useEffect(() => {
    if (isOpen && !query) {
      setResults(getDefaultCommands());
    }
  }, [isOpen, query]);

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" onClick={() => setIsOpen(false)}>
      <div 
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command Palette"
        aria-modal="true"
      >
        <div className="command-palette-header">
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            value={query}
            onChange={handleInputChange}
            placeholder="Search commands, navigate, or ask AI..."
            aria-label="Command search input"
            aria-autocomplete="list"
            aria-controls="command-results"
            aria-activedescendant={`command-${selectedIndex}`}
          />
          {searchTime !== null && (
            <span className="search-time">{searchTime}ms</span>
          )}
        </div>

        {loading && (
          <div className="command-palette-loading">
            <span className="loading-spinner">⏳</span>
            Searching...
          </div>
        )}

        {!loading && results.length > 0 && (
          <div
            ref={resultsRef}
            className="command-palette-results"
            id="command-results"
            role="listbox"
          >
            {results.map((result, index) => (
              <div
                key={result.content_id || index}
                id={`command-${index}`}
                className={`command-result ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => executeCommand(result)}
                onMouseEnter={() => setSelectedIndex(index)}
                role="option"
                aria-selected={index === selectedIndex}
              >
                <CommandIcon type={result.type} />
                <div className="command-result-content">
                  <div className="command-result-title">
                    {result.label || result.title}
                  </div>
                  {result.description && (
                    <div className="command-result-description">
                      {result.description}
                    </div>
                  )}
                </div>
                {result.score && (
                  <div className="command-result-score">
                    {(result.score * 100).toFixed(0)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <div className="command-palette-empty">
            No results found for "{query}"
          </div>
        )}

        <div className="command-palette-footer">
          <span className="command-hint">
            <kbd>↑↓</kbd> Navigate
          </span>
          <span className="command-hint">
            <kbd>Enter</kbd> Select
          </span>
          <span className="command-hint">
            <kbd>Esc</kbd> Close
          </span>
          <span className="command-hint">
            <kbd>Cmd+K</kbd> Toggle
          </span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;