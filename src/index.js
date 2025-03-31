const productReviews = require('./productReviews');
const utils = require('./utils');

/**
 * Main function to run the Product Hunt scraper
 */
async function main() {
  try {
    // Define the product slug we want to fetch reviews for
    const productSlug = 'lovable';
    
    console.log(`Starting to fetch reviews for ${productSlug}...`);
    
    // Fetch all reviews for the product
    const reviews = await productReviews.fetchReviews(productSlug, { limit: 30 });
    
    console.log(`Fetched a total of ${reviews.length} reviews for ${productSlug}`);
    
    // Save the reviews to files in the test_output directory
    utils.saveToFile(reviews, `${productSlug}_reviews`);
    
    console.log('Process completed successfully!');
  } catch (error) {
    console.error('Error running the scraper:', error);
    process.exit(1);
  }
}

// Run the main function
main(); 