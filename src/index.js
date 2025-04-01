const productReviews = require('./productReviews');
const forumThreads = require('./forumThreads');
const utils = require('./utils');
const productLaunches = require('./productLaunches');
const productDetails = require('./productDetails');
const productMakers = require('./productMakers');

/**
 * Main function to run the Product Hunt scraper
 */
async function main() {
  try {
    // Define the product slugs we want to fetch data for
    const productSlugs = ['lovable'];
    
    for (const productSlug of productSlugs) {
      console.log(`\n========== PROCESSING ${productSlug} ==========\n`);

      // // Fetch product reviews
      // console.log(`Starting to fetch reviews for ${productSlug}...`);
      // const reviews = await productReviews.fetchReviews(productSlug, { limit: 30 });
      // console.log(`Fetched a total of ${reviews.length} reviews for ${productSlug}`);
      
      // // Save reviews to output directory
      // utils.saveToOutputFolder(reviews, productSlug, 'reviews');
      
      // // Fetch product forum threads
      // console.log(`Starting to fetch forum threads for ${productSlug}...`);
      // const threads = await forumThreads.fetchAndFormatThreads(productSlug, { limit: 20, commentsLimit: 10 });
      // console.log(`Fetched a total of ${threads.threadCount} forum threads for ${productSlug}`);
      
      // // Save threads to output directory
      // utils.saveToOutputFolder(threads, productSlug, 'threads');
      
      // Fetch product launches
      console.log(`Starting to fetch launches for ${productSlug}...`);
      const launches = await productLaunches.fetchLaunchesWithComments(productSlug, { limit: 10, commentsLimit: 15 });
      console.log(`Fetched a total of ${launches.launchCount} launches for ${productSlug}`);
      
      // Save launches to output directory
      utils.saveToOutputFolder(launches, productSlug, 'launches');
      
      // Fetch product details
      console.log(`Starting to fetch details for ${productSlug}...`);
      const details = await productDetails.fetchDetails(productSlug);
      console.log(`Fetched details for ${productSlug}`);
      
      // Save details to output directory
      utils.saveToOutputFolder(details, productSlug, 'details');
      
      // Fetch product makers
      console.log(`Starting to fetch makers for ${productSlug}...`);
      const makers = await productMakers.fetchMakers(productSlug);
      console.log(`Fetched makers for ${productSlug}`);
      
      // Save makers to output directory
      utils.saveToOutputFolder(makers, productSlug, 'makers');
      
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