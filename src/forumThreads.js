const axios = require('axios');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const threadComments = require('./threadComments');

/**
 * Functions for fetching forum threads from Product Hunt
 */
const forumThreads = {
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
   * Fetch forum threads for a product
   * @param {string} productSlug - The product slug (e.g., "lovable")
   * @param {Object} options - Options for fetching threads
   * @param {number} [options.limit] - Maximum number of threads to fetch (null for all)
   * @param {number} [options.commentsLimit] - Maximum number of comments to fetch per thread (null for all)
   * @returns {Promise<Array>} - Array of forum threads
   */
  async fetchThreads(productSlug, options = {}) {
    try {
      console.log(`\n===== FETCHING FORUM THREADS FOR: ${productSlug} =====`);
      
      // Add the product slug to the referer header
      this.headers.referer = `https://www.producthunt.com/products/${productSlug}/forums`;
      this.headers['x-ph-referer'] = `https://www.producthunt.com/products/${productSlug}`;
      
      const { limit = null, commentsLimit = 100 } = options;
      
      let allThreads = [];
      let rawResponses = [];
      let hasMoreThreads = true;
      let cursor = null;
      
      while (hasMoreThreads) {
        // Fetch a batch of threads
        const batchResult = await this._fetchThreadsBatch(productSlug, cursor);
        
        if (!batchResult.threads || batchResult.threads.length === 0) {
          hasMoreThreads = false;
        } else {
          const batchThreads = batchResult.threads;
          
          // Add the batch to our collection
          allThreads = [...allThreads, ...batchThreads];
          
          // Store the raw response
          if (batchResult.rawResponse) {
            rawResponses.push(batchResult.rawResponse);
          }
          
          // Update cursor for pagination
          cursor = batchResult.pageInfo.endCursor;
          
          // Check if there are more threads
          hasMoreThreads = batchResult.pageInfo.hasNextPage;
          
          // Check if we've reached the requested limit
          if (limit !== null && allThreads.length >= limit) {
            console.log(`\n===== REACHED REQUESTED LIMIT OF ${limit} THREADS =====`);
            allThreads = allThreads.slice(0, limit);
            hasMoreThreads = false;
          }
          
          // Log progress clearly
          console.log(`\n===== PROGRESS: ${allThreads.length} THREADS FETCHED =====`);
          console.log(`Next cursor: ${cursor}`);
          
          // Apply delay before next batch request if there are more threads to fetch
          if (hasMoreThreads) {
            console.log(`Waiting ${this.requestDelay}ms before next batch request...\n`);
            await this.sleep(this.requestDelay);
          }
        }
      }
      
      console.log(`\n===== COMPLETED: FETCHED ${allThreads.length} THREADS FOR ${productSlug} =====\n`);
      
      // Fetch comments for each thread using the threadComments module
      if (allThreads.length > 0) {
        console.log(`\n===== FETCHING COMMENTS FOR ALL THREADS (MAX ${commentsLimit} PER THREAD) =====\n`);
        
        // Create directory for output
        const outputDir = path.join(process.cwd(), 'test_output');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Fetch comments for all threads
        await threadComments.fetchCommentsForThreads(productSlug, allThreads, {
          limit: commentsLimit,
          outputDir
        });
      }
      
      // Save the threads to JSON files
      const outputDir = path.join(process.cwd(), 'test_output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Save raw responses
      const rawOutputFile = path.join(outputDir, 'forum_threads_raw.json');
      fs.writeFileSync(rawOutputFile, JSON.stringify(rawResponses, null, 2));
      console.log(`\n===== SAVED RAW RESPONSES TO: ${rawOutputFile} =====\n`);
      
      // Save parsed threads
      const parsedOutputFile = path.join(outputDir, 'forum_threads_parsed.json');
      fs.writeFileSync(parsedOutputFile, JSON.stringify(allThreads, null, 2));
      console.log(`\n===== SAVED PARSED THREADS TO: ${parsedOutputFile} =====\n`);
      
      return allThreads;
    } catch (error) {
      console.error('ERROR FETCHING FORUM THREADS:', error.message);
      throw error;
    }
  },
  
  /**
   * Fetch a batch of forum threads using GraphQL
   * @private
   */
  async _fetchThreadsBatch(productSlug, cursor = null) {
    const payload = {
      operationName: "DiscussionsForumsQuery",
      variables: {
        window: null,
        order: "trending",
        cursor: cursor,
        forumSlug: productSlug,
        pinnedFirst: true
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "f311e1e9ba52dee82f047d5ba4f2330127bc1d0b15cac8e52ef2267edff1b148"
        }
      }
    };

    const response = await axios.post(this.baseUrl, payload, { headers: this.headers });
    
    // Check if we have a valid response with threads
    if (response.data && response.data.data && response.data.data.discussionForum && response.data.data.discussionForum.threads) {
      const threadsData = response.data.data.discussionForum.threads;
      const parsedThreads = this._parseThreads(threadsData.edges);
      
      // Extract pagination info if available
      const pageInfo = threadsData.pageInfo ? {
        hasNextPage: threadsData.pageInfo.hasNextPage || false,
        endCursor: threadsData.pageInfo.endCursor || null
      } : {
        hasNextPage: false,
        endCursor: null
      };
      
      // Log each thread on a separate line
      console.log(`\n----- Batch of ${parsedThreads.length} threads -----`);
      parsedThreads.forEach((thread, index) => {
        console.log(`[${index + 1}] ${thread.title} by ${thread.author.username} (${thread.commentsCount} comments, ${thread.upvotesCount} upvotes)`);
      });
      console.log(`----- End of batch -----\n`);
      
      // Return both the threads, pagination info, and raw response
      return {
        threads: parsedThreads,
        pageInfo: pageInfo,
        rawResponse: response.data
      };
    }
    
    return { threads: [], pageInfo: { hasNextPage: false, endCursor: null } };
  },
  
  /**
   * Parse the threads from the API response
   * @private
   */
  _parseThreads(threadsEdges) {
    if (!threadsEdges || !Array.isArray(threadsEdges)) {
      return [];
    }
    
    return threadsEdges.map(edge => {
      const node = edge.node;
      const commentable = node.commentable || {};
      
      // Get the basic thread information
      const id = node.id || '';
      const title = node.title || '';
      const description = node.description || '';
      const createdAt = node.createdAt || '';
      const slug = node.slug || '';
      const path = node.path || '';
      const commentsCount = node.commentsCount || 0;
      const isFeatured = node.isFeatured || false;
      const isPinned = node.isPinned || false;
      
      // Get user information
      const user = node.user || {};
      const author = {
        id: user.id || '',
        name: user.name || '',
        username: user.username || '',
        url: user.avatarUrl ? `https://www.producthunt.com/@${user.username}` : '',
        avatarUrl: user.avatarUrl || ''
      };
      
      // Format the URL for direct linking
      const baseUrl = path ? `https://www.producthunt.com${path}` : '';
      
      // Get vote count from commentable if available
      const votesCount = commentable.votesCount || commentable.hasOwnProperty('votesCount') ? commentable.votesCount : 0;
      
      // Return the parsed thread data
      return {
        title,
        author,
        date: createdAt,
        isFeatured,
        upvotesCount: votesCount,
        commentsCount,
        id,
        url: baseUrl,
        // Additional metadata that might be useful
        slug,
        description,
        isPinned,
        path
      };
    });
  },

  /**
   * Format thread data according to project requirements
   * @param {Array} threads - Array of raw thread objects 
   * @param {string} productSlug - The product slug
   * @returns {Object} - Formatted threads data
   */
  formatThreadsData(threads, productSlug) {
    if (!threads || !Array.isArray(threads) || threads.length === 0) {
      return { product: productSlug, threads: [] };
    }

    const formattedThreads = threads.map(thread => {
      // Format the date in YYYY-MM-DD format if possible
      let formattedDate = thread.date;
      try {
        const dateObj = new Date(thread.date);
        if (!isNaN(dateObj.getTime())) {
          formattedDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
        }
      } catch (e) {
        // Keep original date format if parsing fails
      }

      // Format the thread according to requirements
      return {
        title: thread.title,
        author: thread.author.username,
        authorDetails: {
          id: thread.author.id,
          name: thread.author.name,
          url: thread.author.url,
          avatarUrl: thread.author.avatarUrl
        },
        date: formattedDate,
        isFeatured: thread.isFeatured,
        upvotesCount: thread.upvotesCount,
        commentsCount: thread.commentsCount,
        url: thread.url,
        description: thread.description,
        id: thread.id,
        comments: thread.comments || [] // Will be populated by threadComments module
      };
    });

    return {
      product: productSlug,
      threadCount: formattedThreads.length,
      threads: formattedThreads
    };
  },

  /**
   * Fetch threads and format them according to project requirements
   * @param {string} productSlug - The product slug (e.g., "lovable")
   * @param {Object} options - Options for fetching threads
   * @param {number} [options.limit] - Maximum number of threads to fetch (null for all)
   * @param {number} [options.commentsLimit] - Maximum number of comments to fetch per thread (null for all)
   * @param {string} [options.outputFile] - Path to save the formatted data
   * @returns {Promise<Object>} - Formatted threads data
   */
  async fetchAndFormatThreadsWithComments(productSlug, options = {}) {
    try {
      // Fetch threads
      let threads = await this.fetchThreads(productSlug, {
        limit: options.limit,
        commentsLimit: options.commentsLimit
      });
      
      // Create a map of thread slugs to comments
      const threadCommentsMap = {};
      
      // If we have threads and want to include comments
      if (threads.length > 0 && options.commentsLimit !== 0) {
        console.log(`\n===== FETCHING COMMENTS FOR ${threads.length} THREADS =====\n`);
        
        // Fetch comments for all threads
        const commentsResult = await threadComments.fetchCommentsForThreads(
          productSlug, 
          threads, 
          { 
            limit: options.commentsLimit || 100,
            outputDir: path.join(process.cwd(), 'test_output')
          }
        );
        
        // Map the comments to their respective threads
        if (commentsResult && commentsResult.threadsWithComments) {
          Object.keys(commentsResult.threadsWithComments).forEach(threadSlug => {
            threadCommentsMap[threadSlug] = commentsResult.threadsWithComments[threadSlug].parsedComments || [];
          });
        }
        
        // Update each thread with its formatted comments
        threads = threadComments.updateThreadsWithComments(threads, threadCommentsMap);
      }
      
      // Format the threads data
      const formattedData = this.formatThreadsData(threads, productSlug);
      
      // Save formatted data if outputFile is specified
      if (options.outputFile) {
        const outputDir = path.dirname(options.outputFile);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        
        fs.writeFileSync(options.outputFile, JSON.stringify(formattedData, null, 2));
        console.log(`\n===== SAVED FORMATTED DATA TO: ${options.outputFile} =====\n`);
      }
      
      return formattedData;
    } catch (error) {
      console.error('ERROR FORMATTING THREAD DATA:', error.message);
      throw error;
    }
  }
};

module.exports = forumThreads; 

const test = async () => {
    // Test the new method by fetching and formatting threads data
    const formattedData = await forumThreads.fetchAndFormatThreadsWithComments('lovable', { 
      limit: 5, 
      commentsLimit: 10,
      outputFile: './test_output/formatted_threads.json'
    });
    console.log(`Formatted ${formattedData.threadCount} threads for ${formattedData.product}`);
}

test();