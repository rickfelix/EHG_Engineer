/**
 * Shortcut Manager Service
 * SD-002 Sprint 3: Enhanced Database Integration
 *
 * Handles user shortcut customization and preference management
 * Features: Database persistence with localStorage fallback
 */

class ShortcutManager {
  constructor(supabase, telemetryService) {
    this.supabase = supabase;
    this.telemetry = telemetryService;
    this.cache = new Map();
    this.cacheExpiry = 300000; // 5 minutes
    this.localStorageKey = 'ehg_user_shortcuts';
    this.databaseAvailable = false;
    this.initializeDatabaseCheck();
  }

  /**
   * Check if database tables are available
   */
  async initializeDatabaseCheck() {
    if (!this.supabase) {
      this.databaseAvailable = false;
      return;
    }

    try {
      // Test if navigation_shortcuts table exists by querying it
      const { data, error } = await this.supabase
        .from('navigation_shortcuts')
        .select('id')
        .limit(1);

      this.databaseAvailable = !error;
      console.log('🔍 ShortcutManager database availability:', this.databaseAvailable ? '✅ Available' : '❌ Using localStorage fallback');
    } catch (err) {
      this.databaseAvailable = false;
      console.log('🔍 ShortcutManager: Database not available, using localStorage fallback');
    }
  }

