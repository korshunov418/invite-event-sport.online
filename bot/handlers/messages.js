const eventService = require('../../services/eventService');
const participantService = require('../../services/participantService');
const queries = require('../../database/queries');
const Logger = require('../../utils/logger');
const Helpers = require('../../utils/helpers');

module.exports = (bot) => {
  // Обработчики текстовых сообщений + и - в группах
  bot.hears('+', async (ctx) => {
    const chat = ctx.chat;
    
    // Проверяем, что это групповой чат
    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      return;
    }
    
    await handleTextParticipantJoin(ctx);
  });

  bot.hears('-', async (ctx) => {
    const chat = ctx.chat;
    
    // Проверяем, что это групповой чат
    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      return;
    }
    
    await handleTextParticipantLeave(ctx);
  });

  // Обработчик текстовых сообщений (деление на команды)
  bot.on('text', async (ctx) => {
    await handleTeamSplitMessage(ctx);
  });

  // Обработчик любых текстовых сообщений (для будущего расширения)
  bot.on('message', async (ctx) => {
    // Логируем все входящие сообщения
    Logger.debug(`Получено сообщение: ${ctx.message.text} от ${ctx.from.first_name} в чате ${ctx.chat.id}`);
  });
};

async function handleTextParticipantJoin(ctx) {
  const user = ctx.from;
  const chat = ctx.chat;
  
  try {
    Logger.info(`Текстовая запись: пользователь ${user.first_name} в чате ${chat.id}`);
    
    // Получаем текущее активное событие
    const currentEvent = await eventService.getCurrentActiveEvent(chat.id);
    if (!currentEvent) {
      await ctx.reply("❌ В этом чате нет активного мероприятия.");
      return;
    }

    // Проверяем, активен ли еще опрос
    if (!Helpers.isPollActive(currentEvent)) {
      await ctx.reply("❌ Опрос завершен, запись закрыта");
      return;
    }

    const result = await participantService.addParticipant(
      currentEvent.event_id, 
      user.id, 
      user.username, 
      user.first_name
    );
    
    if (result.success) {
      const message = result.isNew ? 
        `✅ ${user.first_name} записался на игру!` : 
        `✅ ${user.first_name} +1 (всего: ${result.count})`;
      await ctx.reply(message);
      
      // Обновляем сообщение с списком участников если есть
      const eventInfo = await eventService.getEventInfoByExternalId(currentEvent.external_chat_id);
      if (eventInfo) {
        // await updateEventMessage(ctx, currentEvent.event_id, chat.id, eventInfo);
      }
    } else {
      await ctx.reply("❌ Ошибка при записи на мероприятие.");
    }
  } catch (error) {
    Logger.error(`Ошибка текстовой записи: ${error}`);
    await ctx.reply("❌ Произошла ошибка при записи.");
  }
}

async function handleTextParticipantLeave(ctx) {
  const user = ctx.from;
  const chat = ctx.chat;
  
  try {
    Logger.info(`Текстовая отписка: пользователь ${user.first_name} в чате ${chat.id}`);
    
    // Получаем текущее активное событие
    const currentEvent = await eventService.getCurrentActiveEvent(chat.id);
    if (!currentEvent) {
      await ctx.reply("❌ В этом чате нет активного мероприятия.");
      return;
    }

    const success = await participantService.removeParticipant(currentEvent.event_id, user.id);
    
    if (success) {
      await ctx.reply(`❌ ${user.first_name} отписался от игры.`);
      
      // Обновляем сообщение с списком участников если есть
      const eventInfo = await eventService.getEventInfoByExternalId(currentEvent.external_chat_id);
      if (eventInfo) {
        // await updateEventMessage(ctx, currentEvent.event_id, chat.id, eventInfo);
      }
    } else {
      await ctx.reply("❌ Вы не были записаны на это мероприятие.");
    }
  } catch (error) {
    Logger.error(`Ошибка текстовой отписки: ${error}`);
    await ctx.reply("❌ Произошла ошибка при отписке.");
  }
}

async function handleTeamSplitMessage(ctx) {
  const chat = ctx.chat;
  const user = ctx.from;
  const text = ctx.message.text;
  
  try {
    // Проверяем, есть ли активная сессия деления на команды
    const activeSession = await queries.getActiveTeamSplitSession(chat.id, user.id);
    
    if (activeSession && !isNaN(text) && text.trim() !== '') {
      const teamCount = parseInt(text);
      
      // Проверяем валидность количества команд
      if (teamCount < 2) {
        await ctx.reply("❌ Количество команд должно быть не менее 2");
        return;
      }

      const participants = await participantService.getParticipants(activeSession.event_id);
      
      if (teamCount > participants.length) {
        await ctx.reply(`❌ Нельзя создать больше команд (${teamCount}) чем участников (${participants.length})`);
        return;
      }
      
      // Делим на команды
      const teams = Helpers.splitIntoTeams(participants, teamCount);
      
      let message = `🏈 <b>Команды (${teamCount}):</b>\n\n`;
      
      teams.forEach((team, index) => {
        message += `<b>Команда ${index + 1}:</b>\n`;
        team.forEach((participant, playerIndex) => {
          const userLink = participant.username ? 
            `@${participant.username}` : participant.first_name;
          const countBadge = participant.plus_count > 1 ? ` (+${participant.plus_count - 1})` : '';
          message += `${playerIndex + 1}. ${userLink}${countBadge}\n`;
        });
        message += '\n';
      });
      
      await ctx.reply(message, { parse_mode: 'HTML' });
      
      // Завершаем сессию
      await queries.completeTeamSplitSession(activeSession.id);
      
      Logger.info(`Участники разделены на ${teamCount} команд для события ${activeSession.event_id}`);
    }
  } catch (error) {
    Logger.error(`Ошибка обработки сообщения разделения команд: ${error}`);
    await ctx.reply("❌ Произошла ошибка при разделении на команды.");
  }
}

// Экспортируем функции для использования в других модулях
module.exports.handleTextParticipantJoin = handleTextParticipantJoin;
module.exports.handleTextParticipantLeave = handleTextParticipantLeave;