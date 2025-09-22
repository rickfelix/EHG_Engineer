import React from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../animations/hooks/useReducedMotion';

const LoadingSkeleton = ({ 
  variant = 'text', 
  width = '100%', 
  height = 'auto',
  className = '',
  count = 1,
  isCompact = false
}) => {
  const shouldReduceMotion = useReducedMotion();

  const skeletonVariants = {
    pulse: {
      opacity: shouldReduceMotion ? 1 : [0.3, 0.6, 0.3],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut'
      }
    }
  };

  const getSkeletonHeight = () => {
    if (height !== 'auto') return height;
    
    switch (variant) {
      case 'title':
        return isCompact ? '24px' : '32px';
      case 'text':
        return isCompact ? '16px' : '20px';
      case 'button':
        return isCompact ? '32px' : '40px';
      case 'card':
        return isCompact ? '120px' : '200px';
      case 'avatar':
        return isCompact ? '32px' : '48px';
      case 'thumbnail':
        return '150px';
      default:
        return '20px';
    }
  };

  const getSkeletonWidth = () => {
    if (width !== '100%') return width;
    
    switch (variant) {
      case 'title':
        return '60%';
      case 'button':
        return '120px';
      case 'avatar':
        return isCompact ? '32px' : '48px';
      case 'thumbnail':
        return '150px';
      default:
        return '100%';
    }
  };

  const baseClass = `bg-gray-200 dark:bg-gray-700 rounded ${
    variant === 'avatar' ? 'rounded-full' : 'rounded-md'
  }`;

  const renderSkeleton = () => (
    <motion.div
      className={`${baseClass} ${className}`}
      style={{
        width: getSkeletonWidth(),
        height: getSkeletonHeight()
      }}
      animate="pulse"
      variants={skeletonVariants}
    />
  );

  if (count > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index}>
            {renderSkeleton()}
          </div>
        ))}
      </div>
    );
  }

  return renderSkeleton();
};

// Card skeleton with structured layout
export const CardSkeleton = ({ isCompact = false }) => {
  const shouldReduceMotion = useReducedMotion();

  const containerVariants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.1
      }
    }
  };

  const itemVariants = {
    initial: { opacity: 0, y: 10 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.3
      }
    }
  };

  return (
    <motion.div
      className={`${
        isCompact 
          ? 'bg-white dark:bg-gray-800 rounded-lg shadow p-3' 
          : 'bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6'
      }`}
      variants={containerVariants}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={itemVariants} className="flex items-center mb-4">
        <LoadingSkeleton variant="avatar" isCompact={isCompact} />
        <div className="ml-3 flex-1">
          <LoadingSkeleton variant="title" width="40%" isCompact={isCompact} />
        </div>
      </motion.div>
      
      <motion.div variants={itemVariants}>
        <LoadingSkeleton variant="text" count={3} isCompact={isCompact} />
      </motion.div>
      
      <motion.div variants={itemVariants} className="mt-4 flex gap-2">
        <LoadingSkeleton variant="button" isCompact={isCompact} />
        <LoadingSkeleton variant="button" isCompact={isCompact} />
      </motion.div>
    </motion.div>
  );
};

// List skeleton
export const ListSkeleton = ({ count = 5, isCompact = false }) => {
  const shouldReduceMotion = useReducedMotion();

  const listVariants = {
    initial: { opacity: 0 },
    animate: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.05
      }
    }
  };

  const itemVariants = {
    initial: { opacity: 0, x: -20 },
    animate: {
      opacity: 1,
      x: 0,
      transition: {
        duration: shouldReduceMotion ? 0 : 0.3
      }
    }
  };

  return (
    <motion.div
      className="space-y-2"
      variants={listVariants}
      initial="initial"
      animate="animate"
    >
      {Array.from({ length: count }).map((_, index) => (
        <motion.div
          key={index}
          variants={itemVariants}
          className={`${
            isCompact 
              ? 'bg-white dark:bg-gray-800 rounded p-2' 
              : 'bg-white dark:bg-gray-800 rounded-lg p-4'
          } shadow`}
        >
          <div className="flex items-center">
            <LoadingSkeleton variant="avatar" isCompact={isCompact} />
            <div className="ml-3 flex-1">
              <LoadingSkeleton variant="text" width="60%" isCompact={isCompact} />
              <LoadingSkeleton 
                variant="text" 
                width="40%" 
                className="mt-1" 
                height={isCompact ? '14px' : '16px'}
                isCompact={isCompact} 
              />
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
};

// Grid skeleton
export const GridSkeleton = ({ count = 6, columns = 3, isCompact = false }) => {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-${columns} gap-4`}>
      {Array.from({ length: count }).map((_, index) => (
        <CardSkeleton key={index} isCompact={isCompact} />
      ))}
    </div>
  );
};

export default LoadingSkeleton;