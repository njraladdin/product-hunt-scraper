const fs = require('fs');
const path = require('path');

/**
 * Utility functions for the Product Hunt scraper
 */
const utils = {
  /**
   * Save data to files in the test_output directory
   * @param {Object|Array} data - The data to save
   * @param {string} filename - Base filename (without extension)
   */
  saveToFile(data, filename) {
    // Create directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'test_output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Save as JSON
    const filePath = path.join(outputDir, `${filename}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Data saved to ${filePath}`);
    
    // Save as JSONL (if data is an array)
    if (Array.isArray(data)) {
      const jsonlPath = path.join(outputDir, `${filename}.jsonl`);
      const jsonlContent = data.map(item => JSON.stringify(item)).join('\n');
      fs.writeFileSync(jsonlPath, jsonlContent);
      console.log(`Data saved as JSONL to ${jsonlPath}`);
    }
  },

  /**
   * Save data to output folder with product-specific directory
   * @param {Object|Array} data - The data to save
   * @param {string} productSlug - Product slug to create folder for
   * @param {string} dataType - Type of data (e.g., 'reviews', 'forum_threads')
   */
  saveToOutputFolder(data, productSlug, dataType) {
    // Create output/productSlug directory if it doesn't exist
    const outputDir = path.join(process.cwd(), 'output', productSlug);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filename = `${dataType}`;
    
    // Save as JSON
    const jsonPath = path.join(outputDir, `${filename}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`Data saved as JSON to ${jsonPath}`);
  }
};

module.exports = utils; 