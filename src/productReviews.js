const axios = require('axios');
const geminiAIExtractor = require('./geminiAIExtractor');
require('dotenv').config(); // Add dotenv config to ensure env vars are loaded

/**
 * Functions for fetching product reviews from Product Hunt
 */
const productReviews = {
  baseUrl: 'https://www.producthunt.com/frontend/graphql',
  headers: {
    'accept': '*/*',
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'origin': 'https://www.producthunt.com',
    'referer': 'https://www.producthunt.com/products/',
    'x-requested-with': 'XMLHttpRequest',
  },
  requestDelay: 1000, // Default delay between requests in milliseconds
  useGeminiForExtraction: true, // Whether to use Gemini AI for extraction

  /**
   * Sleep function to delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after the delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Fetch reviews for a product
   * @param {string} productSlug - The product slug (e.g., "lovable")
   * @param {Object} options - Options for fetching reviews
   * @param {number} [options.limit] - Maximum number of reviews to fetch (null for all)
   * @param {boolean} [options.useGemini] - Whether to use Gemini AI for extraction
   * @param {string} [options.geminiApiKey] - Gemini API key (if useGemini is true)
   * @returns {Promise<Array>} - Array of reviews
   */
  async fetchReviews(productSlug, options = {}) {
    try {
      console.log(`\n===== FETCHING REVIEWS FOR: ${productSlug} =====`);
      console.log('GEMINI_API_KEY environment variable:', process.env.GEMINI_API_KEY ? 'is set' : 'is NOT set');
      
      // Add the product slug to the referer header
      this.headers.referer = `https://www.producthunt.com/products/${productSlug}`;
      
      const { 
        limit = null, 
        useGemini = this.useGeminiForExtraction, 
        geminiApiKey = null 
      } = options;
      
      // Set up Gemini extractor if enabled
      if (useGemini) {
        if (geminiApiKey) {
          geminiAIExtractor.setApiKey(geminiApiKey);
          console.log('Using provided Gemini API key');
        } else if (process.env.GEMINI_API_KEY) {
          console.log('Using Gemini API key from environment variable');
        } else {
          throw new Error('No Gemini API key found. Please set GEMINI_API_KEY environment variable or provide it as an option.');
        }
      }
      
      let allReviews = [];
      let hasMoreReviews = true;
      let cursor = null;
      let totalFetched = 0;
      
      while (hasMoreReviews) {
        // 1. Fetch a batch of reviews
        const reviews = await this._fetchReviewsBatch(productSlug, cursor);
        
        if (reviews.length === 0) {
          hasMoreReviews = false;
        } else {
          // 2. Process this batch with Gemini immediately if enabled
          let processedBatch = [...reviews]; // Clone the reviews
          if (useGemini && reviews.length > 0) {
            // Extract "used to build" information
            console.log('\n===== PROCESSING BATCH WITH GEMINI AI - USED TO BUILD =====');
            processedBatch = await geminiAIExtractor.extractUsedToBuildField(reviews);
            console.log('===== BATCH GEMINI EXTRACTION COMPLETE =====\n');
            
            // Check for reviews without ratings and perform sentiment analysis
            const reviewsWithoutRating = processedBatch.filter(
              review => review.rating === null || review.rating === undefined
            );
            
            if (reviewsWithoutRating.length > 0) {
              console.log('\n===== PROCESSING REVIEWS WITHOUT RATINGS FOR SENTIMENT ANALYSIS =====');
              processedBatch = await geminiAIExtractor.extractSentiment(processedBatch);
              console.log('===== BATCH SENTIMENT ANALYSIS COMPLETE =====\n');
            }
          }
          
          // 3. Add the processed batch to our collection
          allReviews = [...allReviews, ...processedBatch];
          totalFetched += reviews.length;
          
          // Update cursor based on total reviews fetched
          // Product Hunt uses Base64 encoded numbers (10 -> "MTA", 20 -> "MjA", etc.)
          cursor = reviews.length === 10 ? Buffer.from(String(totalFetched)).toString('base64') : null;
          
          // If we received fewer than 10 reviews or we've reached a pagination limit
          if (reviews.length < 10 || cursor === null) {
            hasMoreReviews = false;
          }
          
          // Check if we've reached the requested limit
          if (limit !== null && allReviews.length >= limit) {
            console.log(`\n===== REACHED REQUESTED LIMIT OF ${limit} REVIEWS =====`);
            allReviews = allReviews.slice(0, limit);
            hasMoreReviews = false;
          }
          
          // Log progress clearly
          console.log(`\n===== PROGRESS: ${allReviews.length} REVIEWS FETCHED =====`);
          console.log(`Next cursor: ${cursor}`);
          
          // Apply delay before next request if there are more reviews to fetch
          if (hasMoreReviews) {
            console.log(`Waiting ${this.requestDelay}ms before next request...\n`);
            await this.sleep(this.requestDelay);
          }
        }
      }
      
      console.log(`\n===== COMPLETED: FETCHED ${allReviews.length} REVIEWS FOR ${productSlug} =====\n`);
      return allReviews;
    } catch (error) {
      console.error('ERROR FETCHING REVIEWS:', error.message);
      throw error;
    }
  },
  
  /**
   * Fetch a batch of reviews using GraphQL
   * @private
   */
  async _fetchReviewsBatch(productSlug, cursor = null) {
    const payload = {
      operationName: "ProductReviewsPage",
      variables: {
        commentsListSubjectThreadsCursor: "",
        commentsThreadRepliesCursor: "",
        slug: productSlug,
        query: null,
        reviewsLimit: 10,
        reviewsOrder: "best",
        includeReviewId: null,
        rating: "0",
        order: null,
        reviewsCursor: cursor,
        reviewsNoReplies: null,
        commentsListSubjectThreadsLimit: 10,
        includeThreadForCommentId: null,
        commentsListSubjectFilter: null,
        excludeThreadForCommentId: null
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "a7362f46151a83be4632644a5f719b12e0b7d64b5134113f393ffaefbe5b7775"
        }
      }
    };

    const response = await axios.post(this.baseUrl, payload, { headers: this.headers });
    
    // Log response metadata
    if (response.data && response.data.data && response.data.data.product) {
      const product = response.data.data.product;
      console.log(`Product info: ${product.name} (${product.slug})`);
      console.log(`Total reviews: ${product.reviewsCount}, Rating: ${product.reviewsRating}`);
      console.log(`Rating distribution: ${JSON.stringify(product.ratingSpecificCount || [])}`);
    }
    
    if (response.data && response.data.data && response.data.data.product && response.data.data.product.reviews) {
      const parsedReviews = this._parseReviews(response.data.data.product.reviews);
      
      // Log each review text on a separate line
      console.log(`\n----- Batch of ${parsedReviews.length} reviews -----`);
      parsedReviews.forEach((review, index) => {
        console.log(`[${index + 1}] ${review.reviewer.name} (${review.reviewer.username}): ${review.text.substring(0, 100)}${review.text.length > 100 ? '...' : ''}`);
      });
      console.log(`----- End of batch -----\n`);
      
      return parsedReviews;
    }
    
    return [];
  },
  
  /**
   * Parse the reviews from the API response
   * @private
   */
  _parseReviews(reviewsData) {
    if (!reviewsData || !reviewsData.edges) {
      return [];
    }
    
    return reviewsData.edges.map(edge => {
      const review = edge.node;
      
      // Handle rating - keep as numerical only
      const rating = review.rating || null;
      
      // Format the URL to include the review ID for direct linking
      const baseUrl = review.url || '';
      const reviewId = review.id || '';
      const formattedUrl = reviewId ? `${baseUrl}?review=${reviewId}` : baseUrl;
      
      // Parse review data according to the requirements
      return {
        reviewer: {
          name: review.user?.name || '',
          username: review.user?.username || '',
        },
        usedToBuild: '', // Will be filled by Gemini extractor
        text: review.text || review.body || '',
        rating: rating, // Numerical rating only (1-5)
        sentiment: null, // Will be filled by Gemini extractor if no rating exists
        date: review.createdAt || '',
        helpfulVotes: review.votesCount || 0,
        id: reviewId,
        // Additional metadata
        url: formattedUrl,
        isVerified: review.isVerified || false,
        // Only relevant interaction data
        commentsCount: review.commentsCount || 0,
        hasVoted: review.hasVoted || false
      };
    });
  },
};

module.exports = productReviews; 