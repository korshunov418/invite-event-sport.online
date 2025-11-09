const { Markup } = require('telegraf');
const eventService = require('../../services/eventService');
const participantService = require('../../services/participantService');
const Keyboards = require('../keyboards');
const Logger = require('../../utils/logger');
const config = require('../../config');

module.exports = (bot) => {
  // Основные команды
  bot.start(handleStart);
  bot.command('list', handleList);
  bot.command('teams', handleTeams);
  bot.command('reset_participants', handleResetParticipants);
  bot.command('delete_event', handleDeleteEvent);
  bot.command('help', handleHelp);
  bot.command('info', handleInfo);
  bot.command('stats', handleStats);

  // Админ команды
  bot.command('admin', handleAdmin);
  bot.command('broadcast', handleBroadcast);
};

async function handleStart(ctx) {
  const args = ctx.startPayload;
  const chat = ctx.chat;
  const user = ctx.from;
  
  try {
    Logger.info(`Команда /start от ${user.first_name} в чате ${chat.id}`);

    if (args) {
      await handleDeepLinkStart(ctx, args, chat);
    } else {
      await handleRegularStart(ctx, chat);
    }
  } catch (error) {
    Logger.error(`Ошибка обработки команды start: ${error}`);
    await ctx.reply("❌ Произошла ошибка при запуске бота.");
  }
}

async function handleDeepLinkStart(ctx, args, chat) {
  Logger.info(`Deep link: ${args}`);
  
  if (args === 'group') {
    await handleGroupDeepLink(ctx);
    return;
  }

  // Обработка существующего события
  const existingEvent = await eventService.getEventByExternalId(args);
  
  if (existingEvent) {
    const miniAppUrl = `${config.MINI_APP_BASE_URL}?chat_id=${args}`;
    const keyboard = Keyboards.getWebAppKeyboard(miniAppUrl);
    
    await ctx.reply(
      `Продолжите создание события для группы.\n\nСвязь с группой установлена!`,
      keyboard
    );
  } else {
    await handleNewGroupLink(ctx, args, chat);
  }
}

async function handleGroupDeepLink(ctx) {
  const chat = ctx.chat;
  
  if (chat.type === 'private') {
    const externalChatId = await eventService.createEventRecord(chat.id);
    const miniAppUrl = `${config.MINI_APP_BASE_URL}?chat_id=${externalChatId}`;
    const keyboard = Keyboards.getWebAppKeyboard(miniAppUrl);
    
    await ctx.reply(
      "Привет! В этом чате ты можешь создавать события для своих групп:",
      keyboard
    );
  } else {
    await ctx.reply(
      "Эта команда предназначена для личных сообщений с ботом."
    );
  }
}

async function handleRegularStart(ctx, chat) {
  if (chat.type === 'private') {
    const externalChatId = await eventService.createEventRecord(chat.id);
    const miniAppUrl = `${config.MINI_APP_BASE_URL}?chat_id=${externalChatId}`;
    const keyboard = Keyboards.getWebAppKeyboard(miniAppUrl);
    
    await ctx.reply(
      "Привет! Я бот для организации мероприятий. Я помогу тебе создавать события, управлять участниками и делиться на команды.",
      keyboard
    );
  } else {
    const botUsername = ctx.botInfo.username;
    const keyboard = Keyboards.getGroupHelpKeyboard(botUsername);
    const helpText = `🏀 Бот для организации мероприятий\n\n📋 Команды в этой группе:\n+ ➕ Записаться на игру\n- ➖ Отписаться от игры\n/list 👥 Список участников\n/teams 🏈 Поделить на команды (админы)\n/help ℹ️ Помощь`;
    
    await ctx.reply(helpText, keyboard);
  }
}

async function handleList(ctx) {
  const chat = ctx.chat;
  const user = ctx.from;
  
  try {
    Logger.info(`Команда /list от ${user.first_name} в чате ${chat.id}`);
    
    // Проверяем, что это групповой чат
    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      await ctx.reply("❌ Эта команда работает только в групповых чатах.");
      return;
    }
    
    // Получаем текущее активное событие
    const currentEvent = await eventService.getCurrentActiveEvent(chat.id);
    if (!currentEvent) {
      await ctx.reply("❌ В этом чате нет активного мероприятия.");
      return;
    }
    
    const participants = await participantService.getParticipants(currentEvent.event_id);
    const totalRegistrations = await participantService.getTotalRegistrations(currentEvent.event_id);
    
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
    
  } catch (error) {
    Logger.error(`Ошибка обработки команды list: ${error}`);
    await ctx.reply("❌ Произошла ошибка при получении списка участников.");
  }
}

