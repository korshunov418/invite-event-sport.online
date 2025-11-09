const { Telegraf, session } = require('telegraf');
const config = require('../config');
const Logger = require('../utils/logger');

class Bot {
  constructor() {
    this.bot = new Telegraf(config.BOT_TOKEN);
    this.setupMiddlewares();
    this.loadHandlers();
  }

  setupMiddlewares() {
    // Session middleware
    this.bot.use(session({
      defaultSession: () => ({})
    }));

    // Logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      const responseTime = Date.now() - start;
      
      Logger.info(`Update ${ctx.updateType} processed in ${responseTime}ms`);
    });

    // Error handling middleware
    this.bot.use(async (ctx, next) => {
      try {
        await next();
      } catch (error) {
        Logger.error(`Error in middleware: ${error}`);
        await ctx.reply('❌ Произошла ошибка при обработке запроса');
      }
    });
  }

  loadHandlers() {
    // Загружаем все обработчики
    require('./handlers/commands')(this.bot);
    require('./handlers/actions')(this.bot);
    require('./handlers/messages')(this.bot);
    
    Logger.info('All bot handlers loaded');
  }

  async launch() {
    try {
      await this.bot.telegram.getMe();
      Logger.info('🤖 Bot is available, starting polling...');
      
      await this.bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query']
      });
      
      Logger.info('✅ Bot successfully launched in polling mode');
    } catch (error) {
      if (error.response && error.response.error_code === 409) {
        Logger.warn('⚠️ Warning: Another bot instance is already running. Web server is working but bot is not processing messages.');
      } else {
        Logger.error(`❌ Bot launch error: ${error.message}`);
        throw error;
      }
    }
  }

  stop() {
    return this.bot.stop();
  }

  getBot() {
    return this.bot;
  }
}

module.exports = new Bot();