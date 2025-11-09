const Logger = require('./logger');

class Validators {
  // Валидация email
  static isValidEmail(email) {
    if (!email) return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Валидация телефона
  static isValidPhone(phone) {
    if (!phone) return false;
    
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    return phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  }

  // Валидация URL
  static isValidURL(url) {
    if (!url) return false;
    
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Валидация ID события
  static isValidEventId(eventId) {
    if (!eventId) return false;
    
    // ID события должно быть числом
    return !isNaN(eventId) && parseInt(eventId) > 0;
  }

  // Валидация chat ID
  static isValidChatId(chatId) {
    if (!chatId) return false;
    
    // Chat ID должно быть числом (может быть отрицательным для групп)
    return !isNaN(chatId);
  }

  // Валидация пользовательских данных события
  static validateEventData(eventData) {
    const errors = [];

    if (!eventData.event_name || eventData.event_name.trim().length === 0) {
      errors.push('Название события обязательно');
    }

    if (eventData.event_name && eventData.event_name.length > 100) {
      errors.push('Название события не должно превышать 100 символов');
    }

    if (!eventData.start_time || !this.isValidTime(eventData.start_time)) {
      errors.push('Время начала должно быть в формате HH:MM');
    }

    if (eventData.weekly_days) {
      try {
        const days = JSON.parse(eventData.weekly_days);
        if (!Array.isArray(days) || days.length === 0) {
          errors.push('Дни недели должны быть массивом');
        }
      } catch {
        errors.push('Неверный формат дней недели');
      }
    }

    if (eventData.participant_limit && (isNaN(eventData.participant_limit) || eventData.participant_limit < 1)) {
      errors.push('Лимит участников должен быть положительным числом');
    }

    if (eventData.fixed_cost && (isNaN(eventData.fixed_cost) || eventData.fixed_cost < 0)) {
      errors.push('Стоимость должна быть неотрицательным числом');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Валидация времени
  static isValidTime(timeString) {
    if (!timeString) return false;
    
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(timeString);
  }

  // Валидация даты
  static isValidDate(dateString) {
    if (!dateString) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }

  // Валидация временной зоны
  static isValidTimezone(timezone) {
    if (!timezone) return false;
    
    // Временная зона должна быть числом от -12 до +14
    const tz = parseInt(timezone);
    return !isNaN(tz) && tz >= -12 && tz <= 14;
  }

  // Валидация данных участника
  static validateParticipantData(userData) {
    const errors = [];

    if (!userData.user_id || isNaN(userData.user_id)) {
      errors.push('ID пользователя обязательно и должно быть числом');
    }

    if (!userData.first_name || userData.first_name.trim().length === 0) {
      errors.push('Имя пользователя обязательно');
    }

    if (userData.first_name && userData.first_name.length > 50) {
      errors.push('Имя пользователя не должно превышать 50 символов');
    }

    if (userData.username && userData.username.length > 32) {
      errors.push('Имя пользователя (username) не должно превышать 32 символа');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Валидация данных для сохранения сообщения
  static validateMessageData(messageData) {
    const errors = [];

    if (!messageData.external_id) {
      errors.push('external_id обязателен');
    }

    if (messageData.external_id && messageData.external_id.length > 100) {
      errors.push('external_id не должен превышать 100 символов');
    }

    if (messageData.language && !['ru', 'en'].includes(messageData.language)) {
      errors.push('Поддерживаемые языки: ru, en');
    }

    // Валидация времени опроса
    if (messageData.poll_start_value && (isNaN(messageData.poll_start_value) || messageData.poll_start_value < 0)) {
      errors.push('Время начала опроса должно быть неотрицательным числом');
    }

    if (messageData.poll_end_value && (isNaN(messageData.poll_end_value) || messageData.poll_end_value < 0)) {
      errors.push('Время окончания опроса должно быть неотрицательным числом');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Валидация команды разделения на команды
  static validateTeamSplitData(teamCount, participantCount) {
    const errors = [];

    if (isNaN(teamCount) || teamCount < 2) {
      errors.push('Количество команд должно быть не менее 2');
    }

    if (teamCount > participantCount) {
      errors.push('Количество команд не может превышать количество участников');
    }

    if (teamCount > 10) {
      errors.push('Максимальное количество команд: 10');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Валидация данных для уведомления
  static validateNotificationData(notificationData) {
    const errors = [];

    if (!notificationData.chat_id || !this.isValidChatId(notificationData.chat_id)) {
      errors.push('Некорректный chat_id');
    }

    if (!notificationData.event_id || !this.isValidEventId(notificationData.event_id)) {
      errors.push('Некорректный event_id');
    }

    if (notificationData.language && !['ru', 'en'].includes(notificationData.language)) {
      errors.push('Поддерживаемые языки: ru, en');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Санитизация строки (очистка от потенциально опасных символов)
  static sanitizeString(str) {
    if (!str) return '';
    
    return str
      .replace(/[<>]/g, '') // Удаляем угловые скобки
      .replace(/script/gi, '') // Блокируем script теги
      .trim()
      .substring(0, 1000); // Ограничиваем длину
  }

  // Санитизация объекта события
  static sanitizeEventData(eventData) {
    const sanitized = { ...eventData };
    
    if (sanitized.event_name) {
      sanitized.event_name = this.sanitizeString(sanitized.event_name);
    }
    
    if (sanitized.location) {
      sanitized.location = this.sanitizeString(sanitized.location);
    }
    
    if (sanitized.comment) {
      sanitized.comment = this.sanitizeString(sanitized.comment);
    }
    
    return sanitized;
  }

  // Проверка прав администратора (симуляция - в реальности нужно проверять через Telegram API)
  static async validateAdminRights(bot, chatId, userId) {
    try {
      const chatMember = await bot.telegram.getChatMember(chatId, userId);
      return chatMember.status === 'administrator' || chatMember.status === 'creator';
    } catch (error) {
      Logger.error(`Ошибка проверки прав администратора: ${error}`);
      return false;
    }
  }

  // Валидация UUID
  static isValidUUID(uuid) {
    if (!uuid) return false;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  // Валидация JSON строки
  static isValidJSON(str) {
    if (!str) return false;
    
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = Validators;