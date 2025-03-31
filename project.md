Project Scope:

The core task is to extract ALL the data from the following Product Hunt URLs:

https://www.producthunt.com/products/lovable
https://www.producthunt.com/products/base44
https://www.producthunt.com/products/bolt-new

DATA EXTRACTION REQUIREMENTS:

Extract all data for all companies. Data must be easily sortable and accessible.

MODULE 1: PRODUCT REVIEWS
- Reviewer's Name: Full name as displayed.
- "Used this to build X": If the reviewer mentions using the product to build something (e.g., "used this to build Sherloq"), extract the name of what they built ("Sherloq"). If this isn't present, leave the field blank.
- Review Text: The complete text of the review.
- Rating: If a numerical rating (e.g., 4.77/5) is explicitly stated, extract it. If no numerical rating is given, infer the sentiment as "positive," "negative," or "neutral" based on the review text. Provide a clear explanation of your sentiment analysis methodology.
- Date of Review: Extract the date in a consistent format (YYYY-MM-DD if possible, otherwise, preserve the original format).
- "Helpful" Votes: The number of "Helpful" votes (or similar interaction metrics).
- Any other interaction data on the review.

MODULE 2: FORUM THREADS
- Thread Title: The exact title of the forum thread.
- Author: The username of the thread creator.
- Date: Date of the thread creation (YYYY-MM-DD if possible).
- Featured Status: Note if a thread is marked as "Featured".
- All Comments within the Thread: Each comment should be treated as a separate data point, with:
  * Comment Author
  * Comment Text
  * Date of Comment
  * Upvotes or other interaction data on the comment.
- Upvotes: The total upvotes for the thread itself.
- Any other interaction data on the thread.

MODULE 3: LAUNCH INFORMATION
- Launch Title: The title of each product launch (e.g., "Bolt x Figma").
- Launch Description: The accompanying description.
- Launch Date: (YYYY-MM-DD if possible).
- Upvotes: The number of upvotes for the launch.
- Comments: Any comments associated with the launch (treat these like forum comments).

MODULE 4: MAKER INFORMATION
- Maker's Name: If available, extract the names of the product makers.
- Maker's Comments: Any comments made by identified makers, categorized appropriately (as a review, forum comment, etc.).

MODULE 5: PRODUCT DETAILS
- Product Description: The main product description text from the "What is [Product Name]?" section.
- Product Status: Whether the product is "Claimed" (Yes/No).
- Follower Count: The number of followers for the product.
- Shoutouts: The number of shoutouts (if present).
- Number of Reviews
- Overall Rating

OUTPUT FORMAT:

JSON Lines (.jsonl) and CSV files separated by each product. Delivery required 24 hours after job award.