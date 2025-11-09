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
  
    // Обработка специальных deep link аргументов
    if (args === 'group' || args === 'help') {
        await handleSpecialDeepLink(ctx, args, chat);
        return;
    }

// Обработка существующего события по external_chat_id
    try {
        const existingEvent = await eventService.getEventByExternalId(args);
        
        if (existingEvent) {
            await handleExistingEventDeepLink(ctx, args, chat, existingEvent);
        } else {
            await handleNewGroupLink(ctx, args, chat);
        }
    } catch (error) {
        Logger.error(`Ошибка обработки deep link: ${error}`);
        await ctx.reply("❌ Ошибка при обработке ссылки. Попробуйте снова.");
    }
}

async function handleSpecialDeepLink(ctx, args, chat) {
    if (args === 'group') {
        if (chat.type === 'private') {
            const externalChatId = await eventService.createEventRecord(chat.id);
            const miniAppUrl = `${config.MINI_APP_BASE_URL}?chat_id=${externalChatId}`;
            const keyboard = Keyboards.getWebAppKeyboard(miniAppUrl);
            
            await ctx.reply(
                "👋 Привет! Я бот для организации мероприятий в группах.\n\n" +
                "Создайте событие для вашей группы, и участники смогут записываться через команды в чате!",
                keyboard
            );
        } else {
            await ctx.reply(
                "ℹ️ Для создания событий перейдите в личные сообщения с ботом."
            );
        }
    } else if (args === 'help') {
        await handleHelp(ctx);
    }
}

async function handleExistingEventDeepLink(ctx, args, chat, existingEvent) {
    const miniAppUrl = `${config.MINI_APP_BASE_URL}?chat_id=${args}`;
    
    if (chat.type === 'private') {
        const keyboard = Keyboards.getWebAppKeyboard(miniAppUrl, 'ru', true);
        
        await ctx.reply(
            "🔗 Связь с группой установлена!\n\n" +
            "Вы можете продолжить настройку события для вашей группы:",
            keyboard
        );
    } else {
        // В групповом чате просто подтверждаем связь
        await ctx.reply(
            "✅ Связь с личным чатом установлена! Теперь вы можете управлять событиями через личные сообщения с ботом."
        );
    }
    
    Logger.event(`Deep link к существующему событию: ${args} в чате ${chat.id}`);
}


async function handleRegularStart(ctx, chat) {
    if (chat.type === 'private') {
        await handlePrivateChatStart(ctx, chat);
    } else {
        await handleGroupChatStart(ctx, chat);
    }
}

async function handlePrivateChatStart(ctx, chat) {
    try {
        const externalChatId = await eventService.createEventRecord(chat.id);
        const miniAppUrl = `${config.MINI_APP_BASE_URL}?chat_id=${externalChatId}`;
        const keyboard = Keyboards.getWebAppKeyboard(miniAppUrl);
        
        const welcomeText = 
            "👋 Привет! Я бот для организации мероприятий.\n\n" +
            "🎯 <b>Что я умею:</b>\n" +
            "• Создавать события через удобную форму\n" +
            "• Управлять списком участников\n" +
            "• Делить на команды автоматически\n" +
            "• Отправлять уведомления о начале записи\n" +
            "• Работать в группах и личных чатах\n\n" +
            "🚀 <b>Начните с создания события!</b>";
        
        await ctx.reply(welcomeText, {
            parse_mode: 'HTML',
            ...keyboard
        });
        
        Logger.info(`Новая сессия в личном чате: ${chat.id}, external_id: ${externalChatId}`);
        
    } catch (error) {
        Logger.error(`Ошибка создания события в личном чате: ${error}`);
        await ctx.reply(
            "❌ Произошла ошибка при инициализации. Попробуйте еще раз или обратитесь к администратору."
        );
    }
}

async function handleGroupChatStart(ctx, chat) {
    try {
        // Создаем событие для группы
        const externalChatId = await eventService.createEventRecord(chat.id);
        const botUsername = ctx.botInfo.username;
        const deepLink = `https://t.me/${botUsername}?start=${externalChatId}`;
        
        const helpText = 
            "🏀 <b>Бот для организации мероприятий</b>\n\n" +
            "📋 <b>Команды в этой группе:</b>\n" +
            "<code>+</code> ➕ Записаться на игру\n" +
            "<code>-</code> ➖ Отписаться от игры\n" +
            "<code>/list</code> 👥 Список участников\n" +
            "<code>/teams</code> 🏈 Поделить на команды (админы)\n" +
            "<code>/help</code> ℹ️ Помощь\n\n" +
            "🎯 <b>Чтобы создать событие:</b>\n" +
            "Перейдите в личный чат с ботом";
        
        const keyboard = Keyboards.getGroupHelpKeyboard(botUsername);
        
        await ctx.reply(helpText, {
            parse_mode: 'HTML',
            ...keyboard
        });
        
        Logger.info(`Новая сессия в групповом чате: ${chat.id}, external_id: ${externalChatId}`);
        
    } catch (error) {
        Logger.error(`Ошибка создания события в групповом чате: ${error}`);
        await ctx.reply(
            "❌ Произошла ошибка при инициализации бота в группе."
        );
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
    try {
        const groupChatId = await eventService.getChatIdByExternalId(args);
        
        if (groupChatId) {
            // Создаем новое событие для личного чата, связывая с групповым external_chat_id
            const newExternalId = await eventService.createEventRecord(chat.id);
            
            // Создаем связь между чатами
            await eventService.createChatLink(newExternalId, args, groupChatId);
            
            const miniAppUrl = `${config.MINI_APP_BASE_URL}?chat_id=${newExternalId}`;
            const keyboard = Keyboards.getWebAppKeyboard(miniAppUrl);
            
            await ctx.reply(
                "🔗 Связь с группой установлена!\n\n" +
                "Теперь вы можете создать событие для вашей группы:",
                keyboard
            );
            
            Logger.info(`Создана связь чатов: personal=${newExternalId}, group=${args}`);
        } else {
            await ctx.reply(
                "❌ Не удалось найти связанную группу. Возможно, ссылка устарела.\n\n" +
                "Попробуйте создать новое событие через меню бота."
            );
        }
    } catch (error) {
        Logger.error(`Ошибка создания связи с группой: ${error}`);
        await ctx.reply("❌ Ошибка при создании связи с группой. Попробуйте снова.");
    }
}