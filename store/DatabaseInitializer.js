// DatabaseInitializer.js
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

class DatabaseInitializer {
  constructor(dbPath, tablesConfig) {
    // Asegúrate de que dbPath es una ruta absoluta o relativa correcta
    this.dbPath = path.resolve(__dirname, dbPath); // Usar path.resolve para mayor robustez
    this.tablesConfig = Array.isArray(tablesConfig) ? tablesConfig : [tablesConfig];
    this.db = null;
    console.log(`Database path set to: ${this.dbPath}`);
  }

  async initialize() {
    await this._ensureDatabaseDirectoryExists(); // Renombrado para claridad
    await this._connectDatabase(); // Renombrado para claridad
    await this._ensureTablesExist();
    console.log("Database initialized successfully.");
    return this.db;
  }

  async _ensureDatabaseDirectoryExists() {
    const dirPath = path.dirname(this.dbPath);
    if (!fs.existsSync(dirPath)) {
      console.log(`Creating database directory: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
    } else {
        console.log(`Database directory already exists: ${dirPath}`);
    }
  }

  async _connectDatabase() {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to database: ${this.dbPath}`);
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Error connecting to database:', err);
          reject(err);
        } else {
          console.log('Database connection successful.');
          // Habilitar claves foráneas (buena práctica)
          this.db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
            if (pragmaErr) {
              console.error('Error enabling foreign keys:', pragmaErr);
              // Podrías decidir rechazar la promesa aquí si las FK son críticas
            }
            resolve();
          });
        }
      });
    });
  }

  async _ensureTablesExist() {
    if (!this.db) {
       throw new Error("Database not connected. Call initialize() first.");
    }
    const promises = this.tablesConfig.map(tableConfig => {
      return new Promise((resolve, reject) => {
        console.log(`Ensuring table '${tableConfig.tableName}' exists...`);
        this.db.run(tableConfig.createQuery, (err) => {
          if (err) {
            console.error(`Error creating table '${tableConfig.tableName}':`, err);
            reject(err);
          } else {
            console.log(`Table '${tableConfig.tableName}' ensured/created.`);
            resolve();
          }
        });
      });
    });
    await Promise.all(promises);
    console.log("All required tables ensured/created.");
  }

  close() {
    if (this.db) {
      console.log("Closing database connection.");
      this.db.close((err) => {
         if (err) {
             console.error('Error closing database:', err);
         } else {
             console.log('Database connection closed.');
             this.db = null;
         }
      });
    }
  }
}

module.exports = DatabaseInitializer;