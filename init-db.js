const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('restaurant.db');

db.serialize(() => {
    // Restaurants table
    db.run(`
        CREATE TABLE IF NOT EXISTS restaurants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            osm_id TEXT UNIQUE,
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            address TEXT,
            opening_hours TEXT,
            last_updated TIMESTAMP,
            bbox_key TEXT
        )
    `);

    // Map regions table for caching
    db.run(`
        CREATE TABLE IF NOT EXISTS map_regions (
            bbox_key TEXT PRIMARY KEY,
            min_lat REAL,
            max_lat REAL,
            min_lng REAL,
            max_lng REAL,
            last_updated TIMESTAMP
        )
    `);

    // Comments table
    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            text TEXT,
            food_rating INTEGER CHECK (food_rating BETWEEN 1 AND 5),
            price_rating INTEGER CHECK (price_rating BETWEEN 1 AND 5),
            ambience_rating INTEGER CHECK (ambience_rating BETWEEN 1 AND 5),
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(osm_id)
        )
    `);

    // Tags table
    db.run(`
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            restaurant_id TEXT NOT NULL,
            comment_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY (restaurant_id) REFERENCES restaurants(osm_id),
            FOREIGN KEY (comment_id) REFERENCES comments(id)
        )
    `);

    // Create indices
    db.run('CREATE INDEX IF NOT EXISTS idx_restaurants_location ON restaurants(lat, lng)');
    db.run('CREATE INDEX IF NOT EXISTS idx_restaurants_osm_id ON restaurants(osm_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_comments_restaurant ON comments(restaurant_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_tags_restaurant ON tags(restaurant_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_tags_comment ON tags(comment_id)');

    // Comment tags join table
    db.run(`
        CREATE TABLE IF NOT EXISTS comment_tags (
            comment_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (comment_id, tag_id),
            FOREIGN KEY (comment_id) REFERENCES comments(id),
            FOREIGN KEY (tag_id) REFERENCES tags(id)
        )
    `);
    db.run('CREATE INDEX IF NOT EXISTS idx_comment_tags_comment ON comment_tags(comment_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_comment_tags_tag ON comment_tags(tag_id)');
});

db.close();