  /**
   * Get shortcuts for a specific user
   */
  async getUserShortcuts(userId) {
    try {
      // Check cache first
      const cacheKey = `shortcuts_${userId}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      let shortcuts;

      if (this.databaseAvailable && userId) {
        // Try database first
        try {
          const { data, error } = await this.supabase
            .rpc('get_user_shortcuts', { p_user_id: userId });

          if (!error && data && data.length > 0) {
            shortcuts = data;
          } else {
            // Fallback to localStorage then defaults
            shortcuts = this.getLocalStorageShortcuts(userId) || this.getDefaultShortcuts();
          }
        } catch (dbError) {
          console.log('Database query failed, using localStorage fallback');
          shortcuts = this.getLocalStorageShortcuts(userId) || this.getDefaultShortcuts();
        }
      } else {
        // Use localStorage or defaults
        shortcuts = this.getLocalStorageShortcuts(userId) || this.getDefaultShortcuts();
      }

      // Cache the results
      this.cacheResults(cacheKey, shortcuts);

      return shortcuts;
    } catch (error) {
      console.error('Failed to get user shortcuts:', error);
      return this.getDefaultShortcuts();
    }
  }

  /**
   * Save a custom shortcut for a user
   */
  async saveUserShortcut(userId, shortcutKey, targetPath, label, icon = null, displayOrder = 0) {
    try {
      // Validate inputs
      if (!this.validateShortcutKey(shortcutKey)) {
        throw new Error(`Invalid shortcut key: ${shortcutKey}`);
      }

      if (!this.validatePath(targetPath)) {
        throw new Error(`Invalid target path: ${targetPath}`);
      }

      const shortcutData = {
        shortcut_key: shortcutKey,
        target_path: targetPath,
        label: label,
        icon: icon,
        display_order: displayOrder,
        is_custom: true,
        is_enabled: true
      };

      let dbSuccess = false;

      // Try database first if available
      if (this.databaseAvailable && userId) {
        try {
          const { data, error } = await this.supabase
            .rpc('save_user_shortcut', {
              p_user_id: userId,
              p_shortcut_key: shortcutKey,
              p_target_path: targetPath,
              p_label: label,
              p_icon: icon,
              p_display_order: displayOrder
            });

          if (!error) {
            dbSuccess = true;
          }
        } catch (dbError) {
          console.log('Database save failed, using localStorage fallback');
        }
      }

      // Always save to localStorage as backup/fallback
      this.saveLocalStorageShortcut(userId, shortcutData);

      // Invalidate cache
      this.invalidateUserCache(userId);

      // Track telemetry
      if (this.telemetry) {
        await this.telemetry.trackShortcut({
          key: shortcutKey,
          target_path: targetPath,
          label: label
        }, {
          userId,
          action: 'shortcut_customized',
          source: 'settings',
          persistence: dbSuccess ? 'database' : 'localStorage'
        });
      }

      return {
        success: true,
        data: shortcutData,
        persistence: dbSuccess ? 'database' : 'localStorage'
      };
    } catch (error) {
      console.error('Failed to save user shortcut:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a custom shortcut
   */
  async deleteUserShortcut(userId, shortcutKey) {
    try {
      const { error } = await this.supabase
        .from('user_shortcut_preferences')
        .delete()
        .eq('user_id', userId)
        .eq('shortcut_key', shortcutKey);

      if (error) {
        throw error;
      }

      // Invalidate cache
      this.invalidateUserCache(userId);

      // Track telemetry
      await this.telemetry.trackShortcut({
        key: shortcutKey,
        target_path: null,
        label: 'deleted'
      }, {
        userId,
        action: 'shortcut_deleted',
        source: 'settings'
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to delete user shortcut:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset user shortcuts to defaults
   */
  async resetUserShortcuts(userId) {
    try {
      let dbSuccess = false;

      // Try database first if available
      if (this.databaseAvailable && userId) {
        try {
          const { data, error } = await this.supabase
            .rpc('reset_user_shortcuts', { p_user_id: userId });

          if (!error) {
            dbSuccess = true;
          }
        } catch (dbError) {
          console.log('Database reset failed, using localStorage fallback');
        }
      }

      // Always clear localStorage
      this.clearLocalStorageShortcuts(userId);

      // Invalidate cache
      this.invalidateUserCache(userId);

      // Track telemetry
      if (this.telemetry) {
        await this.telemetry.trackShortcut({
          key: 'all',
          target_path: null,
          label: 'reset_to_defaults'
        }, {
          userId,
          action: 'shortcuts_reset',
          source: 'settings',
          persistence: dbSuccess ? 'database' : 'localStorage'
        });
      }

      return { success: true, persistence: dbSuccess ? 'database' : 'localStorage' };
    } catch (error) {
      console.error('Failed to reset user shortcuts:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available paths for shortcut customization
   */
  async getAvailablePaths() {
    const commonPaths = [
      { path: '/dashboard', label: 'Dashboard', icon: 'home' },
      { path: '/strategic-directives', label: 'Strategic Directives', icon: 'target' },
      { path: '/prds', label: 'Product Requirements', icon: 'file-text' },
      { path: '/backlog', label: 'Backlog', icon: 'list' },
      { path: '/stories', label: 'User Stories', icon: 'book' },
      { path: '/reports', label: 'Reports', icon: 'bar-chart' },
      { path: '/analytics', label: 'Analytics', icon: 'trending-up' },
      { path: '/settings', label: 'Settings', icon: 'settings' },
      { path: '/profile', label: 'Profile', icon: 'user' },
      { path: '/teams', label: 'Teams', icon: 'users' },
      { path: '/projects', label: 'Projects', icon: 'folder' },
      { path: '/calendar', label: 'Calendar', icon: 'calendar' },
      { path: '/notifications', label: 'Notifications', icon: 'bell' },
      { path: '/help', label: 'Help', icon: 'help-circle' }
    ];

    return commonPaths;
  }

  /**
   * Validate shortcut key (1-9)
   */
  validateShortcutKey(key) {
    return /^[1-9]$/.test(key);
  }

  /**
   * Validate navigation path
   */
  validatePath(path) {
    return /^\/[a-zA-Z0-9\-_\/]*$/.test(path) && path.length > 1;
  }

  /**
   * Get default shortcuts (fallback)
   */
  getDefaultShortcuts() {
    return [
      { shortcut_key: '1', label: 'Dashboard', target_path: '/dashboard', icon: 'home', is_enabled: true, display_order: 1, is_custom: false },
      { shortcut_key: '2', label: 'Strategic Directives', target_path: '/strategic-directives', icon: 'target', is_enabled: true, display_order: 2, is_custom: false },
      { shortcut_key: '3', label: 'PRDs', target_path: '/prds', icon: 'file-text', is_enabled: true, display_order: 3, is_custom: false },
      { shortcut_key: '4', label: 'Backlog', target_path: '/backlog', icon: 'list', is_enabled: true, display_order: 4, is_custom: false },
      { shortcut_key: '5', label: 'Stories', target_path: '/stories', icon: 'book', is_enabled: true, display_order: 5, is_custom: false },
      { shortcut_key: '6', label: 'Reports', target_path: '/reports', icon: 'bar-chart', is_enabled: true, display_order: 6, is_custom: false },
      { shortcut_key: '7', label: 'Analytics', target_path: '/analytics', icon: 'trending-up', is_enabled: true, display_order: 7, is_custom: false },
      { shortcut_key: '8', label: 'Settings', target_path: '/settings', icon: 'settings', is_enabled: true, display_order: 8, is_custom: false },
      { shortcut_key: '9', label: 'Profile', target_path: '/profile', icon: 'user', is_enabled: true, display_order: 9, is_custom: false }
    ];
  }

  /**
   * LocalStorage persistence methods
   */
  getLocalStorageShortcuts(userId) {
    try {
      const stored = localStorage.getItem(`${this.localStorageKey}_${userId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.shortcuts || null;
      }
    } catch (error) {
      console.error('Error reading shortcuts from localStorage:', error);
    }
    return null;
  }

