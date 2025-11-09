const eventService = require('../../services/eventService');
const participantService = require('../../services/participantService');
const queries = require('../../database/queries');
const Keyboards = require('../keyboards');
const Logger = require('../../utils/logger');
const Helpers = require('../../utils/helpers');

module.exports = (bot) => {
  // Обработчики инлайн-кнопок с ID мероприятий
  bot.action(/join_(\d+)/, async (ctx) => {
    const eventId = ctx.match[1];
    await handleParticipantAction(ctx, eventId, 'join');
  });

  bot.action(/leave_(\d+)/, async (ctx) => {
    const eventId = ctx.match[1];
    await handleParticipantAction(ctx, eventId, 'leave');
  });

  bot.action(/list_(\d+)/, async (ctx) => {
    const eventId = ctx.match[1];
    await handleListAction(ctx, eventId);
  });

  bot.action(/teams_(\d+)/, async (ctx) => {
    const eventId = ctx.match[1];
    await handleTeamsAction(ctx, eventId);
  });

  bot.action(/reset_(\d+)/, async (ctx) => {
    const eventId = ctx.match[1];
    await handleResetAction(ctx, eventId);
  });

  bot.action(/delete_(\d+)/, async (ctx) => {
    const eventId = ctx.match[1];
    await handleDeleteAction(ctx, eventId);
  });

  // Обработчики подтверждений
  bot.action(/confirm_(.+)_(\d+)/, async (ctx) => {
    const action = ctx.match[1];
    const id = ctx.match[2];
    await handleConfirmation(ctx, action, id);
  });

  bot.action(/cancel_(.+)_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery('Действие отменено');
    await ctx.deleteMessage();
  });

  // Обработчики языков
  bot.action(/set_language_(.+)/, async (ctx) => {
    const language = ctx.match[1];
    await handleLanguageChange(ctx, language);
  });

  // Общие обработчики
  bot.action('help', async (ctx) => {
    await ctx.answerCbQuery();
    await handleHelpAction(ctx);
  });
};

