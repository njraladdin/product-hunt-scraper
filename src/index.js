const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const cheerio = require('cheerio');
const parseProductHuntData = require('./utils/parseProductHuntData');

/**
 * Makes a request to Product Hunt product page
 * @param {string} productSlug - The product slug (e.g., 'lovable', 'base44')
 * @returns {Promise<string>} - HTML response
 */
async function fetchProductPage(productSlug) {
  const url = `https://www.producthunt.com/products/${productSlug}`;
  
  const config = {
    method: 'get',
    maxBodyLength: Infinity,
    url: url,
    headers: { 
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7', 
      'accept-language': 'en-US,en;q=0.9,be;q=0.8,ar;q=0.7', 
      'cache-control': 'no-cache', 
      'dnt': '1', 
      'pragma': 'no-cache', 
      'priority': 'u=0, i', 
      'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"', 
      'sec-ch-ua-mobile': '?0', 
      'sec-ch-ua-platform': '"Windows"', 
      'sec-fetch-dest': 'document', 
      'sec-fetch-mode': 'navigate', 
      'sec-fetch-site': 'same-origin', 
      'sec-fetch-user': '?1', 
      'upgrade-insecure-requests': '1', 
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
    },
    timeout: 30000
  };

  try {
    console.log(`Fetching product page for: ${productSlug}`);
    const response = await axios.request(config);
    
    // Only log status code for debugging
    console.log(`Response status: ${response.status}`);
    
    return response.data;
  } catch (error) {
    console.error(`Error fetching product page for ${productSlug}:`, error.message);
    throw error;
  }
}

/**
 * Extracts JSON data from script tags in HTML
 * @param {string} html - HTML content
 * @returns {Array} - Array of extracted JSON data objects
 */
function extractJsonFromHtml(html) {
  try {
    const $ = cheerio.load(html);
    let jsonDataArray = [];
    
    // Loop through all script tags
    $('script').each((index, element) => {
      const content = $(element).html() || '';
      
      // Look for ApolloSSRDataTransport
      if (content.includes('ApolloSSRDataTransport')) {
        console.log(`Found script with ApolloSSRDataTransport at position ${index}`);
        
        // Simple direct regex to extract JSON after push(
        const match = content.match(/push\((\{.*\})\);?$/s);
        if (match && match[1]) {
          try {
            // Replace "undefined" with null before parsing
            const cleanedJson = match[1].replace(/:undefined,/g, ':null,').replace(/:undefined}/g, ':null}');
            
            // Parse the cleaned JSON data
            const parsedData = JSON.parse(cleanedJson);
            console.log(`Successfully parsed Apollo JSON data from script at position ${index}`);
            
            // Save each parsed data object with order number instead of position
            const orderNumber = jsonDataArray.length + 1;
            fs.writeFileSync(
              path.join(__dirname, '..', 'test_output', `apollo_data_${orderNumber}.json`), 
              JSON.stringify(parsedData, null, 2)
            );
            
            jsonDataArray.push(parsedData);
          } catch (jsonError) {
            console.error(`JSON parsing failed for script at position ${index}:`, jsonError.message);
          }
        }
      }
    });
    
    if (jsonDataArray.length === 0) {
      throw new Error('No Apollo JSON data found in any script tag');
    }
    
    console.log(`Found and parsed ${jsonDataArray.length} Apollo data scripts`);
    
    // Create a merged JSON file with all apollo data
    if (jsonDataArray.length > 1) {
      // Create a container object with each apollo data as a numbered property
      const mergedData = {};
      jsonDataArray.forEach((data, index) => {
        mergedData[`apollo_data_${index + 1}`] = data;
      });
      
      fs.writeFileSync(
        path.join(__dirname, '..', 'test_output', 'apollo_data_merged.json'),
        JSON.stringify(mergedData, null, 2)
      );
      console.log('Created merged Apollo data file with all parsed objects');
    }
    
    return jsonDataArray;
  } catch (error) {
    console.error('Error extracting JSON data from HTML:', error.message);
    throw error;
  }
}

/**
 * Cleans up JSON data to remove problematic values
 * @param {Object} data - JSON data to clean
 * @returns {Object} - Cleaned JSON data
 */
