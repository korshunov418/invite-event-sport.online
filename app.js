const express = require('express');
const bodyParser = require('body-parser');
const { Telegraf, session } = require('telegraf');

const config = require('./config');
const Logger = require('./utils/logger');
const Helpers = require('./utils/helpers');
const db = require('./database');

// Инициализация бота и приложения
const bot = new Telegraf(config.BOT_TOKEN);
const app = express();

// Middleware
app.use(express.json());
app.use(bodyParser.json());

// Логирование запросов
app.use((req, res, next) => {
  Logger.info(`Запрос: ${req.method} ${req.url}`);
  next();
});

// Импорт маршрутов и обработчиков
require('./routes')(app, bot);
require('./bot/handlers/commands')(bot);
require('./bot/handlers/actions')(bot);
require('./bot/handlers/messages')(bot);

// Обработка ошибок бота
bot.catch((err, ctx) => {
  Logger.error(`Ошибка в боте: ${err}`);
  console.error(err);
});

// Graceful shutdown
async function shutdown(signal) {
  Logger.info(`Получен сигнал ${signal}. Завершение работы...`);
  
  try {
    await bot.stop();
    Logger.info('Бот остановлен');
    
    await db.close();
    Logger.info('База данных закрыта');
    
    process.exit(0);
  } catch (error) {
    Logger.error(`Ошибка при завершении работы: ${error}`);
    process.exit(1);
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Запуск приложения
async function start() {
  try {
    Logger.info('База данных готова');
    
    const port = await Helpers.findFreePort(config.WEB_SERVER_PORT, 10);
    
    app.listen(port, () => {
      Logger.info(`🚀 Веб-сервер запущен на порту ${port}`);
      Logger.info(`🌐 Сервер доступен по адресу: http://localhost:${port}`);
    });
    
    try {
      await bot.telegram.getMe();
      Logger.info('🤖 Бот доступен, запускаем polling...');
      
      await bot.launch({
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query']
      });
      
      Logger.info('✅ Бот успешно запущен в режиме polling');
    } catch (botError) {
      if (botError.response && botError.response.error_code === 409) {
        Logger.warn('⚠️  Предупреждение: Другой экземпляр бота уже запущен. Веб-сервер работает, но бот не обрабатывает сообщения.');
      } else {
        Logger.error(`❌ Ошибка запуска бота: ${botError.message}`);
      }
    }
  } catch (error) {
    Logger.error(`💥 Критическая ошибка при запуске: ${error}`);
    process.exit(1);
  }
}

start();

module.exports = { app, bot };