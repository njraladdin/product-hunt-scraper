const productReviews = require('./productReviews');
const forumThreads = require('./forumThreads');
const utils = require('./utils');

/**
 * Main function to run the Product Hunt scraper
 */
async function main() {
  try {
    // Define the product slug we want to fetch reviews for
    const productSlugs = ['lovable'];
    
    
    for (const productSlug of productSlugs) {
      console.log(`\n========== PROCESSING ${productSlug} ==========\n`);

      
      // // Fetch product reviews
      // console.log(`Starting to fetch reviews for ${productSlug}...`);
      // const reviews = await productReviews.fetchReviews(productSlug, { limit: 30 });
      // console.log(`Fetched a total of ${reviews.length} reviews for ${productSlug}`);
      // utils.saveToFile(reviews, `${productSlug}_reviews`);
      
      // Fetch forum threads
      console.log(`\nStarting to fetch forum threads for ${productSlug}...`);
      const threads = await forumThreads.fetchThreads(productSlug, { limit: 30 });
      console.log(`Fetched a total of ${threads.length} forum threads for ${productSlug}`);
      utils.saveToFile(threads, `${productSlug}_forum_threads`);
      
      console.log(`\n========== COMPLETED ${productSlug} ==========\n`);
    }
    
    console.log('Process completed successfully!');
  } catch (error) {
    console.error('Error running the scraper:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 