/**
 * PR Reviews Module
 * Handles PR review tracking and metrics
 * Extracted from database-loader.js - NO BEHAVIOR CHANGES
 */

class PRReviewsManager {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Load PR reviews from database
   */
  async loadPRReviews(limit = 50) {
    if (!this.connectionManager.isReady()) {
      console.log('⚠️  Database not connected - cannot load PR reviews');
      return [];
    }

    const supabase = this.connectionManager.getClient();

    try {
      const { data, error } = await supabase
        .from('pr_reviews')
        .select('*')
        .order('reviewed_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('❌ Error loading PR reviews:', error.message);
        return [];
      }

      console.log(`📊 Loaded ${data.length} PR reviews from database`);
      return data;
    } catch (error) {
      console.error('❌ Failed to load PR reviews:', error.message);
      return [];
    }
  }

  /**
   * Calculate PR review metrics
   */
  async calculatePRMetrics() {
    if (!this.connectionManager.isReady()) {
      return {
        total: 0,
        approved: 0,
        rejected: 0,
        avgReviewTime: 0,
        reviewsByReviewer: {},
        reviewsByWeek: {}
      };
    }

    const supabase = this.connectionManager.getClient();

    try {
      const { data: reviews, error } = await supabase
        .from('pr_reviews')
        .select('*');

      if (error) {
        console.error('❌ Error calculating PR metrics:', error.message);
        return null;
      }

      // Calculate metrics
      const metrics = {
        total: reviews.length,
        approved: reviews.filter(r => r.status === 'approved').length,
        rejected: reviews.filter(r => r.status === 'rejected').length,
        avgReviewTime: 0,
        reviewsByReviewer: {},
        reviewsByWeek: {}
      };

      // Calculate average review time
      const reviewTimes = reviews
        .filter(r => r.created_at && r.reviewed_at)
        .map(r => {
          const created = new Date(r.created_at);
          const reviewed = new Date(r.reviewed_at);
          return (reviewed - created) / (1000 * 60 * 60); // hours
        });

      if (reviewTimes.length > 0) {
        metrics.avgReviewTime = reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length;
      }

      // Group by reviewer
      reviews.forEach(r => {
        if (!metrics.reviewsByReviewer[r.reviewer]) {
          metrics.reviewsByReviewer[r.reviewer] = 0;
        }
        metrics.reviewsByReviewer[r.reviewer]++;
      });

      // Group by week
      reviews.forEach(r => {
        const week = this.getWeekNumber(new Date(r.reviewed_at));
        if (!metrics.reviewsByWeek[week]) {
          metrics.reviewsByWeek[week] = 0;
        }
        metrics.reviewsByWeek[week]++;
      });

      console.log('📊 Calculated PR metrics:', metrics);
      return metrics;
    } catch (error) {
      console.error('❌ Failed to calculate PR metrics:', error.message);
      return null;
    }
  }

  /**
   * Save a PR review
   */
  async savePRReview(review) {
    if (!this.connectionManager.isReady()) {
      console.log('⚠️  Database not connected - cannot save PR review');
      return null;
    }

    const supabase = this.connectionManager.getClient();

    try {
      const reviewData = {
        pr_number: review.prNumber,
        title: review.title,
        author: review.author,
        reviewer: review.reviewer,
        status: review.status,
        comments: review.comments || 0,
        files_changed: review.filesChanged || 0,
        additions: review.additions || 0,
        deletions: review.deletions || 0,
        created_at: review.createdAt || new Date().toISOString(),
        reviewed_at: review.reviewedAt || new Date().toISOString(),
        metadata: review.metadata || {}
      };

      const { data, error } = await supabase
        .from('pr_reviews')
        .insert(reviewData)
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving PR review:', error.message);
        return null;
      }

      console.log('✅ PR review saved:', data.pr_number);

      // Update metrics after saving
      await this.updatePRMetrics();

      return data;
    } catch (error) {
      console.error('❌ Failed to save PR review:', error.message);
      return null;
    }
  }

  /**
   * Update PR review metrics cache
   */
  async updatePRMetrics() {
    const metrics = await this.calculatePRMetrics();
    if (metrics) {
      // Could save to a metrics table or cache
      console.log('📊 PR metrics updated');
    }
  }

  /**
   * Helper to get week number
   */
  getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }
}

export default PRReviewsManager;