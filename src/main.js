import MapComponent from './components/map.js';
import MarkersComponent from './components/markers.js';
import DarkModeComponent from './components/darkMode.js';
import ControlsComponent from './components/controls.js';
import ModalComponent from './components/modal.js';
import FilteringComponent from './features/filtering.js';
import TagsComponent from './features/tags.js';
import ApiService from './services/ApiService.js';

/**
 * Main application class
 */
class App {
    constructor() {
        this.debouncedFetchRestaurants = null;
    }

    /**
     * Initialize the application
     */
    async initialize() {
        console.log('Initializing application...');
        
        // Initialize map
        MapComponent.initialize('map');
        
        // Initialize components
        MarkersComponent.initialize();
        DarkModeComponent.initialize();
        ControlsComponent.initialize();
        ModalComponent.initialize();
        FilteringComponent.initialize();
        TagsComponent.initialize();
        
        // Set up map event listeners
        this.setupMapEventListeners();
        
        // Create debounced fetch function
        this.debouncedFetchRestaurants = ApiService.getDebouncedFetchRestaurants();
        
        // Initialize map location and fetch initial restaurants
        await MapComponent.initializeLocation();
        await this.fetchRestaurants();
        
        console.log('Application initialized');
    }

    /**
     * Set up map event listeners
     */
    setupMapEventListeners() {
        MapComponent.map.on('moveend zoomend', () => {
            console.log('Map moved or zoomed, fetching new restaurants...');
            this.fetchRestaurants();
            
            // Note: URL update is handled in MapComponent.updateUrlWithMapLocation
        });
    }

    /**
     * Fetch restaurants in the current viewport
     * 
     * @param {boolean} forceUpdate - Whether to force an update regardless of cache
     */
    async fetchRestaurants(forceUpdate = false) {
        console.log('Main.js - fetchRestaurants called');
        const bounds = MapComponent.getBounds();
        const zoom = MapComponent.map.getZoom();
        console.log('Main.js - Map bounds:', bounds, 'zoom:', zoom);
        
        try {
            const restaurants = await this.debouncedFetchRestaurants(bounds, forceUpdate, zoom);
            console.log('Main.js - Received restaurants:', restaurants.length);
            
            if (restaurants.length > 0) {
                // Batch process restaurants in chunks to avoid UI freezing
                const BATCH_SIZE = 20;
                const batches = [];
                
                for (let i = 0; i < restaurants.length; i += BATCH_SIZE) {
                    batches.push(restaurants.slice(i, i + BATCH_SIZE));
                }
                
                let batchIndex = 0;
                
                const processBatch = async () => {
                    if (batchIndex >= batches.length) {
                        // All batches processed, reapply filters to maintain filter state
                        console.log('Main.js - All batches processed, reapplying filters');
                        // Ensure filters are applied after marker updates, both for initial load and navigation
                        if (FilteringComponent.hasActiveFilters()) {
                            FilteringComponent.applyFilters();
                        }
                        return;
                    }
                    
                    const batch = batches[batchIndex++];
                    console.log(`Main.js - Processing batch ${batchIndex} of ${batches.length}`);
                    
                    // Check filter state before processing batch
                    const hasFilters = FilteringComponent.hasActiveFilters();
                    const activeFilters = hasFilters ? FilteringComponent.getActiveFilters() : null;
                    
                    const updatePromises = batch.map(async restaurant => {
                        // If filters are active, preload data and check all filter criteria
                        if (hasFilters) {
                            const [comments, tags] = await Promise.all([
                                ApiService.getComments(restaurant.osm_id),
                                ApiService.getTags(restaurant.osm_id)
                            ]);

                            // Check amenity filter first since it doesn't require comments/tags
                            if (activeFilters.amenity && restaurant.amenity !== activeFilters.amenity) {
                                return null;
                            }

                            const hasReviews = comments.some(comment => 
                                comment.food_rating || comment.price_rating || comment.ambience_rating || comment.text
                            ) || tags.length > 0;

                            // Then check reviews filter
                            if (activeFilters.withReviews && !hasReviews) {
                                return null;
                            }

                            // Calculate ratings for other filters
                            const ratings = comments.reduce((acc, comment) => {
                                if (comment.food_rating) acc.food.push(comment.food_rating);
                                if (comment.price_rating) acc.price.push(comment.price_rating);
                                if (comment.ambience_rating) acc.ambience.push(comment.ambience_rating);
                                return acc;
                            }, { food: [], price: [], ambience: [] });

                            const avgRatings = {
                                food: ratings.food.length ? ratings.food.reduce((a, b) => a + b) / ratings.food.length : null,
                                price: ratings.price.length ? ratings.price.reduce((a, b) => a + b) / ratings.price.length : null,
                                ambience: ratings.ambience.length ? ratings.ambience.reduce((a, b) => a + b) / ratings.ambience.length : null
                            };

                            // Check rating filters
                            if (activeFilters.food && (!avgRatings.food || avgRatings.food < parseFloat(activeFilters.food))) {
                                return null;
                            }
                            if (activeFilters.price && (!avgRatings.price || avgRatings.price < parseFloat(activeFilters.price))) {
                                return null;
                            }
                            if (activeFilters.ambience && (!avgRatings.ambience || avgRatings.ambience < parseFloat(activeFilters.ambience))) {
                                return null;
                            }

                            // Check tags filter
                            if (activeFilters.tags) {
                                const searchTags = activeFilters.tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
                                if (searchTags.length > 0) {
                                    const matchingTags = searchTags.filter(searchTag =>
                                        tags.some(restaurantTag => 
                                            restaurantTag.toLowerCase().includes(searchTag)
                                        )
                                    );
                                    if (matchingTags.length !== searchTags.length) {
                                        return null;
                                    }
                                }
                            }

                            // Store the preloaded data with the restaurant to avoid fetching it again
                            restaurant.comments = comments;
                            restaurant.tags = tags;
                        }
                        
                        return MarkersComponent.updateMarker(restaurant, forceUpdate);
                    });
                    
                    // Remove null values from results (filtered out markers)
                    const results = await Promise.all(updatePromises);
                    
                    // Process next batch in next animation frame to keep UI responsive
                    requestAnimationFrame(() => setTimeout(processBatch, 0));
                };
                
                // Start processing batches
                processBatch();
            } else {
                console.log('Main.js - No restaurants received from API');
            }
        } catch (error) {
            console.error('Main.js - Error fetching restaurants:', error);
        }
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log('🚀 LOADING NEW MODULAR STRUCTURE - src/main.js');
        console.log('Imported modules:');
        console.log('- MapComponent:', !!MapComponent);
        console.log('- MarkersComponent:', !!MarkersComponent);
        console.log('- DarkModeComponent:', !!DarkModeComponent);
        console.log('- ControlsComponent:', !!ControlsComponent);
        console.log('- ModalComponent:', !!ModalComponent);
        console.log('- FilteringComponent:', !!FilteringComponent);
        console.log('- TagsComponent:', !!TagsComponent);
        console.log('- ApiService:', !!ApiService);
        
        const app = new App();
        app.initialize().catch(error => {
            console.error('Error initializing app:', error);
        });
    } catch (error) {
        console.error('Critical error in main.js:', error);
        console.error('Error stack:', error.stack);
    }
});

// Expose the app and components to the global scope for debugging
try {
    window.app = new App();
    window.app.markersComponent = MarkersComponent;
} catch (error) {
    console.error('Error creating global app instance:', error);
}
