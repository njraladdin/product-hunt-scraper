const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Functions for fetching comments from Product Hunt launches
 */
const launchComments = {
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
   * Fetch comments for a specific launch
   * @param {string} launchSlug - The launch slug (e.g., "lovable-visual-edits")
   * @param {Object} options - Options for fetching comments 
   * @param {number} [options.limit] - Maximum number of comments to fetch (null for all)
   * @param {string} [options.order] - Order of comments (default: "VOTES")
   * @param {boolean} [options.fetchAllReplies] - Whether to fetch all replies for comments (defaults to true)
   * @param {string} [options.outputDir] - Directory to save comment data (defaults to 'test_output')
   * @returns {Promise<Object>} - Object containing parsed comments and raw responses
   */
  async fetchLaunchComments(launchSlug, options = {}) {
    try {
      console.log(`\n===== FETCHING COMMENTS FOR LAUNCH: ${launchSlug} =====`);
      
      const { 
        limit = null, 
        order = 'VOTES',
        fetchAllReplies = true,
        outputDir = path.join(process.cwd(), 'test_output')
      } = options;
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Extract product slug from launch slug (usually the first part before a hyphen)
      const productSlug = launchSlug.split('-')[0];
      
      // Update referer header for comments
      this.headers.referer = `https://www.producthunt.com/products/${productSlug}`;
      
      const rawResponses = [];
      const parsedComments = [];
      let hasMoreComments = true;
      let cursor = ""; // Start with empty cursor
      let totalComments = 0;
      let totalExpectedComments = 0;
      let postId = null;
      let batchNumber = 0;
      
      // First page uses PostPageComments query
      let firstBatch = true;
      
      while (hasMoreComments) {
        batchNumber++;
        console.log(`\n----- Fetching batch #${batchNumber} with cursor: "${cursor}" -----`);
        
        // Fetch batch of comments
        let result;
        if (firstBatch) {
          // First request uses PostPageComments
          result = await this._fetchFirstBatch(launchSlug, cursor, order, outputDir, batchNumber);
          firstBatch = false;
          
          // Get post ID for subsequent requests
          if (result.postId) {
            postId = result.postId;
            console.log(`Got post ID: ${postId} for subsequent requests`);
          } else {
            console.error("Could not find post ID in the first response");
            break;
          }
        } else {
          // Subsequent requests use a different payload structure
          result = await this._fetchNextCommentsBatch(postId, cursor, order, outputDir, batchNumber);
        }
        
        // Store the raw response
        if (result.rawResponse) {
          rawResponses.push(result.rawResponse);
        }
        
        // Update total expected comments count if available
        if (totalExpectedComments === 0 && result.totalCount !== undefined) {
          totalExpectedComments = result.totalCount;
          console.log(`Launch has ${totalExpectedComments} comments in total`);
        }
        
        // Process comments from this batch
        if (result.comments && result.comments.length > 0) {
          const newComments = result.comments;
          console.log(`Fetched ${newComments.length} comments in this batch`);
          
          // Fetch all replies for each comment if requested
          if (fetchAllReplies) {
            for (let i = 0; i < newComments.length; i++) {
              const comment = newComments[i];
              // Check if there are replies indicated and if we need to fetch more
              if (comment.hasMoreReplies || (comment.repliesCount > (comment.replies?.length || 0))) {
                console.log(`\nComment ${comment.id} has more replies to fetch (${comment.repliesCount} total, ${comment.replies?.length || 0} initial)`);
                // Implement _expandReplies function call here
                await this._expandReplies(comment, productSlug, launchSlug);
              }
            }
          }
          
          // Add comments to collection
          parsedComments.push(...newComments);
          totalComments += newComments.length;
          
          console.log(`Total comments so far: ${totalComments}`);
        } else {
          console.log("No comments found in this batch");
        }
        
        // Update pagination state
        hasMoreComments = result.hasNextPage;
        cursor = result.nextCursor || "";
        
        // Check if we've reached the requested limit
        if (limit !== null && totalComments >= limit) {
          console.log(`\n===== REACHED REQUESTED LIMIT OF ${limit} COMMENTS =====`);
          if (parsedComments.length > limit) {
            parsedComments.splice(limit); // Trim to exact limit
          }
          hasMoreComments = false;
        }
        
        // Apply delay before next request if there are more comments to fetch
        if (hasMoreComments) {
          console.log(`Waiting ${this.requestDelay}ms before next request...\n`);
          await this.sleep(this.requestDelay);
        }
      }
      
      console.log(`\n===== COMPLETED: FETCHED ${totalComments} OF ${totalExpectedComments} COMMENTS FOR LAUNCH ${launchSlug} =====\n`);
      
      // Save combined raw responses to a file
      const rawFile = path.join(outputDir, `launch_comments_raw_${launchSlug}.json`);
      fs.writeFileSync(rawFile, JSON.stringify(rawResponses, null, 2));
      console.log(`Saved combined raw responses to: ${rawFile}`);
      
      // Save parsed comments to a file
      const parsedFile = path.join(outputDir, `launch_comments_parsed_${launchSlug}.json`);
      fs.writeFileSync(parsedFile, JSON.stringify(parsedComments, null, 2));
      console.log(`Saved parsed comments to: ${parsedFile}`);
      
      return {
        launchSlug,
        commentCount: totalComments,
        totalExpectedComments,
        parsedComments,
        rawResponses
      };
    } catch (error) {
      console.error(`ERROR FETCHING COMMENTS FOR LAUNCH ${launchSlug}:`, error.message);
      throw error;
    }
  },
  
  /**
   * Fetch the first batch of comments using PostPageComments query
   * @private
   */
  async _fetchFirstBatch(launchSlug, cursor = "", order = "VOTES", outputDir, batchNumber) {
    // First request uses PostPageComments operation
    const payload = {
      "operationName": "PostPageComments",
      "variables": {
        "commentsListSubjectThreadsCursor": cursor,
        "commentsThreadRepliesCursor": "",
        "order": order,
        "slug": launchSlug,
        "includeThreadForCommentId": null,
        "commentsListSubjectThreadsLimit": 4, // API default
        "commentsListSubjectFilter": null,
        "excludeThreadForCommentId": null
      },
      "extensions": {
        "persistedQuery": {
          "version": 1,
          "sha256Hash": "30f2a3c9af5dce9b7e8cbe7b8ad23bd4bc6eda38a9d69a88e247e6c1efd08442"
        }
      }
    };
    
    try {
      console.log(`Sending first batch request for launch: ${launchSlug}`);
      console.log(`Payload: ${JSON.stringify(payload.variables)}`);
      
      const response = await axios.post(this.baseUrl, payload, { headers: this.headers });
      
      // Save raw response to file for debugging
      const batchFile = path.join(outputDir, `launch_comments_batch_${batchNumber}_${launchSlug}.json`);
      fs.writeFileSync(batchFile, JSON.stringify(response.data, null, 2));
      console.log(`Saved batch ${batchNumber} raw data to: ${batchFile}`);
      
      // Debug: Log a preview of the response data
      const responsePreview = JSON.stringify(response.data).substring(0, 200) + "...";
      console.log(`Response preview: ${responsePreview}`);
      
      // Check if we have a valid response
      if (!response.data || !response.data.data || !response.data.data.post) {
        console.error("Invalid response format for first batch");
        return { 
          comments: [], 
          hasNextPage: false, 
          nextCursor: null, 
          totalCount: 0, 
          postId: null,
          rawResponse: response.data 
        };
      }
      
      // Extract relevant data from post
      const post = response.data.data.post;
      const totalCount = post.commentsCount || 0;
      const postId = post.id;
      
      console.log(`Post ID: ${postId}, Total comments: ${totalCount}`);
      
      // Extract comments from threads
      const comments = [];
      let hasNextPage = false;
      let nextCursor = null;
      
      if (post.threads && post.threads.edges) {
        console.log(`Found ${post.threads.edges.length} thread edges in post`);
        
        // Parse each comment thread
        post.threads.edges.forEach(edge => {
          if (!edge.node) return;
          
          // Parse the main comment and ignore replies for now
          const comment = this._parseCommentNode(edge.node, post);
          if (comment) {
            comments.push(comment);
          }
        });
        
        // Get pagination info
        if (post.threads.pageInfo) {
          hasNextPage = post.threads.pageInfo.hasNextPage || false;
          nextCursor = post.threads.pageInfo.endCursor || null;
          console.log(`Pagination: hasNextPage=${hasNextPage}, nextCursor=${nextCursor}`);
        }
      }
      
      console.log(`Parsed ${comments.length} comments from first batch`);
      
      return {
        comments,
        hasNextPage,
        nextCursor,
        totalCount,
        postId,
        rawResponse: response.data
      };
    } catch (error) {
      console.error(`ERROR FETCHING FIRST BATCH FOR ${launchSlug}:`, error.message);
      return { 
        comments: [], 
        hasNextPage: false, 
        nextCursor: null, 
        totalCount: 0, 
        postId: null,
        rawResponse: null 
      };
    }
  },
  
  /**
   * Fetch the next batch of comments using the Comments operation
   * @private
   */
  async _fetchNextCommentsBatch(postId, cursor, order = "VOTES", outputDir, batchNumber) {
    // Use the correct payload structure as observed in the example
    const payload = {
      "operationName": "Comments",
      "variables": {
        "commentsListSubjectThreadsCursor": cursor,
        "commentsThreadRepliesCursor": "",
        "commentsSubjectId": postId,
        "commentsSubjectType": "Post",
        "commentsListSubjectThreadsLimit": 20,
        "commentsListSubjectFilter": null,
        "order": order,
        "includeThreadForCommentId": null,
        "excludeThreadForCommentId": null
      },
      "extensions": {
        "persistedQuery": {
          "version": 1,
          "sha256Hash": "c6e0907909263976e488d25f9c5c667a45a4d1bb968ed825cb6e05a9c89d5d9c"
        }
      }
    };
    
    try {
      console.log(`Sending next batch request for post ID: ${postId} with cursor: ${cursor}`);
      console.log(`Payload: ${JSON.stringify(payload.variables)}`);
      
      const response = await axios.post(this.baseUrl, payload, { headers: this.headers });
      
      // Save raw response to file for debugging
      const batchFile = path.join(outputDir, `launch_comments_batch_${batchNumber}_cursor_${cursor}.json`);
      fs.writeFileSync(batchFile, JSON.stringify(response.data, null, 2));
      console.log(`Saved batch ${batchNumber} raw data to: ${batchFile}`);
      
      // Debug: Log a preview of the response data
      const responsePreview = JSON.stringify(response.data).substring(0, 200) + "...";
      console.log(`Response preview: ${responsePreview}`);
      
      // Print out response structure for debugging
      console.log("Response data structure:");
      if (response.data?.data) {
        console.log("Data keys:", Object.keys(response.data.data));
        
        if (response.data.data.subject) {
          console.log("Subject type:", response.data.data.subject.__typename);
        } else if (response.data.data.commentable) {
          console.log("Commentable found, type:", response.data.data.commentable.__typename);
        }
      }
      
      // Extract comments from response
      let comments = [];
      let hasNextPage = false;
      let nextCursor = null;
      
      // Check for different response structures
      if (response.data?.data?.subject?.threads) {
        // Original expected structure
        const subject = response.data.data.subject;
        const threads = subject.threads;
        
        console.log(`Found subject with threads, edge count: ${threads.edges?.length || 0}`);
        
        if (threads.edges && threads.edges.length > 0) {
          // Parse comments from thread edges
          comments = threads.edges
            .map(edge => {
              if (!edge.node) return null;
              return this._parseCommentNode(edge.node, subject);
            })
            .filter(comment => comment !== null);
          
          console.log(`Parsed ${comments.length} comments from thread edges`);
        }
        
        // Get pagination info
        if (threads.pageInfo) {
          hasNextPage = threads.pageInfo.hasNextPage || false;
          nextCursor = threads.pageInfo.endCursor || null;
          console.log(`Pagination from threads: hasNextPage=${hasNextPage}, nextCursor=${nextCursor}`);
        }
      } else if (response.data?.data?.commentable?.threads) {
        // Alternative structure with commentable instead of subject
        const commentable = response.data.data.commentable;
        const threads = commentable.threads;
        
        console.log(`Found commentable with threads, edge count: ${threads.edges?.length || 0}`);
        
        if (threads.edges && threads.edges.length > 0) {
          // Parse comments from thread edges
          comments = threads.edges
            .map(edge => {
              if (!edge.node) return null;
              return this._parseCommentNode(edge.node, {id: postId});
            })
            .filter(comment => comment !== null);
          
          console.log(`Parsed ${comments.length} comments from commentable threads`);
        }
        
        // Get pagination info
        if (threads.pageInfo) {
          hasNextPage = threads.pageInfo.hasNextPage || false;
          nextCursor = threads.pageInfo.endCursor || null;
          console.log(`Pagination from commentable: hasNextPage=${hasNextPage}, nextCursor=${nextCursor}`);
        }
      }
      
      return {
        comments,
        hasNextPage,
        nextCursor,
        rawResponse: response.data
      };
    } catch (error) {
      console.error(`ERROR FETCHING NEXT BATCH FOR POST ${postId}:`, error.message);
      return { 
        comments: [], 
        hasNextPage: false, 
        nextCursor: null,
        rawResponse: null 
      };
    }
  },
  
  /**
   * Parse a single comment node
   * @private
   */
  _parseCommentNode(node, contextObject) {
    if (!node) return null;
    
    try {
      // Get launch info from context
      const launchInfo = {
        id: contextObject.id || '',
        slug: contextObject.slug || '',
        name: contextObject.name || ''
      };
      
      // Parse initial replies if they exist
      const initialReplies = [];
      let hasMoreReplies = false;
      let repliesEndCursor = null;
      
      if (node.replies && node.replies.edges) {
        // Parse each initial reply
        node.replies.edges.forEach(replyEdge => {
          if (replyEdge.node) {
            // Need a _parseReplyNode function
            const reply = this._parseReplyNode(replyEdge.node, node.id, launchInfo);
            if (reply) {
              initialReplies.push(reply);
            }
          }
        });
        
        // Check if there are more replies to fetch based on pageInfo
        if (node.replies.pageInfo) {
          hasMoreReplies = node.replies.pageInfo.hasNextPage || false;
          repliesEndCursor = node.replies.pageInfo.endCursor || null;
        }
      }
      
      // Parse the main comment
      return {
        id: node.id || '',
        body: node.body || '',
        bodyHtml: node.bodyHtml || '',
        createdAt: node.createdAt || '',
        votesCount: node.votesCount || 0,
        isPinned: node.isPinned || false,
        isSticky: node.isSticky || false,
        repliesCount: node.repliesCount || 0, // Keep total count
        author: node.user ? {
          id: node.user.id || '',
          name: node.user.name || '',
          username: node.user.username || '',
          avatarUrl: node.user.avatarUrl || '',
          product: node.user.selectedBylineProduct ? {
            id: node.user.selectedBylineProduct.id || '',
            name: node.user.selectedBylineProduct.name || '',
            slug: node.user.selectedBylineProduct.slug || ''
          } : null
        } : null,
        badges: node.badges || [],
        url: node.url || '',
        path: node.path || '',
        launchInfo,
        replies: initialReplies, // Store initial replies
        hasMoreReplies, // Flag if pagination is needed
        repliesEndCursor // Cursor for fetching more
      };
    } catch (error) {
      console.error("Error parsing comment node:", error);
      return null;
    }
  },
  
  /**
   * Parse a reply node
   * @private
   */
  _parseReplyNode(node, parentId, launchInfo) {
    if (!node) return null;
    
    try {
      return {
        id: node.id || '',
        parentId: parentId,
        body: node.body || '',
        bodyHtml: node.bodyHtml || '',
        createdAt: node.createdAt || '',
        votesCount: node.votesCount || 0,
        isPinned: node.isPinned || false,
        isSticky: node.isSticky || false,
        author: node.user ? {
          id: node.user.id || '',
          name: node.user.name || '',
          username: node.user.username || '',
          avatarUrl: node.user.avatarUrl || '',
          product: node.user.selectedBylineProduct ? {
            id: node.user.selectedBylineProduct.id || '',
            name: node.user.selectedBylineProduct.name || '',
            slug: node.user.selectedBylineProduct.slug || ''
          } : null
        } : null,
        badges: node.badges || [],
        url: node.url || '',
        path: node.path || '',
        launchInfo // Include launch info for context
      };
    } catch (error) {
      console.error("Error parsing reply node:", error);
      return null;
    }
  },
  
  /**
   * Fetch and expand all replies for a comment that has more replies
   * @private
   */
  async _expandReplies(comment, productSlug, launchSlug) {
    // Check if we even need to fetch more based on counts and flags
    if (!comment.hasMoreReplies && comment.repliesCount <= (comment.replies?.length || 0)) {
      console.log(`Comment ${comment.id}: No more replies to fetch.`);
      return;
    }
    
    try {
      console.log(`Expanding replies for comment ${comment.id}...`);
      
      // Update referer header for the reply request
      this.headers.referer = `https://www.producthunt.com/products/${productSlug}`;
      
      let cursor = comment.repliesEndCursor || ""; // Start with initial cursor if available
      let allReplies = [...(comment.replies || [])]; // Start with initial replies
      let hasMoreRepliesToFetch = comment.hasMoreReplies;
      const MAX_FETCH_ATTEMPTS = 5; // Safety break
      let fetchAttempts = 0;

      // Get IDs of already fetched replies to exclude them in the FIRST request
      const initialExcludedIds = allReplies.map(reply => reply.id);
      let excludedCommentIds = [...initialExcludedIds]; // Copy for modification

      while (hasMoreRepliesToFetch && fetchAttempts < MAX_FETCH_ATTEMPTS) {
        fetchAttempts++;
        console.log(`Fetching reply page ${fetchAttempts} for comment ${comment.id} with cursor: "${cursor}"`);

        const payload = {
          "operationName": "CommentsThread",
          "variables": {
            "commentsThreadRepliesCursor": cursor,
            "includeCollapsed": true,
            "commentsThreadId": comment.id,
            // Only exclude initially fetched IDs on the first attempt
            "excludedCommentIds": fetchAttempts === 1 ? initialExcludedIds : [], 
            "includeThreadForCommentId": null
          },
          "extensions": {
            "persistedQuery": {
              "version": 1,
              "sha256Hash": "43666f5110463b1187da2e997404e7daead57fe0a95fd0cf0d148c0e297a3b0a"
            }
          }
        };
        
        console.log(`Excluding ${payload.variables.excludedCommentIds.length} IDs: ${payload.variables.excludedCommentIds.join(", ")}`);

        const response = await axios.post(this.baseUrl, payload, { headers: this.headers });
        
        // Process response
        if (response.data?.data?.comment?.replies) {
          const repliesData = response.data.data.comment.replies;
          
          // Get pagination info
          hasMoreRepliesToFetch = repliesData.pageInfo?.hasNextPage || false;
          cursor = repliesData.pageInfo?.endCursor || "";
          
          // Parse and add new replies
          if (repliesData.edges && repliesData.edges.length > 0) {
            const newReplies = repliesData.edges
              .map(edge => {
                if (!edge.node) return null;
                // Parse reply node
                return this._parseReplyNode(edge.node, comment.id, comment.launchInfo);
              })
              .filter(reply => reply !== null);
            
            console.log(`Found ${newReplies.length} additional replies`);
            
            // Add only unique replies to our collection
            const existingIds = new Set(allReplies.map(r => r.id));
            const uniqueNewReplies = newReplies.filter(r => !existingIds.has(r.id));
            
            if (uniqueNewReplies.length < newReplies.length) {
              console.log(`Filtered out ${newReplies.length - uniqueNewReplies.length} duplicate replies`);
            }

            allReplies = [...allReplies, ...uniqueNewReplies];
            console.log(`Total replies accumulated: ${allReplies.length}/${comment.repliesCount}`);

          } else {
            console.log("No additional reply edges found in this batch");
            hasMoreRepliesToFetch = false; // Stop if no new edges
          }
        } else {
          console.log("Invalid reply response format or no replies data");
          hasMoreRepliesToFetch = false;
        }
        
        // Apply delay before next request if needed
        if (hasMoreRepliesToFetch) {
          console.log(`Waiting ${this.requestDelay}ms before next replies request...`);
          await this.sleep(this.requestDelay);
        }
      }

      if (fetchAttempts >= MAX_FETCH_ATTEMPTS) {
        console.warn(`Reached max fetch attempts (${MAX_FETCH_ATTEMPTS}) for comment ${comment.id} replies.`);
      }
      
      // Update the original comment object with all fetched replies
      comment.replies = allReplies;
      comment.hasMoreReplies = false; // Mark as fully fetched
      comment.repliesEndCursor = null;
      
      console.log(`Updated comment ${comment.id} with ${allReplies.length} total replies`);
    } catch (error) {
      console.error(`Error expanding replies for comment ${comment.id}:`, error.message);
      // Keep initial replies if fetching failed
      comment.hasMoreReplies = true; // Indicate fetching failed
    }
  }
};

module.exports = launchComments;

// Example usage:
const test = async () => {
  const comments = await launchComments.fetchLaunchComments('lovable-visual-edits', { 
    limit: 300,
    order: 'VOTES'
  });
  console.log(`Fetched ${comments.parsedComments.length} comments`);
}

// Run the test
test(); 