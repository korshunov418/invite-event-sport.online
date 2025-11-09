const db = require('../database');
const queries = require('../database/queries');
const Logger = require('../utils/logger');

class ParticipantService {
  async getParticipants(eventId) {
    try {
      const participants = await db.all(
        `SELECT user_id, username, first_name, plus_count, is_reserve 
         FROM event_participants 
         WHERE event_id = ? 
         ORDER BY joined_at`,
        [eventId]
      );
      
      return participants || [];
    } catch (error) {
      Logger.error(`Ошибка получения участников: ${error}`);
      throw error;
    }
  }

  async addParticipant(eventId, userId, username, firstName) {
    try {
      // Проверяем существующего участника
      const existing = await db.get(
        `SELECT id, plus_count FROM event_participants WHERE event_id = ? AND user_id = ?`,
        [eventId, userId]
      );
      
      if (existing) {
        // Увеличиваем счетчик
        const newCount = existing.plus_count + 1;
        await db.run(
          `UPDATE event_participants SET plus_count = ?, joined_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newCount, existing.id]
        );
        
        Logger.info(`Увеличено количество плюсов для user_id=${userId}: ${newCount}`);
        await handleParticipantAction(ctx, eventId, 'join');
        return { success: true, isNew: false, count: newCount };
      } else {
        // Добавляем нового участника
        await db.run(
          `INSERT INTO event_participants (event_id, user_id, username, first_name, plus_count) 
           VALUES (?, ?, ?, ?, 1)`,
          [eventId, userId, username, firstName]
        );
        
        Logger.info(`Добавлен участник: ${firstName} (user_id=${userId})`);
        await handleParticipantAction(ctx, eventId, 'join');
        return { success: true, isNew: true, count: 1 };
      }
    } catch (error) {
      Logger.error(`Ошибка добавления участника: ${error}`);
      throw error;
    }
  }

  async handleParticipantAction(ctx, eventId, action) {
    try {
      const user = ctx.from;
      const chat = ctx.callbackQuery.message.chat;
      
      // Получаем информацию о мероприятии
      const eventInfo = await queries.getEventInfo(eventId);
      if (!eventInfo) {
        await ctx.answerCbQuery('❌ Мероприятие не найдено');
        return;
      }

      // Проверяем, активен ли еще опрос
      if (!Helpers.isPollActive(eventInfo)) {
        await ctx.answerCbQuery('❌ Опрос завершен, запись закрыта');
        return;
      }

      // Находим запись события
      const eventRecord = await eventService.getEventByExternalId(eventInfo.external_id);
      if (!eventRecord) {
        await ctx.answerCbQuery('❌ Событие не найдено');
        return;
      }

      if (action === 'join') {
        const result = await addParticipant(
          eventRecord.id, 
          user.id, 
          user.username, 
          user.first_name
        );
        
        if (result.success) {
          const message = result.isNew ? 
            '✅ Вы записались на игру!' : 
            `✅ +1 (всего: ${result.count})`;
          await ctx.answerCbQuery(message);
          await updateEventMessage(ctx, eventRecord.id, chat.id, eventInfo);
        } else {
          await ctx.answerCbQuery('❌ Ошибка при записи');
        }
      } else if (action === 'leave') {
        const success = await participantService.removeParticipant(eventRecord.id, user.id);
        if (success) {
          await ctx.answerCbQuery('❌ Вы отписались от игры');
          await updateEventMessage(ctx, eventRecord.id, chat.id, eventInfo);
        } else {
          await ctx.answerCbQuery('❌ Вы не были записаны');
        }
      }
      
    } catch (error) {
      Logger.error(`Ошибка обработки действия участника: ${error}`);
      await ctx.answerCbQuery('❌ Произошла ошибка');
    }
  }
  

  async removeParticipant(eventId, userId) {
    try {
      const result = await db.run(
        `DELETE FROM event_participants WHERE event_id = ? AND user_id = ?`,
        [eventId, userId]
      );
      
      const deleted = result.changes > 0;
      if (deleted) {
        Logger.info(`Удален участник: user_id=${userId}`);
      }
      
      return deleted;
    } catch (error) {
      Logger.error(`Ошибка удаления участника: ${error}`);
      throw error;
    }
  }

  async resetParticipants(eventId) {
    try {
      const result = await db.run(
        `DELETE FROM event_participants WHERE event_id = ?`,
        [eventId]
      );
      
      Logger.info(`Участники сброшены для event_id=${eventId}`);
      return result.changes >= 0;
    } catch (error) {
      Logger.error(`Ошибка сброса участников: ${error}`);
      throw error;
    }
  }

  async getTotalRegistrations(eventId) {
    try {
      const participants = await this.getParticipants(eventId);
      return participants.reduce((sum, participant) => sum + participant.plus_count, 0);
    } catch (error) {
      Logger.error(`Ошибка подсчета регистраций: ${error}`);
      throw error;
    }
  }

  async getParticipantCount(eventId) {
    try {
      const result = await db.get(
        `SELECT COUNT(*) as count FROM event_participants WHERE event_id = ?`,
        [eventId]
      );
      return result ? result.count : 0;
    } catch (error) {
      Logger.error(`Ошибка подсчета участников: ${error}`);
      throw error;
    }
  }

  async isUserParticipant(eventId, userId) {
    try {
      const participant = await db.get(
        `SELECT id FROM event_participants WHERE event_id = ? AND user_id = ?`,
        [eventId, userId]
      );
      return !!participant;
    } catch (error) {
      Logger.error(`Ошибка проверки участника: ${error}`);
      throw error;
    }
  }

  async getParticipantInfo(eventId, userId) {
    try {
      return await db.get(
        `SELECT * FROM event_participants WHERE event_id = ? AND user_id = ?`,
        [eventId, userId]
      );
    } catch (error) {
      Logger.error(`Ошибка получения информации об участнике: ${error}`);
      throw error;
    }
  }

  async updateParticipantReserveStatus(eventId, userId, isReserve) {
    try {
      const result = await db.run(
        `UPDATE event_participants SET is_reserve = ? WHERE event_id = ? AND user_id = ?`,
        [isReserve, eventId, userId]
      );
      
      Logger.info(`Статус резерва обновлен для user_id=${userId}: ${isReserve}`);
      return result.changes > 0;
    } catch (error) {
      Logger.error(`Ошибка обновления статуса резерва: ${error}`);
      throw error;
    }
  }

  async getReserveParticipants(eventId) {
    try {
      return await db.all(
        `SELECT user_id, username, first_name, plus_count 
         FROM event_participants 
         WHERE event_id = ? AND is_reserve = TRUE 
         ORDER BY joined_at`,
        [eventId]
      );
    } catch (error) {
      Logger.error(`Ошибка получения резервных участников: ${error}`);
      throw error;
    }
  }

  async promoteReserveToMain(eventId, userId) {
    try {
      const result = await db.run(
        `UPDATE event_participants SET is_reserve = FALSE WHERE event_id = ? AND user_id = ?`,
        [eventId, userId]
      );
      
      if (result.changes > 0) {
        Logger.info(`Резервный участник повышен до основного: user_id=${userId}`);
      }
      
      return result.changes > 0;
    } catch (error) {
      Logger.error(`Ошибка повышения резервного участника: ${error}`);
      throw error;
    }
  }

  async getParticipantLeaderboard(eventId, limit = 10) {
    try {
      return await db.all(
        `SELECT user_id, username, first_name, plus_count 
         FROM event_participants 
         WHERE event_id = ? 
         ORDER BY plus_count DESC, joined_at ASC 
         LIMIT ?`,
        [eventId, limit]
      );
    } catch (error) {
      Logger.error(`Ошибка получения таблицы лидеров: ${error}`);
      throw error;
    }
  }

  async cleanupOldParticipants(days = 30) {
    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      
      const result = await db.run(
        `DELETE FROM event_participants 
         WHERE joined_at < ? 
         AND event_id IN (
           SELECT id FROM events WHERE created_at < ?
         )`,
        [cutoffDate, cutoffDate]
      );
      
      Logger.info(`Очищено ${result.changes} устаревших записей участников`);
      return result.changes;
    } catch (error) {
      Logger.error(`Ошибка очистки устаревших участников: ${error}`);
      throw error;
    }
  }
}

module.exports = new ParticipantService();