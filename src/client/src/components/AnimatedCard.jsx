import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, MoreVertical } from 'lucide-react';
import { useReducedMotion } from '../animations/hooks/useReducedMotion';
import { ANIMATION_DURATION, CARD_VARIANTS } from '../animations/constants';

const AnimatedCard = ({
  children,
  title,
  icon: Icon,
  className = '',
  expandable = false,
  flippable = false,
  draggable = false,
  actions,
  backContent,
  isCompact = false,
  delay = 0,
  ...props
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  // Card animation variants
  const cardVariants = {
    initial: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : 20,
      scale: shouldReduceMotion ? 1 : 0.95
    },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.normal / 1000,
        delay: shouldReduceMotion ? 0 : delay * 0.5,  // Reduced delay
        ease: [0.4, 0, 0.2, 1]
      }
    },
    hover: shouldReduceMotion ? {} : {
      y: -4,
      scale: 1.02,
      boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
      transition: {
        duration: ANIMATION_DURATION.fast / 1000,
        ease: [0.4, 0, 0.2, 1]
      }
    },
    tap: shouldReduceMotion ? {} : {
      scale: 0.98,
      transition: {
        duration: ANIMATION_DURATION.instant / 1000
      }
    },
    drag: {
      scale: 1.05,
      boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
      cursor: 'grabbing',
      transition: {
        duration: ANIMATION_DURATION.instant / 1000
      }
    }
  };

  // Flip animation variants
  const flipVariants = {
    front: {
      rotateY: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.slow / 1000,
        ease: [0.4, 0, 0.2, 1]
      }
    },
    back: {
      rotateY: 180,
      transition: {
        duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.slow / 1000,
        ease: [0.4, 0, 0.2, 1]
      }
    }
  };

  // Expand/collapse animation
  const contentVariants = {
    expanded: {
      height: 'auto',
      opacity: 1,
      transition: {
        height: {
          duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.normal / 1000,
          ease: [0.4, 0, 0.2, 1]
        },
        opacity: {
          duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.fast / 1000,
          delay: shouldReduceMotion ? 0 : 0.1
        }
      }
    },
    collapsed: {
      height: 0,
      opacity: 0,
      transition: {
        height: {
          duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.normal / 1000,
          ease: [0.4, 0, 0.2, 1]
        },
        opacity: {
          duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.fast / 1000
        }
      }
    }
  };

  const baseCardClass = isCompact 
    ? 'bg-white dark:bg-gray-800 rounded-lg shadow p-3' 
    : 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6';

  const headerClass = isCompact 
    ? 'text-lg font-semibold' 
    : 'text-xl font-semibold';

  return (
    <motion.div
      className={`${baseCardClass} ${className} relative`}
      variants={cardVariants}
      initial="initial"
      animate={isFlipped ? "flipped" : "animate"}
      whileHover={!isDragging ? "hover" : undefined}
      whileTap={!isDragging ? "tap" : undefined}
      drag={draggable}
      dragElastic={0.2}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      whileDrag="drag"
      layout
      style={{
        transformStyle: flippable ? 'preserve-3d' : undefined,
        cursor: draggable ? (isDragging ? 'grabbing' : 'grab') : 'default'
      }}
      {...props}
    >
      {/* Card elevation effect */}
      {!shouldReduceMotion && (
        <motion.div
          className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary-500/10 to-primary-600/10"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 0.5 }}
          transition={{ duration: ANIMATION_DURATION.fast / 1000 }}
          style={{ zIndex: -1 }}
        />
      )}

      {/* Front of card */}
      <motion.div
        animate={isFlipped ? flipVariants.back : flipVariants.front}
        style={{
          backfaceVisibility: 'hidden',
          transformStyle: 'preserve-3d'
        }}
      >
        {/* Card Header */}
        {(title || Icon || expandable || actions) && (
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              {Icon && (
                <motion.div
                  whileHover={{ rotate: shouldReduceMotion ? 0 : 360 }}
                  transition={{ duration: ANIMATION_DURATION.slow / 1000 }}
                >
                  <Icon className={`${isCompact ? 'w-4 h-4 mr-2' : 'w-5 h-5 mr-3'} text-primary-600`} />
                </motion.div>
              )}
              {title && <h3 className={headerClass}>{title}</h3>}
            </div>
            
            <div className="flex items-center gap-2">
              {actions && (
                <motion.button
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  whileHover={{ scale: shouldReduceMotion ? 1 : 1.1 }}
                  whileTap={{ scale: shouldReduceMotion ? 1 : 0.9 }}
                >
                  <MoreVertical className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                </motion.button>
              )}
              
              {expandable && (
                <motion.button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  whileHover={{ scale: shouldReduceMotion ? 1 : 1.1 }}
                  whileTap={{ scale: shouldReduceMotion ? 1 : 0.9 }}
                >
                  <motion.div
                    animate={{ rotate: isExpanded ? 0 : 180 }}
                    transition={{ duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.fast / 1000 }}
                  >
                    <ChevronUp className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                  </motion.div>
                </motion.button>
              )}
              
              {flippable && (
                <motion.button
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
                  whileHover={{ scale: shouldReduceMotion ? 1 : 1.1 }}
                  whileTap={{ scale: shouldReduceMotion ? 1 : 0.9 }}
                >
                  Flip
                </motion.button>
              )}
            </div>
          </div>
        )}

        {/* Card Content */}
        <AnimatePresence initial={false}>
          {(!expandable || isExpanded) && (
            <motion.div
              variants={contentVariants}
              initial={expandable ? "collapsed" : false}
              animate="expanded"
              exit="collapsed"
              style={{ overflow: 'hidden' }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Back of card (for flippable cards) */}
      {flippable && backContent && (
        <motion.div
          className="absolute inset-0 p-6"
          initial={{ rotateY: 180 }}
          animate={isFlipped ? flipVariants.front : flipVariants.back}
          style={{
            backfaceVisibility: 'hidden',
            transformStyle: 'preserve-3d'
          }}
        >
          <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className={headerClass}>Details</h3>
              <motion.button
                onClick={() => setIsFlipped(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
                whileHover={{ scale: shouldReduceMotion ? 1 : 1.1 }}
                whileTap={{ scale: shouldReduceMotion ? 1 : 0.9 }}
              >
                Back
              </motion.button>
            </div>
            <div className="flex-1 overflow-auto">
              {backContent}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default AnimatedCard;