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
        this.popupTimeouts = new Map(); // Store timeout IDs for popup auto-close
        this.popupHoverStates = new Map(); // Track if mouse is over popup or marker
        
        // Define emojis for different amenity types
        this.amenityEmojis = {
            'restaurant': '🍴',
            'cafe': '☕',
            'fast_food': '🍔',
            'bar': '🍸',
            'pub': '🍺',
            'food_court': '🏢',
            'ice_cream': '🍦',
            'bakery': '🥐'
        };
        
        // Define emojis for ratings
        this.ratingEmojis = {
            'food': '🍽️',
            'price': '💰',
            'ambience': '🌟'
        };
    }
    
    /**
     * Get emoji based on amenity type
     * 
     * @param {string} amenity - Amenity type
     * @returns {string} - Emoji for the amenity
     */
    getAmenityEmoji(amenity) {
        return this.amenityEmojis[amenity] || '📍';
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
        // Clear all timeouts
        this.popupTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
        this.popupTimeouts.clear();
        this.popupHoverStates.clear();
    }

    /**
     * Create or update a marker for a restaurant
     * 
     * @param {Object} restaurant - Restaurant data
     * @param {boolean} forceUpdate - Whether to force an update regardless of cache
     * @returns {Promise<L.Marker>} - Promise resolving to the created/updated marker
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
                
                // Clear any existing timeout and hover state for this marker
                const timeoutId = this.popupTimeouts.get(restaurant.osm_id);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    this.popupTimeouts.delete(restaurant.osm_id);
                }
                this.popupHoverStates.delete(restaurant.osm_id);
            }
            
            const hasReviews = comments.some(comment => 
                comment.food_rating || comment.price_rating || comment.ambience_rating || comment.text
            ) || tags.length > 0;
            
            // Create marker content with emoji
            const amenityEmoji = this.getAmenityEmoji(restaurant.amenity);
            
            // Create a custom icon with the emoji and ratings
            let iconContent = `<div class="marker-content">${amenityEmoji}</div>`;
            
            // Create a divIcon
            const customIcon = L.divIcon({
                className: 'custom-marker',
                html: hasReviews ? 
                    `<div class="marker-rectangle">
                        ${iconContent}
                        <div class="ratings-container">
                            <span class="rating-item${avgRatings.food === null ? ' empty' : ''}">${avgRatings.food !== null ? Math.round(avgRatings.food) : ''}</span>
                            <span class="rating-item${avgRatings.price === null ? ' empty' : ''}">${avgRatings.price !== null ? Math.round(avgRatings.price) : ''}</span>
                            <span class="rating-item${avgRatings.ambience === null ? ' empty' : ''}">${avgRatings.ambience !== null ? Math.round(avgRatings.ambience) : ''}</span>
                        </div>
                    </div>` : 
                    `${iconContent}`,
                iconSize: [hasReviews ? 60 : 24, hasReviews ? 50 : 24],
                iconAnchor: [hasReviews ? 30 : 12, hasReviews ? 12 : 12]
            });
            
            let marker = this.markers[restaurant.osm_id];
            
            if (!marker) {
                console.log(`Markers.js - Creating new marker for: ${restaurant.name} at [${restaurant.lat}, ${restaurant.lng}]`);
                
                // Create a marker with the custom icon
                marker = L.marker([restaurant.lat, restaurant.lng], {
                    icon: customIcon,
                    zIndexOffset: hasReviews ? 1000 : 0
                });
                
                // Use event delegation for mouseover to improve performance
                marker.on('mouseover', (e) => {
                    const markerObj = e.target;
                    this.popupHoverStates.set(restaurant.osm_id, 'marker');
                    
                    // Clear any existing timeout
                    const timeoutId = this.popupTimeouts.get(restaurant.osm_id);
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        this.popupTimeouts.delete(restaurant.osm_id);
                    }

                    // Only close other popups when this one opens
                    if (!markerObj.isPopupOpen()) {
                        MapComponent.map.fire('closeAllPopups');
                    }
                    
                    markerObj.openPopup();
                    const markerElement = markerObj.getElement();
                    if (markerElement) {
                        const markerShape = markerElement.querySelector('.marker-circle') || 
                                          markerElement.querySelector('.marker-rectangle');
                        if (markerShape) {
                            markerShape.classList.add('hover');
                        }
                    }
                });
                
                marker.on('mouseout', (e) => {
                    const markerObj = e.target;
                    this.popupHoverStates.set(restaurant.osm_id, null);
                    
                    const markerElement = markerObj.getElement();
                    if (markerElement) {
                        const markerShape = markerElement.querySelector('.marker-circle') || 
                                          markerElement.querySelector('.marker-rectangle');
                        if (markerShape) {
                            markerShape.classList.remove('hover');
                        }
                    }

                    // Only start close timeout if we're not hovering over the popup
                    if (this.popupHoverStates.get(restaurant.osm_id) !== 'popup') {
                        const timeoutId = setTimeout(() => {
                            // Double check we're still not hovering over either element
                            if (!this.popupHoverStates.get(restaurant.osm_id) && markerObj.isPopupOpen()) {
                                markerObj.closePopup();
                            }
                        }, 2000);
                        this.popupTimeouts.set(restaurant.osm_id, timeoutId);
                    }
                });

                marker.on('click', function(e) {
                    L.DomEvent.stopPropagation(e);
                    this.openPopup();
                });
                
                this.markers[restaurant.osm_id] = marker;
            } else {
                // Update existing marker with new icon
                marker.setIcon(customIcon);
                marker.setZIndexOffset(hasReviews ? 1000 : 0);
            }
            
            // Store restaurant data with marker
            this.storeRestaurantData(marker, restaurant, avgRatings, tags, comments);

            // Lazy popup creation - only create popup content when needed
            marker.unbindPopup(); // Remove any existing popup
            
            marker.bindPopup(() => {
                // This function is only called when the popup is opened
                const popupContent = PopupComponent.createPopupContent(restaurant, comments, tags, avgRatings);
                
                // Add event listeners to the popup container after it's added to the DOM
                setTimeout(() => {
                    const popup = marker.getPopup();
                    if (popup && popup.getElement()) {
                        const popupContainer = popup.getElement();
                        
                        popupContainer.addEventListener('mouseenter', () => {
                            this.popupHoverStates.set(restaurant.osm_id, 'popup');
                            const timeoutId = this.popupTimeouts.get(restaurant.osm_id);
                            if (timeoutId) {
                                clearTimeout(timeoutId);
                                this.popupTimeouts.delete(restaurant.osm_id);
                            }
                        });
                        
                        popupContainer.addEventListener('mouseleave', () => {
                            this.popupHoverStates.set(restaurant.osm_id, null);
                            // Only start close timeout if we're not hovering over the marker
                            if (this.popupHoverStates.get(restaurant.osm_id) !== 'marker') {
                                const timeoutId = setTimeout(() => {
                                    // Double check we're still not hovering over either element
                                    if (!this.popupHoverStates.get(restaurant.osm_id) && marker.isPopupOpen()) {
                                        marker.closePopup();
                                    }
                                }, 2000);
                                this.popupTimeouts.set(restaurant.osm_id, timeoutId);
                            }
                        });
                    }
                }, 0);
                
                return popupContent;
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
