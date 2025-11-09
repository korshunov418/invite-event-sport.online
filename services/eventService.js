const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const queries = require('../database/queries');
const Logger = require('../utils/logger');

class EventService {
  async createEventRecord(chatId) {
    try {
      // Проверяем существующее событие
      const existing = await db.get(
        `SELECT external_chat_id FROM events WHERE internal_chat_id = ?`,
        [chatId]
      );
      
      if (existing) {
        Logger.info(`Найдено существующее событие для chat_id=${chatId}: ${existing.external_chat_id}`);
        return existing.external_chat_id;
      }

      // Создаем новое событие
      const externalChatId = uuidv4();
      const createdAt = new Date().toISOString();
      
      await db.run(
        `INSERT INTO events (created_at, internal_chat_id, external_chat_id) VALUES (?, ?, ?)`,
        [createdAt, chatId, externalChatId]
      );

      Logger.info(`Создана запись: chat_id=${chatId}, GUID=${externalChatId}`);
      return externalChatId;
    } catch (error) {
      Logger.error(`Ошибка создания записи события: ${error}`);
      throw error;
    }
  }

  async getEventByExternalId(externalChatId) {
    try {
      return await db.get(
        `SELECT id, internal_chat_id, external_chat_id FROM events WHERE external_chat_id = ?`,
        [externalChatId]
      );
    } catch (error) {
      Logger.error(`Ошибка поиска события по external_chat_id: ${error}`);
      throw error;
    }
  }

  async getEventByChatId(chatId) {
    try {
      return await db.get(
        `SELECT id, external_chat_id FROM events WHERE internal_chat_id = ?`,
        [chatId]
      );
    } catch (error) {
      Logger.error(`Ошибка получения события: ${error}`);
      throw error;
    }
  }

  async getChatIdByExternalId(externalChatId) {
    try {
      const row = await db.get(
        `SELECT internal_chat_id FROM events WHERE external_chat_id = ?`,
        [externalChatId]
      );
      return row ? row.internal_chat_id : null;
    } catch (error) {
      Logger.error(`Ошибка получения chat_id по external_chat_id: ${error}`);
      throw error;
    }
  }

  async deleteEvent(eventId) {
    try {
      await db.run('BEGIN TRANSACTION');

      // Удаляем связанные данные
      await db.run(`DELETE FROM event_participants WHERE event_id = ?`, [eventId]);
      await db.run(`DELETE FROM event_messages WHERE event_id = ?`, [eventId]);
      await db.run(`DELETE FROM team_split_sessions WHERE event_id = ?`, [eventId]);
      
      // Удаляем само событие
      const result = await db.run(`DELETE FROM events WHERE id = ?`, [eventId]);

      await db.run('COMMIT');
      
      Logger.info(`Событие удалено: event_id=${eventId}`);
      return result.changes > 0;
    } catch (error) {
      await db.run('ROLLBACK');
      Logger.error(`Ошибка удаления события: ${error}`);
      throw error;
    }
  }

  async getCurrentActiveEvent(chatId) {
    try {
      const query = `
        SELECT 
          e.id as event_id,
          e.external_chat_id,
          m.id as message_id,
          m.start_time,
          m.weekly_days,
          m.city_timezone,
          m.poll_start_value,
          m.poll_start_unit,
          m.poll_end_value,
          m.poll_end_unit,
          m.event_name
        FROM events e
        JOIN id_mapping i ON e.external_chat_id = i.external_id
        JOIN messages m ON m.internal_id = i.internal_id
        WHERE e.internal_chat_id = ?
        ORDER BY m.created_at DESC
        LIMIT 1
      `;
      
      return await db.get(query, [chatId]);
    } catch (error) {
      Logger.error(`Ошибка получения активного события: ${error}`);
      throw error;
    }
  }

  async saveEventMessage(eventId, messageId, chatId) {
    return await queries.saveEventMessage(eventId, messageId, chatId);
  }

  async getLastEventMessage(eventId, chatId) {
    return await queries.getLastEventMessage(eventId, chatId);
  }

  async getEventInfo(eventId) {
    return await queries.getEventInfo(eventId);
  }

  async getEventInfoByExternalId(externalId) {
    return await queries.getEventInfoByExternalId(externalId);
  }

  async getAllActiveEvents() {
    try {
      return await queries.getActiveEvents();
    } catch (error) {
      Logger.error(`Ошибка получения всех активных событий: ${error}`);
      throw error;
    }
  }

  async getEventStatistics(eventId) {
    try {
      return await queries.getEventStatistics(eventId);
    } catch (error) {
      Logger.error(`Ошибка получения статистики события: ${error}`);
      throw error;
    }
  }

  async searchEvents(searchTerm, limit = 10) {
    try {
      return await queries.searchEvents(searchTerm, limit);
    } catch (error) {
      Logger.error(`Ошибка поиска событий: ${error}`);
      throw error;
    }
  }

  async createChatLink(personalExternalId, groupExternalId, groupChatId) {
    try {
      return await queries.createChatLink(personalExternalId, groupExternalId, groupChatId);
    } catch (error) {
      Logger.error(`Ошибка создания связи чатов: ${error}`);
      throw error;
    }
  }

  async getChatLinkByPersonalId(personalExternalId) {
    try {
      return await queries.getChatLinkByPersonalId(personalExternalId);
    } catch (error) {
      Logger.error(`Ошибка получения связи чатов: ${error}`);
      throw error;
    }
  }
}

module.exports = new EventService();