async function handleParticipantAction(ctx, eventId, action) {
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
      const result = await participantService.addParticipant(
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

async function handleListAction(ctx, eventId) {
  try {
    const eventInfo = await queries.getEventInfo(eventId);
    if (!eventInfo) {
      await ctx.answerCbQuery('❌ Мероприятие не найдено');
      return;
    }

    const eventRecord = await eventService.getEventByExternalId(eventInfo.external_id);
    if (!eventRecord) {
      await ctx.answerCbQuery('❌ Событие не найдено');
      return;
    }

    const participants = await participantService.getParticipants(eventRecord.id);
    const totalRegistrations = await participantService.getTotalRegistrations(eventRecord.id);
    
    let message = `👥 <b>Участники мероприятия</b>\n`;
    message += `📊 Всего записей: ${totalRegistrations}\n\n`;
    
    if (participants.length > 0) {
      participants.forEach((participant, index) => {
        const userLink = participant.username ? 
          `<a href="tg://user?id=${participant.user_id}">@${participant.username}</a>` : 
          `<a href="tg://user?id=${participant.user_id}">${participant.first_name}</a>`;
        const countBadge = participant.plus_count > 1 ? ` ×${participant.plus_count}` : '';
        message += `${index + 1}. ${userLink}${countBadge}\n`;
      });
    } else {
      message += `Пока никто не записался\n`;
    }
    
    await ctx.reply(message, { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
    
  } catch (error) {
    Logger.error(`Ошибка показа списка: ${error}`);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
}

async function handleTeamsAction(ctx, eventId) {
  try {
    const user = ctx.from;
    const chat = ctx.callbackQuery.message.chat;
    
    // Проверяем права администратора
    const isAdmin = await checkAdminRights(ctx, chat.id, user.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Только для администраторов');
      return;
    }

    const eventInfo = await queries.getEventInfo(eventId);
    if (!eventInfo) {
      await ctx.answerCbQuery('❌ Мероприятие не найдено');
      return;
    }

    const eventRecord = await eventService.getEventByExternalId(eventInfo.external_id);
    if (!eventRecord) {
      await ctx.answerCbQuery('❌ Событие не найдено');
      return;
    }

    const participants = await participantService.getParticipants(eventRecord.id);
    
    if (participants.length < 2) {
      await ctx.answerCbQuery('❌ Нужно минимум 2 участника');
      return;
    }

    await queries.setTeamSplitSession(eventRecord.id, chat.id, user.id);
    await ctx.answerCbQuery();
    
    await ctx.reply(
      `🏈 <b>Деление на команды</b>\n\n` +
      `Участников: ${participants.length}\n` +
      `На сколько команд поделить? Отправьте число (2-${participants.length}):`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    Logger.error(`Ошибка разделения на команды: ${error}`);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
}

async function handleResetAction(ctx, eventId) {
  try {
    const user = ctx.from;
    const chat = ctx.callbackQuery.message.chat;
    
    // Проверяем права администратора
    const isAdmin = await checkAdminRights(ctx, chat.id, user.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Только для администраторов');
      return;
    }

    const eventInfo = await queries.getEventInfo(eventId);
    if (!eventInfo) {
      await ctx.answerCbQuery('❌ Мероприятие не найдено');
      return;
    }

    const eventRecord = await eventService.getEventByExternalId(eventInfo.external_id);
    if (!eventRecord) {
      await ctx.answerCbQuery('❌ Событие не найдено');
      return;
    }

    // Сбрасываем участников
    const success = await participantService.resetParticipants(eventRecord.id);
    
    if (success) {
      await ctx.answerCbQuery('✅ Список сброшен!');
      await updateEventMessage(ctx, eventRecord.id, chat.id, eventInfo);
    } else {
      await ctx.answerCbQuery('❌ Ошибка сброса');
    }
    
  } catch (error) {
    Logger.error(`Ошибка сброса участников: ${error}`);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
}

async function handleDeleteAction(ctx, eventId) {
  try {
    const user = ctx.from;
    const chat = ctx.callbackQuery.message.chat;
    
    // Проверяем права администратора
    const isAdmin = await checkAdminRights(ctx, chat.id, user.id);
    if (!isAdmin) {
      await ctx.answerCbQuery('❌ Только для администраторов');
      return;
    }

    const eventInfo = await queries.getEventInfo(eventId);
    if (!eventInfo) {
      await ctx.answerCbQuery('❌ Мероприятие не найдено');
      return;
    }

    const eventRecord = await eventService.getEventByExternalId(eventInfo.external_id);
    if (!eventRecord) {
      await ctx.answerCbQuery('❌ Событие не найдено');
      return;
    }

    // Запрашиваем подтверждение
    const keyboard = Keyboards.getConfirmationKeyboard('delete', eventRecord.id);
    await ctx.reply(
      '❓ <b>Вы уверены, что хотите удалить это событие?</b>\n\n' +
      'Это действие нельзя отменить. Все данные об участниках будут удалены.',
      {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup
      }
    );
    
    await ctx.answerCbQuery();
    
  } catch (error) {
    Logger.error(`Ошибка удаления события: ${error}`);
    await ctx.answerCbQuery('❌ Произошла ошибка');
  }
}

async function handleConfirmation(ctx, action, id) {
  try {
    await ctx.answerCbQuery();
    
    if (action === 'delete') {
      const success = await eventService.deleteEvent(parseInt(id));
      
      if (success) {
        await ctx.editMessageText('✅ Событие успешно удалено');
        
        // Пытаемся удалить оригинальное сообщение с формой
        try {
          await ctx.deleteMessage();
        } catch (e) {
          // Игнорируем ошибку, если сообщение уже удалено
        }
      } else {
        await ctx.editMessageText('❌ Ошибка при удалении события');
      }
    }
  } catch (error) {
    Logger.error(`Ошибка подтверждения действия: ${error}`);
    await ctx.editMessageText('❌ Произошла ошибка');
  }
}

async function handleLanguageChange(ctx, language) {
  try {
    // Здесь можно сохранить выбор языка в базу данных
    await ctx.answerCbQuery(`Язык изменен на ${language === 'ru' ? 'русский' : 'English'}`);
    
    await ctx.editMessageText(
      `✅ Язык установлен: ${language === 'ru' ? 'Русский' : 'English'}`,
      Keyboards.getBackButton('main')
    );
  } catch (error) {
    Logger.error(`Ошибка смены языка: ${error}`);
    await ctx.answerCbQuery('❌ Ошибка при смене языка');
  }
}

async function handleHelpAction(ctx) {
  try {
    const helpText = `❓ <b>Помощь по кнопкам</b>\n\n` +
      `➕ <b>Записаться</b> - Добавить себя в список участников\n` +
      `➖ <b>Отписаться</b> - Убрать себя из списка участников\n` +
      `👥 <b>Список</b> - Показать всех участников\n` +
      `🏈 <b>Команды</b> - Разделить участников на команды\n` +
      `🔄 <b>Сбросить</b> - Очистить список участников (админы)\n` +
      `🗑️ <b>Удалить</b> - Удалить событие (админы)`;
    
    await ctx.reply(helpText, { parse_mode: 'HTML' });
  } catch (error) {
    Logger.error(`Ошибка показа помощи: ${error}`);
  }
}

// Вспомогательные функции
async function checkAdminRights(ctx, chatId, userId) {
  try {
    const chatMember = await ctx.telegram.getChatMember(chatId, userId);
    return chatMember.status === 'administrator' || chatMember.status === 'creator';
  } catch (error) {
    Logger.error(`Ошибка проверки прав администратора: ${error}`);
    return false;
  }
}

async function updateEventMessage(ctx, eventId, chatId, eventInfo) {
  try {
    const participants = await participantService.getParticipants(eventId);
    const lastMessage = await queries.getLastEventMessage(eventId, chatId);
    
    if (lastMessage) {
      const lang = eventInfo.language || 'ru';
      // Здесь должна быть функция formatEventMessage
      const { message: formattedMessage, pollActive } = formatEventMessage(eventInfo, participants, lang);
      const keyboard = Keyboards.getEventKeyboard(eventInfo.id, lang, pollActive);
      
      try {
        await ctx.telegram.editMessageText(
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
  }
}
// Функция для форматирования сообщения о событии
function formatEventMessage(eventInfo, participants = [], language = 'ru') {
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
            'poll_closed': '❌ ОПРОС ЗАКРЫТ'
        }
    };

    const t = localizations[language] || localizations['ru'];
    
    // Проверяем, активен ли опрос
    const pollActive = isPollActive(eventInfo);
    
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
                    }
                };
                const dayDict = dayTranslations[language] || dayTranslations['ru'];
                const dayNames = days.map(day => dayDict[day] || day).join(', ');
                message += `<b>${t['day']}:</b> ${dayNames}\n`;
            }
        } catch (e) {
            log(`Ошибка парсинга дней недели: ${e}`);
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
    if (eventInfo.participant_limit) {
        const limitText = t['participant_limit'].replace('{limit}', eventInfo.participant_limit);
        message += `<b>${t['participants']}:</b> ${limitText}\n`;
        message += `<b>${t['current_participants'].replace('{current}', totalRegistrations)}</b>\n`;
    } else {
        message += `<b>${t['participants']}:</b> ${totalRegistrations}\n`;
    }
    
    // Статус опроса
    if (!pollActive) {
        message += `\n<b>${t['poll_closed']}</b>\n`;
    }
    
    message += `\n<b>${t['commands_title']}</b>`;
    
    // ВАЖНО: Возвращаем объект с message и pollActive
    return { message, pollActive };
}