import { lightLayer, darkLayer, mapOptions, clusterOptions } from '../config/mapConfig.js';
import GeolocationService from '../services/GeolocationService.js';

/**
 * Map component responsible for initializing and managing the Leaflet map
 */
class MapComponent {
    constructor() {
        this.map = null;
        this.reviewedLayer = null;
        this.nonReviewedCluster = null;
        this.currentLayer = null;
    }

    /**
     * Initialize the map and its layers
     * 
     * @param {string} elementId - ID of the HTML element to contain the map
     * @returns {L.Map} - The initialized Leaflet map instance
     */
    initialize(elementId) {
        // Initialize map (position will be set by geolocation)
        this.map = L.map(elementId, mapOptions);
        
        // Set up layers
        this.currentLayer = lightLayer;
        this.currentLayer.addTo(this.map);
        
        // Create layer groups for markers
        this.reviewedLayer = L.layerGroup();
        this.nonReviewedCluster = L.markerClusterGroup(clusterOptions);
        
        // Add layers to map
        this.reviewedLayer.addTo(this.map);
        this.nonReviewedCluster.addTo(this.map);
        
        // Add click handler to close popups when clicking on the map
        this.map.on('click', () => {
            // This will be used by the markers component to close popups
            this.map.fire('closeAllPopups');
        });
        
        return this.map;
    }

    /**
     * Initialize the map with the user's location or saved location from URL
     * 
     * @returns {Promise<void>}
     */
    async initializeLocation() {
        // Check for location in URL parameters first
        const urlParams = new URLSearchParams(window.location.search);
        const lat = parseFloat(urlParams.get('lat'));
        const lon = parseFloat(urlParams.get('lon'));
        const zoom = parseInt(urlParams.get('zoom'));
        
        if (!isNaN(lat) && !isNaN(lon)) {
            console.log('Setting map view from URL parameters:', { lat, lon, zoom: zoom || 15 });
            this.map.setView([lat, lon], zoom || 15);
        } else {
            // Fall back to geolocation
            const location = await GeolocationService.getUserLocation();
            console.log('Setting initial map view from geolocation:', location);
            this.map.setView([location.lat, location.lon], 15);
        }
        
        // Add event listener to update URL when map moves
        this.map.on('moveend', () => {
            this.updateUrlWithMapLocation();
        });
    }
    
    /**
     * Update URL with current map location
     */
    updateUrlWithMapLocation() {
        const center = this.map.getCenter();
        const zoom = this.map.getZoom();
        
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('lat', center.lat.toFixed(6));
        urlParams.set('lon', center.lng.toFixed(6));
        urlParams.set('zoom', zoom);
        
        // Update URL without reloading the page
        const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }

    /**
     * Toggle between light and dark map layers
     * 
     * @param {boolean} isDark - Whether to use the dark layer
     */
    toggleDarkMode(isDark) {
        if (isDark) {
            this.map.removeLayer(lightLayer);
            darkLayer.addTo(this.map);
            this.currentLayer = darkLayer;
        } else {
            this.map.removeLayer(darkLayer);
            lightLayer.addTo(this.map);
            this.currentLayer = lightLayer;
        }
    }

    /**
     * Clear all markers from the map
     */
    clearLayers() {
        this.reviewedLayer.clearLayers();
        this.nonReviewedCluster.clearLayers();
    }

    /**
     * Add a marker to the appropriate layer
     * 
     * @param {L.Marker} marker - The marker to add
     * @param {boolean} hasReviews - Whether the marker has reviews
     */
    addMarkerToLayer(marker, hasReviews) {
        console.log(`Map.js - Adding marker to ${hasReviews ? 'reviewed' : 'nonReviewed'} layer`);
        try {
            if (hasReviews) {
                this.reviewedLayer.addLayer(marker);
                return 'reviewed';
            } else {
                this.nonReviewedCluster.addLayer(marker);
                return 'nonReviewed';
            }
        } catch (error) {
            console.error('Map.js - Error adding marker to layer:', error);
            return null;
        }
    }

    /**
     * Remove a marker from its layer
     * 
     * @param {L.Marker} marker - The marker to remove
     * @param {string} layerType - The type of layer ('reviewed' or 'nonReviewed')
     */
    removeMarkerFromLayer(marker, layerType) {
        if (layerType === 'reviewed') {
            this.reviewedLayer.removeLayer(marker);
        } else if (layerType === 'nonReviewed') {
            this.nonReviewedCluster.removeLayer(marker);
        }
    }

    /**
     * Get the current map bounds
     * 
     * @returns {L.LatLngBounds} - The current map bounds
     */
    getBounds() {
        return this.map.getBounds();
    }

    /**
     * Set the map view to a specific location
     * 
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} zoom - Zoom level
     */
    setView(lat, lon, zoom = 14) {
        this.map.setView([lat, lon], zoom);
    }

    /**
     * Zoom in the map
     */
    zoomIn() {
        this.map.zoomIn();
    }

    /**
     * Zoom out the map
     */
    zoomOut() {
        this.map.zoomOut();
    }
}

export default new MapComponent();
