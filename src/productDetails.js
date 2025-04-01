const axios = require('axios');

/**
 * Functions for fetching product details from Product Hunt
 */
const productDetails = {
  baseUrl: 'https://www.producthunt.com/frontend/graphql',
  headers: {
    'accept': '*/*',
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'origin': 'https://www.producthunt.com',
    'referer': 'https://www.producthunt.com/products/', // Base referer, will be updated
    'x-requested-with': 'XMLHttpRequest',
  },
  requestDelay: 1000, // Optional: add delay if needed

  /**
   * Sleep function to delay execution (if needed)
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after the delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Fetch details for a specific product
   * @param {string} productSlug - The product slug (e.g., "lovable")
   * @returns {Promise<Object|null>} - Object containing product details or null if not found/error
   */
  async fetchDetails(productSlug) {
    try {
      console.log(`
===== FETCHING DETAILS FOR: ${productSlug} =====`);
      
      // Update the referer header for the specific product
      const specificHeaders = {
        ...this.headers,
        referer: `https://www.producthunt.com/products/${productSlug}/about`, // More specific referer
      };

      const payload = {
        operationName: "ProductAboutPage",
        variables: {
          productSlug: productSlug
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "c7495797778b271a67f42cc2709ed506dea300938c11173729e5266432732643"
          }
        }
      };

      const response = await axios.post(this.baseUrl, payload, { headers: specificHeaders });

      if (response.data && response.data.data && response.data.data.product) {
        const details = this._parseDetails(response.data.data.product);
        console.log(`
===== SUCCESSFULLY FETCHED DETAILS FOR: ${productSlug} =====
`);
        return details;
      } else {
        console.warn(`No product data found in response for ${productSlug}`);
        return null;
      }

    } catch (error) {
      console.error(`ERROR FETCHING DETAILS FOR ${productSlug}:`, error.message);
      if (error.response) {
        // Log more details if available (status code, data)
        console.error('Response Status:', error.response.status);
        console.error('Response Data:', JSON.stringify(error.response.data, null, 2)); 
      }
      // Decide if you want to re-throw or return null/empty object
      return null; 
    }
  },

  /**
   * Parse the product details from the API response
   * @private
   * @param {Object} productData - The product data object from the API response
   * @returns {Object} - Parsed product details
   */
  _parseDetails(productData) {
    if (!productData) {
      return {};
    }

    // Helper function to safely get nested properties
    const getSafe = (fn, defaultValue = null) => {
        try {
            return fn() ?? defaultValue;
        } catch (e) {
            return defaultValue;
        }
    };
    
    // Extract key details - adjust based on required data
    const details = {
      id: productData.id,
      slug: productData.slug,
      name: productData.name,
      description: productData.description,
      reviewsCount: productData.reviewsCount || 0,
      reviewsRating: productData.reviewsRating || null,
      postsCount: productData.postsCount || 0,
      stacksCount: productData.stacksCount || 0,
      alternativesCount: productData.alternativesCount || 0,
      shoutoutsToCount: productData.shoutoutsToCount || 0,
      categories: getSafe(() => productData.categories?.map(cat => ({
          id: cat.id,
          title: cat.title,
          slug: cat.to?.replace('/categories/', '') || ''
      })), []),
      media: getSafe(() => productData.media?.map(m => ({
          id: m.id,
          type: m.mediaType,
          imageUrl: m.imageUuid ? `https://ph-files.imgix.net/${m.imageUuid}` : null, // Construct image URL
          videoUrl: getSafe(() => m.metadata?.url, null), // Video URL if available
          platform: getSafe(() => m.metadata?.platform, null),
      })), []),
      // Simplified posts list
      posts: getSafe(() => productData.posts?.edges.map(edge => ({
        id: edge.node.id,
        slug: edge.node.slug,
        name: edge.node.name,
        tagline: edge.node.tagline,
        votesCount: edge.node.votesCount || 0,
        commentsCount: edge.node.commentsCount || 0,
        createdAt: edge.node.createdAt,
        thumbnailUrl: edge.node.thumbnailImageUuid ? `https://ph-files.imgix.net/${edge.node.thumbnailImageUuid}` : null,
      })), []),
      // Add more fields as needed, e.g., alternatives, stackers, discussion info
       discussionForumPath: getSafe(() => productData.discussionForum?.path, null),
    };

    return details;
  }
};

module.exports = productDetails; 

const test = async () => {
  const details = await productDetails.fetchDetails('lovable');
  console.log(details);
}

test();
