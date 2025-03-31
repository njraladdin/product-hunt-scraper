const axios = require('axios');
require('dotenv').config(); // Add dotenv config to ensure env vars are loaded

/**
 * Module for extracting information from reviews using Gemini AI
 */
const geminiExtractor = {
  apiKey: process.env.GEMINI_API_KEY,
  modelId: 'gemini-2.0-flash-lite',
  apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  
  /**
   * Set the Gemini API key 
   * @param {string} key - Gemini API key
   */
  setApiKey(key) {
    this.apiKey = key;
  },
  
  /**
   * Extract "used this to build" information from a batch of reviews
   * @param {Array} reviews - Array of review objects
   * @param {number} batchSize - Number of reviews to process per batch (default: 10)
   * @returns {Promise<Array>} - Reviews with enhanced "usedToBuild" field
   */
  async extractUsedToBuildField(reviews, batchSize = 10) {
    if (!this.apiKey) {
      console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Found in env" : "Not found in env");
      throw new Error('Gemini API key is required. Set it using setApiKey() or GEMINI_API_KEY environment variable.');
    }
    
    try {
      console.log(`Processing ${reviews.length} reviews with Gemini AI in batches of ${batchSize}`);
      const enhancedReviews = [...reviews]; // Clone the reviews array
      
      // Process reviews in batches
      for (let i = 0; i < reviews.length; i += batchSize) {
        const batch = reviews.slice(i, i + batchSize);
        console.log(`\n----- Processing batch ${Math.floor(i/batchSize) + 1} (${batch.length} reviews) -----`);
        
        const extractionResults = await this._processReviewBatch(batch);
        
        // Update the enhanced reviews with the extraction results and log them
        console.log(`\n----- "Used to build" extraction results -----`);
        for (let j = 0; j < batch.length; j++) {
          if (extractionResults[j] && extractionResults[j].usedToBuild) {
            enhancedReviews[i + j].usedToBuild = extractionResults[j].usedToBuild;
            // Log the reviewer name and what they built (if anything)
            const review = batch[j];
            const builtText = extractionResults[j].usedToBuild || "nothing";
            console.log(`[${i + j + 1}] ${review.reviewer.name}: "${builtText}"`);
          }
        }
        console.log(`----- End of extraction results -----\n`);
      }
      
      return enhancedReviews;
    } catch (error) {
      console.error('ERROR EXTRACTING WITH GEMINI AI:', error.message);
      throw error; // Don't return original reviews, propagate the error
    }
  },
  
  /**
   * Extract sentiment from review text when numerical rating is not available
   * @param {Array} reviews - Array of review objects without ratings
   * @param {number} batchSize - Number of reviews to process per batch (default: 10)
   * @returns {Promise<Array>} - Reviews with sentiment analysis results
   */
  async extractSentiment(reviews, batchSize = 10) {
    if (!this.apiKey) {
      console.log("GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "Found in env" : "Not found in env");
      throw new Error('Gemini API key is required. Set it using setApiKey() or GEMINI_API_KEY environment variable.');
    }
    
    try {
      // Filter reviews that need sentiment analysis (no rating)
      const reviewsNeedingSentiment = reviews.filter(review => 
        review.rating === null || review.rating === undefined
      );
      
      if (reviewsNeedingSentiment.length === 0) {
        console.log("No reviews need sentiment analysis - all have numerical ratings");
        return reviews;
      }
      
      console.log(`Performing sentiment analysis on ${reviewsNeedingSentiment.length} reviews without ratings`);
      const enhancedReviews = [...reviews]; // Clone the reviews array
      
      // Process reviews in batches
      for (let i = 0; i < reviewsNeedingSentiment.length; i += batchSize) {
        const batch = reviewsNeedingSentiment.slice(i, i + batchSize);
        console.log(`\n----- Processing sentiment for batch ${Math.floor(i/batchSize) + 1} (${batch.length} reviews) -----`);
        
        const sentimentResults = await this._processSentimentBatch(batch);
        
        // Update the enhanced reviews with the sentiment results and log them
        console.log(`\n----- Sentiment analysis results -----`);
        for (let j = 0; j < batch.length; j++) {
          if (sentimentResults[j] && sentimentResults[j].sentiment) {
            // Find the original review in the full array
            const originalIndex = reviews.findIndex(r => r.id === batch[j].id);
            if (originalIndex !== -1) {
              // Add sentiment to the dedicated field, not the rating field
              enhancedReviews[originalIndex].sentiment = sentimentResults[j].sentiment;
              // Log the reviewer name and sentiment
              const review = batch[j];
              console.log(`[${originalIndex + 1}] ${review.reviewer.name}: Sentiment "${sentimentResults[j].sentiment}"`);
            }
          }
        }
        console.log(`----- End of sentiment results -----\n`);
      }
      
      return enhancedReviews;
    } catch (error) {
      console.error('ERROR EXTRACTING SENTIMENT WITH GEMINI AI:', error.message);
      throw error;
    }
  },
  
  /**
   * Process a batch of reviews with Gemini AI
   * @private
   */
  async _processReviewBatch(reviewBatch) {
    // Prepare the reviews for the prompt
    const reviewTexts = reviewBatch.map((review, index) => 
      `Review ${index + 1}: ${review.text}`
    ).join('\n\n');
    
    const prompt = `
Extract "used this to build" information from the following product reviews. 
If a review mentions that the user "used this to build" something, extract what they built. 
If there's no such mention, leave it blank.

Here are some examples:

Example 1: "I used this to build my personal website and it was great."
Result: "personal website"

Example 2: "This product is amazing for building apps."
Result: "" (empty because it doesn't specifically say "used this to build")

Example 3: "I have used this to build a Chrome extension called 'TabManager'."
Result: "Chrome extension called 'TabManager'"

Example 4: "Used this product to create a landing page for my business."
Result: ""

Example 5: "I used this tool to build my portfolio site with animations."
Result: "portfolio site with animations"

For each review, determine if the user mentions what they built with the product.

Here are the reviews:

${reviewTexts}
`;

    // Define response schema for structured JSON output
    const requestData = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: {
                type: "integer",
                description: "The 1-based index of the review"
              },
              usedToBuild: {
                type: "string",
                description: "What the user mentioned they built with the product, or empty string if not mentioned"
              }
            },
            required: ["index", "usedToBuild"]
          }
        }
      }
    };
    
    const url = `${this.apiEndpoint}/${this.modelId}:generateContent?key=${this.apiKey}`;
    
    try {
      console.log("Sending request to Gemini API...");
      
      const response = await axios.post(url, requestData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log("Received response from Gemini API");
      
      // Parse the response to get the extracted information
      if (!response.data || 
          !response.data.candidates || 
          !response.data.candidates[0] || 
          !response.data.candidates[0].content || 
          !response.data.candidates[0].content.parts || 
          !response.data.candidates[0].content.parts[0]) {
        throw new Error('Invalid response structure from Gemini API');
      }
      
      const part = response.data.candidates[0].content.parts[0];
      
      // Parse the JSON response
      let extractedData;
      
      try {
        // Parse the response text as JSON
        extractedData = JSON.parse(part.text);
        console.log("Successfully parsed Gemini response");
      } catch (parseError) {
        console.error('ERROR PARSING GEMINI RESPONSE:', parseError.message);
        throw new Error('Failed to parse Gemini response as JSON');
      }
      
      // Map the results to match the review indices (converting from 1-based to 0-based)
      return extractedData.map(item => ({
        index: item.index - 1,
        usedToBuild: item.usedToBuild || ''
      }));
    } catch (error) {
      console.error('ERROR WITH GEMINI API:', error.message);
      throw error;
    }
  },
  
  /**
   * Process a batch of reviews for sentiment analysis
   * @private
   */
  async _processSentimentBatch(reviewBatch) {
    // Prepare the reviews for the prompt
    const reviewTexts = reviewBatch.map((review, index) => 
      `Review ${index + 1}: ${review.text}`
    ).join('\n\n');
    
    const prompt = `
Analyze the sentiment of the following product reviews. 
Classify each review as "positive", "negative", or "neutral" based on the overall tone and content.

Here are some examples:

Example 1: "This is a great product. I love how easy it is to use."
Sentiment: "positive"

Example 2: "This product is terrible. Wasted my money."
Sentiment: "negative"

Example 3: "The product works as described. Nothing special but gets the job done."
Sentiment: "neutral"

For each review, determine the sentiment as accurately as possible.

Here are the reviews:

${reviewTexts}
`;

    // Define response schema for structured JSON output
    const requestData = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              index: {
                type: "integer",
                description: "The 1-based index of the review"
              },
              sentiment: {
                type: "string",
                description: "The sentiment of the review: 'positive', 'negative', or 'neutral'"
              },
              explanation: {
                type: "string",
                description: "Brief explanation of why this sentiment was chosen"
              }
            },
            required: ["index", "sentiment"]
          }
        }
      }
    };
    
    const url = `${this.apiEndpoint}/${this.modelId}:generateContent?key=${this.apiKey}`;
    
    try {
      console.log("Sending sentiment analysis request to Gemini API...");
      
      const response = await axios.post(url, requestData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log("Received sentiment analysis response from Gemini API");
      
      // Parse the response
      if (!response.data || 
          !response.data.candidates || 
          !response.data.candidates[0] || 
          !response.data.candidates[0].content || 
          !response.data.candidates[0].content.parts || 
          !response.data.candidates[0].content.parts[0]) {
        throw new Error('Invalid response structure from Gemini API');
      }
      
      const part = response.data.candidates[0].content.parts[0];
      
      // Parse the JSON response
      let extractedData;
      
      try {
        // Parse the response text as JSON
        extractedData = JSON.parse(part.text);
        console.log("Successfully parsed Gemini sentiment analysis response");
      } catch (parseError) {
        console.error('ERROR PARSING GEMINI SENTIMENT RESPONSE:', parseError.message);
        throw new Error('Failed to parse Gemini sentiment response as JSON');
      }
      
      // Map the results to match the review indices
      return extractedData.map(item => ({
        index: item.index - 1,
        sentiment: item.sentiment || 'neutral',
        explanation: item.explanation || ''
      }));
    } catch (error) {
      console.error('ERROR WITH GEMINI SENTIMENT API:', error.message);
      throw error;
    }
  }
};

module.exports = geminiExtractor; 