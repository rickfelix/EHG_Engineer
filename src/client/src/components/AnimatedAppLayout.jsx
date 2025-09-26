import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  FileText,
  ChevronRight,
  Minimize2,
  Menu,
  X,
  FlaskConical,
  Package,
  GitPullRequest,
  BookOpen,
  TrendingUp
} from 'lucide-react';
import Breadcrumbs from './Breadcrumbs';
import SmartRefreshButton from './SmartRefreshButton';
import DarkModeToggle from './DarkModeToggle';
import { useReducedMotion } from '../animations/hooks/useReducedMotion';
import { 
  ANIMATION_DURATION,
  ANIMATION_SPRING,
  fadeInUp,
  slideIn,
  scaleIn,
  staggerContainer
} from '../animations/constants';

function AnimatedAppLayout({ 
  state, 
  isConnected, 
  isSidebarCollapsed, 
  setIsSidebarCollapsed,
  isCompactMode,
  setIsCompactMode,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  updateChecklist,
  requestHandoff,
  compactContext,
  refreshData,
  setActiveSD
}) {
  const shouldReduceMotion = useReducedMotion();
  const location = useLocation();
  
  const navItems = [
    { path: '/', icon: Home, label: 'Dashboard', tooltip: 'Dashboard' },
    { path: '/strategic-directives', icon: FileText, label: 'Strategic Directives', tooltip: 'SDs' },
    { path: '/backlog', icon: Package, label: 'Backlog', tooltip: 'Backlog' },
    { path: '/stories', icon: BookOpen, label: 'User Stories', tooltip: 'Stories' },
    { path: '/directive-lab', icon: FlaskConical, label: 'Directive Lab', tooltip: 'Lab' },
    { path: '/pr-reviews', icon: GitPullRequest, label: 'PR Reviews', tooltip: 'PRs' }
  ];

  // Animation variants for sidebar
  const sidebarVariants = {
    expanded: {
      width: '16rem', // w-64
      transition: shouldReduceMotion ? { duration: 0 } : ANIMATION_SPRING
    },
    collapsed: {
      width: '4rem', // w-16
      transition: shouldReduceMotion ? { duration: 0 } : ANIMATION_SPRING
    }
  };

  // Animation variants for mobile sidebar
  const mobileSidebarVariants = {
    open: {
      x: 0,
      transition: shouldReduceMotion ? { duration: 0 } : ANIMATION_SPRING
    },
    closed: {
      x: '-100%',
      transition: shouldReduceMotion ? { duration: 0 } : ANIMATION_SPRING
    }
  };

  // Menu item hover animation
  const menuItemVariants = {
    rest: {
      scale: 1,
      transition: { duration: 0.2 }
    },
    hover: {
      scale: shouldReduceMotion ? 1 : 1.02,
      transition: {
        duration: 0.2,
        ease: 'easeInOut'
      }
    },
    tap: {
      scale: shouldReduceMotion ? 1 : 0.98
    }
  };

  // Tooltip animation
  const tooltipVariants = {
    hidden: {
      opacity: 0,
      x: -10,
      transition: { duration: 0.1 }
    },
    visible: {
      opacity: 1,
      x: 0,
      transition: { 
        duration: 0.2,
        delay: 0.5 // Delay before showing tooltip
      }
    }
  };

  // Reduce padding for directive-lab page to maximize vertical space
  const isDirectiveLab = location.pathname === '/directive-lab';
  const contentPadding = isCompactMode 
    ? 'p-2 pt-16 md:pt-2' 
    : isDirectiveLab 
      ? 'p-0' // No padding for directive-lab - it manages its own padding
      : 'p-6 pt-20 md:pt-6'; // Normal padding for other pages

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 relative">
      {/* Mobile menu button */}
      <motion.button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="mobile-menu-button fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg md:hidden"
        whileHover={{ scale: shouldReduceMotion ? 1 : 1.05 }}
        whileTap={{ scale: shouldReduceMotion ? 1 : 0.95 }}
      >
        <AnimatePresence mode="wait">
          {isMobileMenuOpen ? (
            <motion.div
              key="close"
              initial={{ rotate: -90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: 90, opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            >
              <X className="w-6 h-6" />
            </motion.div>
          ) : (
            <motion.div
              key="menu"
              initial={{ rotate: 90, opacity: 0 }}
              animate={{ rotate: 0, opacity: 1 }}
              exit={{ rotate: -90, opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            >
              <Menu className="w-6 h-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Overlay for mobile */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.div 
        className={`
          fixed md:static inset-y-0 left-0 bg-gradient-to-br from-purple-600 via-purple-700 to-blue-800 shadow-2xl 
          z-50 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out
          md:transform-none backdrop-blur-xl
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        initial={false}
        animate={isSidebarCollapsed ? 'collapsed' : 'expanded'}
        variants={sidebarVariants}
      >
          <div className={`${isCompactMode ? 'p-2' : 'p-4'} border-b border-purple-400/30 backdrop-blur-sm relative overflow-hidden`}>
            {/* Animated background glow */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-purple-400/20 via-blue-400/20 to-purple-400/20"
              animate={{
                background: shouldReduceMotion ? 'linear-gradient(to right, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2), rgba(168, 85, 247, 0.2))' : [
                  'linear-gradient(to right, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2), rgba(168, 85, 247, 0.2))',
                  'linear-gradient(to right, rgba(59, 130, 246, 0.2), rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2))',
                  'linear-gradient(to right, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2), rgba(168, 85, 247, 0.2))'
                ]
              }}
              transition={{
                duration: shouldReduceMotion ? 0 : 4,
                repeat: Infinity,
                ease: 'linear'
              }}
            />
            <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
              <AnimatePresence>
                {!isSidebarCollapsed && (
                  <motion.h1 
                    className="text-xl font-bold text-white relative z-10 drop-shadow-lg"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
                  >
                    LEO Protocol
                  </motion.h1>
                )}
              </AnimatePresence>
              <motion.button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="hidden md:block p-1 hover:bg-white/20 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/10 relative z-10"
                title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                whileHover={{ scale: shouldReduceMotion ? 1 : 1.1 }}
                whileTap={{ scale: shouldReduceMotion ? 1 : 0.9 }}
              >
                <motion.div
                  animate={{ rotate: isSidebarCollapsed ? 0 : 180 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
                >
                  <ChevronRight className="w-5 h-5" />
                </motion.div>
              </motion.button>
            </div>
            <AnimatePresence>
              {!isSidebarCollapsed && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
                >
                  <div className="mt-2 flex items-center">
                    <motion.div 
                      className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
                      animate={{
                        scale: isConnected ? [1, 1.2, 1] : 1,
                      }}
                      transition={{
                        duration: 2,
                        repeat: isConnected ? Infinity : 0,
                        repeatType: "loop"
                      }}
                    />
                    <span className="text-sm text-purple-100 relative z-10">
                      {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <motion.span 
                    className="text-xs px-2 py-1 bg-white/20 text-white rounded-full inline-block mt-2 backdrop-blur-sm border border-white/20 relative z-10 font-medium"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ 
                      type: "spring",
                      stiffness: 500,
                      damping: 15
                    }}
                  >
                    v{state.leoProtocol?.version || 'detecting...'}
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <nav className={`flex-1 ${isCompactMode ? 'p-2' : 'p-4'} relative`}>
            {/* Subtle animated background pattern */}
            <motion.div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px)',
                backgroundSize: '20px 20px'
              }}
              animate={{
                backgroundPosition: shouldReduceMotion ? '0px 0px' : ['0px 0px', '20px 20px', '0px 0px']
              }}
              transition={{
                duration: shouldReduceMotion ? 0 : 20,
                repeat: Infinity,
                ease: 'linear'
              }}
            />
            <motion.ul 
              className="space-y-1"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {navItems.map(({ path, icon: Icon, label, tooltip }, index) => (
                <motion.li 
                  key={path}
                  variants={fadeInUp}
                  custom={index}
                >
                  <NavLink
                    to={path}
                    className={({ isActive }) =>
                      `block ${
                        isActive
                          ? 'active-nav-item'
                          : ''
                      }`
                    }
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {({ isActive }) => (
                      <motion.div
                        className={`flex items-center ${isCompactMode ? 'p-1.5' : 'p-2'} rounded-lg transition-all duration-300 group relative backdrop-blur-sm ${
                          isActive
                            ? 'bg-white/25 text-white border border-white/30 shadow-lg backdrop-blur-md'
                            : 'hover:bg-white/10 text-purple-100 hover:text-white border border-transparent hover:border-white/20'
                        }`}
                        variants={menuItemVariants}
                        initial="rest"
                        whileHover="hover"
                        whileTap="tap"
                        layout
                      >
                        {/* Enhanced glow effect for active items */}
                        {isActive && !shouldReduceMotion && (
                          <>
                            <motion.div
                              className="absolute inset-0 rounded-lg bg-white/30 blur-xl"
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 0.6, scale: 1 }}
                              transition={{ duration: 0.3 }}
                            />
                            <motion.div
                              className="absolute inset-0 rounded-lg bg-gradient-to-r from-purple-400/40 to-blue-400/40"
                              animate={{
                                background: [
                                  'linear-gradient(to right, rgba(168, 85, 247, 0.4), rgba(59, 130, 246, 0.4))',
                                  'linear-gradient(to right, rgba(59, 130, 246, 0.4), rgba(168, 85, 247, 0.4))',
                                  'linear-gradient(to right, rgba(168, 85, 247, 0.4), rgba(59, 130, 246, 0.4))'
                                ]
                              }}
                              transition={{
                                duration: 3,
                                repeat: Infinity,
                                ease: 'linear'
                              }}
                            />
                          </>
                        )}
                        
                        <Icon className={`${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'} ${isSidebarCollapsed ? '' : 'mr-3'} relative z-10`} />
                        
                        <AnimatePresence>
                          {!isSidebarCollapsed && (
                            <motion.span 
                              className={`${isCompactMode ? 'text-sm' : ''} relative z-10`}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -10 }}
                              transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
                            >
                              {label}
                            </motion.span>
                          )}
                        </AnimatePresence>
                        
                        {/* Enhanced Tooltip - shows on hover for all states */}
                        <motion.span 
                          className={`absolute ${
                            isSidebarCollapsed 
                              ? 'left-full ml-2 top-1/2 transform -translate-y-1/2' 
                              : 'bottom-full mb-2 left-1/2 transform -translate-x-1/2'
                          } px-2 py-1 bg-gray-900/90 backdrop-blur-md text-white text-xs rounded whitespace-nowrap pointer-events-none z-30 opacity-0 group-hover:opacity-100 transition-all duration-200 delay-300 border border-white/20 shadow-xl`}
                          style={{ visibility: 'hidden' }}
                          animate={{ 
                            opacity: 0,
                            visibility: 'hidden'
                          }}
                          whileHover={{ 
                            opacity: 1,
                            visibility: 'visible'
                          }}
                        >
                          {tooltip}
                          {/* Tooltip arrow */}
                          <div 
                            className={`absolute ${
                              isSidebarCollapsed
                                ? 'right-full top-1/2 transform -translate-y-1/2 border-l-0 border-r-4 border-r-gray-900 dark:border-r-gray-700 border-t-4 border-b-4 border-t-transparent border-b-transparent'
                                : 'top-full left-1/2 transform -translate-x-1/2 border-t-4 border-t-gray-900 dark:border-t-gray-700 border-l-4 border-r-4 border-l-transparent border-r-transparent border-b-0'
                            }`}
                          />
                        </motion.span>
                      </motion.div>
                    )}
                  </NavLink>
                </motion.li>
              ))}
            </motion.ul>
          </nav>

          {/* Settings section */}
          <motion.div 
            className={`border-t border-purple-400/30 ${isCompactMode ? 'p-2' : 'p-4'} relative backdrop-blur-sm`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <motion.button
              onClick={() => setIsCompactMode(!isCompactMode)}
              className={`w-full flex items-center ${isCompactMode ? 'p-1.5' : 'p-2'} rounded-lg hover:bg-white/10 text-purple-100 hover:text-white transition-all duration-300 group relative border border-transparent hover:border-white/20 backdrop-blur-sm`}
              title={isCompactMode ? 'Standard view' : 'Compact view'}
              whileHover={{ scale: shouldReduceMotion ? 1 : 1.02 }}
              whileTap={{ scale: shouldReduceMotion ? 1 : 0.98 }}
            >
              <motion.div
                animate={{ rotate: isCompactMode ? 180 : 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
              >
                <Minimize2 className={`${isCompactMode ? 'w-4 h-4' : 'w-5 h-5'} ${isSidebarCollapsed ? '' : 'mr-3'}`} />
              </motion.div>
              
              <AnimatePresence>
                {!isSidebarCollapsed && (
                  <motion.span 
                    className={isCompactMode ? 'text-sm' : ''}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {isCompactMode ? 'Standard View' : 'Compact View'}
                  </motion.span>
                )}
              </AnimatePresence>
              
              <AnimatePresence>
                {isSidebarCollapsed && (
                  <motion.span 
                    className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap pointer-events-none z-10"
                    variants={tooltipVariants}
                    initial="hidden"
                    whileHover="visible"
                    exit="hidden"
                  >
                    {isCompactMode ? 'Standard' : 'Compact'}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
            
            {/* Smart Refresh Button */}
            <div className={`mt-3 pt-3 border-t border-purple-400/30`}>
              <SmartRefreshButton 
                onRefresh={refreshData}
                isCompact={isCompactMode}
                isCollapsed={isSidebarCollapsed}
              />
            </div>
          </motion.div>
      </motion.div>

      {/* Main content with page transitions */}
      <motion.div 
        className="flex-1 flex flex-col overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.08 }}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Header with Breadcrumbs and Dark Mode Toggle */}
        <div className="flex items-center justify-between bg-gradient-to-r from-purple-600 via-purple-700 to-blue-800 border-b border-purple-400/30 shadow-lg relative overflow-hidden backdrop-blur-xl">
          {/* Animated background glow */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-purple-400/20 via-blue-400/20 to-purple-400/20"
            animate={{
              background: shouldReduceMotion ? 'linear-gradient(to right, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2), rgba(168, 85, 247, 0.2))' : [
                'linear-gradient(to right, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2), rgba(168, 85, 247, 0.2))',
                'linear-gradient(to right, rgba(59, 130, 246, 0.2), rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2))',
                'linear-gradient(to right, rgba(168, 85, 247, 0.2), rgba(59, 130, 246, 0.2), rgba(168, 85, 247, 0.2))'
              ]
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 4,
              repeat: Infinity,
              ease: 'linear'
            }}
          />
          {/* Subtle sparkle effect */}
          <motion.div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px)',
              backgroundSize: '40px 40px'
            }}
            animate={{
              backgroundPosition: shouldReduceMotion ? '0px 0px' : ['0px 0px', '40px 40px', '0px 0px']
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 15,
              repeat: Infinity,
              ease: 'linear'
            }}
          />
          <div className="flex-1 relative z-10">
            <Breadcrumbs isCompact={isCompactMode} />
          </div>
          <div className="flex items-center px-4 py-2 relative z-10">
            <DarkModeToggle />
          </div>
        </div>
        
        {/* Page content with transitions */}
        <main className={`flex-1 overflow-y-auto ${contentPadding}`}>
          <AnimatePresence>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ 
                duration: shouldReduceMotion ? 0 : 0.1,  // Much faster!
                ease: 'easeOut'
              }}
            >
              <Outlet context={{ 
                state, 
                isCompactMode,
                updateChecklist,
                requestHandoff,
                compactContext,
                refreshData
              }} />
            </motion.div>
          </AnimatePresence>
        </main>
      </motion.div>
    </div>
  );
}

export default AnimatedAppLayout;