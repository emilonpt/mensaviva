const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('restaurant.db');

console.log('Starting cache reset...');

// Set the last_updated timestamp to a date more than one week ago
// This will force the system to fetch fresh data that includes the new amenity types
const pastDate = new Date();
pastDate.setDate(pastDate.getDate() - 8); // 8 days ago (more than one week)
const pastDateIso = pastDate.toISOString();

db.serialize(() => {
  // Update all records in the map_regions table
  db.run(`UPDATE map_regions SET last_updated = ?`, [pastDateIso], function(err) {
    if (err) {
      console.error('Error updating map_regions:', err);
    } else {
      console.log(`Successfully reset cache for ${this.changes} map regions to ${pastDateIso}`);
    }
    
    // Close the database connection
    db.close(() => {
      console.log('Database connection closed');
    });
  });
});
