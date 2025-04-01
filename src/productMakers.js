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
   * Fetch makers for a specific product
   * @param {string} productSlug - The product slug (e.g., "lovable")
   * @returns {Promise<Array|null>} - Array of maker objects or null if not found/error
   */
  async fetchMakers(productSlug) {
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
        const makers = this._parseMakers(response.data.data.product.makers);
        console.log(`
===== SUCCESSFULLY FETCHED ${makers.length} MAKERS FOR: ${productSlug} =====
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
   * Parse the maker details from the API response
   * @private
   * @param {Object} makersData - The makers connection object from the API response
   * @returns {Array} - Parsed list of makers
   */
  _parseMakers(makersData) {
    if (!makersData || !makersData.edges) {
      return [];
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
      };
    }).filter(Boolean); // Filter out any null entries
  }
};

module.exports = productMakers;

// // Optional: Simple test case
const test = async () => {
  const makers = await productMakers.fetchMakers('lovable');
  if (makers) {
    console.log(JSON.stringify(makers, null, 2));
  } else {
    console.log('Failed to fetch makers.');
  }
};

test(); 