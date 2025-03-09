import MapComponent from './map.js';
import ApiService from '../services/ApiService.js';
import { calculateAverageRatings } from '../utils/formatters.js';
import PopupComponent from './popups.js';

/**
 * Markers component responsible for creating and managing map markers
 */
class MarkersComponent {
    constructor() {
        this.markers = {}; // Store all markers by restaurant ID
        this.markerLayers = {}; // Track which layer each marker belongs to
        this.allTags = new Set(); // Store all unique tags from restaurants
        this.restaurantDataCache = new Map(); // Cache for restaurant data
    }

    /**
     * Initialize markers component
     */
    initialize() {
        // Set up map event listener for closing popups
        MapComponent.map.on('closeAllPopups', this.closeAllPopups.bind(this));
    }

    /**
     * Close all open popups
     */
    closeAllPopups() {
        Object.values(this.markers).forEach(marker => {
            if (marker.isPopupOpen()) {
                marker.closePopup();
            }
        });
    }

    /**
     * Create or update a marker for a restaurant
     * 
     * @param {Object} restaurant - Restaurant data
     * @param {boolean} forceUpdate - Whether to force an update regardless of cache
     * @returns {Promise<L.CircleMarker>} - Promise resolving to the created/updated marker
     */
    async updateMarker(restaurant, forceUpdate = false) {
        console.log(`Markers.js - updateMarker called for restaurant: ${restaurant.name} (${restaurant.osm_id})`);
        try {
            const cacheKey = restaurant.osm_id;
            let cachedData = this.restaurantDataCache.get(cacheKey);
            
            // Only fetch data if we don't have it cached or if forceUpdate is true
            if (!cachedData || forceUpdate) {
                console.log(`Markers.js - Fetching data for restaurant: ${restaurant.name}`);
                const [comments, tags] = await Promise.all([
                    ApiService.getComments(restaurant.osm_id),
                    ApiService.getTags(restaurant.osm_id)
                ]);
                
                // Calculate ratings
                const avgRatings = calculateAverageRatings(comments);
                
                // Cache the data
                cachedData = { comments, tags, avgRatings };
                this.restaurantDataCache.set(cacheKey, cachedData);
                
                // Update all tags collection
                tags.forEach(tag => this.allTags.add(tag));
            }
            
            const { comments, tags, avgRatings } = cachedData;
            
            // Remove marker from previous layer if it exists
            if (this.markers[restaurant.osm_id]) {
                console.log(`Markers.js - Removing existing marker for: ${restaurant.name}`);
                const currentLayer = this.markerLayers[restaurant.osm_id];
                MapComponent.removeMarkerFromLayer(this.markers[restaurant.osm_id], currentLayer);
            }
            
            let marker = this.markers[restaurant.osm_id];
            if (!marker) {
                console.log(`Markers.js - Creating new marker for: ${restaurant.name} at [${restaurant.lat}, ${restaurant.lng}]`);
                marker = L.circleMarker([restaurant.lat, restaurant.lng], {
                    opacity: 1,
                });
                
                // Use event delegation for mouseover to improve performance
                marker.on('mouseover', function(e) {
                    // Only close other popups when this one opens
                    if (!this.isPopupOpen()) {
                        MapComponent.map.fire('closeAllPopups');
                    }
                    
                    this.openPopup();
                    this.setStyle({
                        fillColor: "#F59E0B"
                    });
                });
                
                marker.on('mouseout', function(e) {
                    // Reset fill color when mouse leaves
                    if (!this.isPopupOpen()) {
                        const hasReviews = this.restaurantData && 
                            (this.restaurantData.comments.some(comment => 
                                comment.food_rating || comment.price_rating || 
                                comment.ambience_rating || comment.text
                            ) || this.restaurantData.tags.length > 0);
                        
                        this.setStyle({
                            fillColor: hasReviews ? 'SkyBlue' : 'DimGrey'
                        });
                    }
                });

                marker.on('click', function(e) {
                    L.DomEvent.stopPropagation(e);
                    this.openPopup();
                });
                
                this.markers[restaurant.osm_id] = marker;
            }

            // Store restaurant data with marker
            this.storeRestaurantData(marker, restaurant, avgRatings, tags, comments);

            // Lazy popup creation - only create popup content when needed
            marker.unbindPopup(); // Remove any existing popup
            
            marker.bindPopup(() => {
                // This function is only called when the popup is opened
                return PopupComponent.createPopupContent(restaurant, comments, tags, avgRatings);
            });

            const hasReviews = comments.some(comment => 
                comment.food_rating || comment.price_rating || comment.ambience_rating || comment.text
            ) || tags.length > 0;

            marker.setStyle({
                color: 'Black',
                fillColor: hasReviews ? 'SkyBlue' : 'DimGrey',
                radius: hasReviews ? 18 : 8,
                weight: 0.5,
                fillOpacity: 0.8,
                zIndex: hasReviews ? 1000 : 0
            });

            // Add to appropriate layer and track which layer it belongs to
            console.log(`Markers.js - Adding marker to ${hasReviews ? 'reviewed' : 'nonReviewed'} layer`);
            this.markerLayers[restaurant.osm_id] = MapComponent.addMarkerToLayer(marker, hasReviews);
            
            return marker;
        } catch (error) {
            console.error('Error updating marker:', error);
            return null;
        }
    }

    /**
     * Store restaurant data with marker
     * 
     * @param {L.CircleMarker} marker - The marker to store data with
     * @param {Object} restaurant - Restaurant data
     * @param {Object} avgRatings - Average ratings
     * @param {Array} tags - Tags
     * @param {Array} comments - Comments
     */
    storeRestaurantData(marker, restaurant, avgRatings, tags, comments) {
        const data = {
            ...restaurant,
            avgRatings,
            tags,
            comments
        };
        marker.restaurantData = data;
    }

    /**
     * Get all unique tags from restaurants
     * 
     * @returns {Set} - Set of unique tags
     */
    getAllTags() {
        return this.allTags;
    }

    /**
     * Get all markers
     * 
     * @returns {Object} - Object containing all markers indexed by restaurant ID
     */
    getAllMarkers() {
        return this.markers;
    }

    /**
     * Get marker layer information
     * 
     * @returns {Object} - Object containing layer information for each marker
     */
    getMarkerLayers() {
        return this.markerLayers;
    }
}

export default new MarkersComponent();
