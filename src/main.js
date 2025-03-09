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
        MapComponent.map.on('moveend', () => {
            console.log('Map moved, fetching new restaurants...');
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
        console.log('Main.js - Map bounds:', bounds);
        
        try {
            const restaurants = await this.debouncedFetchRestaurants(bounds, forceUpdate);
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
                        // All batches processed, apply filters
                        console.log('Main.js - All batches processed, applying filters');
                        FilteringComponent.applyFilters();
                        return;
                    }
                    
                    const batch = batches[batchIndex++];
                    console.log(`Main.js - Processing batch ${batchIndex} of ${batches.length}`);
                    
                    const updatePromises = batch.map(restaurant => 
                        MarkersComponent.updateMarker(restaurant, forceUpdate)
                    );
                    
                    await Promise.all(updatePromises);
                    
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
