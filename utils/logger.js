const fs = require('fs');
const path = require('path');
const config = require('../config');

class Logger {
  constructor() {
    this.logFile = path.join(__dirname, '../logs/app.log');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  static log(message, level = 'INFO') {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    // Вывод в консоль
    console.log(logMessage);
    
    // Запись в файл
    this.writeToFile(logMessage);
    
    // Дополнительный вывод для ошибок
    if (level === 'ERROR') {
      console.error(logMessage);
    }
  }

  static writeToFile(message) {
    try {
      const logFile = path.join(__dirname, '../logs/app.log');
      const logDir = path.dirname(logFile);
      
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      fs.appendFileSync(logFile, message + '\n', 'utf8');
    } catch (error) {
      console.error(`Ошибка записи в лог-файл: ${error}`);
    }
  }

  static info(message) {
    this.log(message, 'INFO');
  }

  static error(message) {
    this.log(message, 'ERROR');
  }

  static warn(message) {
    this.log(message, 'WARN');
  }

  static debug(message) {
    if (config.NODE_ENV === 'development') {
      this.log(message, 'DEBUG');
    }
  }

  static http(message) {
    this.log(message, 'HTTP');
  }

  static bot(message) {
    this.log(`🤖 ${message}`, 'BOT');
  }

  static database(message) {
    this.log(`🗄️ ${message}`, 'DATABASE');
  }

  static event(message) {
    this.log(`🎯 ${message}`, 'EVENT');
  }

  static user(message) {
    this.log(`👤 ${message}`, 'USER');
  }

  static notification(message) {
    this.log(`🔔 ${message}`, 'NOTIFICATION');
  }

  // Метод для логирования входящих запросов
  static request(req) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    this.http(`${req.method} ${req.url} - IP: ${ip} - User-Agent: ${userAgent}`);
  }

  // Метод для логирования ошибок с stack trace
  static errorWithStack(message, error) {
    const stack = error.stack || 'No stack trace';
    this.error(`${message}\nStack: ${stack}`);
  }

  // Метод для логирования производительности
  static performance(operation, startTime) {
    const duration = Date.now() - startTime;
    this.debug(`⏱️ ${operation} выполнено за ${duration}ms`);
  }

  // Метод для ротации логов (можно расширить)
  static rotateLogs() {
    // Здесь можно добавить логику ротации логов
    // Например, архивирование старых логов и создание новых файлов
  }
}

module.exports = Logger;