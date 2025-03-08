const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

class RestaurantService {
    constructor() {
        console.log('Initializing RestaurantService...');
        this.db = new sqlite3.Database('restaurant.db');
        this.lastFetch = 0;
        this.RATE_LIMIT = 5000; // 5 seconds between API calls
        this.initializeDatabase();
    }

    // Validate and normalize bounds
    validateBounds(bounds) {
        console.log('Validating bounds:', bounds);
        const south = parseFloat(bounds.south);
        const north = parseFloat(bounds.north);
        const west = parseFloat(bounds.west);
        const east = parseFloat(bounds.east);

        if (isNaN(south) || isNaN(west) || isNaN(north) || isNaN(east)) {
            throw new Error('Invalid coordinates');
        }

        const normalized = this.normalizeCoordinates({ south, north, west, east });
        console.log('Normalized bounds:', normalized);
        return normalized;
    }

    async initializeDatabase() {
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                // Update restaurants table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS restaurants (
                        id INTEGER PRIMARY KEY,
                        osm_id TEXT UNIQUE,
                        name TEXT NOT NULL,
                        lat REAL NOT NULL,
                        lng REAL NOT NULL,
                        address TEXT,
                        opening_hours TEXT,
                        last_updated TIMESTAMP,
                        bbox_key TEXT,
                        UNIQUE(lat, lng)
                    )
                `);

                // Create map regions table
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS map_regions (
                        bbox_key TEXT PRIMARY KEY,
                        min_lat REAL,
                        max_lat REAL,
                        min_lng REAL,
                        max_lng REAL,
                        last_updated TIMESTAMP
                    )
                `);

                // Create spatial index
                this.db.run(`
                    CREATE INDEX IF NOT EXISTS idx_restaurants_location 
                    ON restaurants(lat, lng)
                `);

                resolve();
            });
        });
    }

    generateBboxKey(bounds) {
        const key = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
        return crypto.createHash('md5').update(key).digest('hex');
    }

    needsUpdate(region) {
        if (!region) return true;
        
        const oneWeek = 7 * 24 * 60 * 60 * 1000; // one week in milliseconds
        const lastUpdated = new Date(region.last_updated);
        return Date.now() - lastUpdated > oneWeek;
    }

    buildOverpassQuery(bounds) {
        // Coordinates should already be validated at this point
        return `[out:json][timeout:25];
(
  node["amenity"="restaurant"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  way["amenity"="restaurant"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
  relation["amenity"="restaurant"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
);
out center;
out body;`;
    }

    normalizeCoordinates(bounds) {
        const south = Math.max(-90, Math.min(90, bounds.south));  // Clamp to valid latitude
        const north = Math.max(-90, Math.min(90, bounds.north));  // Clamp to valid latitude
        
        let west = bounds.west;
        let east = bounds.east;
        
        // Normalize longitude to -180 to 180
        while (west > 180) west -= 360;
        while (west < -180) west += 360;
        while (east > 180) east -= 360;
        while (east < -180) east += 360;
        
        return {
            south: Math.min(south, north),
            north: Math.max(south, north),
            west: Math.min(west, east),
            east: Math.max(west, east)
        };
    }

    // Split viewport into smaller chunks for better performance
    splitBounds(bounds) {
        try {
            const normalizedBounds = this.normalizeCoordinates(bounds);
            const { south, north, west, east } = normalizedBounds;
            
            const latDiff = north - south;
            const lngDiff = east - west;
            
            // If the area is small enough, return as is
            if (latDiff < 0.02 && lngDiff < 0.02) {
                return [normalizedBounds];
            }
            
            // Split on the larger dimension
            if (latDiff > lngDiff) {
                const midLat = (north + south) / 2;
                return [
                    { ...normalizedBounds, north: midLat },
                    { ...normalizedBounds, south: midLat }
                ];
            } else {
                const midLng = (east + west) / 2;
                return [
                    { ...normalizedBounds, east: midLng },
                    { ...normalizedBounds, west: midLng }
                ];
            }
        } catch (error) {
            console.error('Error splitting bounds:', error);
            return [bounds];
        }
    }

    async fetchFromOSM(query) {
        const MAX_RETRIES = 3;
        const RETRY_DELAY = 1000; // 1 second

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                console.log('Fetching restaurants with query:', query);
                const endpoint = 'https://overpass-api.de/api/interpreter';
                const response = await axios.post(endpoint, query, {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    timeout: 30000 // 30 seconds
                });
                //console.log(`Found ${response.data.elements?.length || 0} restaurants`);
                console.log(`Received ${response.data.elements?.length || 0} restaurants from OSM`);
                return response.data;
            } catch (error) {
                if (attempt === MAX_RETRIES) throw error;
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
            }
        }
    }

    async updateDatabase(osmData, bboxKey) {
        console.log('Updating database with OSM data...');
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
                const stmt = this.db.prepare(`
                    INSERT OR REPLACE INTO restaurants 
                    (osm_id, name, lat, lng, address, opening_hours, last_updated, bbox_key)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);

                osmData.elements.forEach(element => {
                    if (element.tags && element.tags.name) {
                        const lat = element.lat || (element.center && element.center.lat);
                        const lon = element.lon || (element.center && element.center.lon);
                        
                        if (lat && lon) {
                            stmt.run(
                                element.id.toString(),
                                element.tags.name,
                                lat,
                                lon,
                                element.tags['addr:full'] || null,
                                element.tags.opening_hours || null,
                                new Date().toISOString(),
                                bboxKey
                            );
                        }
                    }
                });

                stmt.finalize();
                resolve();
            });
        });
    }

    async getRegion(bboxKey) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM map_regions WHERE bbox_key = ?',
                [bboxKey],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async updateRegion(bounds, bboxKey) {
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT OR REPLACE INTO map_regions 
                (bbox_key, min_lat, max_lat, min_lng, max_lng, last_updated)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    bboxKey,
                    bounds.south,
                    bounds.north,
                    bounds.west,
                    bounds.east,
                    new Date().toISOString()
                ],
                err => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async getCachedRestaurants(bounds) {
        console.log('Fetching cached restaurants for bounds:', bounds);
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM restaurants 
                WHERE lat BETWEEN ? AND ?
                AND lng BETWEEN ? AND ?`,
                [bounds.south, bounds.north, bounds.west, bounds.east],
                (err, rows) => {
                    if (err) {
                        console.error('Error fetching cached restaurants:', err);
                        reject(err);
                    } else {
                        console.log(`Found ${rows?.length || 0} cached restaurants`);
                        resolve(rows || []);
                    }
                }
            );
        });
    }

    async getRestaurantsInViewport(bounds) {
        console.log('Getting restaurants in viewport, original bounds:', bounds);
        const normalizedBounds = this.validateBounds(bounds);
        const subRegions = this.splitBounds(normalizedBounds);
        
        // First try to get cached restaurants
        const cachedRestaurants = await this.getCachedRestaurants(normalizedBounds);
        if (cachedRestaurants.length > 0) {
            // Check if any region needs update
            const needsUpdate = await Promise.all(
                subRegions.map(async region => {
                    const bboxKey = this.generateBboxKey(region);
                    const regionInfo = await this.getRegion(bboxKey);
                    return this.needsUpdate(regionInfo);
                })
            );

            if (!needsUpdate.some(update => update)) {
                console.log('Cache is fresh, using cached restaurants:', cachedRestaurants.length);
                return cachedRestaurants;
            }
        }

        // If cache is empty or stale, fetch from OSM
        for (const subBounds of subRegions) {
            const bboxKey = this.generateBboxKey(subBounds);
            const region = await this.getRegion(bboxKey);

            if (this.needsUpdate(region)) {
                const now = Date.now();
                const timeSinceLastFetch = now - this.lastFetch;
                
                if (timeSinceLastFetch < this.RATE_LIMIT) {
                    await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT - timeSinceLastFetch));
                }

                try {
                    const query = this.buildOverpassQuery(subBounds);
                    const osmData = await this.fetchFromOSM(query);
                    await this.updateDatabase(osmData, bboxKey);
                    await this.updateRegion(subBounds, bboxKey);
                    this.lastFetch = Date.now();
                } catch (error) {
                    console.error('Error fetching data for region:', error.message);
                    console.error('Full error:', error);
                }
            }
        }

        // Return updated restaurant data
        return this.getCachedRestaurants(normalizedBounds);
    }
}

module.exports = RestaurantService;
