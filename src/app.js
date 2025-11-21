// Основной файл приложения бота
const { Telegraf, session, MemorySessionStore } = require('telegraf');

// Импорты модулей
const { banCheck, adminOnly } = require('./middlewares/auth');
const { sessionInit, messageEnrich, messageLogger } = require('./middlewares/session');

// Импорты handlers
const registerCommands = require('./handlers/commands');
const { registerActions } = require('./handlers/actions');
const { registerTextHandlers } = require('./handlers/textHandlers');

// Создание бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Сохраняем экземпляр бота глобально для доступа в других модулях
global.botInstance = bot;

// Применение middleware
const sessionStore = new Map();

bot.use(async (ctx, next) => {
  const key = ctx.from?.id;
  if (key) {
    ctx.session = sessionStore.get(key) || {};

    // Восстанавливаем язык из базы данных, если он не задан в сессии
    if (!ctx.session.language) {
      try {
        const user = await require('./database/models').getUser(key);
        if (user && user.language) {
          ctx.session.language = user.language;
        } else {
          ctx.session.language = 'ru'; // язык по умолчанию
        }
      } catch (error) {
        ctx.session.language = 'ru'; // fallback на русский
      }
    }
  }
  return next().then(() => {
    if (key) {
      sessionStore.set(key, ctx.session);
    }
  });
});

bot.use(messageEnrich);
bot.use(messageLogger);

// ГЛОБАЛЬНЫЙ ДЕБАГ - ловим все сообщения
bot.on('message', async (ctx, next) => {
  // Проверяем не заблокирован ли пользователь
  if (ctx.from.id !== 366323850) { // Админ может все делать
    const user = await require('./database/models').getUser(ctx.from.id);
    if (user && await require('./database/models').isUserBanned(ctx.from.id)) {
      const { getKeyboardButtonVariants } = require('./utils/helpers');

      const bannedVariants = getKeyboardButtonVariants('keyboard_unblock_request');
      const originalText = ctx.message?.text?.trim() || '';

      if (bannedVariants.includes(originalText)) {
        await next();
        return;
      }

      // Полностью блокируем любые действия заблокированных пользователей кроме кнопки заявки
      const { t } = require('./utils/lang');
      const userLanguage = ctx.session?.language || user.language || 'ru';
      await ctx.reply(t(userLanguage, 'banned_user'), {
        reply_markup: { keyboard: [[t(userLanguage, 'keyboard_unblock_request')]], resize_keyboard: true },
        parse_mode: 'Markdown'
      });
      return;
    }
  }

  await next(); // Продолжаем обработку если не заблокирован
});

// Глобальная проверка callback_query для заблокированных пользователей
bot.on('callback_query', async (ctx, next) => {
  if (ctx.from.id !== 366323850) { // Админ может все делать
    const isBanned = await require('./database/models').isUserBanned(ctx.from.id);
    if (isBanned) {
      // Специальная клавиатура для забокированных пользователей
      const { t } = require('./utils/lang');
      const user = await require('./database/models').getUser(ctx.from.id);
      const userLanguage = user ? (user.language || 'ru') : 'ru';
      const banKeyboard = [[t(userLanguage, 'keyboard_unblock_request')]];

      await ctx.reply(t('ru', 'banned_user'), {
        reply_markup: { keyboard: banKeyboard, resize_keyboard: true },
        parse_mode: 'Markdown'
      });
      await ctx.answerCbQuery();
      return; // Полностью блокируем callback для забокированных пользователей
    }
  }

  await next();
});

// Регистрация handlers
registerCommands(bot);
registerActions(bot);
registerTextHandlers(bot);

bot.catch((err, ctx) => {
});

process.on('unhandledRejection', (reason, promise) => {
});

process.on('uncaughtException', (error) => {
});

bot.launch()
  .then(() => {
  })
  .catch((error) => {
  });

process.once('SIGINT', () => {
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
});

module.exports = bot;
