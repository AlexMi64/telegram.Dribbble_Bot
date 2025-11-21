// Middleware для аутентификации и проверки банов
const { isUserBanned } = require('../database/models');

/**
 * Middleware для проверки забаненных пользователей
 */
function banCheck(ctx, next) {
  // Разрешить админу все
  if (ctx.from.id === 366323850) {
    return next();
  }

  // Проверить не заблокирован ли пользователь
  if (!isUserBanned) {
    return next();
  }

  return isUserBanned(ctx.from.id).then(isBanned => {
    if (isBanned) {

      const banKeyboard = [['🔓 Подать заявку на разблокировку']];

      return ctx.reply('🚫 **Ваш аккаунт заблокирован**\n\n' +
        'Причина: Многократные нарушения правил взаимной поддержки.\n\n' +
        'Если считаете блокировку несправедливой, обратитесь к администратору.\n\n' +
        'Вы можете подать заявку на разблокировку.', {
        reply_markup: { keyboard: banKeyboard, resize_keyboard: true },
        parse_mode: 'Markdown'
      });
    }

    return next();
  }).catch(error => {
    return next();
  });
}

/**
 * Middleware для проверки администратора
 */
function adminOnly(ctx, next) {
  if (ctx.from.id !== 366323850) {
    return ctx.reply('❌ У вас нет доступа к этой функции.');
  }
  return next();
}

module.exports = {
  banCheck,
  adminOnly
};
