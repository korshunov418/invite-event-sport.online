const db = require('./index');
const Logger = require('../utils/logger');

class Queries {
  // ===== EVENT MESSAGES QUERIES =====
  
  async saveEventMessage(eventId, messageId, chatId) {
    try {
      const result = await db.run(
        `INSERT OR REPLACE INTO event_messages (event_id, message_id, chat_id, created_at) 
         VALUES (?, ?, ?, ?)`,
        [eventId, messageId, chatId, new Date().toISOString()]
      );
      return result.id;
    } catch (error) {
      Logger.error(`Ошибка сохранения сообщения события: ${error}`);
      throw error;
    }
  }

  async getLastEventMessage(eventId, chatId) {
    try {
      return await db.get(
        `SELECT message_id FROM event_messages 
         WHERE event_id = ? AND chat_id = ? 
         ORDER BY created_at DESC 
         LIMIT 1`,
        [eventId, chatId]
      );
    } catch (error) {
      Logger.error(`Ошибка получения последнего сообщения: ${error}`);
      throw error;
    }
  }

  // ===== TEAM SPLIT SESSIONS QUERIES =====
  
  async setTeamSplitSession(eventId, chatId, userId) {
    try {
      const result = await db.run(
        `INSERT OR REPLACE INTO team_split_sessions (event_id, chat_id, user_id, waiting_for_teams, created_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [eventId, chatId, userId, true, new Date().toISOString()]
      );
      return result.id;
    } catch (error) {
      Logger.error(`Ошибка установки сессии разделения команд: ${error}`);
      throw error;
    }
  }

  async getActiveTeamSplitSession(chatId, userId) {
    try {
      return await db.get(
        `SELECT * FROM team_split_sessions 
         WHERE chat_id = ? AND user_id = ? AND waiting_for_teams = TRUE
         ORDER BY created_at DESC 
         LIMIT 1`,
        [chatId, userId]
      );
    } catch (error) {
      Logger.error(`Ошибка получения активной сессии команд: ${error}`);
      throw error;
    }
  }

  async completeTeamSplitSession(sessionId) {
    try {
      await db.run(
        `UPDATE team_split_sessions SET waiting_for_teams = FALSE WHERE id = ?`,
        [sessionId]
      );
      return true;
    } catch (error) {
      Logger.error(`Ошибка завершения сессии команд: ${error}`);
      throw error;
    }
  }

  // ===== MESSAGE & ID MAPPING QUERIES =====
  
  async saveMessageData(messageData) {
    try {
      const {
        external_id,
        language,
        eventName,
        frequency,
        regularFrequency,
        startDate,
        yearlyDates,
        dayNumber,
        weeklyDays,
        startTime,
        duration,
        pollStart,
        pollEnd,
        cityTimezone,
        location,
        comment,
        participantLimitType,
        participantLimit,
        reserve,
        paymentType,
        paymentMethod,
        costType,
        fixedCost
      } = messageData;

      // Поиск или создание internal_id
      const existingMapping = await db.get(
        'SELECT internal_id FROM id_mapping WHERE external_id = ?', 
        [external_id]
      );

      let internal_id = existingMapping ? existingMapping.internal_id : require('uuid').v4();

      if (!existingMapping) {
        await db.run(
          'INSERT INTO id_mapping (external_id, internal_id) VALUES (?, ?)', 
          [external_id, internal_id]
        );
        Logger.info(`Создан новый mapping: external_id=${external_id}, internal_id=${internal_id}`);
      }

      // Сохранение сообщения
      const query = `
        INSERT INTO messages (
          internal_id, language, event_name, frequency, regular_frequency, start_date, yearly_dates,
          day_number, weekly_days, start_time, duration_value, duration_unit, poll_start_value,
          poll_start_unit, poll_end_value, poll_end_unit, city_timezone, location, comment,
          participant_limit_type, participant_limit, reserve, payment_type, payment_method,
          cost_type, fixed_cost
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        internal_id,
        language || null,
        eventName || null,
        frequency || null,
        regularFrequency || null,
        startDate || null,
        yearlyDates ? JSON.stringify(yearlyDates) : null,
        dayNumber ? parseInt(dayNumber) : null,
        weeklyDays ? JSON.stringify(weeklyDays) : null,
        startTime || null,
        duration?.value ? parseInt(duration.value) : null,
        duration?.unit || null,
        pollStart?.value ? parseInt(pollStart.value) : null,
        pollStart?.unit || null,
        pollEnd?.value ? parseInt(pollEnd.value) : null,
        pollEnd?.unit || null,
        cityTimezone || null,
        location || null,
        comment || null,
        participantLimitType || null,
        participantLimit ? parseInt(participantLimit) : null,
        reserve || null,
        paymentType || null,
        paymentMethod || null,
        costType || null,
        fixedCost ? parseInt(fixedCost) : null
      ];

      const result = await db.run(query, params);
      
      Logger.info(`Сообщение успешно сохранено. ID: ${result.id}, internal_id: ${internal_id}`);
      
      return { 
        internal_id: internal_id,
        message_id: result.id
      };
    } catch (error) {
      Logger.error(`Ошибка сохранения данных сообщения: ${error}`);
      throw error;
    }
  }

  async getEventInfo(eventId) {
    try {
      const query = `
        SELECT 
          m.*,
          i.external_id,
          e.internal_chat_id
        FROM messages m
        JOIN id_mapping i ON m.internal_id = i.internal_id
        JOIN events e ON e.external_chat_id = i.external_id
        WHERE m.id = ?
      `;
      
      return await db.get(query, [eventId]);
    } catch (error) {
      Logger.error(`Ошибка получения информации о мероприятии: ${error}`);
      throw error;
    }
  }

  async getEventInfoByExternalId(externalId) {
    try {
      const query = `
        SELECT m.* 
        FROM messages m
        JOIN id_mapping i ON m.internal_id = i.internal_id
        WHERE i.external_id = ?
        ORDER BY m.created_at DESC
        LIMIT 1
      `;
      
      return await db.get(query, [externalId]);
    } catch (error) {
      Logger.error(`Ошибка получения информации о мероприятии по external_id: ${error}`);
      throw error;
    }
  }

  // ===== ACTIVE EVENTS QUERIES =====
  
  async getActiveEvents() {
    try {
      const query = `
        SELECT
          m.id,
          i.external_id internal_id,
          m.language,
          m.event_name,
          m.frequency,
          m.regular_frequency,
          m.start_date,
          m.yearly_dates,
          m.day_number,
          m.weekly_days,
          m.start_time,
          m.duration_value,
          m.duration_unit,
          m.poll_start_value,
          m.poll_start_unit,
          m.poll_end_value,
          m.poll_end_unit,
          m.city_timezone,
          m.location,
          m.comment,
          m.participant_limit_type,
          m.participant_limit,
          m.reserve,
          m.payment_type,
          m.payment_method,
          m.cost_type,
          m.fixed_cost,
          m.created_at
        FROM messages m, id_mapping i
        WHERE m.internal_id = i.internal_id
        ORDER BY m.created_at DESC
      `;

      return await db.all(query);
    } catch (error) {
      Logger.error(`Ошибка получения активных событий: ${error}`);
      throw error;
    }
  }

  // ===== ADMIN QUERIES =====
  
  async getDatabaseStatus() {
    try {
      const result = await db.get('SELECT COUNT(*) as count FROM messages');
      return result.count;
    } catch (error) {
      Logger.error(`Ошибка получения статуса базы данных: ${error}`);
      throw error;
    }
  }

  // ===== CHAT LINKS QUERIES =====
  
  async createChatLink(personalExternalId, groupExternalId, groupChatId) {
    try {
      const result = await db.run(
        `INSERT INTO chat_links (personal_external_id, group_external_id, group_chat_id, created_at) 
         VALUES (?, ?, ?, ?)`,
        [personalExternalId, groupExternalId, groupChatId, new Date().toISOString()]
      );
      return result.id;
    } catch (error) {
      Logger.error(`Ошибка создания связи чатов: ${error}`);
      throw error;
    }
  }

  async getChatLinkByPersonalId(personalExternalId) {
    try {
      return await db.get(
        `SELECT * FROM chat_links WHERE personal_external_id = ?`,
        [personalExternalId]
      );
    } catch (error) {
      Logger.error(`Ошибка получения связи чатов: ${error}`);
      throw error;
    }
  }

  // ===== BATCH OPERATIONS =====
  
  async cleanupOldSessions(hours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      
      const result = await db.run(
        `DELETE FROM team_split_sessions WHERE created_at < ?`,
        [cutoffTime]
      );
      
      Logger.info(`Очищено ${result.changes} устаревших сессий`);
      return result.changes;
    } catch (error) {
      Logger.error(`Ошибка очистки устаревших сессий: ${error}`);
      throw error;
    }
  }

