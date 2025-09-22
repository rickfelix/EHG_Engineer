import React, { useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useReducedMotion } from '../animations/hooks/useReducedMotion';
import { ANIMATION_DURATION, STAGGER_VARIANTS } from '../animations/constants';
import AnimatedCard from './AnimatedCard';
import { GridSkeleton } from './LoadingSkeleton';

const CardGrid = ({
  cards = [],
  loading = false,
  columns = 3,
  gap = 4,
  isCompact = false,
  reorderable = false,
  onReorder,
  renderCard,
  skeletonCount = 6
}) => {
  const [orderedCards, setOrderedCards] = useState(cards);
  const shouldReduceMotion = useReducedMotion();

  React.useEffect(() => {
    setOrderedCards(cards);
  }, [cards]);

  // Grid container animation
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.02,  // Reduced from 0.05
        delayChildren: shouldReduceMotion ? 0 : 0.05      // Reduced from 0.1
      }
    }
  };

  // Individual card animation
  const cardVariants = {
    hidden: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : 20,
      scale: shouldReduceMotion ? 1 : 0.9
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.normal / 1000,
        ease: [0.4, 0, 0.2, 1]
      }
    },
    exit: {
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.8,
      y: shouldReduceMotion ? 0 : -20,
      transition: {
        duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.fast / 1000
      }
    }
  };

  // Handle reordering
  const handleReorder = (newOrder) => {
    setOrderedCards(newOrder);
    if (onReorder) {
      onReorder(newOrder);
    }
  };

  // Grid classes based on columns
  const getGridClass = () => {
    const baseClass = `grid gap-${gap}`;
    switch (columns) {
      case 1:
        return `${baseClass} grid-cols-1`;
      case 2:
        return `${baseClass} grid-cols-1 md:grid-cols-2`;
      case 3:
        return `${baseClass} grid-cols-1 md:grid-cols-2 lg:grid-cols-3`;
      case 4:
        return `${baseClass} grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`;
      default:
        return `${baseClass} grid-cols-1 md:grid-cols-2 lg:grid-cols-3`;
    }
  };

  // Show loading skeletons
  if (loading) {
    return <GridSkeleton count={skeletonCount} columns={columns} isCompact={isCompact} />;
  }

  // Reorderable grid
  if (reorderable && !shouldReduceMotion) {
    return (
      <Reorder.Group
        axis="y"
        values={orderedCards}
        onReorder={handleReorder}
        className={getGridClass()}
      >
        <AnimatePresence mode="popLayout">
          {orderedCards.map((card, index) => (
            <Reorder.Item
              key={card.id || index}
              value={card}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={cardVariants}
              whileDrag={{
                scale: 1.05,
                boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
                zIndex: 1000,
                cursor: 'grabbing'
              }}
              transition={{
                layout: {
                  duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.normal / 1000,
                  ease: [0.4, 0, 0.2, 1]
                }
              }}
            >
              {renderCard ? (
                renderCard(card, index)
              ) : (
                <AnimatedCard
                  title={card.title}
                  icon={card.icon}
                  expandable={card.expandable}
                  flippable={card.flippable}
                  isCompact={isCompact}
                  delay={index * 0.05}
                  backContent={card.backContent}
                >
                  {card.content}
                </AnimatedCard>
              )}
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>
    );
  }

  // Regular non-reorderable grid
  return (
    <motion.div
      className={getGridClass()}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence mode="popLayout">
        {orderedCards.map((card, index) => (
          <motion.div
            key={card.id || index}
            variants={cardVariants}
            layout
            transition={{
              layout: {
                duration: shouldReduceMotion ? 0 : ANIMATION_DURATION.normal / 1000,
                ease: [0.4, 0, 0.2, 1]
              }
            }}
          >
            {renderCard ? (
              renderCard(card, index)
            ) : (
              <AnimatedCard
                title={card.title}
                icon={card.icon}
                expandable={card.expandable}
                flippable={card.flippable}
                draggable={card.draggable}
                isCompact={isCompact}
                delay={index * 0.05}
                backContent={card.backContent}
              >
                {card.content}
              </AnimatedCard>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
};

export default CardGrid;