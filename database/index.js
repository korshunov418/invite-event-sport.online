const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const Logger = require('../utils/logger');
const config = require('../config');
const { createTables } = require('./models');

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    const dbExists = fs.existsSync(config.DB_PATH);
    
    this.db = new sqlite3.Database(config.DB_PATH, (err) => {
      if (err) {
        Logger.error(`Ошибка подключения к базе данных: ${err.message}`);
        return;
      }
      Logger.info('Подключено к базе данных SQLite.');
    });

    createTables(this.db);
  }

  getDB() {
    return this.db;
  }

  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            Logger.error(`Ошибка закрытия базы данных: ${err}`);
            reject(err);
          } else {
            Logger.info('База данных закрыта.');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }

  // Универсальный метод для выполнения запросов
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          Logger.error(`Ошибка выполнения запроса: ${err}`);
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          Logger.error(`Ошибка выполнения запроса: ${err}`);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          Logger.error(`Ошибка выполнения запроса: ${err}`);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
}

module.exports = new Database();