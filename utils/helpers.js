const net = require('net');
const Logger = require('./logger');

class Helpers {
  // Проверка доступности порта
  static async checkPort(port) {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, () => {
        server.close();
        resolve(true);
      });
      
      server.on('error', () => {
        resolve(false);
      });
      
      // Таймаут на случай если порт занят, но сервер не отвечает
      setTimeout(() => {
        server.close();
        resolve(false);
      }, 1000);
    });
  }

  // Поиск свободного порта
  static async findFreePort(startPort = 3486, maxAttempts = 10) {
    for (let port = startPort; port < startPort + maxAttempts; port++) {
      const isAvailable = await this.checkPort(port);
      if (isAvailable) {
        Logger.info(`Найден свободный порт: ${port}`);
        return port;
      }
      Logger.info(`Порт ${port} занят, пробуем следующий...`);
    }
    throw new Error(`Не удалось найти свободный порт в диапазоне ${startPort}-${startPort + maxAttempts - 1}`);
  }

  // Конвертация времени в минуты
  static convertToMinutes(value, unit) {
    if (!value || isNaN(value)) return 0;
    
    const multipliers = {
      'minutes': 1,
      'hours': 60,
      'days': 1440,
      'weeks': 10080
    };
    
    if (!multipliers[unit]) {
      Logger.error(`Неподдерживаемая единица измерения: ${unit}`);
      return 0;
    }
    
    const totalMinutes = parseInt(value) * multipliers[unit];
    
    if (totalMinutes < 1 || totalMinutes > 10000) {
      Logger.error(`Значение должно быть эквивалентно 1-10000 минут. Получено: ${value} ${unit} = ${totalMinutes} минут`);
      return 0;
    }
    
    return totalMinutes;
  }

  // Разделение участников на команды
  static splitIntoTeams(participants, teamCount) {
    if (!participants || participants.length === 0) {
      return [];
    }

    // Создаем расширенный массив участников (учитываем plus_count)
    const expandedParticipants = [];
    participants.forEach(participant => {
      for (let i = 0; i < participant.plus_count; i++) {
        expandedParticipants.push({
          ...participant,
          original_index: expandedParticipants.length
        });
      }
    });

    // Перемешиваем участников
    const shuffled = [...expandedParticipants].sort(() => Math.random() - 0.5);
    const teams = Array.from({ length: teamCount }, () => []);
    
    // Распределяем участников по командам
    shuffled.forEach((participant, index) => {
      teams[index % teamCount].push(participant);
    });
    
    // Группируем обратно по пользователям
    const finalTeams = teams.map(team => {
      const userMap = new Map();
      
      team.forEach(participant => {
        const key = participant.user_id;
        if (userMap.has(key)) {
          userMap.get(key).plus_count++;
        } else {
          userMap.set(key, { ...participant, plus_count: 1 });
        }
      });
      
      return Array.from(userMap.values());
    });
    
    return finalTeams;
  }

  // Проверка активности опроса
  static isPollActive(eventInfo) {
    if (!eventInfo) return false;
    
    try {
      const now = new Date();
      const timezoneOffset = parseInt(eventInfo.city_timezone) || 0;
      const pollEndMinutes = this.convertToMinutes(
        parseInt(eventInfo.poll_end_value) || 0,
        eventInfo.poll_end_unit || 'minutes'
      );
      
      // Упрощенная проверка - всегда активен, если нет информации о времени окончания
      if (pollEndMinutes === 0) {
        return true;
      }
      
      // Здесь должна быть полная логика проверки времени
      // Пока возвращаем true для совместимости
      return true;
      
    } catch (error) {
      Logger.error(`Ошибка проверки активности опроса: ${error}`);
      return false;
    }
  }

  // Форматирование даты и времени
  static formatDateTime(date, format = 'ru') {
    if (!date) return '';
    
    const d = new Date(date);
    
    if (format === 'ru') {
      return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else {
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }
  }

  // Форматирование длительности
  static formatDuration(minutes, language = 'ru') {
    if (!minutes || minutes === 0) return '';
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    const units = {
      'ru': {
        'hour': 'час',
        'hours': 'часа',
        'hours_many': 'часов',
        'minute': 'минута',
        'minutes': 'минуты',
        'minutes_many': 'минут'
      },
      'en': {
        'hour': 'hour',
        'hours': 'hours',
        'minute': 'minute',
        'minutes': 'minutes'
      }
    };
    
    const t = units[language] || units['ru'];
    
    let result = '';
    
    if (hours > 0) {
      if (language === 'ru') {
        if (hours === 1) result += `${hours} ${t.hour}`;
        else if (hours < 5) result += `${hours} ${t.hours}`;
        else result += `${hours} ${t.hours_many}`;
      } else {
        result += `${hours} ${t.hours}`;
      }
    }
    
    if (mins > 0) {
      if (result) result += ' ';
      
      if (language === 'ru') {
        if (mins === 1) result += `${mins} ${t.minute}`;
        else if (mins < 5) result += `${mins} ${t.minutes}`;
        else result += `${mins} ${t.minutes_many}`;
      } else {
        result += `${mins} ${t.minutes}`;
      }
    }
    
    return result;
  }

  // Генерация случайной строки
  static generateRandomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  // Обработка ошибок с повторными попытками
  static async retryOperation(operation, maxAttempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        Logger.warn(`Попытка ${attempt}/${maxAttempts} не удалась: ${error}`);
        
        if (attempt === maxAttempts) {
          throw error;
        }
        
        await this.sleep(delay * attempt);
      }
    }
  }

  // Задержка выполнения
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Deep clone объекта
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    
    return cloned;
  }

  // Объединение объектов
  static mergeObjects(target, source) {
    const result = this.deepClone(target);
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.mergeObjects(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }

  // Проверка на пустой объект
  static isEmptyObject(obj) {
    if (!obj) return true;
    return Object.keys(obj).length === 0;
  }

  // Получение текущего timestamp
  static getCurrentTimestamp() {
    return Math.floor(Date.now() / 1000);
  }

  // Форматирование числа с разделителями
  static formatNumber(number, language = 'ru') {
    if (isNaN(number)) return '0';
    
    const formatter = new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-US');
    return formatter.format(number);
  }

  // Транслитерация текста
  static transliterate(text) {
    if (!text) return '';
    
    const translitMap = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
      'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
      'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
      'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
      'я': 'ya'
    };
    
    return text.toLowerCase().split('').map(char => {
      return translitMap[char] || char;
    }).join('');
  }

  // Создание slug из строки
  static createSlug(text) {
    if (!text) return '';
    
    return this.transliterate(text)
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  // Валидация и парсинг JSON с обработкой ошибок
  static safeJSONParse(str, defaultValue = null) {
    try {
      return JSON.parse(str);
    } catch (error) {
      Logger.error(`Ошибка парсинга JSON: ${error}`);
      return defaultValue;
    }
  }

  // Экранирование специальных символов для Markdown
  static escapeMarkdown(text) {
    if (!text) return '';
    
    return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }

  // Экранирование специальных символов для HTML
  static escapeHTML(text) {
    if (!text) return '';
    
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, char => map[char]);
  }

  // Получение имени дня недели
  static getDayName(dayNumber, language = 'ru') {
    const days = {
      'ru': ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
      'en': ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    };
    
    const dayNames = days[language] || days['ru'];
    return dayNames[dayNumber] || '';
  }

  // Расчет времени до события
  static getTimeUntil(targetDate) {
    const now = new Date();
    const target = new Date(targetDate);
    const diff = target - now;
    
    if (diff <= 0) {
      return { expired: true };
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
      days,
      hours,
      minutes,
      totalMinutes: Math.floor(diff / (1000 * 60))
    };
  }
}

module.exports = Helpers;