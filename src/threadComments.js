const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * Functions for fetching and managing comments from Product Hunt forum threads
 */
const threadComments = {
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
   * Fetch comments for a specific thread
   * @param {string} forumSlug - The forum slug (typically the product slug)
   * @param {string} threadSlug - The thread slug
   * @param {Object} options - Options for fetching comments 
   * @param {number} [options.limit] - Maximum number of comments to fetch (defaults to 10)
   * @param {string} [options.outputDir] - Directory to save comment data (defaults to 'test_output')
   * @param {boolean} [options.fetchAllReplies] - Whether to fetch all replies for comments (defaults to true)
   * @returns {Promise<Object>} - Object containing raw responses
   */
  async fetchComments(forumSlug, threadSlug, options = {}) {
    try {
      console.log(`\n===== FETCHING COMMENTS FOR THREAD: ${threadSlug} =====`);
      
      const { 
        limit = 10, 
        outputDir = path.join(process.cwd(), 'test_output'),
        fetchAllReplies = true
      } = options;
      
      // Update referer header for comments
      this.headers.referer = `https://www.producthunt.com/p/${forumSlug}/${threadSlug}`;
      this.headers['x-ph-referer'] = `https://www.producthunt.com/p/${forumSlug}/${threadSlug}`;
      
      const rawResponses = [];
      const parsedComments = [];
      const repliesRawResponses = [];
      let hasMoreComments = true;
      let cursor = ""; // Start with empty cursor
      let totalComments = 0;
      let totalExpectedComments = 0;
      let batchNumber = 0;
      
      while (hasMoreComments) {
        batchNumber++;
        console.log(`\n----- Fetching batch #${batchNumber} with cursor: "${cursor}" -----`);
        
        // Set up the payload for comment fetching
        const payload = {
          operationName: "PDiscussionRedesignQuery",
          variables: {
            // Critical: These cursor fields need to be correctly set
            commentsListSubjectThreadsCursor: cursor, // This appears to be the main cursor for getting different comments
            commentsThreadRepliesCursor: "", // This is for replies to comments, not the main comments
            threadSlug: threadSlug,
            forumSlug: forumSlug,
            commentsListSubjectThreadsLimit: 10, // Keep fixed
            includeThreadForCommentId: null,
            commentsListSubjectFilter: null,
            order: "DATE_DESC",
            excludeThreadForCommentId: null
          },
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash: "b283157452800ddc0235def608d63ce6e496d92b26317380a55cb92956088672"
            }
          }
        };
        
        console.log(`Request payload variables: ${JSON.stringify(payload.variables, null, 2)}`);
        
        const response = await axios.post(this.baseUrl, payload, { headers: this.headers });
        
        // Log the first 100 characters of the response
        const responseStr = JSON.stringify(response.data);
        console.log(`Response preview: ${responseStr.substring(0, 100)}...`);
        
        // Store the raw response
        rawResponses.push(response.data);
        
        // Initialize variables for this batch
        hasMoreComments = false;
        let commentsCount = 0;
        
        // Check if the thread has comments and get total count
        if (response.data && 
            response.data.data && 
            response.data.data.discussionForum && 
            response.data.data.discussionForum.thread && 
            response.data.data.discussionForum.thread.commentable) {
            
          const commentable = response.data.data.discussionForum.thread.commentable;
          
          // Get the total comments count if it's the first batch
          if (totalExpectedComments === 0 && commentable.commentsCount !== undefined) {
            totalExpectedComments = commentable.commentsCount;
            console.log(`Thread has ${totalExpectedComments} comments in total`);
          }
          
          // Extract debug info about threads and pagination from response
          if (commentable.threads) {
            console.log(`\nThreads object present. Comment threads total: ${commentable.threads.totalCount || 'unknown'}`);
            
            if (commentable.threads.pageInfo) {
              console.log(`Threads pageInfo: hasNextPage=${commentable.threads.pageInfo.hasNextPage}, endCursor=${commentable.threads.pageInfo.endCursor}`);
              
              // Update pagination state for next request
              hasMoreComments = commentable.threads.pageInfo.hasNextPage;
              cursor = commentable.threads.pageInfo.endCursor || ""; // Update cursor for next batch
              
              console.log(`Updated cursor to: ${cursor} for next batch`);
            } else {
              console.log("No pageInfo in threads object");
            }
          }
          
          // Parse comments from this response
          const batchComments = this.parseComments(response.data);
          
          // Log IDs of comments in this batch to help debugging
          if (batchComments.length > 0) {
            const commentIds = batchComments.map(c => c.id).join(', ');
            console.log(`Comment IDs in this batch: ${commentIds}`);
          }
          
          // Check for duplicates before adding
          const existingIds = new Set(parsedComments.map(c => c.id));
          const uniqueComments = batchComments.filter(c => !existingIds.has(c.id));
          
          if (uniqueComments.length < batchComments.length) {
            console.log(`Skipped ${batchComments.length - uniqueComments.length} duplicate comments`);
          }
          
          // If fetchAllReplies is enabled, fetch all replies for comments that have more
          if (fetchAllReplies) {
            console.log(`\n----- Fetching all replies for ${uniqueComments.length} comments -----`);
            
            for (let i = 0; i < uniqueComments.length; i++) {
              const comment = uniqueComments[i];
              
              if (comment.hasMoreReplies) {
                console.log(`\nComment ${comment.id} has more replies to fetch`);
                
                // Fetch all replies for this comment
                const allReplies = await this.fetchAllRepliesForComment(comment, forumSlug, threadSlug);
                
                // Update the comment with all replies
                comment.replies = allReplies;
                comment.hasMoreReplies = false; // We've fetched all replies
                
                // Store any raw responses from reply fetching
                if (allReplies.length > comment.replies.length) {
                  console.log(`Added ${allReplies.length - comment.replies.length} more replies`);
                }
              }
            }
          }
          
          // Add the unique comments to our collection
          parsedComments.push(...uniqueComments);
          commentsCount = uniqueComments.length;
          totalComments += commentsCount;
          
          console.log(`\nFetched batch of ${commentsCount} comments. Total so far: ${totalComments}`);
        } else {
          console.log("Invalid response structure or no commentable found");
        }
        
        // Stop if no new comments were found in this batch (likely pagination issue)
        if (commentsCount === 0) {
          console.log("No new comments in this batch, stopping pagination");
          hasMoreComments = false;
        }
        
        // Check if we've reached the limit
        if (limit !== null && totalComments >= limit) {
          console.log(`\n===== REACHED REQUESTED LIMIT OF ${limit} COMMENTS =====`);
          hasMoreComments = false;
        }
        
        // Apply delay before next batch request if there are more comments to fetch
        if (hasMoreComments) {
          console.log(`Waiting ${this.requestDelay}ms before next batch request...\n`);
          await this.sleep(this.requestDelay);
        }
      }
      
      console.log(`\n===== COMPLETED: FETCHED ${totalComments} OF ${totalExpectedComments} COMMENTS FOR THREAD ${threadSlug} =====\n`);
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Save raw comments to a file
      const rawCommentsFile = path.join(outputDir, `thread_comments_raw_${threadSlug}.json`);
      fs.writeFileSync(rawCommentsFile, JSON.stringify(rawResponses, null, 2));
      console.log(`\n===== SAVED RAW COMMENTS FOR THREAD '${threadSlug}' TO: ${rawCommentsFile} =====\n`);
      
      // Save parsed comments to a file
      const parsedCommentsFile = path.join(outputDir, `thread_comments_parsed_${threadSlug}.json`);
      fs.writeFileSync(parsedCommentsFile, JSON.stringify(parsedComments, null, 2));
      console.log(`\n===== SAVED PARSED COMMENTS FOR THREAD '${threadSlug}' TO: ${parsedCommentsFile} =====\n`);
      
      return {
        threadSlug,
        commentCount: totalComments,
        totalExpectedComments,
        parsedComments,
        rawResponses
      };
    } catch (error) {
      console.error(`ERROR FETCHING COMMENTS FOR THREAD ${threadSlug}:`, error.message);
      return { threadSlug, commentCount: 0, totalExpectedComments: 0, parsedComments: [], rawResponses: [] };
    }
  },

  /**
   * Fetch comments for multiple threads
   * @param {string} forumSlug - The forum slug (typically the product slug)
   * @param {Array<Object>} threads - Array of thread objects with slug property
   * @param {Object} options - Options for fetching comments
   * @param {number} [options.limit] - Maximum number of comments to fetch per thread
   * @param {string} [options.outputDir] - Directory to save comment data
   * @returns {Promise<Object>} - Object with threadsWithComments mapping thread slugs to their comments
   */
  async fetchCommentsForThreads(forumSlug, threads, options = {}) {
    try {
      console.log(`\n===== FETCHING COMMENTS FOR ${threads.length} THREADS =====\n`);
      
      const threadsWithComments = {};
      let currentThreadIndex = 0;
      
      for (const thread of threads) {
        currentThreadIndex++;
        // Skip threads without a slug
        if (!thread.slug) {
          console.log(`Thread #${currentThreadIndex} missing slug, skipping...`);
          continue;
        }
        
        console.log(`\nProcessing thread ${currentThreadIndex}/${threads.length}: "${thread.title}" (${thread.slug})`);
        
        // Get the thread slug and fetch comments
        const threadSlug = thread.slug;
        const result = await this.fetchComments(forumSlug, threadSlug, options);
        
        // Store the result in our map
        threadsWithComments[threadSlug] = result;
        
        // Apply delay before next thread
        if (currentThreadIndex < threads.length) {
          console.log(`Waiting ${this.requestDelay}ms before next thread...`);
          await this.sleep(this.requestDelay);
        }
      }
      
      console.log(`\n===== COMPLETED FETCHING COMMENTS FOR ${Object.keys(threadsWithComments).length} THREADS =====\n`);
      
      // Create a consolidated output file with all thread comments
      const { outputDir = path.join(process.cwd(), 'test_output') } = options;
      
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const consolidatedOutputFile = path.join(outputDir, `all_threads_comments.json`);
      fs.writeFileSync(consolidatedOutputFile, JSON.stringify(threadsWithComments, null, 2));
      console.log(`\n===== SAVED CONSOLIDATED THREAD COMMENTS TO: ${consolidatedOutputFile} =====\n`);
      
      return { threadsWithComments };
    } catch (error) {
      console.error('ERROR FETCHING COMMENTS FOR THREADS:', error.message);
      return { threadsWithComments: {} };
    }
  },

  /**
   * Parse comments from raw response data
   * @param {Object} responseData - Raw response data from API
   * @returns {Array} - Array of parsed comments
   */
  parseComments(responseData) {
    const parsedComments = [];
    
    try {
      // Check if we have a valid response with thread data
      if (!responseData || 
          !responseData.data || 
          !responseData.data.discussionForum ||
          !responseData.data.discussionForum.thread ||
          !responseData.data.discussionForum.thread.commentable) {
        return [];
      }
      
      const thread = responseData.data.discussionForum.thread;
      const commentable = thread.commentable;
      
      // Get threads which contain the comments
      if (!commentable.threads || !commentable.threads.edges) {
        return [];
      }
      
      // Loop through each thread
      commentable.threads.edges.forEach(threadEdge => {
        if (!threadEdge.node) return;
        
        const commentNode = threadEdge.node;
        
        // Parse the main comment
        const mainComment = this._parseCommentNode(commentNode, thread);
        if (mainComment) {
          // Add replies if they exist
          if (commentNode.replies && 
              commentNode.replies.edges && 
              Array.isArray(commentNode.replies.edges)) {
            
            mainComment.replies = commentNode.replies.edges
              .map(replyEdge => this._parseCommentNode(replyEdge.node, thread))
              .filter(reply => reply !== null);
            
            mainComment.hasMoreReplies = commentNode.replies.pageInfo && 
                                        commentNode.replies.pageInfo.hasNextPage;
            
            mainComment.repliesEndCursor = commentNode.replies.pageInfo && 
                                        commentNode.replies.pageInfo.endCursor;
          } else {
            mainComment.replies = [];
            mainComment.hasMoreReplies = false;
            mainComment.repliesEndCursor = null;
          }
          
          parsedComments.push(mainComment);
        }
      });
      
      return parsedComments;
    } catch (error) {
      console.error("Error parsing comments:", error);
      return [];
    }
  },
  
  /**
   * Parse a single comment node
   * @private
   * @param {Object} node - Comment node from API response
   * @param {Object} thread - Thread data for context
   * @returns {Object|null} - Parsed comment object or null if invalid
   */
  _parseCommentNode(node, thread) {
    if (!node) return null;
    
    try {
      return {
        id: node.id || '',
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
        parentId: node.parent ? node.parent.id : null,
        threadInfo: {
          id: thread.id || '',
          title: thread.title || '',
          slug: thread.slug || ''
        }
      };
    } catch (error) {
      console.error("Error parsing comment node:", error);
      return null;
    }
  },

  /**
   * Fetch additional replies for a comment
   * @param {string} commentId - The ID of the comment to fetch replies for
   * @param {string} cursor - The cursor for pagination
   * @param {Array} excludedCommentIds - IDs of comments already fetched
   * @param {string} forumSlug - The forum slug for the referer header
   * @param {string} threadSlug - The thread slug for the referer header
   * @returns {Promise<Object>} - Object containing parsed replies and pagination info
   */
  async fetchCommentReplies(commentId, cursor, excludedCommentIds, forumSlug, threadSlug) {
    try {
      console.log(`\n----- Fetching additional replies for comment ${commentId} with cursor: "${cursor}" -----`);
      console.log(`Excluding ${excludedCommentIds.length} already fetched replies: ${excludedCommentIds.join(', ')}`);
      
      // Update referer header for the request
      this.headers.referer = `https://www.producthunt.com/p/${forumSlug}/${threadSlug}`;
      this.headers['x-ph-referer'] = `https://www.producthunt.com/p/${forumSlug}`;
      
      // Set up the payload for fetching additional replies
      const payload = {
        operationName: "CommentsThread",
        variables: {
          commentsThreadRepliesCursor: cursor,
          includeCollapsed: true,
          commentsThreadId: commentId,
          // Only exclude IDs for the first request, as this seems to cause problems with pagination
          excludedCommentIds: cursor === "" ? (excludedCommentIds || []) : [],
          includeThreadForCommentId: null
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "43666f5110463b1187da2e997404e7daead57fe0a95fd0cf0d148c0e297a3b0a"
          }
        }
      };
      
      console.log(`Request payload for replies: ${JSON.stringify(payload.variables, null, 2)}`);
      
      const response = await axios.post(this.baseUrl, payload, { headers: this.headers });
      
      // Log the first 100 characters of the response
      const responseStr = JSON.stringify(response.data);
      console.log(`Response preview: ${responseStr.substring(0, 100)}...`);
      
      // Save the full response for debugging
      const outputDir = path.join(process.cwd(), 'test_output');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const debugFile = path.join(outputDir, `debug_replies_${commentId}_${new Date().getTime()}.json`);
      fs.writeFileSync(debugFile, JSON.stringify(response.data, null, 2));
      console.log(`Saved full reply data to ${debugFile} for debugging`);
      
      // Parse replies from the response
      let replies = [];
      let hasNextPage = false;
      let nextCursor = null;
      let totalRepliesCount = 0;
      
      if (response.data && 
          response.data.data && 
          response.data.data.comment) {
            
        const commentData = response.data.data.comment;
        
        // Get the total count of replies from the API
        totalRepliesCount = commentData.repliesCount || 0;
        console.log(`Total replies count reported by API: ${totalRepliesCount}`);
        
        if (commentData.replies) {
          const repliesData = commentData.replies;
          console.log(`Reply edges count in this response: ${repliesData.edges?.length || 0}`);
              
          // Extract the comment thread object that contains the replies
          if (repliesData.edges && Array.isArray(repliesData.edges)) {
            // Parse each reply and log their IDs
            replies = repliesData.edges
              .map(edge => {
                if (!edge.node) return null;
                
                // Create a simplified thread object to pass to _parseCommentNode
                const threadInfo = {
                  id: '',
                  title: '',
                  slug: threadSlug
                };
                
                const reply = this._parseCommentNode(edge.node, { id: '', title: '', slug: threadSlug });
                if (reply) {
                  console.log(`Parsed reply ID: ${reply.id}`);
                  
                  // Check if this reply has further nested replies
                  const nestedRepliesCount = edge.node.repliesCount || 0;
                  if (nestedRepliesCount > 0) {
                    console.log(`Reply ${reply.id} has ${nestedRepliesCount} nested replies`);
                    
                    // Add flag to indicate nested replies
                    reply.hasNestedReplies = true;
                    reply.nestedRepliesCount = nestedRepliesCount;
                    
                    // Add nested replies if they're in the response
                    if (edge.node.replies && edge.node.replies.edges) {
                      const nestedReplies = edge.node.replies.edges
                        .map(nestedEdge => this._parseCommentNode(nestedEdge.node, threadInfo))
                        .filter(r => r !== null);
                      
                      reply.nestedReplies = nestedReplies;
                      
                      console.log(`Added ${nestedReplies.length} nested replies to reply ${reply.id}`);
                    }
                  }
                }
                return reply;
              })
              .filter(reply => reply !== null);
            
            // Extract pagination info
            if (repliesData.pageInfo) {
              hasNextPage = repliesData.pageInfo.hasNextPage || false;
              nextCursor = repliesData.pageInfo.endCursor || "";
              
              console.log(`Reply pagination info: hasNextPage=${hasNextPage}, nextCursor=${nextCursor}`);
              console.log(`Total Count from API: ${repliesData.totalCount}`);
            }
          }
        } else {
          console.log("No replies data found in comment response");
        }
      }
      
      console.log(`Fetched ${replies.length} additional replies`);
      
      return {
        replies,
        hasNextPage,
        nextCursor,
        totalRepliesCount,
        rawResponse: response.data
      };
    } catch (error) {
      console.error(`ERROR FETCHING REPLIES FOR COMMENT ${commentId}:`, error.message);
      return { 
        replies: [], 
        hasNextPage: false, 
        nextCursor: null, 
        totalRepliesCount: 0,
        rawResponse: null 
      };
    }
  },
  
  /**
   * Fetch all replies for a comment that has more replies
   * @param {Object} comment - The comment object with basic replies
   * @param {string} forumSlug - The forum slug
   * @param {string} threadSlug - The thread slug
   * @returns {Promise<Array>} - Array of all replies for the comment
   */
  async fetchAllRepliesForComment(comment, forumSlug, threadSlug) {
    if (!comment.hasMoreReplies || !comment.repliesEndCursor) {
      return comment.replies || [];
    }
    
    try {
      // Let's take a different approach: fetch ALL replies in one go without using excludedCommentIds
      console.log(`\nFetching ALL replies for comment ${comment.id} directly without exclusions`);
      
      const result = await this.fetchCommentReplies(
        comment.id, 
        "", // Start with empty cursor to get ALL replies
        [], // Empty exclusion list
        forumSlug,
        threadSlug
      );
      
      // Get the total count of replies expected
      const expectedTotal = result.totalRepliesCount;
      console.log(`Expected total replies for this comment: ${expectedTotal}`);
      
      // Combine initial replies with new ones, removing duplicates
      let allReplies = [...(comment.replies || [])];
      
      if (result.replies && result.replies.length > 0) {
        // Create a map of existing replies by ID
        const existingRepliesMap = new Map();
        allReplies.forEach(reply => existingRepliesMap.set(reply.id, reply));
        
        // Add new replies that aren't already in our collection
        result.replies.forEach(reply => {
          if (!existingRepliesMap.has(reply.id)) {
            allReplies.push(reply);
          }
        });
        
        console.log(`Combined ${allReplies.length} total unique replies`);
      }
      
      // If we need to fetch additional pages, continue with normal pagination
      let hasMoreReplies = result.hasNextPage;
      let cursor = result.nextCursor;
      let fetchAttempts = 1; // We've already made one attempt
      const MAX_FETCH_ATTEMPTS = 5; // Prevent infinite loops
      
      // Fetch additional replies until there are no more
      while (hasMoreReplies && cursor && fetchAttempts < MAX_FETCH_ATTEMPTS) {
        fetchAttempts++;
        console.log(`\nFetching additional page of replies for comment ${comment.id} (attempt ${fetchAttempts}/${MAX_FETCH_ATTEMPTS})`);
        
        // Get IDs of already fetched replies
        const excludedCommentIds = allReplies.map(reply => reply.id);
        
        const nextResult = await this.fetchCommentReplies(
          comment.id, 
          cursor, 
          excludedCommentIds,
          forumSlug,
          threadSlug
        );
        
        // Add new replies to our collection
        if (nextResult.replies && nextResult.replies.length > 0) {
          console.log(`Fetched ${nextResult.replies.length} additional replies`);
          
          // Check for duplicates by ID before adding
          const existingIds = new Set(allReplies.map(r => r.id));
          const uniqueReplies = nextResult.replies.filter(r => !existingIds.has(r.id));
          
          if (uniqueReplies.length < nextResult.replies.length) {
            console.log(`Filtered out ${nextResult.replies.length - uniqueReplies.length} duplicate replies`);
          }
          
          allReplies = [...allReplies, ...uniqueReplies];
          console.log(`Total replies accumulated: ${allReplies.length}/${expectedTotal}`);
        } else {
          console.log(`No additional replies found in this batch`);
        }
        
        // Update pagination state
        hasMoreReplies = nextResult.hasNextPage;
        cursor = nextResult.nextCursor;
        
        console.log(`Next page exists: ${hasMoreReplies}, Next cursor: ${cursor || 'none'}`);
        
        // Add a delay before the next request
        if (hasMoreReplies) {
          console.log(`Waiting ${this.requestDelay}ms before next replies request...`);
          await this.sleep(this.requestDelay);
        }
      }
      
      console.log(`Fetched all ${allReplies.length} replies for comment ${comment.id}`);
      return allReplies;
    } catch (error) {
      console.error(`Error fetching all replies for comment ${comment.id}:`, error.message);
      return comment.replies || [];
    }
  },

  /**
   * Format comment data according to project requirements
   * @param {Array} comments - Array of parsed comments
   * @returns {Array} - Formatted comments
   */
  formatComments(comments) {
    if (!comments || !Array.isArray(comments)) {
      return [];
    }

    return comments.map(comment => {
      // Format the date in YYYY-MM-DD format if possible
      let formattedDate = comment.createdAt;
      try {
        const dateObj = new Date(comment.createdAt);
        if (!isNaN(dateObj.getTime())) {
          formattedDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
        }
      } catch (e) {
        // Keep original date format if parsing fails
      }

      // Format the comment according to requirements
      const formattedComment = {
        id: comment.id,
        author: comment.author.username,
        authorDetails: {
          id: comment.author.id,
          name: comment.author.name,
          url: comment.author.url,
          avatarUrl: comment.author.avatarUrl
        },
        content: comment.body,
        date: formattedDate,
        upvotesCount: comment.votesCount || 0,
        replyCount: (comment.replies && comment.replies.length) || 0
      };

      // Format and add replies if they exist
      if (comment.replies && comment.replies.length > 0) {
        formattedComment.replies = this.formatComments(comment.replies);
      } else {
        formattedComment.replies = [];
      }

      return formattedComment;
    });
  },

  /**
   * Update thread objects with formatted comments
   * @param {Array} threads - Array of thread objects
   * @param {Object} threadCommentsMap - Map of thread slugs to comments
   * @returns {Array} - Updated thread objects with formatted comments
   */
  updateThreadsWithComments(threads, threadCommentsMap) {
    if (!threads || !Array.isArray(threads)) {
      return [];
    }

    return threads.map(thread => {
      const threadSlug = thread.slug;
      const comments = threadCommentsMap[threadSlug] || [];
      
      // Format the comments and add them to the thread
      const formattedComments = this.formatComments(comments);
      return {
        ...thread,
        comments: formattedComments
      };
    });
  },
};

module.exports = threadComments;

// Example usage:
const test = async () => {
  // Let's fetch just 5 comments with a faster test run, but fetch all their replies
  const comments = await threadComments.fetchComments('lovable', 'lovable', { 
    limit: 5,
    fetchAllReplies: true
  });
}
test(); 