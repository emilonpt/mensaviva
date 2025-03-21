import express from 'express';
import sqlite3 from 'sqlite3';
const { Database } = sqlite3.verbose();
import path from 'path';
import { fileURLToPath } from 'url';
import RestaurantService from './src/services/RestaurantService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;
const db = new Database('restaurant.db');
const restaurantService = new RestaurantService();

app.use(express.json());
app.use(express.static('.'));

// Initialize database tables
db.serialize(() => {
    // Comments table
    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            text TEXT NOT NULL,
            food_rating INTEGER CHECK (food_rating IS NULL OR food_rating BETWEEN 1 AND 5),
            price_rating INTEGER CHECK (price_rating IS NULL OR price_rating BETWEEN 1 AND 5),
            ambience_rating INTEGER CHECK (ambience_rating IS NULL OR ambience_rating BETWEEN 1 AND 5),
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(osm_id)
        )
    `);

    // Tags table
    db.run(`
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(osm_id)
        )
    `);
});

// Get restaurants in viewport
app.get('/restaurants', async (req, res) => {
    try {
        const south = parseFloat(req.query.south);
        const west = parseFloat(req.query.west);
        const north = parseFloat(req.query.north);
        const east = parseFloat(req.query.east);

        if (isNaN(south) || isNaN(west) || isNaN(north) || isNaN(east)) {
            return res.status(400).json({ error: 'Invalid coordinates' });
        }

        const bounds = { 
            south: Math.min(south, north),
            north: Math.max(south, north),
            west: Math.min(west, east),
            east: Math.max(west, east)
        };

        const restaurants = await restaurantService.getRestaurantsInViewport(bounds);
        res.json(restaurants);
    } catch (error) {
        console.error('Error fetching restaurants:', error);
        res.status(500).json({ error: 'Failed to fetch restaurants' });
    }
});

// Get comments for a restaurant
app.get('/comments/:restaurantId', (req, res) => {
    const { restaurantId } = req.params;
    db.all(
        `SELECT c.*, GROUP_CONCAT(t.name) as tags 
         FROM comments c 
         LEFT JOIN comment_tags ct ON c.id = ct.comment_id 
         LEFT JOIN tags t ON ct.tag_id = t.id 
         WHERE c.restaurant_id = ? 
         GROUP BY c.id 
         ORDER BY c.date DESC`,
        [restaurantId],
        (err, comments) => {
            if (err) {
                console.error('Error fetching comments:', err);
                return res.status(500).json({ error: 'Failed to fetch comments' });
            }
            res.json(comments);
        }
    );
});

// Add a new comment
app.post('/comments', (req, res) => {
    const { restaurantId, text, foodRating, priceRating, ambienceRating } = req.body;
    
    db.run(
        `INSERT INTO comments (restaurant_id, text, food_rating, price_rating, ambience_rating)
         VALUES (?, ?, ?, ?, ?)`,
        [restaurantId, text, foodRating || null, priceRating || null, ambienceRating || null],
        function(err) {
            if (err) {
                console.error('Error saving comment:', err);
                return res.status(500).json({ error: 'Failed to save comment' });
            }
            res.json({ id: this.lastID });
        }
    );
});

// Get tags for a restaurant
app.get('/tags/:restaurantId', (req, res) => {
    const { restaurantId } = req.params;
    db.all(
        `SELECT name FROM tags WHERE restaurant_id = ?`,
        [restaurantId],
        (err, tags) => {
            if (err) {
                console.error('Error fetching tags:', err);
                return res.status(500).json({ error: 'Failed to fetch tags' });
            }
            res.json(tags.map(tag => tag.name));
        }
    );
});

// Add tags to a restaurant
app.post('/tags', (req, res) => {
    const { restaurantId, tags, commentId } = req.body;
    
    // First check for existing tags
    db.all(
        'SELECT name FROM tags WHERE restaurant_id = ?',
        [restaurantId],
        (err, existingTags) => {
            if (err) {
                console.error('Error checking existing tags:', err);
                return res.status(500).json({ error: 'Failed to check existing tags' });
            }

            const existingTagSet = new Set(existingTags.map(tag => tag.name.toLowerCase()));
            const newTags = tags.filter(tag => !existingTagSet.has(tag.toLowerCase()));
            
            if (newTags.length === 0) {
                return res.json({ success: true, message: 'No new tags to add' });
            }

            const stmt = db.prepare('INSERT INTO tags (restaurant_id, name, comment_id) VALUES (?, ?, ?)');
            
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                newTags.forEach(tag => {
                    stmt.run(restaurantId, tag, commentId.id, function(err) {
                        if (err) {
                            console.error('Error saving tag:', err);
                            return;
                        }
                        // Add entry to comment_tags table
                        db.run('INSERT INTO comment_tags (comment_id, tag_id) VALUES (?, ?)',
                            [commentId.id, this.lastID]);
                    });
                });
                
                db.run('COMMIT', err => {
                    if (err) {
                        console.error('Error saving tags:', err);
                        return res.status(500).json({ error: 'Failed to save tags' });
                    }
                    res.json({ success: true });
                });
            });
            
            stmt.finalize();
        }
    );
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
