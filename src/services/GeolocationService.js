import { defaultLocation } from '../config/mapConfig.js';

/**
 * Service for handling user geolocation
 */
class GeolocationService {
    /**
     * Get the user's current location
     * 
     * @returns {Promise<Object>} - Promise resolving to location object with lat and lon
     */
    async getUserLocation() {
        try {
            if ('geolocation' in navigator) {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject);
                });
                
                return {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                };
            }
            throw new Error('Geolocation not available');
        } catch (error) {
            console.log('Geolocation failed, defaulting to Lisbon:', error);
            return defaultLocation;
        }
    }
}

export default new GeolocationService();
