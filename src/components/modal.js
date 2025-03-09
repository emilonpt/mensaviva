import ApiService from '../services/ApiService.js';
import MapComponent from './map.js';

/**
 * Modal component responsible for handling the review modal
 */
class ModalComponent {
    constructor() {
        this.modal = null;
        this.closeBtn = null;
        this.submitBtn = null;
        this.currentRestaurantId = null;
        this.currentRatings = { food: 0, price: 0, ambience: 0 };
        this.currentTags = new Set();
    }

    /**
     * Initialize the modal component
     */
    initialize() {
        this.modal = document.getElementById('review-modal');
        this.closeBtn = document.getElementsByClassName('close')[0];
        this.submitBtn = document.getElementById('submit-review');
        
        this.setupEventListeners();
        this.initializeRatings();
        this.initializeTags();
        
        // Expose the openReviewModal method to the global scope
        window.openReviewModal = this.openReviewModal.bind(this);
        window.removeTag = this.removeTag.bind(this);
    }

    /**
     * Set up event listeners for the modal
     */
    setupEventListeners() {
        // Close button
        if (this.closeBtn) {
            this.closeBtn.onclick = () => {
                if (this.modal) this.modal.style.display = 'none';
            };
        }

        // Close when clicking outside the modal
        window.onclick = (event) => {
            if (event.target == this.modal) {
                this.modal.style.display = 'none';
            }
        };

        // Submit button
        if (this.submitBtn) {
            this.submitBtn.onclick = this.handleSubmit.bind(this);
        }
    }

    /**
     * Initialize rating functionality
     */
    initializeRatings() {
        document.querySelectorAll('.stars').forEach(starsContainer => {
            const type = starsContainer.dataset.rating;
            starsContainer.querySelectorAll('.star').forEach(star => {
                star.addEventListener('click', () => {
                    const value = parseInt(star.dataset.value);
                    this.updateStarRating(type, value);
                });
            });
        });
    }

    /**
     * Update star rating
     * 
     * @param {string} type - Rating type (food, price, ambience)
     * @param {number} value - Rating value (1-5)
     */
    updateStarRating(type, value) {
        this.currentRatings[type] = value;
        const starsContainer = document.querySelector(`.stars[data-rating="${type}"]`);
        if (starsContainer) {
            starsContainer.querySelectorAll('.star').forEach(star => {
                star.classList.toggle('active', parseInt(star.dataset.value) <= value);
            });
        }
    }

    /**
     * Reset ratings
     */
    resetRatings() {
        this.currentRatings = { food: 0, price: 0, ambience: 0 };
        document.querySelectorAll('.star').forEach(star => star.classList.remove('active'));
    }

    /**
     * Initialize tags functionality
     */
    initializeTags() {
        const tagsInput = document.getElementById('tags-input');
        tagsInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const tag = tagsInput.value.trim().toLowerCase();
                if (tag) {
                    if (!this.currentTags.has(tag)) {
                        this.currentTags.add(tag);
                        this.updateTagsDisplay();
                    } else {
                        const existingTag = document.querySelector(`.tag[data-tag="${tag}"]`);
                        if (existingTag) {
                            existingTag.classList.add('duplicate');
                            setTimeout(() => existingTag.classList.remove('duplicate'), 1000);
                        }
                    }
                }
                tagsInput.value = '';
            }
        });
    }

    /**
     * Update tags display
     */
    updateTagsDisplay() {
        const tagsDisplay = document.getElementById('tags-display');
        if (tagsDisplay) {
            tagsDisplay.innerHTML = Array.from(this.currentTags).map(tag => `
                <span class="tag">
                    ${tag}
                    <span class="remove" onclick="removeTag('${tag}')">&times;</span>
                </span>
            `).join('');
        }
    }

    /**
     * Remove a tag
     * 
     * @param {string} tag - Tag to remove
     */
    removeTag(tag) {
        this.currentTags.delete(tag);
        this.updateTagsDisplay();
    }

    /**
     * Reset tags
     */
    resetTags() {
        this.currentTags.clear();
        this.updateTagsDisplay();
        const tagsInput = document.getElementById('tags-input');
        if (tagsInput) tagsInput.value = '';
    }

    /**
     * Open the review modal
     * 
     * @param {string} restaurantId - Restaurant ID
     */
    openReviewModal(restaurantId) {
        this.currentRestaurantId = restaurantId;
        this.resetRatings();
        this.resetTags();
        if (this.modal) {
            document.getElementById('review-text').value = '';
            this.modal.style.display = 'block';
        }
    }

    /**
     * Handle review submission
     */
    async handleSubmit() {
        const reviewText = document.getElementById('review-text')?.value.trim();
        
        if (!this.currentRatings.food && !this.currentRatings.price && !this.currentRatings.ambience && !reviewText && this.currentTags.size === 0) {
            alert('Please provide at least one rating, review text, or tag');
            return;
        }

        try {
            const success = await ApiService.submitReview(
                this.currentRestaurantId,
                reviewText,
                this.currentRatings,
                Array.from(this.currentTags)
            );

            if (success) {
                // Close modal and refresh data
                if (this.modal) this.modal.style.display = 'none';
                
                // Force update restaurants in the current viewport
                const bounds = MapComponent.getBounds();
                await ApiService.fetchRestaurants(bounds, true);
                
                // Specifically refresh the marker for the restaurant that was just reviewed
                const markers = window.app.markersComponent?.markers || {};
                const marker = markers[this.currentRestaurantId];
                if (marker) {
                    console.log('Refreshing marker after review submission:', this.currentRestaurantId);
                    const restaurant = marker.restaurantData;
                    if (restaurant) {
                        await window.app.markersComponent.updateMarker(restaurant, true);
                    }
                }
            } else {
                alert('Failed to save review. Please try again.');
            }
        } catch (error) {
            console.error('Error saving review:', error);
            alert('Failed to save review. Please try again.');
        }
    }
}

export default new ModalComponent();
