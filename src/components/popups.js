import { formatRating } from '../utils/formatters.js';

/**
 * Popup component responsible for creating popup content
 */
class PopupComponent {
    /**
     * Create popup content for a restaurant
     * 
     * @param {Object} restaurant - Restaurant data
     * @param {Array} comments - Comments for the restaurant
     * @param {Array} tags - Tags for the restaurant
     * @param {Object} avgRatings - Average ratings for the restaurant
     * @returns {HTMLElement} - Popup content element
     */
    createPopupContent(restaurant, comments, tags, avgRatings) {
        // Format opening hours
        const openingHours = restaurant.opening_hours ? 
            restaurant.opening_hours.split(';').map(h => `<div class="opening-hours-row">${h.trim()}</div>`).join('') :
            'Opening hours not available';

        // Create popup content
        const popupContent = document.createElement('div');
        popupContent.className = 'restaurant-popup';
        popupContent.innerHTML = `
            <div class="restaurant-info">
                <h3>${restaurant.name}</h3>
                
                <div class="restaurant-details">
                    ${restaurant.address ? `
                        <div class="info-row">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${restaurant.address}</span>
                        </div>
                    ` : ''}
                    
                    <div class="info-row">
                        <i class="fas fa-clock"></i>
                        <div class="opening-hours">
                            ${openingHours}
                        </div>
                    </div>
                </div>

                <div class="rating-summary">
                    <div class="rating-item">
                        <h4>🍽️ Food</h4>
                        <div class="value">${formatRating(avgRatings.food)}</div>
                    </div>
                    <div class="rating-item">
                        <h4>💰 Price</h4>
                        <div class="value">${formatRating(avgRatings.price)}</div>
                    </div>
                    <div class="rating-item">
                        <h4>🌟 Ambience</h4>
                        <div class="value">${formatRating(avgRatings.ambience)}</div>
                    </div>
                </div>

                ${tags.length > 0 ? `
                    <div class="tags-list">
                        ${tags.map(tag => `
                            <span class="tag" onclick="handleTagClick('${tag.replace(/'/g, "\\'")}')">${tag}</span>
                        `).join('')}
                    </div>
                ` : ''}
            </div>

            ${comments.map(comment => `
                <div class="comment">
                    <p class="comment-text">${comment.text || ''}</p>
                    <div class="comment-meta">
                        <span>
                            ${comment.food_rating ? `🍽️ ${comment.food_rating}` : ''}
                            ${comment.price_rating ? `${comment.food_rating ? ' • ' : ''}💰 ${comment.price_rating}` : ''}
                            ${comment.ambience_rating ? `${(comment.food_rating || comment.price_rating) ? ' • ' : ''}🌟 ${comment.ambience_rating}` : ''}
                        </span>
                        <span>${new Date(comment.date).toLocaleDateString()}</span>
                    </div>
                    ${comment.tags ? `
                        <div class="comment-tags">
                            ${comment.tags.split(',').map(tag => `
                                <span class="tag" onclick="handleTagClick('${tag.trim().replace(/'/g, "\\'")}')">${tag.trim()}</span>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
            
            <button onclick="openReviewModal('${restaurant.osm_id}')">Add Review</button>
        `;
        
        return popupContent;
    }
}

export default new PopupComponent();
