// LocalStorageManager.js
const path = require('path');
const DatabaseInitializer = require('./DatabaseInitializer'); // Assuming you have this file to handle database initialization and table creation

class LocalStorageManager {
  constructor(filename = 'storage.db') {
    const storageDir = path.join(__dirname, 'data');
    this.dbPath = path.join(storageDir, filename);
    
    const tablesConfig = [{
      name: 'store',
      createQuery: `
        CREATE TABLE IF NOT EXISTS store (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          expires_at INTEGER DEFAULT NULL
        );
      `
    }];
    
    this.initializer = new DatabaseInitializer(this.dbPath, tablesConfig);
    this.initialized = false;
  }

  async _initialize() {
    this.db = await this.initializer.initialize();
  }

  async setItem(key, value, ttl = null) {
    if (!this.initialized) {
      await this._initialize();
      this.initialized = true;
    }
    
    const stringValue = JSON.stringify(value);
    const expiresAt = ttl ? Date.now() + ttl : null;
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO store (key, value, expires_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at;
      `;
      this.db.run(query, [key, stringValue, expiresAt], function (err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  async getItem(key) {
    if (!this.initialized) {
      await this._initialize();
      this.initialized = true;
    }
    
    return new Promise((resolve, reject) => {
      const query = `SELECT value, expires_at FROM store WHERE key = ?`;
      this.db.get(query, [key], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!row) {
          resolve(null);
          return;
        }
        
        // Check if item has expired
        if (row.expires_at && row.expires_at < Date.now()) {
          this.removeItem(key).then(() => resolve(null));
        } else {
          resolve(row.value);
        }
      });
    });
  }

  async removeItem(key) {
    if (!this.initialized) {
      await this._initialize();
      this.initialized = true;
    }
    
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM store WHERE key = ?`, [key], function (err) {
        if (err) reject(err);
        else resolve(this.changes > 0);
      });
    });
  }

  async clear() {
    if (!this.initialized) {
      await this._initialize();
      this.initialized = true;
    }
    
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM store`, [], function (err) {
        if (err) reject(err);
        else resolve(true);
      });
    });
  }

  async keys() {
    if (!this.initialized) {
      await this._initialize();
      this.initialized = true;
    }
    
    return new Promise((resolve, reject) => {
      // First clean up expired items
      this.db.run(`DELETE FROM store WHERE expires_at IS NOT NULL AND expires_at < ?`, 
        [Date.now()], (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Then get all remaining keys
          this.db.all(`SELECT key FROM store`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => r.key));
          });
        });
    });
  }

  async setItems(items, ttl = null) {
    if (!this.initialized) {
      await this._initialize();
      this.initialized = true;
    }

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION', (err) => {
          if (err) return reject(err);

          const expiresAt = ttl ? Date.now() + ttl : null;
          const query = `
            INSERT INTO store (key, value, expires_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires_at=excluded.expires_at;
          `;
          const stmt = this.db.prepare(query);

          let errorOccurred = false;
          items.forEach(({ key, value }) => {
            if (errorOccurred) return;
            const stringValue = JSON.stringify(value);
            stmt.run([key, stringValue, expiresAt], (err) => {
              if (err) {
                errorOccurred = true;
                this.db.run('ROLLBACK', () => reject(err));
              }
            });
          });

          stmt.finalize((err) => {
            if (err && !errorOccurred) { // Finalize error, but no run error yet
              errorOccurred = true;
              this.db.run('ROLLBACK', () => reject(err));
            }
            if (!errorOccurred) {
              this.db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve(true);
              });
            }
          });
        });
      });
    });
  }

  async getAllItems() {
    if (!this.initialized) {
      await this._initialize();
      this.initialized = true;
    }

    return new Promise((resolve, reject) => {
      // First clean up expired items
      this.db.run(`DELETE FROM store WHERE expires_at IS NOT NULL AND expires_at < ?`,
        [Date.now()], (err) => {
          if (err) {
            return reject(err);
          }

          // Then get all remaining items
          const query = `SELECT key, value FROM store`;
          this.db.all(query, [], (err, rows) => {
            if (err) {
              reject(err);
            } else {
              // Parse JSON values before resolving
              const items = rows.map(row => {
                try {
                  return { key: row.key, value: JSON.parse(row.value) };
                } catch (parseError) {
                  // Handle potential JSON parsing errors, maybe log them
                  console.error(`Error parsing JSON for key ${row.key}:`, parseError);
                  // Decide how to handle: return null, skip, or keep raw string?
                  // Returning raw string for now, might need adjustment based on use case
                  return { key: row.key, value: row.value };
                }
              });
              resolve(items);
            }
          });
        });
    });
  }

  close() {
    if (this.db) { // Check if db exists before closing
        this.db.close((err) => {
            if (err) {
                console.error('Error closing the database:', err.message);
            } else {
                console.log('Database connection closed.');
            }
        });
        this.initialized = false; // Mark as uninitialized after closing
        this.db = null; // Clear the db reference
    }
  }
}

module.exports = LocalStorageManager;
