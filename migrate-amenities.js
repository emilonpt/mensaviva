const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('restaurant.db');

// Migration script to add amenity field and set default values
db.serialize(() => {
  console.log('Starting migration...');
  
  // Check if amenity column exists
  db.all(`PRAGMA table_info(restaurants)`, (err, rows) => {
    if (err) {
      console.error('Error checking table schema:', err);
      db.close();
      return;
    }
    
    // Check if the amenity column already exists
    const hasAmenityColumn = rows.some(row => row.name === 'amenity');
    
    if (!hasAmenityColumn) {
      // Add amenity column (SQLite doesn't support IF NOT EXISTS in ALTER TABLE)
      db.run(`ALTER TABLE restaurants ADD COLUMN amenity TEXT DEFAULT 'restaurant'`, (err) => {
        if (err) {
          console.error('Error adding amenity column:', err);
          db.close();
          return;
        }
        console.log('Added amenity column to restaurants table');
        
        proceedWithMigration();
      });
    } else {
      console.log('Amenity column already exists, skipping column creation');
      proceedWithMigration();
    }
  });
  
  function proceedWithMigration() {
    // Update all existing records to have amenity='restaurant'
    db.run(`UPDATE restaurants SET amenity = 'restaurant' WHERE amenity IS NULL`, (err) => {
      if (err) {
        console.error('Error updating existing records:', err);
        db.close();
        return;
      }
      console.log('Updated existing records to have amenity=restaurant');
      
      // Create index on amenity field
      db.run(`CREATE INDEX IF NOT EXISTS idx_restaurants_amenity ON restaurants(amenity)`, (err) => {
        if (err) {
          console.error('Error creating index:', err);
          db.close();
          return;
        }
        console.log('Created index on amenity field');
        console.log('Migration completed successfully');
        
        // Close the database connection
        db.close();
      });
    });
  }
});
