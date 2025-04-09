const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

class DatabaseInitializer {
  constructor(dbPath, tablesConfig) {
    this.dbPath = dbPath;
    this.tablesConfig = Array.isArray(tablesConfig) ? tablesConfig : [tablesConfig];
    this.db = null;
  }

  async initialize() {
    await this._ensureDatabaseExists();
    await this._ensureTablesExist();
    return this.db;
  }

  async _ensureDatabaseExists() {
    const dirPath = path.dirname(this.dbPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async _ensureTablesExist() {
    const promises = this.tablesConfig.map(tableConfig => {
      return new Promise((resolve, reject) => {
        this.db.run(tableConfig.createQuery, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    await Promise.all(promises);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = DatabaseInitializer;