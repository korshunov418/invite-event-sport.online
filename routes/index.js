const express = require('express');
const Logger = require('../utils/logger');
const Validators = require('../utils/validators');
const Helpers = require('../utils/helpers');
const queries = require('../database/queries');
const eventService = require('../services/eventService');
const participantService = require('../services/participantService');
const NotificationService = require('../services/notificationService');

module.exports = (app, bot) => {
  const router = express.Router();
  const notificationService = new NotificationService(bot);

  // Middleware для логирования запросов
  router.use((req, res, next) => {
    Logger.request(req);
    next();
  });

  // Middleware для обработки ошибок
  router.use((error, req, res, next) => {
    Logger.error(`Ошибка в маршруте ${req.method} ${req.url}: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Внутренняя ошибка сервера',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  });

  // ===== HEALTH CHECK ROUTES =====

  router.get('/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'Telegram Bot + Events API',
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  });

  router.get('/db-status', async (req, res) => {
    try {
      const messagesCount = await queries.getDatabaseStatus();
      
      res.json({
        success: true,
        message: 'База данных доступна',
        messages_count: messagesCount,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      Logger.error(`Ошибка проверки статуса БД: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Ошибка подключения к базе данных',
        details: error.message
      });
    }
  });

  // ===== EVENT MANAGEMENT ROUTES =====

  // Получение всех активных событий
  router.get('/api/active-events', async (req, res) => {
    try {
      const events = await queries.getActiveEvents();
      
      // Обрабатываем каждое мероприятие и добавляем UTC время
      const processedEvents = events.map(event => {
        const weeklyDays = event.weekly_days ? Helpers.safeJSONParse(event.weekly_days) : [];
        const timezoneOffset = parseInt(event.city_timezone) || 0;
        
        let pollStartMinutes = 0;
        try {
          pollStartMinutes = Helpers.convertToMinutes(
            parseInt(event.poll_start_value) || 0,
            event.poll_start_unit || 'minutes'
          );
        } catch (error) {
          Logger.error(`Ошибка конвертации времени: ${error}`);
        }

        // Создаем UTC расписание для каждого дня недели
        const utcSchedules = weeklyDays.map(dayName => {
          try {
            const schedule = calculateWeeklyUTCTime(dayName, event.start_time, timezoneOffset, pollStartMinutes);
            return {
              day_name: dayName,
              meeting_time_utc: schedule.meeting_time_utc,
              meeting_datetime_utc: schedule.meeting_datetime_utc,
              poll_time_utc: schedule.poll_time_utc,
              poll_datetime_utc: schedule.poll_datetime_utc,
              utc_weekday: schedule.utc_weekday,
              timezone_offset: schedule.timezone_offset
            };
          } catch (error) {
            Logger.error(`Ошибка создания UTC расписания: ${error}`);
            return null;
          }
        }).filter(schedule => schedule !== null);

        // Находим ближайшее следующее событие
        let nextOccurrence = null;
        try {
          if (utcSchedules.length > 0) {
            nextOccurrence = findNextWeeklyOccurrence(weeklyDays, event.start_time, timezoneOffset, pollStartMinutes);
          }
        } catch (error) {
          Logger.error(`Ошибка расчета следующего события: ${error}`);
        }

        // Логируем информацию о времени для отладки
        Logger.debug(`📅 Мероприятие: ${event.event_name}`);
        Logger.debug(`   Локальное время: ${event.start_time}`);
        Logger.debug(`   Часовой пояс: ${timezoneOffset} минут (${timezoneOffset/60} часов)`);
        Logger.debug(`   Poll start minutes: ${pollStartMinutes}`);
        
        if (nextOccurrence) {
          const now = new Date();
          const pollTime = new Date(nextOccurrence.poll_datetime_utc);
          const meetingTime = new Date(nextOccurrence.meeting_datetime_utc);
          const timeUntilPoll = (pollTime - now) / 60000;
          const timeUntilMeeting = (meetingTime - now) / 60000;
          
          Logger.debug(`   ⏰ Время уведомления UTC: ${nextOccurrence.poll_datetime_utc}`);
          Logger.debug(`   🎯 Время начала UTC: ${nextOccurrence.meeting_datetime_utc}`);
          Logger.debug(`   📊 До уведомления: ${timeUntilPoll.toFixed(1)} минут`);
          Logger.debug(`   📊 До начала: ${timeUntilMeeting.toFixed(1)} минут`);
        }

        return {
          id: event.id,
          internal_id: event.internal_id,
          language: event.language,
          event_name: event.event_name,
          frequency: event.frequency,
          regular_frequency: event.regular_frequency,
          start_date: event.start_date,
          yearly_dates: event.yearly_dates ? Helpers.safeJSONParse(event.yearly_dates) : [],
          day_number: event.day_number,
          weekly_days: weeklyDays,
          start_time: event.start_time,
          duration: {
            value: event.duration_value,
            unit: event.duration_unit
          },
          poll_start: {
            value: event.poll_start_value,
            unit: event.poll_start_unit
          },
          poll_end: {
            value: event.poll_end_value,
            unit: event.poll_end_unit
          },
          city_timezone: timezoneOffset,
          location: event.location,
          comment: event.comment,
          participant_limit_type: event.participant_limit_type,
          participant_limit: event.participant_limit,
          reserve: event.reserve,
          payment_type: event.payment_type,
          payment_method: event.payment_method,
          cost_type: event.cost_type,
          fixed_cost: event.fixed_cost,
          created_at: event.created_at,
          
          // UTC данные
          utc_data: {
            poll_start_minutes: pollStartMinutes,
            timezone_offset: timezoneOffset,
            schedules: utcSchedules,
            next_occurrence: nextOccurrence
          },
          
          // Для совместимости со старым кодом
          poll_datetime_utc: nextOccurrence ? nextOccurrence.poll_datetime_utc : null
        };
      });

      res.json({
        success: true,
        events: processedEvents,
        total: processedEvents.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error(`Ошибка получения активных событий: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Ошибка сервера',
        details: error.message
      });
    }
  });

  // Получение информации о конкретном событии
  router.get('/api/events/:id', async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      
      if (!Validators.isValidEventId(eventId)) {
        return res.status(400).json({
          success: false,
          error: 'Некорректный ID события'
        });
      }

      const eventInfo = await queries.getEventInfo(eventId);
      
      if (!eventInfo) {
        return res.status(404).json({
          success: false,
          error: 'Событие не найдено'
        });
      }

      // Получаем участников события
      const eventRecord = await eventService.getEventByExternalId(eventInfo.external_id);
      const participants = eventRecord ? await participantService.getParticipants(eventRecord.id) : [];
      const statistics = eventRecord ? await queries.getEventStatistics(eventRecord.id) : null;

      res.json({
        success: true,
        event: eventInfo,
        participants: participants,
        statistics: statistics,
        total_participants: participants.length,
        total_registrations: participants.reduce((sum, p) => sum + p.plus_count, 0)
      });

    } catch (error) {
      Logger.error(`Ошибка получения события: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Ошибка сервера',
        details: error.message
      });
    }
  });

  // Поиск событий
  router.get('/api/events/search/:term', async (req, res) => {
    try {
      const searchTerm = req.params.term;
      const limit = parseInt(req.query.limit) || 10;

      if (!searchTerm || searchTerm.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Поисковый запрос должен содержать минимум 2 символа'
        });
      }

      const events = await queries.searchEvents(searchTerm, limit);

      res.json({
        success: true,
        events: events,
        total: events.length,
        search_term: searchTerm,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error(`Ошибка поиска событий: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Ошибка сервера',
        details: error.message
      });
    }
  });

  // ===== NOTIFICATION ROUTES =====

  // Создание формы уведомления
  router.post('/send-notification', async (req, res) => {
    try {
      Logger.info(`Получен запрос на отправку уведомления: ${JSON.stringify(req.body, null, 2)}`);
      
      const {
        chat_id,
        event_id,
        event_internal_id,
        language
      } = req.body;

      // Валидация обязательных полей
      const validation = Validators.validateNotificationData({ chat_id, event_id, language });
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Неверные параметры запроса',
          details: validation.errors
        });
      }

      Logger.info(`Создание формы для мероприятия ID: ${event_id} в чат: ${chat_id}`);

      const result = await notificationService.sendEventNotification(
        chat_id, 
        event_id, 
        event_internal_id, 
        language
      );

      res.json(result);

    } catch (error) {
      Logger.error(`Ошибка создания формы: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Внутренняя ошибка сервера',
        details: error.message
      });
    }
  });

  // ===== MESSAGE SAVING ROUTES =====

  // Сохранение сообщения из Mini App
  router.post('/save-message', async (req, res) => {
    try {
      Logger.info(`Получен запрос на сохранение сообщения: ${JSON.stringify(req.body, null, 2)}`);
      
      // Валидация данных
      const validation = Validators.validateMessageData(req.body);
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Неверные данные сообщения',
          details: validation.errors
        });
      }

      // Санитизация данных
      const sanitizedData = Validators.sanitizeEventData(req.body);

      // Логируем полученные данные
      Logger.debug(`Данные для сохранения: ${JSON.stringify(sanitizedData, null, 2)}`);

      // Сохранение сообщения
      const result = await queries.saveMessageData(sanitizedData);

      Logger.info(`Сообщение успешно сохранено. ID: ${result.message_id}, internal_id: ${result.internal_id}`);
      
      res.json({ 
        success: true,
        message: 'Сообщение сохранено', 
        internal_id: result.internal_id,
        message_id: result.message_id
      });

    } catch (error) {
      Logger.error(`Ошибка сохранения сообщения: ${error}`);
      res.status(500).json({ 
        success: false,
        error: 'Внутренняя ошибка сервера',
        details: error.message
      });
    }
  });

  // ===== CHAT MANAGEMENT ROUTES =====

  // Получение chat_id по external_chat_id
  router.get('/get_chat_id', async (req, res) => {
    try {
      const externalChatId = req.query.external_chat_id;
      
      if (!externalChatId) {
        return res.status(400).json({
          success: false,
          error: 'Параметр external_chat_id обязателен'
        });
      }
      
      Logger.info(`Запрос chat_id для external_chat_id: ${externalChatId}`);
      
      const chatId = await eventService.getChatIdByExternalId(externalChatId);
      
      if (chatId) {
        res.json({
          success: true,
          external_chat_id: externalChatId,
          internal_chat_id: chatId,
          message: 'Chat ID найден'
        });
      } else {
        res.status(404).json({
          success: false,
          external_chat_id: externalChatId,
          message: 'Событие с таким external_chat_id не найдено'
        });
      }
      
    } catch (error) {
      Logger.error(`Ошибка получения chat_id: ${error}`);
      res.status(500).json({ 
        success: false,
        error: 'Ошибка получения chat_id',
        details: error.message 
      });
    }
  });

  // Создание связи между чатами
  router.post('/chat-links', async (req, res) => {
    try {
      const { personal_external_id, group_external_id, group_chat_id } = req.body;

      if (!personal_external_id || !group_external_id || !group_chat_id) {
        return res.status(400).json({
          success: false,
          error: 'Все параметры (personal_external_id, group_external_id, group_chat_id) обязательны'
        });
      }

      const linkId = await eventService.createChatLink(
        personal_external_id, 
        group_external_id, 
        group_chat_id
      );

      res.json({
        success: true,
        link_id: linkId,
        message: 'Связь между чатами создана'
      });

    } catch (error) {
      Logger.error(`Ошибка создания связи чатов: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Ошибка создания связи',
        details: error.message
      });
    }
  });

  // ===== PARTICIPANT ROUTES =====

  // Получение участников события
  router.get('/api/events/:id/participants', async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      
      if (!Validators.isValidEventId(eventId)) {
        return res.status(400).json({
          success: false,
          error: 'Некорректный ID события'
        });
      }

      const eventInfo = await queries.getEventInfo(eventId);
      
      if (!eventInfo) {
        return res.status(404).json({
          success: false,
          error: 'Событие не найдено'
        });
      }

      const eventRecord = await eventService.getEventByExternalId(eventInfo.external_id);
      
      if (!eventRecord) {
        return res.status(404).json({
          success: false,
          error: 'Запись события не найдена'
        });
      }

      const participants = await participantService.getParticipants(eventRecord.id);
      const statistics = await queries.getEventStatistics(eventRecord.id);

      res.json({
        success: true,
        participants: participants,
        statistics: statistics,
        total: participants.length,
        total_registrations: participants.reduce((sum, p) => sum + p.plus_count, 0)
      });

    } catch (error) {
      Logger.error(`Ошибка получения участников: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Ошибка сервера',
        details: error.message
      });
    }
  });

  // Таблица лидеров по участию
  router.get('/api/events/:id/leaderboard', async (req, res) => {
    try {
      const eventId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit) || 10;
      
      if (!Validators.isValidEventId(eventId)) {
        return res.status(400).json({
          success: false,
          error: 'Некорректный ID события'
        });
      }

      const eventInfo = await queries.getEventInfo(eventId);
      
      if (!eventInfo) {
        return res.status(404).json({
          success: false,
          error: 'Событие не найдено'
        });
      }

      const eventRecord = await eventService.getEventByExternalId(eventInfo.external_id);
      
      if (!eventRecord) {
        return res.status(404).json({
          success: false,
          error: 'Запись события не найдена'
        });
      }

      const leaderboard = await participantService.getParticipantLeaderboard(eventRecord.id, limit);

      res.json({
        success: true,
        leaderboard: leaderboard,
        event_name: eventInfo.event_name,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error(`Ошибка получения таблицы лидеров: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Ошибка сервера',
        details: error.message
      });
    }
  });

  // ===== ADMIN ROUTES =====

  // Статистика системы
  router.get('/admin/statistics', async (req, res) => {
    try {
      // Проверка авторизации (можно добавить JWT или другую аутентификацию)
      const authToken = req.headers.authorization;
      if (!authToken || authToken !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({
          success: false,
          error: 'Неавторизованный доступ'
        });
      }

      const messagesCount = await queries.getDatabaseStatus();
      const activeEvents = await queries.getActiveEvents();
      const databaseSchema = await queries.getDatabaseSchema();

      // Очистка устаревших данных
      const cleanedSessions = await queries.cleanupOldSessions(24);
      const cleanedParticipants = await participantService.cleanupOldParticipants(30);

      res.json({
        success: true,
        statistics: {
          total_events: messagesCount,
          active_events: activeEvents.length,
          database_tables: Object.keys(databaseSchema).length,
          cleaned_sessions: cleanedSessions,
          cleaned_participants: cleanedParticipants
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      Logger.error(`Ошибка получения статистики администратора: ${error}`);
      res.status(500).json({
        success: false,
        error: 'Ошибка сервера',
        details: error.message
      });
    }
  });

  // ===== COMPATIBILITY ROUTES =====

  // Старый маршрут для совместимости
  router.get('/status', async (req, res) => {
    try {
      const events = await queries.getActiveEvents();
      
      const processedEvents = events.map(event => {
        const weeklyDays = event.weekly_days ? Helpers.safeJSONParse(event.weekly_days) : [];
        const timezoneOffset = parseInt(event.city_timezone) || 0;
        
        let pollStartMinutes = 0;
        try {
          pollStartMinutes = Helpers.convertToMinutes(
            parseInt(event.poll_start_value) || 0,
            event.poll_start_unit || 'minutes'
          );
        } catch (error) {
          Logger.error(`Ошибка конвертации времени: ${error}`);
        }
        
        const utcSchedules = weeklyDays.map(dayName => {
          try {
            const schedule = calculateWeeklyUTCTime(dayName, event.start_time, timezoneOffset, pollStartMinutes);
            return {
              day_name: dayName,
              meeting_time_utc: schedule.meeting_time_utc,
              meeting_datetime_utc: schedule.meeting_datetime_utc,
              poll_time_utc: schedule.poll_time_utc,
              poll_datetime_utc: schedule.poll_datetime_utc,
              utc_weekday: schedule.utc_weekday
            };
          } catch (error) {
            Logger.error(`Ошибка создания UTC расписания: ${error}`);
            return null;
          }
        }).filter(schedule => schedule !== null);

        let nextOccurrence = null;
        try {
          if (utcSchedules.length > 0) {
            nextOccurrence = findNextWeeklyOccurrence(weeklyDays, event.start_time, timezoneOffset, pollStartMinutes);
          }
        } catch (error) {
          Logger.error(`Ошибка расчета следующего события: ${error}`);
        }

        return {
          id: event.id,
          internal_id: event.internal_id,
          language: event.language,
          event_name: event.event_name,
          frequency: event.frequency,
          regular_frequency: event.regular_frequency,
          start_date: event.start_date,
          yearly_dates: event.yearly_dates ? Helpers.safeJSONParse(event.yearly_dates) : [],
          day_number: event.day_number,
          weekly_days: weeklyDays,
          start_time: event.start_time,
          duration: {
            value: event.duration_value,
            unit: event.duration_unit
          },
          poll_start: {
            value: event.poll_start_value,
            unit: event.poll_start_unit
          },
          poll_end: {
            value: event.poll_end_value,
            unit: event.poll_end_unit
          },
          city_timezone: timezoneOffset,
          location: event.location,
          comment: event.comment,
          participant_limit_type: event.participant_limit_type,
          participant_limit: event.participant_limit,
          reserve: event.reserve,
          payment_type: event.payment_type,
          payment_method: event.payment_method,
          cost_type: event.cost_type,
          fixed_cost: event.fixed_cost,
          created_at: event.created_at,
          
          utc_data: {
            poll_start_minutes: pollStartMinutes,
            timezone_offset: timezoneOffset,
            schedules: utcSchedules,
            next_occurrence: nextOccurrence
          },
          
          poll_datetime_utc: nextOccurrence ? nextOccurrence.poll_datetime_utc : null
        };
      });

      res.json({
        success: true,
        events: processedEvents,
        total: processedEvents.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      Logger.error(`Ошибка в маршруте /status: ${error}`);
      res.status(500).json({ 
        success: false,
        error: 'Ошибка сервера',
        details: error.message 
      });
    }
  });

  // ===== 404 HANDLER =====

  router.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'Маршрут не найден',
      path: req.originalUrl,
      method: req.method
    });
  });

  // Регистрируем все маршруты
  app.use('/', router);

  Logger.info('Все маршруты успешно зарегистрированы');
};

// Вспомогательные функции для расчета времени (вынесены из основного кода)

function calculateWeeklyUTCTime(dayName, startTime, timezoneOffsetMinutes, pollStartMinutes) {
  const dayMapping = {
    'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
    'friday': 5, 'saturday': 6, 'sunday': 0
  };
  
  const dayNumber = dayMapping[dayName.toLowerCase()];
  const [hours, minutes] = startTime.split(':').map(Number);
  
  if (isNaN(hours) || isNaN(minutes)) {
    throw new Error(`Неверный формат времени: ${startTime}`);
  }
  
  // Текущая дата в UTC
  const now = new Date();
  const currentUTCDay = now.getUTCDay();
  
  // Вычисляем разницу в днях до нужного дня недели
  let daysDiff = dayNumber - currentUTCDay;
  if (daysDiff < 0) daysDiff += 7;
  
  // Создаем дату события в UTC
  const eventDateUTC = new Date(now);
  eventDateUTC.setUTCDate(now.getUTCDate() + daysDiff);
  eventDateUTC.setUTCHours(hours, minutes, 0, 0);
  
  // КОРРЕКТНО конвертируем из локального времени в UTC
  // timezoneOffsetMinutes - это смещение локального времени от UTC в минутах
  const eventTimeUTC = new Date(eventDateUTC.getTime() - (timezoneOffsetMinutes * 60000));
  
  // Если время уже прошло сегодня, берем следующую неделю
  if (daysDiff === 0 && eventTimeUTC <= now) {
    eventTimeUTC.setUTCDate(eventTimeUTC.getUTCDate() + 7);
  }
  
  // ВАЖНО: Время уведомления = время начала события МИНУС время опроса
  // pollStartMinutes - за сколько минут ДО начала события отправлять уведомление
  const pollDateUTC = new Date(eventTimeUTC.getTime() - (pollStartMinutes * 60000));
  
  Logger.debug(`⏰ Расчет времени для ${dayName}:`);
  Logger.debug(`   Локальное время начала: ${startTime}`);
  Logger.debug(`   Часовой пояс: ${timezoneOffsetMinutes} мин (${timezoneOffsetMinutes/60} часов)`);
  Logger.debug(`   Время начала UTC: ${eventTimeUTC.toISOString()}`);
  Logger.debug(`   Poll start minutes: ${pollStartMinutes}`);
  Logger.debug(`   Время уведомления UTC: ${pollDateUTC.toISOString()}`);
  
  return {
    day_name: dayName,
    local_time: startTime,
    meeting_time_utc: eventTimeUTC.toISOString().slice(11, 16),
    meeting_datetime_utc: eventTimeUTC.toISOString(),
    poll_time_utc: pollDateUTC.toISOString().slice(11, 16),
    poll_datetime_utc: pollDateUTC.toISOString(),
    utc_weekday: eventTimeUTC.getUTCDay(),
    date: eventTimeUTC.toISOString().split('T')[0],
    timezone_offset: timezoneOffsetMinutes
  };
}

function findNextWeeklyOccurrence(weeklyDays, startTime, timezoneOffsetMinutes, pollStartMinutes) {
  const now = new Date();
  let nearestEvent = null;
  let minTimeDiff = Infinity;
  
  weeklyDays.forEach(dayName => {
    try {
      const utcTime = calculateWeeklyUTCTime(dayName, startTime, timezoneOffsetMinutes, pollStartMinutes);
      const timeDiff = new Date(utcTime.poll_datetime_utc) - now;
      
      // Ищем ближайшее будущее событие
      if (timeDiff > 0 && timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        nearestEvent = utcTime;
      }
    } catch (error) {
      Logger.error(`Ошибка расчета времени для дня ${dayName}:`, error);
    }
  });
  
  if (nearestEvent) {
    Logger.debug(`🎯 Ближайшее событие: ${nearestEvent.day_name} в ${nearestEvent.poll_datetime_utc}`);
  }
  
  return nearestEvent;
}