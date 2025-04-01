const axios = require('axios');

/**
 * Functions for fetching product makers from Product Hunt
 */
const productMakers = {
  baseUrl: 'https://www.producthunt.com/frontend/graphql',
  headers: {
    'accept': '*/*',
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'origin': 'https://www.producthunt.com',
    'referer': 'https://www.producthunt.com/products/', // Base referer, will be updated
    'x-requested-with': 'XMLHttpRequest',
  },
  requestDelay: 1000, // Optional delay

  /**
   * Sleep function to delay execution (if needed)
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Fetch makers for a specific product and correlate their activity from launches and threads.
   * @param {string} productSlug - The product slug (e.g., "lovable")
   * @param {Object} launchesData - Data object containing product launches and their comments.
   * @param {Object} threadsData - Data object containing forum threads and their comments.
   * @returns {Promise<Array|null>} - Array of maker objects with correlated activity or null if not found/error
   */
  async fetchMakers(productSlug, launchesData, threadsData) {
    try {
      console.log(`
===== FETCHING MAKERS FOR: ${productSlug} =====`);
      
      const specificHeaders = {
        ...this.headers,
        referer: `https://www.producthunt.com/products/${productSlug}`, // Referer for makers page
      };

      const payload = {
        operationName: "ProductPageMakers",
        variables: {
          slug: productSlug,
          cursor: null // Assuming we fetch all makers at once for now, pagination could be added later
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "9f028fe68e6c6894e895e66a2d417b1be76f7a06dc8c7f2dc74e23b5108bf385"
          }
        }
      };

      const response = await axios.post(this.baseUrl, payload, { headers: specificHeaders });

      if (response.data && response.data.data && response.data.data.product && response.data.data.product.makers) {
        const makersRawData = response.data.data.product.makers;
        // Pass launchesData and threadsData to _parseMakers
        const makers = this._parseMakers(makersRawData, launchesData, threadsData);
        console.log(`
===== SUCCESSFULLY FETCHED AND CORRELATED ${makers.length} MAKERS FOR: ${productSlug} =====
`);
        return makers;
      } else {
        console.warn(`No maker data found in response for ${productSlug}`);
        return null;
      }

    } catch (error) {
      console.error(`ERROR FETCHING MAKERS FOR ${productSlug}:`, error.message);
      if (error.response) {
        console.error('Response Status:', error.response.status);
        console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      }
      return null;
    }
  },

  /**
   * Parse the maker details from the API response and correlate activity.
   * @private
   * @param {Object} makersData - The makers connection object from the API response.
   * @param {Object} launchesData - Data object containing product launches and their comments.
   * @param {Object} threadsData - Data object containing forum threads and their comments.
   * @returns {Array} - Parsed list of makers with correlated activity.
   */
  _parseMakers(makersData, launchesData, threadsData) {
    if (!makersData || !makersData.edges) {
      return [];
    }

    // Pre-process comments for easier lookup by author ID
    const commentsByAuthor = {};

    // Process launch comments
    if (launchesData && launchesData.launches) {
      launchesData.launches.forEach(launch => {
        if (launch.comments) {
          launch.comments.forEach(comment => {
            const authorId = comment.author?.id;
            if (authorId) {
              if (!commentsByAuthor[authorId]) {
                commentsByAuthor[authorId] = { launchComments: [], forumComments: [], forumThreadsAuthored: [] };
              }
              commentsByAuthor[authorId].launchComments.push({
                commentId: comment.id,
                launchId: launch.id,
                launchName: launch.name,
                body: comment.body, // Keep it simple for now
                createdAt: comment.createdAt,
                votesCount: comment.votesCount,
                isSticky: comment.isSticky
              });
            }
            // Process replies within launch comments
            if (comment.replies) {
              comment.replies.forEach(reply => {
                  const replyAuthorId = reply.author?.id;
                  if (replyAuthorId) {
                      if (!commentsByAuthor[replyAuthorId]) {
                          commentsByAuthor[replyAuthorId] = { launchComments: [], forumComments: [], forumThreadsAuthored: [] };
                      }
                      // Add reply details, indicating it's a reply
                      commentsByAuthor[replyAuthorId].launchComments.push({
                          commentId: reply.id,
                          parentId: reply.parentId,
                          launchId: launch.id,
                          launchName: launch.name,
                          body: reply.body,
                          createdAt: reply.createdAt,
                          votesCount: reply.votesCount,
                          isReply: true
                      });
                  }
              });
            }
          });
        }
      });
    }

    // Process forum thread comments
    if (threadsData && threadsData.threads) {
      threadsData.threads.forEach(thread => {
        if (thread.comments) {
          thread.comments.forEach(comment => {
            const authorId = comment.authorDetails?.id;
            if (authorId) {
              if (!commentsByAuthor[authorId]) {
                commentsByAuthor[authorId] = { launchComments: [], forumComments: [], forumThreadsAuthored: [] };
              }
              commentsByAuthor[authorId].forumComments.push({
                commentId: comment.id,
                threadId: thread.id,
                threadTitle: thread.title,
                content: comment.content,
                date: comment.date,
                upvotesCount: comment.upvotesCount,
                isReply: false // Assuming top-level comment
              });
            }
            // Process replies within forum comments
            if (comment.replies) {
               comment.replies.forEach(reply => {
                  const replyAuthorId = reply.authorDetails?.id;
                   if (replyAuthorId) {
                       if (!commentsByAuthor[replyAuthorId]) {
                           commentsByAuthor[replyAuthorId] = { launchComments: [], forumComments: [], forumThreadsAuthored: [] };
                       }
                       commentsByAuthor[replyAuthorId].forumComments.push({
                           commentId: reply.id,
                           parentId: reply.parentId, // Assuming parentId exists
                           threadId: thread.id,
                           threadTitle: thread.title,
                           content: reply.content,
                           date: reply.date,
                           upvotesCount: reply.upvotesCount,
                           isReply: true
                       });
                   }
               });
            }
          });
        }
         // Process authored forum threads
         const threadAuthorId = thread.authorDetails?.id;
         if (threadAuthorId) {
             if (!commentsByAuthor[threadAuthorId]) {
                 commentsByAuthor[threadAuthorId] = { launchComments: [], forumComments: [], forumThreadsAuthored: [] };
             }
             commentsByAuthor[threadAuthorId].forumThreadsAuthored.push({
                 threadId: thread.id,
                 title: thread.title,
                 date: thread.date,
                 upvotesCount: thread.upvotesCount,
                 commentsCount: thread.commentsCount
             });
         }
      });
    }


    return makersData.edges.map(edge => {
      const maker = edge.node;
      if (!maker) return null; // Skip if node is somehow null

      // Safely extract made posts
      const madePosts = maker.madePosts?.edges.map(postEdge => ({
        id: postEdge.node.id,
        slug: postEdge.node.slug,
        name: postEdge.node.name,
        thumbnailUrl: postEdge.node.thumbnailImageUuid ? `https://ph-files.imgix.net/${postEdge.node.thumbnailImageUuid}` : null,
      })) || [];

      return {
        id: maker.id,
        name: maker.name,
        username: maker.username,
        headline: maker.headline || null, // Handle null headline
        avatarUrl: maker.avatarUrl,
        followersCount: maker.followersCount || 0,
        madePostsCount: madePosts.length,
        madePosts: madePosts,
        // Add correlated activity
        launchComments: commentsByAuthor[maker.id]?.launchComments || [],
        forumComments: commentsByAuthor[maker.id]?.forumComments || [],
        forumThreadsAuthored: commentsByAuthor[maker.id]?.forumThreadsAuthored || [],
      };
    }).filter(Boolean); // Filter out any null entries
  }
};

module.exports = productMakers;

/* // Remove or comment out the direct test call
const test = async () => {
  // Need mock data or actual fetched data for launches and threads to test correlation
  const mockLaunchesData = { launchCount: 0, launches: [] };
  const mockThreadsData = { threadCount: 0, threads: [] };
  const makers = await productMakers.fetchMakers('lovable', mockLaunchesData, mockThreadsData);
  if (makers) {
    // console.log(JSON.stringify(makers, null, 2)); // Log the full output
     console.log(`Found ${makers.length} makers.`);
     // Example: Log details for the first maker if exists
     if (makers.length > 0) {
       console.log(`\nFirst Maker (${makers[0].name}):`);
       console.log(`  Launch Comments: ${makers[0].launchComments.length}`);
       console.log(`  Forum Comments: ${makers[0].forumComments.length}`);
       console.log(`  Forum Threads Authored: ${makers[0].forumThreadsAuthored.length}`);
     }
  } else {
    console.log('Failed to fetch makers.');
  }
};

test();
*/ 