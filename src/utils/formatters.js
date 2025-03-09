/**
 * Formats a rating value for display
 * 
 * @param {number|null} value - The rating value to format
 * @returns {string} - Formatted rating string
 */
function formatRating(value) {
    return value !== null ? value.toFixed(1) : 'N/A';
}

/**
 * Calculates average ratings from an array of comments
 * 
 * @param {Array} comments - Array of comment objects with rating properties
 * @returns {Object} - Object containing average ratings for food, price, and ambience
 */
function calculateAverageRatings(comments) {
    const sum = { food: 0, price: 0, ambience: 0 };
    const count = { food: 0, price: 0, ambience: 0 };
    
    comments.forEach(comment => {
        ['food', 'price', 'ambience'].forEach(type => {
            if (comment[`${type}_rating`]) {
                sum[type] += comment[`${type}_rating`];
                count[type]++;
            }
        });
    });
    
    return {
        food: count.food ? sum.food / count.food : null,
        price: count.price ? sum.price / count.price : null,
        ambience: count.ambience ? sum.ambience / count.ambience : null
    };
}

export {
    formatRating,
    calculateAverageRatings
};