function cleanupJsonData(data) {
  // Return original data if it's not an object or is null
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => cleanupJsonData(item));
  }
  
  // Handle objects
  const cleanedData = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip undefined values
    if (value === undefined) {
      continue;
    }
    
    // Replace "undefined" string values with null
    if (value === 'undefined') {
      cleanedData[key] = null;
      continue;
    }
    
    // Recursively clean nested objects and arrays
    if (value && typeof value === 'object') {
      cleanedData[key] = cleanupJsonData(value);
    } else {
      cleanedData[key] = value;
    }
  }
  
  return cleanedData;
}

/**
 * Saves data to a JSON file
 * @param {string} filename - Name of the file
 * @param {Object} data - Data to save
 */
async function saveToJsonFile(filename, data) {
  try {
    const outputDir = path.join(__dirname, '..', 'test_output');
    await fs.ensureDir(outputDir);
    
    const filePath = path.join(outputDir, filename);
    await fs.writeJson(filePath, data, { spaces: 2 });
    console.log(`Data saved to ${filePath}`);
    return filePath;
  } catch (error) {
    console.error(`Error saving data to file ${filename}:`, error.message);
    throw error;
  }
}

/**
 * Main function to scrape a product page
 * @param {string} productSlug - The product slug
 */
async function scrapeProductPage(productSlug) {
  try {
    // Fetch the product page HTML
    const html = await fetchProductPage(productSlug);
    
    // Save the raw HTML for debugging
    const outputDir = path.join(__dirname, '..', 'test_output');
    await fs.ensureDir(outputDir);
    const htmlPath = path.join(outputDir, `${productSlug}_raw.html`);
    await fs.writeFile(htmlPath, html);
    console.log(`Raw HTML saved to ${htmlPath}`);
    
    // Extract the JSON data - this will save individual JSON files
    const jsonDataArray = extractJsonFromHtml(html);
    
    // Get the merged data for parsing
    const mergedData = {};
    jsonDataArray.forEach((data, index) => {
      mergedData[`apollo_data_${index + 1}`] = data;
    });
    
    // Parse the merged data into a structured format
    console.log('Parsing Apollo data into structured format...');
    const structuredData = parseProductHuntData(mergedData);
    
    // Save the structured data to a file
    const structuredPath = path.join(outputDir, `${productSlug}_structured.json`);
    await fs.writeJson(structuredPath, structuredData, { spaces: 2 });
    console.log(`Structured data saved to ${structuredPath}`);
    
    // Print a summary of the data extracted
    console.log(`\nData Summary for ${productSlug}:`);
    console.log(`Product Name: ${structuredData.productName}`);
    console.log(`Reviews: ${structuredData.productReviews.length}`);
    console.log(`Forum Threads: ${structuredData.forumThreads.length}`);
    console.log(`Launches: ${structuredData.launchInformation.length}`);
    console.log(`Makers: ${structuredData.makerInformation.makerNames.length}`);
    console.log(`Maker Comments: ${structuredData.makerInformation.makerComments.length}`);
    
    console.log(`Successfully scraped data for ${productSlug}`);
    return { jsonDataArray, structuredData };
  } catch (error) {
    console.error(`Failed to scrape product ${productSlug}:`, error.message);
    throw error;
  }
}

/**
 * Main execution function
 */
async function main() {
  const isTestMode = process.argv.includes('test');
  
  // Product slugs to scrape
  const productSlugs = [
    'lovable',
    // 'base44',
    // 'bolt-new'
  ];
  
  // In test mode, just scrape the first product
  const slugsToScrape = isTestMode ? [productSlugs[0]] : productSlugs;
  
  try {
    // Normal scraping mode
    for (const slug of slugsToScrape) {
      await scrapeProductPage(slug);
    }
    console.log('Scraping completed successfully');
  } catch (error) {
    console.error('Scraping failed:', error.message);
    process.exit(1);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}

// Export functions for potential use in other files
module.exports = {
  fetchProductPage,
  extractJsonFromHtml,
  cleanupJsonData,
  saveToJsonFile,
  scrapeProductPage
}; 