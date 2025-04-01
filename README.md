# Product Hunt Scraper

Simple scraper for retrieving data from Product Hunt, including product reviews, forum threads, launches, details, and maker information.

## Project Structure

The scraper consists of several modules:

- **index.js**: Main entry point that orchestrates the scraping process
- **productReviews.js**: Fetches product reviews
- **forumThreads.js**: Fetches forum threads and comments
- **threadComments.js**: Processes and formats thread comments
- **productLaunches.js**: Fetches product launch data
- **launchComments.js**: Processes and formats launch comments
- **productDetails.js**: Fetches product information
- **productMakers.js**: Fetches data about product makers
- **geminiAIExtractor.js**: Uses Google's Gemini AI to enhance data with sentiment analysis
- **utils.js**: Provides utility functions for file operations and data processing

## How It Works

The scraper works by:

1. Taking a list of product slugs to scrape
2. For each product, it fetches reviews, forum threads, launch data, product details, and maker information
3. The data is processed and enriched using Gemini AI when appropriate
4. Results are saved as JSON files in an output directory

```javascript
// Example usage (from index.js)
const productSlugs = ['lovable'];
    
for (const productSlug of productSlugs) {
  // Fetch product reviews
  const reviews = await productReviews.fetchReviews(productSlug);
  
  // Fetch product forum threads
  const threads = await forumThreads.fetchAndFormatThreadsWithComments(productSlug);
  
  // Fetch product launches
  const launches = await productLaunches.fetchLaunchesWithComments(productSlug);
  
  // Fetch product details
  const details = await productDetails.fetchDetails(productSlug);
  
  // Fetch product makers
  const makers = await productMakers.fetchMakers(productSlug, launches, threads);
}
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

## Output Structure

The scraper generates the following JSON files in the `output/{product-name}/` directory:

### reviews.json

Contains product reviews with AI-enhanced data:

```javascript
[
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
    commentsCount: 2
  },
  // ... more reviews
]
```

### threads.json

Contains discussion threads and comments:

```javascript
{
  product: "product-name",
  threadCount: 5,
  threads: [
    {
      title: "Thread Title",
      author: "username",
      authorDetails: {
        id: "123456",
        name: "Author Name",
        url: "https://www.producthunt.com/@username",
        avatarUrl: "https://example.com/avatar.jpg"
      },
      date: "2025-03-09",
      isFeatured: false,
      upvotesCount: 105,
      commentsCount: 22,
      url: "https://www.producthunt.com/p/product-name/thread-slug",
      description: "Thread description content",
      id: "987654",
      comments: [
        {
          id: "111222",
          author: "commenter",
          authorDetails: {
            id: "333444",
            name: "Commenter Name",
            avatarUrl: "https://example.com/commenter-avatar.jpg"
          },
          content: "Comment text content",
          date: "2025-03-25",
          upvotesCount: 5,
          replyCount: 2,
          replies: [
            // nested replies with similar structure
          ]
        },
        // ... more comments
      ]
    },
    // ... more threads
  ]
}
```

### details.json

Contains general product information:

```javascript
{
  id: "123456",
  slug: "product-name",
  name: "Product Name",
  description: "Product description text",
  reviewsCount: 224,
  reviewsRating: 4.74,
  postsCount: 4,
  stacksCount: 677,
  alternativesCount: 5,
  shoutoutsToCount: 249,
  categories: [
    {
      id: "74",
      title: "Category Name",
      slug: "category-slug"
    }
    // ... more categories
  ],
  media: [
    {
      id: "987654",
      type: "image",
      imageUrl: "https://example.com/image.png",
      videoUrl: null,
      platform: null
    }
    // ... more media items
  ],
  posts: [
    {
      id: "112233",
      slug: "post-slug",
      name: "Post Name",
      tagline: "Post tagline",
      votesCount: 1013,
      commentsCount: 74,
      createdAt: "2025-02-13T00:01:00-08:00",
      thumbnailUrl: "https://example.com/thumbnail.png"
    }
    // ... more posts
  ],
  discussionForumPath: "/p/product-name"
}
```

### makers.json

Contains information about product makers:

```javascript
[
  {
    id: "123456",
    name: "Maker Name",
    username: "makerusername",
    headline: "Maker's headline or title",
    avatarUrl: "https://example.com/maker-avatar.png",
    followersCount: 224,
    madePostsCount: 3,
    madePosts: [
      {
        id: "112233",
        slug: "post-slug",
        name: "Post Name",
        thumbnailUrl: "https://example.com/thumbnail.png"
      }
      // ... more posts
    ],
    launchComments: [
      {
        commentId: "445566",
        parentId: "778899", // optional, for replies
        launchId: "112233",
        launchName: "Launch Name",
        body: "Comment text content",
        createdAt: "2025-02-11T06:11:43-08:00",
        votesCount: 34,
        isReply: true, // true for replies, false for top-level comments
        isSticky: false // true for pinned comments
      }
      // ... more comments
    ],
    forumComments: [
      // similar structure to launchComments
    ],
    forumThreadsAuthored: [
      {
        threadId: "334455",
        title: "Thread Title",
        date: "2025-02-13",
        upvotesCount: 1013,
        commentsCount: 74
      }
      // ... more threads
    ]
  },
  // ... more makers
]
```

### launches.json

Contains product launch information with associated comments:

```javascript
{
  product: "product-name",
  launchCount: 2,
  launches: [
    {
      id: "112233",
      slug: "launch-slug",
      name: "Launch Name",
      tagline: "Launch tagline",
      votesCount: 1013,
      commentsCount: 74,
      createdAt: "2025-02-13T00:01:00-08:00",
      thumbnailUrl: "https://example.com/thumbnail.png",
      comments: [
        {
          id: "445566",
          author: "commenter",
          authorDetails: {
            id: "333444",
            name: "Commenter Name",
            avatarUrl: "https://example.com/commenter-avatar.jpg" 
          },
          body: "Comment text content",
          createdAt: "2025-02-11T06:11:43-08:00",
          votesCount: 34,
          isReply: false,
          isSticky: false,
          replies: [
            // nested replies with similar structure
          ]
        },
        // ... more comments
      ]
    },
    // ... more launches
  ]
}
``` 