async function handleTeams(ctx) {
  const chat = ctx.chat;
  const user = ctx.from;
  
  try {
    Logger.info(`Команда /teams от ${user.first_name} в чате ${chat.id}`);
    
    // Проверяем, что это групповой чат
    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      await ctx.reply("❌ Эта команда работает только в групповых чатах.");
      return;
    }
    
    // Проверяем права администратора
    const isAdmin = await checkAdminRights(ctx, chat.id, user.id);
    if (!isAdmin) {
      await ctx.reply("❌ Эта команда доступна только администраторам группы.");
      return;
    }
    
    // Получаем текущее активное событие
    const currentEvent = await eventService.getCurrentActiveEvent(chat.id);
    if (!currentEvent) {
      await ctx.reply("❌ В этом чате нет активного мероприятия.");
      return;
    }
    
    const participants = await participantService.getParticipants(currentEvent.event_id);
    
    if (participants.length < 2) {
      await ctx.reply("❌ Для деления на команды нужно как минимум 2 участника.");
      return;
    }
    
    // Устанавливаем сессию деления на команды
    const queries = require('../../database/queries');
    await queries.setTeamSplitSession(currentEvent.event_id, chat.id, user.id);
    
    await ctx.reply(
      `🏈 <b>Деление на команды</b>\n\n` +
      `Участников: ${participants.length}\n` +
      `На сколько команд поделить? Отправьте число (2-${participants.length}):`,
      { parse_mode: 'HTML' }
    );
    
  } catch (error) {
    Logger.error(`Ошибка обработки команды teams: ${error}`);
    await ctx.reply("❌ Произошла ошибка при разделении на команды.");
  }
}

async function handleResetParticipants(ctx) {
  const chat = ctx.chat;
  const user = ctx.from;
  
  try {
    Logger.info(`Команда /reset_participants от ${user.first_name} в чате ${chat.id}`);
    
    // Проверяем права администратора
    const isAdmin = await checkAdminRights(ctx, chat.id, user.id);
    if (!isAdmin) {
      await ctx.reply("❌ Эта команда доступна только администраторам группы.");
      return;
    }
    
    // Получаем текущее активное событие
    const currentEvent = await eventService.getCurrentActiveEvent(chat.id);
    if (!currentEvent) {
      await ctx.reply("❌ В этом чате нет активного мероприятия.");
      return;
    }

    // Сбрасываем участников
    const success = await participantService.resetParticipants(currentEvent.event_id);
    
    if (success) {
      await ctx.reply("✅ Список участников сброшен!");
      
      // Обновляем сообщение с списком участников если есть
      const eventInfo = await eventService.getEventInfoByExternalId(currentEvent.external_chat_id);
      if (eventInfo) {
        // Здесь должна быть функция обновления сообщения
        // await updateEventMessage(ctx, currentEvent.event_id, chat.id, eventInfo);
      }
    } else {
      await ctx.reply("❌ Ошибка при сбросе участников.");
    }
    
  } catch (error) {
    Logger.error(`Ошибка обработки команды reset_participants: ${error}`);
    await ctx.reply("❌ Произошла ошибка при сбросе участников.");
  }
}

async function handleDeleteEvent(ctx) {
  const chat = ctx.chat;
  const user = ctx.from;
  
  try {
    Logger.info(`Команда /delete_event от ${user.first_name} в чате ${chat.id}`);
    
    // Проверяем права администратора
    const isAdmin = await checkAdminRights(ctx, chat.id, user.id);
    if (!isAdmin) {
      await ctx.reply("❌ Эта команда доступна только администраторам группы.");
      return;
    }
    
    // Получаем текущее активное событие
    const currentEvent = await eventService.getCurrentActiveEvent(chat.id);
    if (!currentEvent) {
      await ctx.reply("❌ В этом чате нет активного мероприятия.");
      return;
    }

    // Удаляем событие
    const success = await eventService.deleteEvent(currentEvent.event_id);
    
    if (success) {
      await ctx.reply("✅ Игра удалена! Создайте новое событие через Mini App.");
    } else {
      await ctx.reply("❌ Ошибка при удалении игры.");
    }
    
  } catch (error) {
    Logger.error(`Ошибка обработки команды delete_event: ${error}`);
    await ctx.reply("❌ Произошла ошибка при удалении события.");
  }
}

