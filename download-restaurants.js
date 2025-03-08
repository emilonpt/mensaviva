const axios = require('axios');
const RestaurantService = require('./src/services/RestaurantService');

const NOMINATIM_DELAY = 1000; // 1 second between Nominatim requests

async function getCityBounds(cityName) {
    try {
        // Add delay to respect Nominatim rate limits
        await new Promise(resolve => setTimeout(resolve, NOMINATIM_DELAY));
        
        const response = await axios.get(`https://nominatim.openstreetmap.org/search`, {
            params: {
                q: cityName,
                format: 'json',
                limit: 1
            },
            headers: {
                'User-Agent': 'Restaurant Data Collection Script'
            }
        });

        if (response.data && response.data.length > 0) {
            const location = response.data[0];
            // Add a small buffer around the city center (approximately 5km)
            const buffer = 0.045; // roughly 5km at the equator
            return {
                south: parseFloat(location.lat) - buffer,
                north: parseFloat(location.lat) + buffer,
                west: parseFloat(location.lon) - buffer,
                east: parseFloat(location.lon) + buffer
            };
        }
        return null;
    } catch (error) {
        console.error(`Error getting bounds for ${cityName}:`, error.message);
        return null;
    }
}

async function main() {
    const fs = require('fs');
    const cities = fs.readFileSync('cities.md', 'utf8')
        .split('\n')
        .map(city => city.trim())
        .filter(city => city) // Remove empty lines
        .filter((city, index, self) => self.indexOf(city) === index); // Remove duplicates

    const restaurantService = new RestaurantService();
    
    console.log(`Starting restaurant data download for ${cities.length} cities...`);
    
    for (const city of cities) {
        try {
            console.log(`\nProcessing ${city}...`);
            
            const bounds = await getCityBounds(city);
            if (!bounds) {
                console.error(`Could not find coordinates for ${city}`);
                continue;
            }
            
            console.log(`Found bounds for ${city}: `, bounds);
            const restaurants = await restaurantService.getRestaurantsInViewport(bounds);
            console.log(`Downloaded ${restaurants.length} restaurants for ${city}`);
            
        } catch (error) {
            console.error(`Error processing ${city}:`, error.message);
        }
    }
    
    console.log('\nDownload completed!');
    process.exit(0);
}

main().catch(console.error);
