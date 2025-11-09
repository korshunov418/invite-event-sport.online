class Logger {
  static log(message, level = 'INFO') {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logMessage);
    
    // Здесь можно добавить запись в файл
    if (level === 'ERROR') {
      console.error(logMessage);
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
    if (process.env.NODE_ENV === 'development') {
      this.log(message, 'DEBUG');
    }
  }
}

module.exports = Logger;