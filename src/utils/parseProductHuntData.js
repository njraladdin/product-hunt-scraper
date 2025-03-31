/**
 * Parses Product Hunt Apollo data into a structured format.
 * @param {object} data The raw JSON data object.
 * @returns {object} The structured data.
 */
function parseProductHuntData(data) {
    // Initialize the result structure with null defaults
    const result = {
        productName: null, // Added for context
        productDescription: null,
        productStatus: null,
        followerCount: null,
        shoutouts: null,
        numberOfReviews: null,
        overallRating: null,
        productReviews: [],
        forumThreads: [],
        launchInformation: [],
        makerInformation: {
            makerNames: [],
            makerComments: [] // Comments made *by* makers
        }
    };

    // Helper function to safely format dates (YYYY-MM-DD)
    const formatDate = (isoString) => {
        if (!isoString) return null;
        try {
            // Extract only the date part
            return new Date(isoString).toISOString().split('T')[0];
        } catch (e) {
            console.warn(`Could not parse date: ${isoString}`);
            return isoString; // Return original if parsing fails
        }
    };

    // --- Locate Primary Product Data ---
    // Data seems split between apollo_data_1 and apollo_data_2 under specific keys
    // ':R4vff9jrpkq:' in data_1 seems to have basic info + makers
    // ':R6fjcvff9jrpkq:' in data_2 seems to have description, reviews, posts, detailed forum
    const productData1 = data?.apollo_data_1?.rehydrate?.[':R4vff9jrpkq:']?.data?.product;
    const productData2 = data?.apollo_data_2?.rehydrate?.[':R6fjcvff9jrpkq:']?.data?.product;

    // Use productData2 as primary for most fields if available, fallback to productData1
    const mainProduct = productData2 || productData1;

    if (!mainProduct) {
        console.error("Could not find primary product data in the expected locations.");
        return result; // Return the default empty structure
    }

    // --- Extract Core Product Information ---
    result.productName = mainProduct?.name ?? null;
    result.productDescription = productData2?.description ?? mainProduct?.tagline ?? null; // Prefer full description
    result.productStatus = mainProduct?.isClaimed ? "Yes" : "No";
    result.followerCount = mainProduct?.followersCount ?? null;
    result.shoutouts = mainProduct?.shoutoutsToCount ?? null;
    result.numberOfReviews = mainProduct?.reviewsCount ?? null;
    result.overallRating = mainProduct?.reviewsRating ?? null;

    // --- Extract Maker Information (primarily from productData1) ---
    const makerIds = new Set();
    if (productData1?.makers?.edges) {
        result.makerInformation.makerNames = productData1.makers.edges.map(edge => {
            const maker = edge?.node;
            if (maker?.id) {
                makerIds.add(maker.id); // Store ID to identify maker comments later
            }
            return maker?.name ?? null;
        }).filter(name => name !== null); // Remove any null entries if mapping failed
    }

    // --- Extract Product Reviews (from productData2) ---
    if (productData2?.reviews?.edges) {
        result.productReviews = productData2.reviews.edges.map(edge => {
            const review = edge?.node;
            if (!review) return null;

            // Attempt to extract "Used this to build X" - This is heuristic and may need refinement
            let usedToBuildX = null;
            const reviewTextLower = review.body?.toLowerCase() || '';
            // Look for patterns like "built X", "created Y", "used this to build Z"
            const buildMatch = review.body?.match(/(?:build|built|created)\s+([A-Z][a-zA-Z0-9\s.-]+)/i);
            const useMatch = review.body?.match(/used this to build\s+([A-Z][a-zA-Z0-9\s.-]+)/i);

            if (useMatch && useMatch[1]) {
                usedToBuildX = useMatch[1].trim().replace(/\.$/, ''); // Simple extraction
            } else if (buildMatch && buildMatch[1]) {
                usedToBuildX = buildMatch[1].trim().replace(/\.$/, ''); // Simple extraction
            }

            const reviewData = {
                reviewerName: review.user?.name ?? null,
                usedThisToBuildX: usedToBuildX,
                reviewText: review.body ?? null,
                // Rating: The data provides a numerical rating, so sentiment inference isn't needed here.
                // If rating were null, we would add sentiment analysis logic.
                rating: review.rating ?? null,
                dateOfReview: formatDate(review.createdAt),
                helpfulVotes: review.votesCount ?? null,
                // Collect other interaction data available on the review node
                otherInteractionData: {
                    canDestroy: review.canDestroy ?? null,
                    canUpdate: review.canUpdate ?? null,
                    canReply: review.canReply ?? null,
                    isHidden: review.isHidden ?? null,
                    reviewerUsername: review.user?.username ?? null, // Adding username for potential cross-ref
                    reviewerId: review.user?.id ?? null, // Adding ID for potential cross-ref
                }
            };

            // Check if this reviewer is a maker and add to makerComments
            if (review.user?.id && makerIds.has(review.user.id)) {
                result.makerInformation.makerComments.push({
                    type: 'Review',
                    authorName: review.user.name,
                    authorUsername: review.user.username,
                    text: review.body,
                    date: formatDate(review.createdAt),
                    rating: review.rating,
                    votes: review.votesCount
                });
            }

            return reviewData;

        }).filter(review => review !== null);
    }

    // --- Extract Forum Threads (from productData2 for descriptions) ---
    // Limitation: The provided data only contains thread metadata and counts, not the actual comments *within* each thread.
    if (productData2?.discussionForum?.threads?.edges) {
        result.forumThreads = productData2.discussionForum.threads.edges.map(edge => {
            const thread = edge?.node;
            if (!thread) return null;

            const threadData = {
                threadTitle: thread.title ?? null,
                author: thread.user?.username ?? null,
                date: formatDate(thread.createdAt),
                featuredStatus: thread.isFeatured ?? false, // Assuming boolean, convert if needed
                // ---- Comment Data Limitation ----
                // The input JSON (`thread.commentsCount`) provides the *count* of comments,
                // but not the comment text, authors, or dates themselves.
                // Setting 'allComments' to null to reflect this limitation.
                allComments: null,
                commentsCount: thread.commentsCount ?? null, // Keep the count if available
                // ---- End Comment Data Limitation ----
                upvotes: thread.commentable?.votesCount ?? null,
                // Collect other interaction data available on the thread node
                otherInteractionData: {
                    isPinned: thread.isPinned ?? null,
                    description: thread.description ?? null, // Add description if present
                    path: thread.path ?? null,
                    commentableType: thread.commentable?.__typename ?? null, // e.g., "Post" or "DiscussionThread"
                    commentableId: thread.commentable?.id ?? null,
                    authorName: thread.user?.name ?? null, // Add author's full name
                    authorId: thread.user?.id ?? null, // Add author's ID
                }
            };

            // Check if this thread author is a maker and add to makerComments
            if (thread.user?.id && makerIds.has(thread.user.id)) {
                result.makerInformation.makerComments.push({
                    type: 'Forum Thread Start',
                    authorName: thread.user.name,
                    authorUsername: thread.user.username,
                    title: thread.title,
                    description: thread.description,
                    date: formatDate(thread.createdAt),
                    votes: thread.commentable?.votesCount,
                    commentsCount: thread.commentsCount
                });
            }

            return threadData;

        }).filter(thread => thread !== null);
    }

    // --- Extract Launch Information (from productData2 -> posts) ---
    // Assuming 'posts' represent 'launches' in this context.
    // Limitation: Similar to forums, actual comments are not present, only the count.
    if (productData2?.posts?.edges) {
        result.launchInformation = productData2.posts.edges.map(edge => {
            const post = edge?.node; // 'post' seems to represent a launch event here
            if (!post) return null;

            return {
                launchTitle: post.name ?? null,
                launchDescription: post.tagline ?? null, // Using tagline as description
                launchDate: formatDate(post.createdAt),
                upvotes: post.votesCount ?? post.latestScore ?? null, // Use votesCount or latestScore
                // ---- Comment Data Limitation ----
                commentsCount: post.commentsCount ?? null, // Count is available
                comments: null // Actual comments are not available in the input data
                // ---- End Comment Data Limitation ----
            };
        }).filter(launch => launch !== null);
        // Sort launches by date, newest first
        result.launchInformation.sort((a, b) => new Date(b.launchDate) - new Date(a.launchDate));
    }

    return result;
}

// Export the function for use in other modules
module.exports = parseProductHuntData; 