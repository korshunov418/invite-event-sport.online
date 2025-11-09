const { Telegraf, Markup } = require('telegraf');
const eventService = require('./eventService');
const participantService = require('./participantService');
const queries = require('../database/queries');
const Keyboards = require('../bot/keyboards');
const Logger = require('../utils/logger');
const Helpers = require('../utils/helpers');
const config = require('../config');

class NotificationService {
  constructor(bot) {
    this.bot = bot;
  }

  // Основной метод для отправки уведомлений о событиях
  async sendEventNotification(chatId, eventId, eventInternalId, language = 'ru') {
    try {
      Logger.info(`Отправка уведомления для мероприятия ID: ${eventId} в чат: ${chatId}`);

      // Получаем информацию о мероприятии
      const eventInfo = await queries.getEventInfo(eventId);
      if (!eventInfo) {
        throw new Error('Мероприятие не найдено');
      }

      // Получаем текущих участников
      const eventRecord = await eventService.getEventByExternalId(eventInfo.external_id);
      if (!eventRecord) {
        throw new Error('Запись события не найдена');
      }

      const participants = await participantService.getParticipants(eventRecord.id);
      const lang = language || eventInfo.language || 'ru';

      // Форматируем сообщение
      const formattedMessage = this.formatEventMessage(eventInfo, participants, lang);
      
      // Создаем клавиатуру
      const pollActive = Helpers.isPollActive(eventInfo);
      const keyboard = Keyboards.getEventKeyboard(eventId, lang, pollActive);

      // Отправляем сообщение
      const result = await this.bot.telegram.sendMessage(chatId, formattedMessage, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      });
      
      if (result.message_id) {
        Logger.info(`✅ Форма создана в чате ${chatId}, message_id: ${result.message_id}`);
        
        // Сохраняем сообщение в базу
        await eventService.saveEventMessage(eventRecord.id, result.message_id, chatId);
        
        return {
          success: true,
          message: 'Форма успешно создана',
          chat_id: chatId,
          message_id: result.message_id,
          event_id: eventId
        };
      } else {
        throw new Error('Не удалось отправить сообщение');
      }

    } catch (error) {
      Logger.error(`Ошибка отправки уведомления: ${error}`);
      throw error;
    }
  }

  // Форматирование сообщения о событии
  formatEventMessage(eventInfo, participants = [], language = 'ru') {
    const localizations = {
      'ru': {
        'event_start_title': '🎯 Начинается событие!',
        'event_name': '🏀 Событие',
        'time': '⏰ Время',
        'day': '📅 День',
        'location': '📍 Место',
        'comment': '💬 Комментарий',
        'participants': '👥 Участники',
        'participant_limit': 'до {limit} чел.',
        'current_participants': 'Записалось: {current}',
        'commands_title': '📝 Действия:',
        'poll_closed': '❌ ОПРОС ЗАКРЫТ',
        'reserve_list': '📋 Резерв'
      },
      'en': {
        'event_start_title': '🎯 Event Starting!',
        'event_name': '🏀 Event',
        'time': '⏰ Time',
        'day': '📅 Day',
        'location': '📍 Location',
        'comment': '💬 Comment',
        'participants': '👥 Participants',
        'participant_limit': 'up to {limit} people',
        'current_participants': 'Registered: {current}',
        'commands_title': '📝 Actions:',
        'poll_closed': '❌ POLL CLOSED',
        'reserve_list': '📋 Reserve'
      }
    };

    const t = localizations[language] || localizations['ru'];
    
    // Проверяем, активен ли опрос
    const pollActive = Helpers.isPollActive(eventInfo);
    
    let message = `<b>${t['event_start_title']}</b>\n\n`;
    
    message += `<b>${t['event_name']}:</b> ${eventInfo.event_name || 'Не указано'}\n`;
    
    if (eventInfo.start_time) {
      message += `<b>${t['time']}:</b> ${eventInfo.start_time}\n`;
    }
    
    if (eventInfo.weekly_days) {
      try {
        const days = JSON.parse(eventInfo.weekly_days);
        if (days && days.length > 0) {
          const dayTranslations = {
            'ru': {
              'monday': 'Понедельник', 'tuesday': 'Вторник', 'wednesday': 'Среда',
              'thursday': 'Четверг', 'friday': 'Пятница', 'saturday': 'Суббота', 'sunday': 'Воскресенье'
            },
            'en': {
              'monday': 'Monday', 'tuesday': 'Tuesday', 'wednesday': 'Wednesday',
              'thursday': 'Thursday', 'friday': 'Friday', 'saturday': 'Saturday', 'sunday': 'Sunday'
            }
          };
          const dayDict = dayTranslations[language] || dayTranslations['ru'];
          const dayNames = days.map(day => dayDict[day] || day).join(', ');
          message += `<b>${t['day']}:</b> ${dayNames}\n`;
        }
      } catch (e) {
        Logger.error(`Ошибка парсинга дней недели: ${e}`);
      }
    }
    
    if (eventInfo.location) {
      message += `<b>${t['location']}:</b> ${eventInfo.location}\n`;
    }
    
    if (eventInfo.comment) {
      message += `<b>${t['comment']}:</b> ${eventInfo.comment}\n`;
    }
    
    // Информация об участниках
    const totalRegistrations = participants.reduce((sum, participant) => sum + participant.plus_count, 0);
    const mainParticipants = participants.filter(p => !p.is_reserve);
    const reserveParticipants = participants.filter(p => p.is_reserve);
    
    if (eventInfo.participant_limit) {
      const limitText = t['participant_limit'].replace('{limit}', eventInfo.participant_limit);
      message += `<b>${t['participants']}:</b> ${limitText}\n`;
      message += `<b>${t['current_participants'].replace('{current}', totalRegistrations)}</b>\n`;
    } else {
      message += `<b>${t['participants']}:</b> ${totalRegistrations}\n`;
    }

    // Резервные участники
    if (reserveParticipants.length > 0) {
      message += `<b>${t['reserve_list']}:</b> ${reserveParticipants.length}\n`;
    }
    
    // Статус опроса
    if (!pollActive) {
      message += `\n<b>${t['poll_closed']}</b>\n`;
    }
    
    message += `\n<b>${t['commands_title']}</b>`;
    
    return message;
  }

  // Отправка напоминания о событии
  async sendEventReminder(chatId, eventInfo, hoursBefore = 24) {
    try {
      const participants = await participantService.getParticipants(eventInfo.id);
      const totalRegistrations = await participantService.getTotalRegistrations(eventInfo.id);
      
      const reminderText = `🔔 <b>Напоминание о событии</b>\n\n` +
        `<b>Событие:</b> ${eventInfo.event_name}\n` +
        `<b>Время:</b> ${eventInfo.start_time}\n` +
        `<b>Участников:</b> ${totalRegistrations}\n` +
        `<b>До начала:</b> ${hoursBefore} часов\n\n` +
        `Не забудьте подготовиться!`;
      
      await this.bot.telegram.sendMessage(chatId, reminderText, {
        parse_mode: 'HTML'
      });
      
      Logger.info(`Напоминание отправлено для события ${eventInfo.id} в чат ${chatId}`);
      
    } catch (error) {
      Logger.error(`Ошибка отправки напоминания: ${error}`);
      throw error;
    }
  }

  // Уведомление о достижении лимита участников
  async sendLimitReachedNotification(chatId, eventInfo) {
    try {
      const limitText = `🎯 <b>Достигнут лимит участников!</b>\n\n` +
        `<b>Событие:</b> ${eventInfo.event_name}\n` +
        `<b>Лимит:</b> ${eventInfo.participant_limit} человек\n\n` +
        `Запись продолжается в резерв.`;
      
      await this.bot.telegram.sendMessage(chatId, limitText, {
        parse_mode: 'HTML'
      });
      
      Logger.info(`Уведомление о лимите отправлено для события ${eventInfo.id}`);
      
    } catch (error) {
      Logger.error(`Ошибка отправки уведомления о лимите: ${error}`);
      throw error;
    }
  }

  // Уведомление о освобождении места
  async sendSpotAvailableNotification(chatId, eventInfo, userId) {
    try {
      const user = await this.bot.telegram.getChat(userId);
      const userName = user.first_name || user.username || 'Участник';
      
      const notificationText = `🎉 <b>Место освободилось!</b>\n\n` +
        `<b>Событие:</b> ${eventInfo.event_name}\n` +
        `<b>Участник:</b> ${userName} вышел из события\n\n` +
        `Теперь есть свободное место!`;
      
      await this.bot.telegram.sendMessage(chatId, notificationText, {
        parse_mode: 'HTML'
      });
      
      Logger.info(`Уведомление о свободном месте отправлено для события ${eventInfo.id}`);
      
    } catch (error) {
      Logger.error(`Ошибка отправки уведомления о свободном месте: ${error}`);
      throw error;
    }
  }

  // Массовая рассылка участникам события
  async broadcastToParticipants(eventId, message, excludeUserIds = []) {
    try {
      const participants = await participantService.getParticipants(eventId);
      let sentCount = 0;
      let errorCount = 0;

      for (const participant of participants) {
        if (excludeUserIds.includes(participant.user_id)) {
          continue;
        }

        try {
          await this.bot.telegram.sendMessage(participant.user_id, message, {
            parse_mode: 'HTML'
          });
          sentCount++;
          
          // Задержка чтобы не превысить лимиты Telegram
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          Logger.error(`Ошибка отправки пользователю ${participant.user_id}: ${error}`);
          errorCount++;
        }
      }

      Logger.info(`Рассылка завершена: отправлено ${sentCount}, ошибок ${errorCount}`);
      return { sent: sentCount, errors: errorCount };

    } catch (error) {
      Logger.error(`Ошибка массовой рассылки: ${error}`);
      throw error;
    }
  }

  // Обновление сообщения события
  async updateEventMessage(chatId, eventId, eventInfo) {
    try {
      const participants = await participantService.getParticipants(eventId);
      const lastMessage = await queries.getLastEventMessage(eventId, chatId);
      
      if (lastMessage) {
        const lang = eventInfo.language || 'ru';
        const formattedMessage = this.formatEventMessage(eventInfo, participants, lang);
        const pollActive = Helpers.isPollActive(eventInfo);
        const keyboard = Keyboards.getEventKeyboard(eventInfo.id, lang, pollActive);
        
        try {
          await this.bot.telegram.editMessageText(
            chatId,
            lastMessage.message_id,
            null,
            formattedMessage,
            {
              parse_mode: 'HTML',
              reply_markup: keyboard.reply_markup
            }
          );
          Logger.info(`Сообщение обновлено: event=${eventId}`);
        } catch (error) {
          Logger.error(`Ошибка редактирования сообщения: ${error}`);
        }
      }
    } catch (error) {
      Logger.error(`Ошибка обновления сообщения: ${error}`);
      throw error;
    }
  }

  // Отправка системного уведомления
  async sendSystemNotification(chatId, title, message, type = 'info') {
    try {
      const icons = {
        'info': 'ℹ️',
        'success': '✅',
        'warning': '⚠️',
        'error': '❌'
      };
      
      const icon = icons[type] || icons['info'];
      const notificationText = `${icon} <b>${title}</b>\n\n${message}`;
      
      await this.bot.telegram.sendMessage(chatId, notificationText, {
        parse_mode: 'HTML'
      });
      
      Logger.info(`Системное уведомление отправлено в чат ${chatId}: ${title}`);
      
    } catch (error) {
      Logger.error(`Ошибка отправки системного уведомления: ${error}`);
      throw error;
    }
  }

  // Проверка и отправка уведомлений о предстоящих событиях
  async checkAndSendUpcomingNotifications() {
    try {
      const activeEvents = await queries.getActiveEvents();
      const now = new Date();
      
      for (const event of activeEvents) {
        try {
          // Здесь должна быть логика проверки времени до начала события
          // и отправки уведомлений за определенное время
          
          // Пример: отправка уведомления за 1 час до начала
          // if (shouldSendNotification(event, now, 60)) {
          //   await this.sendEventReminder(event.internal_chat_id, event, 1);
          // }
        } catch (error) {
          Logger.error(`Ошибка обработки события ${event.id}: ${error}`);
        }
      }
      
    } catch (error) {
      Logger.error(`Ошибка проверки предстоящих уведомлений: ${error}`);
      throw error;
    }
  }
}

module.exports = NotificationService;