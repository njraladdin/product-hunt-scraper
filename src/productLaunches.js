const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const launchComments = require('./launchComments');

/**
 * Functions for fetching product launches from Product Hunt
 */
const productLaunches = {
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

  /**
   * Sleep function to delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after the delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Fetch launches for a product
   * @param {string} productSlug - The product slug (e.g., "lovable")
   * @param {Object} options - Options for fetching launches
   * @param {number} [options.limit] - Maximum number of launches to fetch (null for all)
   * @param {string} [options.order] - Order of launches (default: "DATE")
   * @returns {Promise<Array>} - Array of launches
   */
  async fetchLaunches(productSlug, options = {}) {
    try {
      console.log(`\n===== FETCHING LAUNCHES FOR: ${productSlug} =====`);
      
      // Add the product slug to the referer header
      this.headers.referer = `https://www.producthunt.com/products/${productSlug}/forums`;
      
      const { 
        limit = null,
        order = "DATE"
      } = options;
      
      let allLaunches = [];
      let rawResponses = [];
      let hasMoreLaunches = true;
      let cursor = null;
      
      while (hasMoreLaunches) {
        // Fetch a batch of launches
        const result = await this._fetchLaunchesBatch(productSlug, cursor, order);
        
        // Store the raw response
        if (result.rawResponse) {
          rawResponses.push(result.rawResponse);
        }
        
        if (result.launches.length === 0) {
          hasMoreLaunches = false;
        } else {
          // Add the batch to our collection
          allLaunches = [...allLaunches, ...result.launches];
          
          // Update cursor from pageInfo
          cursor = result.pageInfo?.endCursor;
          hasMoreLaunches = result.pageInfo?.hasNextPage;
          
          // Check if we've reached the requested limit
          if (limit !== null && allLaunches.length >= limit) {
            console.log(`\n===== REACHED REQUESTED LIMIT OF ${limit} LAUNCHES =====`);
            allLaunches = allLaunches.slice(0, limit);
            hasMoreLaunches = false;
          }
          
          // Log progress
          console.log(`\n===== PROGRESS: ${allLaunches.length} LAUNCHES FETCHED =====`);
          console.log(`Next cursor: ${cursor}`);
          
          // Apply delay before next request if there are more launches to fetch
          if (hasMoreLaunches) {
            console.log(`Waiting ${this.requestDelay}ms before next request...\n`);
            await this.sleep(this.requestDelay);
          }
        }
      }
      
      console.log(`\n===== COMPLETED: FETCHED ${allLaunches.length} LAUNCHES FOR ${productSlug} =====\n`);
      
      // Save to hardcoded test_output directory
      const outputDir = path.join(process.cwd(), 'test_output');
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Save raw responses to a file
      const rawFile = path.join(outputDir, `launches_raw_${productSlug}.json`);
      fs.writeFileSync(rawFile, JSON.stringify(rawResponses, null, 2));
      console.log(`Saved raw responses to: ${rawFile}`);
      
      // Save parsed launches to a file
      const parsedFile = path.join(outputDir, `launches_parsed_${productSlug}.json`);
      fs.writeFileSync(parsedFile, JSON.stringify(allLaunches, null, 2));
      console.log(`Saved parsed launches to: ${parsedFile}`);
      
      return allLaunches;
    } catch (error) {
      console.error('ERROR FETCHING LAUNCHES:', error.message);
      throw error;
    }
  },
  
  /**
   * Fetch a batch of launches using GraphQL
   * @private
   */
  async _fetchLaunchesBatch(productSlug, cursor = null, order = "DATE") {
    const payload = {
      operationName: "ProductPageLaunches",
      variables: {
        slug: productSlug,
        cursor: cursor,
        order: order
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "b311dc8ba5a776f8056c837d7464b9b6ceaad8f9f771bc7533b26a1b93e73f4a"
        }
      }
    };

    const response = await axios.post(this.baseUrl, payload, { headers: this.headers });
    
    // Log response metadata
    if (response.data && response.data.data && response.data.data.product) {
      const product = response.data.data.product;
      console.log(`Product info: ${product.name} (${product.slug})`);
    }
    
    if (response.data && response.data.data && response.data.data.product && response.data.data.product.posts) {
      const posts = response.data.data.product.posts;
      const parsedLaunches = this._parseLaunches(posts);
      
      // Log each launch
      console.log(`\n----- Batch of ${parsedLaunches.length} launches -----`);
      parsedLaunches.forEach((launch, index) => {
        console.log(`[${index + 1}] ${launch.name}: ${launch.tagline}`);
      });
      console.log(`----- End of batch -----\n`);
      
      return {
        launches: parsedLaunches,
        pageInfo: posts.pageInfo,
        rawResponse: response.data
      };
    }
    
    return { launches: [], pageInfo: { endCursor: null, hasNextPage: false }, rawResponse: null };
  },
  
  /**
   * Parse the launches from the API response
   * @private
   */
  _parseLaunches(postsData) {
    if (!postsData || !postsData.edges) {
      return [];
    }
    
    return postsData.edges.map(edge => {
      const post = edge.node;
      
      // Get badges information
      const badges = post.badges?.edges?.map(badgeEdge => ({
        position: badgeEdge.node.position,
        period: badgeEdge.node.period,
        date: badgeEdge.node.date
      })) || [];
      
      // Parse launch data
      return {
        id: post.id,
        name: post.name,
        slug: post.slug,
        tagline: post.tagline,
        createdAt: post.createdAt,
        featuredAt: post.featuredAt,
        updatedAt: post.updatedAt,
        thumbnailImageUuid: post.thumbnailImageUuid,
        // Rankings
        dailyRank: post.dailyRank,
        weeklyRank: post.weeklyRank,
        monthlyRank: post.monthlyRank,
        // Stats
        votesCount: post.votesCount,
        commentsCount: post.commentsCount,
        // Scores
        latestScore: post.latestScore,
        launchDayScore: post.launchDayScore,
        // Short URL
        shortenedUrl: post.shortenedUrl,
        // Badges
        badges: badges,
        // Product info
        product: {
          id: post.product?.id,
          isSubscribed: post.product?.isSubscribed || false
        }
      };
    });
  },

  /**
   * Fetch launches for a product and their comments
   * @param {string} productSlug - The product slug (e.g., "lovable")
   * @param {Object} options - Options for fetching launches
   * @param {number} [options.limit] - Maximum number of launches to fetch (null for all)
   * @param {string} [options.order] - Order of launches (default: "DATE")
   * @param {number} [options.commentsLimit] - Maximum number of comments to fetch per launch (null for all)
   * @param {boolean} [options.fetchComments] - Whether to fetch comments for launches (default: false)
   * @returns {Promise<Object>} - Object containing launches and their comments
   */
  async fetchLaunchesWithComments(productSlug, options = {}) {
    try {
      const { 
        limit = null,
        order = "DATE",
        commentsLimit = 100,
        fetchComments = true
      } = options;
      
      // First fetch the launches
      const launches = await this.fetchLaunches(productSlug, { limit, order });
      
      // If no comments requested or no launches found, return just the launches
      if (!fetchComments || launches.length === 0) {
        return {
          product: productSlug,
          launchCount: launches.length,
          launches
        };
      }
      
      console.log(`\n===== FETCHING COMMENTS FOR ${launches.length} LAUNCHES =====\n`);
      
      // Create directory for output if it doesn't exist
      const outputDir = path.join(process.cwd(), 'test_output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Map to store comments by launch slug
      const launchCommentsMap = {};
      
      // Fetch comments for each launch
      for (let i = 0; i < launches.length; i++) {
        const launch = launches[i];
        console.log(`\n----- Fetching comments for launch ${i+1}/${launches.length}: ${launch.slug} -----`);
        
        // Use the launchComments module to fetch comments
        try {
          const commentsResult = await launchComments.fetchLaunchComments(launch.slug, {
            limit: commentsLimit,
            outputDir
          });
          
          // Store the parsed comments
          launchCommentsMap[launch.slug] = commentsResult.parsedComments || [];
          
          // Add comments to the launch object
          launches[i].comments = commentsResult.parsedComments || [];
          launches[i].commentCount = commentsResult.parsedComments?.length || 0;
          
          console.log(`----- Fetched ${launches[i].commentCount} comments for ${launch.slug} -----\n`);
          
          // Apply delay before next launch if needed
          if (i < launches.length - 1) {
            console.log(`Waiting ${this.requestDelay * 2}ms before fetching next launch comments...\n`);
            await this.sleep(this.requestDelay * 2);
          }
        } catch (error) {
          console.error(`ERROR FETCHING COMMENTS FOR LAUNCH ${launch.slug}:`, error.message);
          // Continue with next launch even if this one fails
          launches[i].comments = [];
          launches[i].commentCount = 0;
        }
      }
      
      console.log(`\n===== COMPLETED: FETCHED COMMENTS FOR ${launches.length} LAUNCHES =====\n`);
      
      // Save the combined data to a file
      const combinedFile = path.join(outputDir, `launches_with_comments_${productSlug}.json`);
      const formattedData = {
        product: productSlug,
        launchCount: launches.length,
        launches: launches
      };
      
      fs.writeFileSync(combinedFile, JSON.stringify(formattedData, null, 2));
      console.log(`Saved launches with comments to: ${combinedFile}`);
      
      return formattedData;
    } catch (error) {
      console.error('ERROR FETCHING LAUNCHES WITH COMMENTS:', error.message);
      throw error;
    }
  },
};

module.exports = productLaunches; 

const test = async () => {
  // Test the new fetchLaunchesWithComments method
  const launchesWithComments = await productLaunches.fetchLaunchesWithComments('lovable', { 
    limit: 2,
    commentsLimit: 10
  });
  console.log(`Fetched ${launchesWithComments.launchCount} launches with comments for ${launchesWithComments.product}`);
  console.log(launchesWithComments);
}

test();