async function handleHelp(ctx) {
  const chat = ctx.chat;
  
  try {
    if (chat.type === 'private') {
      const helpText = `🤖 <b>Помощь по боту</b>\n\n` +
        `📋 <b>Основные возможности:</b>\n` +
        `• Создание мероприятий через Mini App\n` +
        `• Управление участниками\n` +
        `• Деление на команды\n` +
        `• Ограничение количества участников\n` +
        `• Резервные участники\n\n` +
        `👥 <b>Команды в группах:</b>\n` +
        `<code>+</code> - Записаться на игру\n` +
        `<code>-</code> - Отписаться от игры\n` +
        `<code>/list</code> - Список участников\n` +
        `<code>/teams</code> - Разделить на команды (админы)\n` +
        `<code>/help</code> - Эта справка\n\n` +
        `🔧 <b>Админ команды:</b>\n` +
        `<code>/reset_participants</code> - Сбросить список участников\n` +
        `<code>/delete_event</code> - Удалить событие`;
      
      await ctx.reply(helpText, { parse_mode: 'HTML' });
    } else {
      const helpText = `🏀 <b>Команды в группе:</b>\n\n` +
        `<code>+</code> ➕ Записаться на игру\n` +
        `<code>-</code> ➖ Отписаться от игры\n` +
        `<code>/list</code> 👥 Список участников\n` +
        `<code>/teams</code> 🏈 Поделить на команды (админы)\n` +
        `<code>/help</code> ℹ️ Помощь\n\n` +
        `🎯 <b>Создать событие:</b>\n` +
        `Напишите боту в личные сообщения!`;
      
      await ctx.reply(helpText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    Logger.error(`Ошибка обработки команды help: ${error}`);
  }
}

async function handleInfo(ctx) {
  try {
    const infoText = `ℹ️ <b>Информация о боте</b>\n\n` +
      `Версия: 2.0.0\n` +
      `Разработчик: Ваша команда\n` +
      `Описание: Бот для организации мероприятий и спортивных событий\n\n` +
      `Возможности:\n` +
      `• Создание регулярных событий\n` +
      `• Управление участниками\n` +
      `• Автоматическое деление на команды\n` +
      `• Оповещения о начале записи\n` +
      `• Поддержка временных зон`;
    
    await ctx.reply(infoText, { parse_mode: 'HTML' });
  } catch (error) {
    Logger.error(`Ошибка обработки команды info: ${error}`);
  }
}

async function handleStats(ctx) {
  const chat = ctx.chat;
  const user = ctx.from;
  
  try {
    // Проверяем права администратора
    const isAdmin = await checkAdminRights(ctx, chat.id, user.id);
    if (!isAdmin) {
      await ctx.reply("❌ Эта команда доступна только администраторам.");
      return;
    }
    
    const queries = require('../../database/queries');
    const messagesCount = await queries.getDatabaseStatus();
    
    const statsText = `📊 <b>Статистика бота</b>\n\n` +
      `Создано событий: ${messagesCount}\n` +
      `Активных чатов: ${messagesCount}\n` +
      `Время работы: 24/7\n` +
      `Статус: ✅ Активен`;
    
    await ctx.reply(statsText, { parse_mode: 'HTML' });
  } catch (error) {
    Logger.error(`Ошибка обработки команды stats: ${error}`);
    await ctx.reply("❌ Ошибка при получении статистики.");
  }
}

async function handleAdmin(ctx) {
  const chat = ctx.chat;
  const user = ctx.from;
  
  try {
    // Проверяем права администратора
    const isAdmin = await checkAdminRights(ctx, chat.id, user.id);
    if (!isAdmin) {
      await ctx.reply("❌ Эта команда доступна только администраторам.");
      return;
    }
    
    const keyboard = Keyboards.getAdminKeyboard();
    await ctx.reply("🛠️ <b>Панель администратора</b>", {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup
    });
  } catch (error) {
    Logger.error(`Ошибка обработки команды admin: ${error}`);
  }
}

async function handleBroadcast(ctx) {
  // Заглушка для будущей функциональности рассылки
  await ctx.reply("📢 Функция рассылки находится в разработке.");
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

async function handleNewGroupLink(ctx, args, chat) {
  // Заглушка для обработки новых групповых связей
  await ctx.reply("🔗 Функция связывания чатов находится в разработке.");
}