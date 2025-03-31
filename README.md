# Product Hunt Reviews Scraper

Simple scraper for retrieving product reviews from Product Hunt.

## Product Reviews Module

### Basic Usage

```javascript
const productReviews = require('./src/productReviews');

// Fetch reviews for a product
async function getReviews() {
  try {
    const reviews = await productReviews.fetchReviews('lovable', {
      limit: 20 // Optional: limit number of reviews (null for all)
    });
    console.log(reviews);
  } catch (error) {
    console.error(error);
  }
}

getReviews();
```

### Gemini AI Integration

This module uses Google's Gemini AI to enhance reviews in two ways:

1. **Used to Build Field**: Extracts what users built with the product when mentioned in reviews.
2. **Sentiment Analysis**: For reviews without numerical ratings, analyzes text to determine sentiment (positive/negative/neutral).

### Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Set your Gemini API key in `.env`:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

### Output Format

Reviews are returned with the following fields:

```javascript
{
  reviewer: {
    name: "User Name",
    username: "username"
  },
  usedToBuild: "project name", // Extracted by Gemini AI (if mentioned)
  text: "Full review text",
  rating: 5, // Numerical rating (1-5) or null if not available
  sentiment: "positive", // Only set if no numerical rating (positive/negative/neutral)
  date: "2024-01-01T12:00:00-07:00",
  helpfulVotes: 10,
  id: "123456",
  url: "https://www.producthunt.com/products/product-name/reviews?review=123456", // Direct link to specific review
  isVerified: false,
  commentsCount: 2,
  hasVoted: false
}
``` 