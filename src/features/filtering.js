import MarkersComponent from '../components/markers.js';
import MapComponent from '../components/map.js';

/**
 * Filtering component responsible for filtering restaurants
 */
class FilteringComponent {
    constructor() {
        this.activeFilters = {
            food: '',
            price: '',
            ambience: '',
            tags: '',
            withReviews: false
        };
        this.reviewsToggle = null;
    }

    /**
     * Initialize filtering functionality
     */
    initialize() {
        this.reviewsToggle = document.getElementById('reviews-only');
        
        // Reviews toggle
        this.reviewsToggle?.addEventListener('change', (e) => {
            this.activeFilters.withReviews = e.target.checked;
            this.applyFilters();
            this.updateFilterButtonState();
        });
    }

    /**
     * Set a filter value
     * 
     * @param {string} filterType - Type of filter (food, price, ambience, tags)
     * @param {string} value - Filter value
     */
    setFilter(filterType, value) {
        this.activeFilters[filterType] = value;
        this.applyFilters();
        this.updateFilterButtonState();
    }

    /**
     * Apply filters to markers
     */
    applyFilters() {
        console.log('Applying filters:', this.activeFilters);
        let visibleCount = 0;
        let totalCount = 0;
        
        // Clear all layers first
        MapComponent.clearLayers();
        
        // Create arrays to hold markers for each layer
        const reviewedMarkers = [];
        const nonReviewedMarkers = [];
        
        const markers = MarkersComponent.getAllMarkers();
        const markerLayers = MarkersComponent.getMarkerLayers();
        
        Object.entries(markers).forEach(([id, marker]) => {
            const restaurant = marker.restaurantData;
            if (!restaurant) return;
            totalCount++;
            
            let visible = true;
            
            const ratings = restaurant.avgRatings;
            const comments = restaurant.comments;
            const hasReviews = comments.some(comment => 
                comment.food_rating || comment.price_rating || comment.ambience_rating || comment.text
            ) || restaurant.tags.length > 0;

            if (this.activeFilters.withReviews && !hasReviews) {
                visible = false;
            }
            
            if ((this.activeFilters.food || this.activeFilters.price || this.activeFilters.ambience) && !hasReviews) {
                visible = false;
            }
            
            if (visible && this.activeFilters.food) {
                if (!ratings || ratings.food === null || ratings.food < parseFloat(this.activeFilters.food)) {
                    visible = false;
                }
            }
            
            if (visible && this.activeFilters.price) {
                if (!ratings || ratings.price === null || ratings.price < parseFloat(this.activeFilters.price)) {
                    visible = false;
                }
            }
            
            if (visible && this.activeFilters.ambience) {
                if (!ratings || ratings.ambience === null || ratings.ambience < parseFloat(this.activeFilters.ambience)) {
                    visible = false;
                }
            }
            
            if (this.activeFilters.tags && restaurant.tags) {
                const searchTags = this.activeFilters.tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
                if (searchTags.length > 0) {
                    const matchingTags = searchTags.filter(searchTag =>
                        restaurant.tags.some(restaurantTag => 
                            restaurantTag.toLowerCase().includes(searchTag)
                        )
                    );
                    if (matchingTags.length !== searchTags.length) {
                        visible = false;
                    }
                }
            }
            
            if (visible) {
                // Add to appropriate array based on whether it has reviews
                if (hasReviews) {
                    reviewedMarkers.push(marker);
                    markerLayers[id] = 'reviewed';
                } else {
                    nonReviewedMarkers.push(marker);
                    markerLayers[id] = 'nonReviewed';
                }
                visibleCount++;
            }
        });
        
        // Add markers to layers in batches
        this.addMarkersInBatches(reviewedMarkers, 'reviewed');
        this.addMarkersInBatches(nonReviewedMarkers, 'nonReviewed');
        
        console.log(`Filters applied: ${visibleCount}/${totalCount} restaurants visible`);
    }

    /**
     * Add markers to layers in batches for better performance
     * 
     * @param {Array} markers - Array of markers to add
     * @param {string} layerType - Type of layer ('reviewed' or 'nonReviewed')
     * @param {number} batchIndex - Current batch index
     */
    addMarkersInBatches(markers, layerType, batchIndex = 0) {
        const BATCH_SIZE = 50;
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, markers.length);
        
        if (start >= markers.length) return;
        
        // Add a batch of markers
        for (let i = start; i < end; i++) {
            MapComponent.addMarkerToLayer(markers[i], layerType === 'reviewed');
        }
        
        // Schedule next batch in next animation frame
        if (end < markers.length) {
            requestAnimationFrame(() => {
                this.addMarkersInBatches(markers, layerType, batchIndex + 1);
            });
        }
    }

    /**
     * Update filter button state
     */
    updateFilterButtonState() {
        const filterButton = document.getElementById('toggle-filters');
        if (filterButton) {
            const hasActiveFilters = this.hasActiveFilters();
            filterButton.classList.toggle('has-filters', hasActiveFilters);
        }
    }

    /**
     * Check if there are any active filters
     * 
     * @returns {boolean} - Whether there are any active filters
     */
    hasActiveFilters() {
        return (
            this.activeFilters.food || 
            this.activeFilters.price || 
            this.activeFilters.ambience || 
            this.activeFilters.tags || 
            this.activeFilters.withReviews
        );
    }

    /**
     * Get active filters
     * 
     * @returns {Object} - Active filters
     */
    getActiveFilters() {
        return { ...this.activeFilters };
    }
}

export default new FilteringComponent();
