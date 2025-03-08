const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('restaurant.db');

db.serialize(() => {
    // Delete all records from comment_tags first (due to foreign key constraints)
    db.run('DELETE FROM comment_tags', (err) => {
        if (err) {
            console.error('Error clearing comment_tags:', err);
        } else {
            console.log('Successfully cleared comment_tags table');
        }
    });

    // Delete all records from tags
    db.run('DELETE FROM tags', (err) => {
        if (err) {
            console.error('Error clearing tags:', err);
        } else {
            console.log('Successfully cleared tags table');
        }
    });

    // Delete all records from comments
    db.run('DELETE FROM comments', (err) => {
        if (err) {
            console.error('Error clearing comments:', err);
        } else {
            console.log('Successfully cleared comments table');
        }
    });
});

db.close(() => {
    console.log('Database connection closed');
});