  async getEventStatistics(eventId) {
    try {
      const stats = await db.get(
        `SELECT 
          COUNT(*) as total_participants,
          SUM(plus_count) as total_registrations,
          SUM(CASE WHEN is_reserve = 1 THEN 1 ELSE 0 END) as reserve_count
         FROM event_participants 
         WHERE event_id = ?`,
        [eventId]
      );
      
      return stats;
    } catch (error) {
      Logger.error(`Ошибка получения статистики события: ${error}`);
      throw error;
    }
  }

  // ===== SEARCH QUERIES =====
  
  async searchEvents(searchTerm, limit = 10) {
    try {
      const query = `
        SELECT 
          m.*,
          i.external_id
        FROM messages m
        JOIN id_mapping i ON m.internal_id = i.internal_id
        WHERE m.event_name LIKE ? OR m.location LIKE ? OR m.comment LIKE ?
        ORDER BY m.created_at DESC
        LIMIT ?
      `;
      
      const searchPattern = `%${searchTerm}%`;
      return await db.all(query, [searchPattern, searchPattern, searchPattern, limit]);
    } catch (error) {
      Logger.error(`Ошибка поиска событий: ${error}`);
      throw error;
    }
  }

  // ===== MIGRATION QUERIES =====
  
  async getDatabaseSchema() {
    try {
      const tables = await db.all(
        "SELECT name FROM sqlite_master WHERE type='table'"
      );
      
      const schema = {};
      
      for (const table of tables) {
        const columns = await db.all(
          `PRAGMA table_info(${table.name})`
        );
        schema[table.name] = columns;
      }
      
      return schema;
    } catch (error) {
      Logger.error(`Ошибка получения схемы базы данных: ${error}`);
      throw error;
    }
  }
}

module.exports = new Queries();