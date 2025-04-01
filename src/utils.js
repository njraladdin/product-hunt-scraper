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
    
    // Save as CSV (if data is an array)
    if (Array.isArray(data)) {
      const csvPath = path.join(outputDir, `${filename}.csv`);
      const csvContent = this.convertToCSV(data);
      fs.writeFileSync(csvPath, csvContent);
      console.log(`Data saved as CSV to ${csvPath}`);
    }
  },

  /**
   * Convert array of objects to CSV format
   * @param {Array} data - Array of objects to convert
   * @returns {string} - CSV formatted string
   */
  convertToCSV(data) {
    if (!data || !data.length) {
      return '';
    }

    // Extract headers (all unique keys from all objects)
    const headers = new Set();
    data.forEach(item => {
      this.extractKeys(item).forEach(key => headers.add(key));
    });
    
    // Convert headers set to array
    const headerRow = Array.from(headers);
    
    // Create CSV header row
    let csvContent = headerRow.map(header => this.escapeCSVValue(header)).join(',') + '\n';
    
    // Add data rows
    data.forEach(item => {
      const row = headerRow.map(header => {
        // Handle nested objects with dot notation
        const value = this.getNestedValue(item, header);
        return this.escapeCSVValue(value);
      });
      csvContent += row.join(',') + '\n';
    });
    
    return csvContent;
  },

  /**
   * Extract all keys from an object, including nested keys with dot notation
   * @param {Object} obj - Object to extract keys from
   * @param {string} prefix - Prefix for nested keys
   * @returns {Array} - Array of keys
   */
  extractKeys(obj, prefix = '') {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return [prefix].filter(Boolean);
    }
    
    return Object.keys(obj).reduce((keys, key) => {
      const value = obj[key];
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return [...keys, ...this.extractKeys(value, newPrefix)];
      }
      
      return [...keys, newPrefix];
    }, []);
  },

  /**
   * Get nested value from an object using dot notation
   * @param {Object} obj - Object to get value from
   * @param {string} path - Path with dot notation
   * @returns {*} - Value at the path
   */
  getNestedValue(obj, path) {
    const keys = path.split('.');
    let value = obj;
    
    for (const key of keys) {
      if (value === null || value === undefined || typeof value !== 'object') {
        return '';
      }
      value = value[key];
    }
    
    return value === null || value === undefined ? '' : value;
  },

  /**
   * Escape a value for CSV format
   * @param {*} value - Value to escape
   * @returns {string} - Escaped value
   */
  escapeCSVValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    
    // Convert to string
    const str = String(value);
    
    // Check if value needs to be quoted
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      // Escape double quotes with double quotes
      return `"${str.replace(/"/g, '""')}"`;
    }
    
    return str;
  }
};

module.exports = utils; 