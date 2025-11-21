// Обработчики текстового ввода для сложных диалогов
const { t } = require('../utils/lang');

const {
  getUser,
  registerUser,
  updateUserProfile,
  addProject,
  detectPlatform,
  isValidProjectUrl,
  getLinkType,
  showProjectActionsMenu,
  banUser,
  unbanUser,
  incrementUserWarnings,
  getAllActiveUsers,
  sendBroadcastMessage,
  getUserStats,
  isUserBanned
} = require('../database/models');

const { normalizeKeyboardText, getKeyboardButtonVariants } = require('../utils/helpers');

// Функция для обработки textoвого ввода - добавление проекта и настройка профилей
function registerTextHandlers(bot) {

  // Обработчик реферального кода в команде /start
  bot.on('text', async (ctx, next) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      if (parts.length > 1 && parts[1].startsWith('REF')) {
        const referralCode = parts[1].substring(3); // Убираем 'REF' префикс

        try {
          // Проверяем, что с пользователями всё в порядке
          let user = await getUser(ctx.from.id);
          if (!user) {
            // Регистрируем нового пользователя
            await registerUser(ctx.from.id, ctx.from.username || 'unknown');
            user = await getUser(ctx.from.id);
          }

          // Проверяем, что пользователь не имеет реферера
          const existingReferrerCheck = await require('../database/models').getReferralList(user.id);
          if (existingReferrerCheck && existingReferrerCheck.length > 0) {
            return await next();
          }

          // Применяем реферальный код
          await require('../database/models').applyReferralCode(user.id, referralCode);

          // Получаем реферера и отправляем ему бонус
          const referrerId = await require('../database/models').getReferrerByCode(referralCode);
          if (referrerId) {
            // Добавляем бонус за регистрацию друга (50 кристаллов)
            await require('../database/models').addReferralBonus(referrerId, 50, 'registration');

            // Уведомляем реферера о новом реферале
            const referrer = await getUser(referrerId);
            if (referrer) {
              const referrerLang = referrer.language || 'ru';
              const { t } = require('../utils/lang');
              const bonusMessage = t(referrerLang, 'referals.referral_bonus_registration', { amount: 50 });
              try {
                await ctx.telegram.sendMessage(referrer.telegram_id, bonusMessage, { parse_mode: 'Markdown' });
              } catch (error) {
              }
            }
          }

          // Показываем приветственное сообщение с реферальным кодом
          const lang = user.language || 'ru';
          const { t } = require('../utils/lang');
          const welcomeMessage = t(lang, 'referals.referral_registration_success');
          await ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });

        } catch (error) {
          // Продолжаем обычную обработку /start
        }

        return await next();
      }
    }

    await next();
  });

  // Обработчик текстов для добавления проектов и настройки профилей
  bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return await next();

    if (ctx.session && ctx.session.waitingForProject) {
      const url = ctx.message.text.trim();
      if (!url.startsWith('http')) {
        ctx.reply(t(ctx.session?.language || 'ru', 'link_format'));
        return;
      }

      if (!isValidProjectUrl(url)) {
        ctx.reply(t(ctx.session?.language || 'ru', 'invalid_url'));
        return;
      }

      const platform = detectPlatform(url);
      if (platform === 'unknown') {
        ctx.reply(t(ctx.session?.language || 'ru', 'invalid_url'));
        return;
      }

      const user = await getUser(ctx.from.id);
      // Ensure language is loaded from user if not in session
      if (!ctx.session?.language) {
        ctx.session.language = user.language || 'ru';
      }
      ctx.session.pendingProject = { url, platform, userId: ctx.from.id };
      ctx.session.waitingForProject = false;

      await showProjectActionsMenu(ctx);
      return;
    }

    // Обработка настроек профилей
    if (ctx.session && ctx.session.waitingForBehance) {
      const input = ctx.message.text.trim();
      const username = extractUsername(input, 'behance');

      if (username) {
        await updateUserProfile(ctx.from.id, 'behance', username);
        ctx.reply(t(ctx.session?.language, 'behance_profile_set', {username}));
      } else {
        ctx.reply(t(ctx.session?.language, 'invalid_username_format'));
      }

      ctx.session.waitingForBehance = false;
      return;
    }

    if (ctx.session && ctx.session.waitingForDribbble) {
      const input = ctx.message.text.trim();
      const username = extractUsername(input, 'dribbble');

      if (username) {
        await updateUserProfile(ctx.from.id, 'dribbble', username);
        ctx.reply(t(ctx.session?.language, 'dribbble_profile_set', {username}));
      } else {
        ctx.reply(t(ctx.session?.language, 'invalid_username_format'));
      }

      ctx.session.waitingForDribbble = false;
      return;
    }

    if (ctx.session && ctx.session.waitingForArtstation) {
      const input = ctx.message.text.trim();
      const username = extractUsername(input, 'artstation');

      if (username) {
        await updateUserProfile(ctx.from.id, 'artstation', username);
        ctx.reply(t(ctx.session?.language, 'artstation_profile_set', {username}));
      } else {
        ctx.reply(t(ctx.session?.language, 'invalid_username_format'));
      }

      ctx.session.waitingForArtstation = false;
      return;
    }

    if (ctx.session && ctx.session.waitingForDprofile) {
      const input = ctx.message.text.trim();

      if (!input.match(/^[a-zA-Z0-9_-]+$/) && !input.includes('dprofile.ru/')) {
        ctx.reply(t(ctx.session?.language, 'invalid_dprofile_format'));
        return;
      }

      const username = extractUsername(input, 'dprofile');

      if (username && username.match(/^[a-zA-Z0-9_-]+$/)) {
        await updateUserProfile(ctx.from.id, 'dprofile', username);
        ctx.reply(t(ctx.session?.language, 'dprofile_profile_set', {username}));
      } else {
        ctx.reply(t(ctx.session?.language, 'invalid_dprofile_format'));
      }

      ctx.session.waitingForDprofile = false;
      return;
    }

    // Обработка количества действий для добавления проекта
    if (ctx.session && ctx.session.waitingForViewsCount) {
      const count = parseInt(ctx.message.text);
      if (isNaN(count) || count < 1 || count > 1000) {
        ctx.reply(t(ctx.session?.language, 'correct_views_count'));
        return;
      }
      ctx.session.selectedActions.views = count;
      delete ctx.session.waitingForViewsCount;
      await showProjectActionsMenu(ctx);
      return;
    }

    if (ctx.session && ctx.session.waitingForLikesCount) {
      const count = parseInt(ctx.message.text);
      if (isNaN(count) || count < 1 || count > 1000) {
        ctx.reply(t(ctx.session?.language, 'correct_likes_count'));
        return;
      }
      ctx.session.selectedActions.likes = count;
      delete ctx.session.waitingForLikesCount;
      await showProjectActionsMenu(ctx);
      return;
    }

    if (ctx.session && ctx.session.waitingForCommentsCount) {
      const count = parseInt(ctx.message.text);
      if (isNaN(count) || count < 1 || count > 1000) {
        ctx.reply(t(ctx.session?.language, 'correct_comments_count'));
        return;
      }
      ctx.session.selectedActions.comments = count;
      delete ctx.session.waitingForCommentsCount;
      await showProjectActionsMenu(ctx);
      return;
    }

    if (ctx.session && ctx.session.waitingForFollowsCount) {
      const count = parseInt(ctx.message.text);
      if (isNaN(count) || count < 1 || count > 1000) {
        ctx.reply(t(ctx.session?.language, 'correct_follows_count'));
        return;
      }
      ctx.session.selectedActions.follows = count;
      delete ctx.session.waitingForFollowsCount;
      await showProjectActionsMenu(ctx);
      return;
    }

    // Админ функции через текстовые сообщения
    if (ctx.session && ctx.session.waitingForBroadcastMessage) {
      if (ctx.from.id !== 366323850) return;

      const messageText = ctx.message.text.trim();
      if (!messageText) {
        ctx.reply(t(ctx.session?.language, 'message_empty'));
        return;
      }

      // Сохраняем текст и переключаем на подтверждение
      ctx.session.broadcastMessage = messageText;
      ctx.session.waitingForBroadcastMessage = false;

      // Показываем подтверждение
      ctx.reply(t(ctx.session?.language, 'admin_broadcast_confirm_long', {message: messageText}), {
        reply_markup: {
          inline_keyboard: [
            [{ text: t(ctx.session?.language, 'buttons.send_broadcast'), callback_data: 'confirm_broadcast_send' }],
            [{ text: t(ctx.session?.language, 'buttons.cancel_broadcast'), callback_data: 'cancel_broadcast' }]
          ]
        },
        parse_mode: 'Markdown'
      });

      return;
    }

    if (ctx.session && ctx.session.waitingForUnbanUserId) {
      if (ctx.from.id !== 366323850) return;

      const telegramUserId = parseInt(ctx.message.text.trim());

      if (isNaN(telegramUserId) || telegramUserId <= 0) {
        ctx.reply(t(ctx.session?.language, 'admin_unblock_error'));
        return;
      }

      try {
        // Получаем пользователя по telegram_id
        const user = await getUser(telegramUserId);
        if (!user) {
          ctx.reply(t(ctx.session?.language, 'user_not_found_by_id', {id: telegramUserId}));
          return;
        }

        // Проверяем, заблокирован ли пользователь
        const isBanned = await isUserBanned(telegramUserId);
        if (!isBanned) {
          ctx.reply(t(ctx.session?.language, 'admin_user_not_banned'));
          return;
        }

        // Разбаниваем по внутреннему id
        const success = await unbanUser(user.id);
        if (success) {
          // Обновляем статистику
          const stats = await getUserStats(user.telegram_id);

          const userLang = user.language || 'ru';

          // Формируем клавиатуру как в start() для активного пользователя
          let keyboard = [
            [t(userLang, 'keyboard_available_tasks'), t(userLang, 'keyboard_add_project')],
            [t(userLang, 'keyboard_rating'), t(userLang, 'keyboard_balance')],
            [t(userLang, 'keyboard_settings')]
          ];

          // Если у пользователя есть проекты, добавляем кнопку "Мои проекты"
          if (stats.projectsCount > 0) {
            keyboard.splice(1, 0, [t(userLang, 'keyboard_my_projects')]);
          }

          // Если это администратор (ID 366323850), добавляем кнопку админ панели
          if (user.telegram_id === 366323850) {
            keyboard.push([t(userLang, 'keyboard_admin_panel')]);
          }

          // Отправляем уведомление о разблокировке сразу с обновленным меню
          await ctx.telegram.sendMessage(user.telegram_id, t(userLang, 'user_unbanned_notify_user'), {
            reply_markup: { keyboard: keyboard, resize_keyboard: true },
            parse_mode: 'Markdown'
          });

          ctx.reply(t(ctx.session?.language, 'admin_unblock_success', {id: user.telegram_id}));
        } else {
          ctx.reply(t(ctx.session?.language, 'admin_unblock_failure', {id: user.telegram_id, username: user.username}));
        }
      } catch (error) {
        ctx.reply(t(ctx.session?.language, 'admin_unblock_generic_error'));
      }

      ctx.session.waitingForUnbanUserId = false;
      return;
    }

    if (ctx.session && ctx.session.waitingForBanUserId) {
      if (ctx.from.id !== 366323850) return;

      const input = ctx.message.text.trim();
      const parts = input.split(' ');
      const telegramUserId = parseInt(parts.shift());
      const reason = parts.join(' ') || 'Админ блокировал';

      if (isNaN(telegramUserId) || telegramUserId <= 0) {
        ctx.reply(t(ctx.session?.language, 'admin_ban_format_error'));
        return;
      }

      try {
        // Получить пользователя по Telegram ID
        const user = await getUser(telegramUserId);
        if (!user) {
          ctx.reply(t(ctx.session?.language, 'user_not_found_by_id', {id: telegramUserId}));
          return;
        }

        const userLang = user.language || 'ru';

        // Заблокировать по внутреннему ID
        await banUser(user.id, reason, ctx.from.id);

        // Отправить уведомление заблокированному пользователю
        try {
          await ctx.telegram.sendMessage(telegramUserId, t(userLang, 'ban_notification_text'), {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [[t(userLang, 'banned_user_keyboard')]],
              resize_keyboard: true
            }
          });
        } catch (error) {
          ctx.reply(t(ctx.session?.language, 'ban_success_message', {id: telegramUserId}));
          return;
        }

        ctx.reply(t(ctx.session?.language, 'ban_success_message', {id: telegramUserId}));
      } catch (error) {
        ctx.reply(t(ctx.session?.language, 'admin_ban_error'));
      }

      ctx.session.waitingForBanUserId = false;
      return;
    }



    // Обработка кнопки для заявки на разблокировку от заблокированного пользователя
    const originalText = ctx.message.text.trim();
    const user = await getUser(ctx.from.id); // get user to get language
    const userLang = user ? (user.language || 'ru') : 'ru';
    const expectedBannedButtonText = t(userLang, 'banned_user_keyboard');
    if (originalText === expectedBannedButtonText) {

      try {
        // Проверяем, заблокирован ли пользователь
        const user = await getUser(ctx.from.id);
        if (!user) {
          await ctx.reply(t(ctx.session?.language || 'ru', 'user_not_found_error'));
          return;
        }

        const isBanned = await isUserBanned(user.telegram_id);
        if (!isBanned) {
          await ctx.reply(t(ctx.session?.language || 'ru', 'banned_user_welcome_back'));
          return;
        }

        // Проверяем, не подал ли уже заявку в последние 24 часа
        const requestExists = await new Promise((resolve) => {
          const fullyAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          require('../../db').db.get('SELECT id FROM unban_requests WHERE user_id = ? AND created_at > ? AND status = ?',
            [user.id, fullyAgo.toISOString(), 'pending'], (err, row) => {
            resolve(!!row);
          });
        });

        if (requestExists) {
          await ctx.reply(t(ctx.session?.language || 'ru', 'unban_request_duplicate'));
          return;
        }

        // Добавляем заявку в базу данных
        const insertRequest = await new Promise((resolve, reject) => {
          require('../../db').db.run('INSERT INTO unban_requests (user_id, reason) VALUES (?, ?)',
            [user.id, 'User submitted unblock request'], (err) => {
            if (err) reject(err);
            else resolve(true);
          });
        });

        if (!insertRequest) {
          await ctx.reply(t(ctx.session?.language || 'ru', 'unban_request_error'));
          return;
        }

        // Отправляем уведомление админу
        try {
          const adminUser = await getUser(366323850);
          const adminLang = adminUser ? (adminUser.language || 'ru') : 'ru';

          await ctx.telegram.sendMessage(366323850,
            `🔓 **Новая заявка на разблокировку:**\n\n👤 Пользователь: [@${ctx.from.username || 'нет'}] (ID: ${ctx.from.id})\n📝 Имя: ${user.username || 'не указано'}\n📅 Зарегистрирован: ${new Date(user.registered_at).toLocaleString('ru-RU')}\n\nГотов ли ты рассмотреть и одобрить?`, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: t(adminLang, 'approve_unblock_button'), callback_data: `approve_unlock_${user.id}` }],
                [{ text: t(adminLang, 'decline_unblock_button'), callback_data: `decline_unblock_${ctx.from.id}` }]
              ]
            }
          });

          ctx.reply(t(ctx.session?.language || 'ru', 'unban_request_success'));
        } catch (error) {
          await ctx.reply(t(ctx.session?.language || 'ru', 'unban_request_error'));
        }

      } catch (error) {
        ctx.reply(t(ctx.session?.language || 'ru', 'unban_request_error'));
      }

      return; // Завершаем обработку
    }

    // Глобальный обработчик текстовых сообщений - для клавиатуры меню

    // Нормализуем текст сообщения
    const normalizedText = normalizeKeyboardText(ctx.message.text.trim());


    // Обработка меню кнопок - только если сообщение соответствует кнопке меню
    let handled = false;

    // Проверка на кнопки меню для всех языков
    const menuButtonKeys = [
      'keyboard_available_tasks',
      'keyboard_add_project',
      'keyboard_my_projects',
      'keyboard_rating',
      'keyboard_balance',
      'keyboard_settings',
      'keyboard_admin_panel'
    ];

    // Проверка для менеджера сессии пользователя должна быть выше
    //const user = await getUser(ctx.from.id);
    for (const buttonKey of menuButtonKeys) {
      const variants = getKeyboardButtonVariants(buttonKey);
      const originalText = ctx.message.text.trim();
      if (variants.includes(originalText)) {
        handled = true;

        // Эмулируем действие inline кнопки
        if (buttonKey === 'keyboard_balance') {
          const user = await getUser(ctx.from.id);
          const lang = ctx.session?.language || 'ru';
          await ctx.reply(t(lang, 'balance').replace('{credits}', stats.credits));
          break;
        } else if (buttonKey === 'keyboard_rating') {
          // Обработка рейтинга
          const ratingMessage = await require('../database/models').getUserRatingMessage(ctx.from.id, ctx.session?.language || 'ru');
          await ctx.reply(ratingMessage, { parse_mode: 'Markdown' });
          break;
        } else if (buttonKey === 'keyboard_available_tasks') {
          // Показать доступные задания
          await require('../services/taskService').showAvailableTasks(ctx);
          break;
        } else if (buttonKey === 'keyboard_add_project') {
          ctx.session = ctx.session || {};
          ctx.session.waitingForProject = true;
          await ctx.reply(t(ctx.session?.language || 'ru', 'add_project_request'));
          break;
        // Обработка 'keyboard_my_projects' убрана, так как есть в commands.js
        } else if (buttonKey === 'keyboard_settings') {
          // Настройки
          const keyboard = [
            [{ text: '🌍 ' + t(ctx.session?.language, 'select_language_button'), callback_data: 'settings_language' }],
            [{ text: t(ctx.session?.language, 'profile_settings_button'), callback_data: 'settings_profiles' }],
            [{ text: t(ctx.session?.language, 'back'), callback_data: 'back_to_main' }]
          ];
          await ctx.reply(t(ctx.session?.language || 'ru', 'settings'), {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
          });
          break;
        } else if (buttonKey === 'keyboard_admin_panel' && ctx.from.id === 366323850) {
          // Админ панель
          const keyboard = [
            [{ text: t(ctx.session?.language, 'view_complaints'), callback_data: 'admin_view_complaints' }],
            [{ text: t(ctx.session?.language, 'broadcast'), callback_data: 'admin_broadcast' }],
            [{ text: t(ctx.session?.language, 'ban'), callback_data: 'admin_ban_user' }],
            [{ text: t(ctx.session?.language, 'unban'), callback_data: 'admin_unban_user' }],
            [{ text: t(ctx.session?.language, 'stats'), callback_data: 'admin_stats' }],
            [{ text: t(ctx.session?.language, 'back'), callback_data: 'back_to_main' }]
          ];
          await ctx.reply(t(ctx.session?.language || 'ru', 'admin_panel'), {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
          });
          break;
        }
      }
    }

    if (handled) {
      return; // Не продолжаем обработку
    }

    await next();
  });

}

// Вспомогательная функция для извлечения username из URL
function extractUsername(input, platform) {
  if (!input.includes('.') && !input.includes('/')) {
    return input.trim();
  }

  const patterns = {
    behance: /behance\.net\/([^\/\?#]+)/,
    dribbble: /dribbble\.com\/([^\/\?#]+)/,
    artstation: /artstation\.com\/([^\/\?#]+)/,
    dprofile: /dprofile\.ru\/([^\/\?#]+)/
  };

  const pattern = patterns[platform];
  if (pattern) {
    const match = input.match(pattern);
    return match ? match[1] : null;
  }

  return null;
}

module.exports = { registerTextHandlers };