  saveLocalStorageShortcut(userId, shortcutData) {
    try {
      const existing = this.getLocalStorageShortcuts(userId) || this.getDefaultShortcuts();
      const updated = existing.filter(s => s.shortcut_key !== shortcutData.shortcut_key);
      updated.push(shortcutData);
      updated.sort((a, b) => a.display_order - b.display_order);

      localStorage.setItem(`${this.localStorageKey}_${userId}`, JSON.stringify({
        shortcuts: updated,
        lastModified: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error saving shortcuts to localStorage:', error);
    }
  }

  clearLocalStorageShortcuts(userId) {
    try {
      localStorage.removeItem(`${this.localStorageKey}_${userId}`);
    } catch (error) {
      console.error('Error clearing shortcuts from localStorage:', error);
    }
  }

  /**
   * Handle keyboard shortcut events
   */
  handleKeyboardEvent(event, shortcuts, callback) {
    // Check for Cmd/Ctrl + number key
    if ((event.metaKey || event.ctrlKey) && event.key >= '1' && event.key <= '9') {
      event.preventDefault();

      const shortcut = shortcuts.find(s => s.shortcut_key === event.key && s.is_enabled);

      if (shortcut) {
        // Track usage
        if (this.telemetry) {
          this.telemetry.trackShortcut(shortcut, {
            action: 'shortcut_used',
            source: 'keyboard',
            method: event.metaKey ? 'cmd' : 'ctrl'
          });
        }

        // Execute callback
        if (callback) {
          callback(shortcut);
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Get database availability status
   */
  isDatabaseAvailable() {
    return this.databaseAvailable;
  }

  /**
   * Force refresh database availability
   */
  async refreshDatabaseStatus() {
    await this.initializeDatabaseCheck();
    return this.databaseAvailable;
  }

  /**
   * Get shortcut conflicts with browser/OS shortcuts
   */
  getShortcutConflicts() {
    return [
      { key: '1', conflict: 'Browser tab navigation (Cmd+1)', severity: 'medium' },
      { key: '2', conflict: 'Browser tab navigation (Cmd+2)', severity: 'medium' },
      { key: '3', conflict: 'Browser tab navigation (Cmd+3)', severity: 'medium' },
      { key: '4', conflict: 'Browser tab navigation (Cmd+4)', severity: 'medium' },
      { key: '5', conflict: 'Browser tab navigation (Cmd+5)', severity: 'medium' },
      { key: '6', conflict: 'Browser tab navigation (Cmd+6)', severity: 'medium' },
      { key: '7', conflict: 'Browser tab navigation (Cmd+7)', severity: 'medium' },
      { key: '8', conflict: 'Browser tab navigation (Cmd+8)', severity: 'medium' },
      { key: '9', conflict: 'Browser last tab (Cmd+9)', severity: 'high' }
    ];
  }

  /**
   * Cache management
   */
  getCacheKey(userId) {
    return `shortcuts_${userId}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  cacheResults(key, data) {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.cacheExpiry
    });
  }

  invalidateUserCache(userId) {
    const cacheKey = this.getCacheKey(userId);
    this.cache.delete(cacheKey);
  }

  /**
   * Export user shortcuts for backup
   */
  async exportUserShortcuts(userId) {
    try {
      const shortcuts = await this.getUserShortcuts(userId);

      const exportData = {
        userId,
        exportDate: new Date().toISOString(),
        shortcuts: shortcuts.filter(s => s.is_custom),
        databaseAvailable: this.databaseAvailable,
        version: '1.1'
      };

      return {
        success: true,
        data: exportData,
        filename: `shortcuts_backup_${userId}_${Date.now()}.json`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Import user shortcuts from backup
   */
  async importUserShortcuts(userId, importData) {
    try {
      if (!importData || !importData.shortcuts) {
        throw new Error('Invalid import data format');
      }

      const results = [];

      for (const shortcut of importData.shortcuts) {
        const result = await this.saveUserShortcut(
          userId,
          shortcut.shortcut_key,
          shortcut.target_path,
          shortcut.label,
          shortcut.icon,
          shortcut.display_order
        );
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      return {
        success: failureCount === 0,
        imported: successCount,
        failed: failureCount,
        results
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default ShortcutManager;