// Middleware для управления сессией и контекста

/**
 * Middleware для инициализации сессии
 */
async function sessionInit(ctx, next) {
  ctx.session = ctx.session || {};

  // Если язык не установлен в сессии, пытаемся загрузить из БД
  if (!ctx.session.language) {
    try {
      const { getUser } = require('../database/models');
      const user = await getUser(ctx.from?.id);
      if (user && user.language) {
        ctx.session.language = user.language;
      }
    } catch (error) {
    }
  }

  return next();
}

/**
 * Middleware для добавления disable_web_page_preview
 */
function messageEnrich(ctx, next) {
  const originalReply = ctx.reply;
  ctx.reply = function(text, extra) {
    if (arguments.length === 1 || typeof extra !== 'object' || extra === null) {
      return originalReply.call(this, text, {});
    } else {
      extra.disable_web_page_preview = true;
      return originalReply.call(this, text, extra);
    }
  };

  const originalEdit = ctx.editMessageText;
  ctx.editMessageText = function(text, extra) {
    if (arguments.length === 1 || typeof extra !== 'object' || extra === null) {
      return originalEdit.call(this, text, {});
    } else {
      extra.disable_web_page_preview = true;
      return originalEdit.call(this, text, extra);
    }
  };

  return next();
}

/**
 * Middleware для логирования сообщений
 */
function messageLogger(ctx, next) {
  if (ctx.callbackQuery) {
    // Logging moved to global callback handler
  } else if (ctx.message) {
    // Logging moved to global message handler
  } else {
  }
  return next();
}

module.exports = {
  sessionInit,
  messageEnrich,
  messageLogger
};
