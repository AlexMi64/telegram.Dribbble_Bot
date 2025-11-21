// Обработчики команд (hears хендлеры)
const { registerUser, getUser, getUserById, getUserStats, updateUserRating, getProjectsForAction, getUndoneActionsForProject, isUserBanned, getActionsForProject, getUserDetailedStats, getUserProjects, getActionText, getCreditsForAction } = require('../database/models');
const { t } = require('../utils/lang');
const { getMainKeyboard, getAdminKeyboard, getUserLevel, normalizeKeyboardText, getKeyboardButtonVariants } = require('../utils/helpers');
const { adminOnly } = require('../middlewares/auth');

/**
 * Регистрация всех командных хендлеров
 */
function registerCommands(bot) {

  // Команда /start
  bot.start(async (ctx) => {

    // Обработка реферального кода
    let referralCode = null;
    if (ctx.startPayload && ctx.startPayload.startsWith('REF')) {
      referralCode = ctx.startPayload.substring(3); // Убираем префикс 'REF'
    }

    const user = await registerOrGetUser(ctx.from.id, ctx.from.username, referralCode);
    const stats = await getUserStats(ctx.from.id);

    // Проверяем заблокирован ли пользователь
    const isBanned = await isUserBanned(ctx.from.id);
    if (isBanned && ctx.from.id !== 366323850) {
      const banKeyboard = [[t(ctx.session?.language, 'keyboard_unblock_request')]];
      return ctx.reply(t(ctx.session?.language, 'banned_user'), {
        reply_markup: { keyboard: banKeyboard, resize_keyboard: true },
        parse_mode: 'Markdown'
      });
    }

    // Проверяем, выбран ли язык пользователем
    if (!ctx.session?.language) {
      const keyboard = [
        [{ text: '🇷🇺 Русский', callback_data: 'select_language_ru' }],
        [{ text: '🇺🇸 English', callback_data: 'select_language_en' }]
      ];

      return ctx.reply(t('ru', 'select_language'), {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    }

    const keyboard = getMainKeyboard(user, ctx.session?.language);

    ctx.reply(t(ctx.session?.language, 'welcome'), {
      reply_markup: { keyboard: keyboard, resize_keyboard: true },
      parse_mode: 'Markdown'
    });
  });

  // Кнопка "Мой рейтинг"
  bot.on('text', async (ctx, next) => {
    if (getKeyboardButtonVariants('keyboard_rating').includes(ctx.message.text)) {

      const user = await getUser(ctx.from.id);
      if (!user) {
        return ctx.reply(t(ctx.session?.language, 'user_registered'));
      }

      // Пересчитываем рейтинг на основе текущей статистики для точности
      await updateUserRating(ctx.from.id);

      // Получаем обновленные данные пользователя после пересчета
      const updatedUser = await getUser(ctx.from.id);
      const stats = await getUserStats(ctx.from.id);
      const level = getUserLevel(updatedUser.rating, ctx.session?.language);

      let progressText = '';
      if (level.nextLevel) {
        const progress = updatedUser.rating >= level.maxPoints ? 0 : updatedUser.rating;
        const percentage = Math.round((progress / level.maxPoints) * 100);
        progressText = `\n⭐ ${t(ctx.session?.language, 'progress_title', {next: level.nextLevel, progress: progress, max: level.maxPoints, percentage: percentage})}`;
      } else {
        progressText = `\n⭐ ${t(ctx.session?.language, 'progress_completed')}`;
      }

      let achievements = '';

      // Localized achievement generation
      if (stats.actionsSent >= 5) achievements += `\n• ${t(ctx.session?.language, 'achievement_active')}`;
      if (stats.warningsReceived === 0) achievements += `\n• ${t(ctx.session?.language, 'achievement_honest')}`;
      if (stats.projectsCount >= 3) achievements += `\n• ${t(ctx.session?.language, 'achievement_creative', {count: stats.projectsCount})}`;
      if (stats.currentCredits >= 500) achievements += `\n• ${t(ctx.session?.language, 'achievement_rich', {count: stats.currentCredits})}`;
      if (stats.creditsSpent >= 1000) achievements += `\n• ${t(ctx.session?.language, 'achievement_business', {count: stats.creditsSpent})}`;
      if (stats.actionsSent >= 50) achievements += `\n• ${t(ctx.session?.language, 'achievement_social', {count: stats.actionsSent})}`;
      if (level.name === 'Эксперт' || level.name === 'Expert') achievements += `\n• ${t(ctx.session?.language, 'achievement_expert')}`;
      if (stats.daysActive >= 30) achievements += `\n• ${t(ctx.session?.language, 'achievement_veteran', {count: stats.daysActive})}`;
      if (stats.actionsReceived >= 100) achievements += `\n• ${t(ctx.session?.language, 'achievement_general', {count: stats.actionsReceived})}`;
      if (stats.behanceActions >= 10) achievements += `\n• ${t(ctx.session?.language, 'achievement_behance', {count: stats.behanceActions})}`;
      if (stats.dribbbleActions >= 10) achievements += `\n• ${t(ctx.session?.language, 'achievement_dribbble', {count: stats.dribbbleActions})}`;
      if (stats.artstationActions >= 10) achievements += `\n• ${t(ctx.session?.language, 'achievement_artstation', {count: stats.artstationActions})}`;
      if (achievements === '') achievements += `\n• ${t(ctx.session?.language, 'achievement_novice')}`;

      let reliabilityText;
      if (stats.warningsReceived === 0) reliabilityText = t(ctx.session?.language, 'reliability_high');
      else if (stats.warningsReceived < 3) reliabilityText = t(ctx.session?.language, 'reliability_medium');
      else reliabilityText = t(ctx.session?.language, 'reliability_low');

      const message = `${level.emoji} **${t(ctx.session?.language, 'level_title', {name: level.name})}**\n\n ${t(ctx.session?.language, 'rating_label')}: ${updatedUser.rating} ${t(ctx.session?.language, 'rating_points')}${progressText}\n\n${t(ctx.session?.language, 'rating_section_stats', {
        sent: stats.actionsSent,
        received: stats.actionsReceived,
        projects: stats.projectsCount,
        reliability: reliabilityText
      })}\n${t(ctx.session?.language, 'rating_section_achievements', {achievements: achievements})}\n\n${t(ctx.session?.language, 'rating_section_main', {
        days: stats.daysActive,
        days_word: stats.daysActive === 1 ?
          t(ctx.session?.language, 'day_singular') :
          stats.daysActive >= 5 && stats.daysActive <= 20 ?
            t(ctx.session?.language, 'days_genitive') :
            [2,3,4].includes(stats.daysActive % 10)? t(ctx.session?.language, 'days_genitive') :
            t(ctx.session?.language, 'days_nominative')
      })}`;

      ctx.reply(message, { parse_mode: 'Markdown' });
      return;
    }
    return next();
  });

  // Кнопка "🤝 Рефералы"
  bot.on('text', async (ctx, next) => {
    if (getKeyboardButtonVariants('keyboard_referrals').includes(ctx.message.text)) {

      const user = await getUser(ctx.from.id);
      if (!user) {
        return ctx.reply(t(ctx.session?.language, 'user_registered'));
      }

      // Используем существующий callback 처리чик для menu_referrals через inline клавиатуру
      const keyboard = [
        [{ text: t(ctx.session?.language, 'keyboard_referrals'), callback_data: 'menu_referrals' }]
      ];



      // Автоматически вызываем callback обработчик
      setTimeout(async () => {
        try {
          const callbackCtx = {
            ...ctx,
            callbackQuery: {
              data: 'menu_referrals'
            },
            answerCbQuery: async () => {},
            editMessageText: ctx.editMessageText.bind(ctx)
          };
          const next = () => {};

          // Найдем и вызовем соответствующий обработчик
          if (callbackCtx.callbackQuery.data === 'menu_referrals') {
            // Импортируем action handler временно
            const { registerActions } = require('./actions');
            // Но лучше просто отправить сообщение напрямую
            const { getReferralStats, getOrCreateReferralCode, getUserReferrals } = require('../database/models');
            const code = await getOrCreateReferralCode(user.id);
            const stats = await getReferralStats(user.id);
            const referrals = await getUserReferrals(user.id);

            const { t } = require('../utils/lang');
            const lang = ctx.session?.language || 'ru';

            // Форматируем статистику
            const referralCount = referrals && referrals.length > 0 ? referrals.length : 0;
            const { getUserReferralEarnings } = require('../database/models');
            const earnedFromReferrals = await getUserReferralEarnings(ctx.from.id);

            // Структурируем сообщение
            let message = t(lang, 'referals.menu_title', {
              total: referralCount,
              earned: earnedFromReferrals
            });

            // Добавляем реферальную ссылку
            const botUsername = process.env.BOT_USERNAME || '@designlikebot';
            const referralLink = `https://t.me/${botUsername.replace('@', '')}?start=REF${code}`;
            message += `\n${referralLink}`;

            // Создаем клавиатуру
            const keyboard = [
              [{ text: t(lang, 'referals.copy_link_button'), callback_data: `referrals_copy` }],
              [{ text: t(lang, 'referals.invite_friends_button'), callback_data: `referrals_share` }],
              [{ text: t(lang, 'referals.my_referrals_button'), callback_data: `referrals_list` }],
              [{ text: t(lang, 'referals.stats_button'), callback_data: `referrals_stats` }]
            ];

            ctx.reply(message, {
              reply_markup: { inline_keyboard: keyboard }
            });
          }
        } catch (error) {
          ctx.reply(t(ctx.session?.language, 'error_occurred'));
        }
      }, 500);

      return;
    }
    return next();
  });

  // Кнопка "➕ Добавить проект"
  bot.on('text', async (ctx, next) => {
    if (getKeyboardButtonVariants('keyboard_add_project').includes(ctx.message.text)) {
      ctx.session = ctx.session || {};
      ctx.reply(t(ctx.session?.language, 'add_project_request'));
      ctx.session.waitingForProject = true;
      return;
    }
    return next();
  });

  // Кнопка "🎯 Доступные задания"
  bot.on('text', async (ctx, next) => {
    if (getKeyboardButtonVariants('keyboard_available_tasks').includes(ctx.message.text)) {

      const user = await getUser(ctx.from.id);

      if (!user) {
        return ctx.reply(t(ctx.session?.language, 'user_registered'));
      }

      const internalUserId = user.id;

      const platforms = [];
      if (user.behance_username) platforms.push('behance');
      if (user.dribbble_username) platforms.push('dribbble');
      if (user.artstation_username) platforms.push('artstation');
      if (user.dprofile_username) platforms.push('dprofile');

      if (platforms.length === 0) {
        ctx.reply(t(ctx.session?.language, 'no_platforms_warning'), {
          reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language, 'go_to_settings'), callback_data: 'settings_profiles' }]] },
          parse_mode: 'Markdown'
        });
        return;
      }

      const projects = await getProjectsForAction(internalUserId, platforms);

      if (projects.length === 0) {
        ctx.reply(t(ctx.session?.language, 'no_tasks_available'));
        return;
      }

      ctx.reply(t(ctx.session?.language, 'important_warning'));

      // Показываем только одно задание (первый доступный проект)
      if (projects.length > 0) {
        const project = projects[0]; // Берем только первый проект
        const projectOwner = await getUserById(project.user_id);
        const username = projectOwner ? (projectOwner.username || 'дизайнер') : 'дизайнер';
        const ownerId = projectOwner ? projectOwner.id : 0;

        const availableActions = await getUndoneActionsForProject(project.id, internalUserId);

        // Убираем дубликаты действий
        const uniqueActions = [...new Set(availableActions)];

        // Берем ТОЛЬКО ПЕРВОЕ доступное действие для этого проекта
        const firstAction = uniqueActions[0];

        const keyboard = [
          [{
            text: getActionText(firstAction),
            callback_data: `${firstAction}_project_${project.id}`
          }]
        ];

        const credits = await getCreditsForAction(project.id, firstAction);
        const actionWord = firstAction === 'like' ? 'лайк' : firstAction === 'follow' ? 'подписку' : firstAction === 'comment' ? 'комментарий' : 'просмотр';

        let actionVerb = getActionText(firstAction, ctx.session?.language).replace(/^[^\s]+\s*/, ''); // Убираем эмодзи и оставляем только текст

        await ctx.reply(t(ctx.session?.language, 'project_task_info', {
          actionVerb: actionVerb,
          url: project.url,
          credits: credits,
          actionWord: t(ctx.session?.language, `action_word_${firstAction}`)
        }), {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
      }
      return;
    }
    return next();
  });

  // Кнопка "💰 Баланс"
  bot.on('text', async (ctx, next) => {
    if (getKeyboardButtonVariants('keyboard_balance').includes(ctx.message.text)) {

      const user = await getUser(ctx.from.id);
      if (!user) {
        return ctx.reply(t(ctx.session?.language, 'user_registered'));
      }

      ctx.reply(t(ctx.session?.language, 'balance', {credits: user.credits}), {
         reply_markup: {
          inline_keyboard: [
            [{ text: t(ctx.session?.language, 'buy_100_crystals'), callback_data: 'buy_100' }],
            [{ text: t(ctx.session?.language, 'buy_500_crystals'), callback_data: 'buy_500' }],
            [{ text: t(ctx.session?.language, 'buy_1000_crystals'), callback_data: 'buy_1000' }]
          ]
        }
      });
      return;
    }
    return next();
  });

  // Кнопка "📂 Мои проекты"
  bot.on('text', async (ctx, next) => {
    console.log('DEBUG: Text message received:', ctx.message.text);
    console.log('DEBUG: Keyboard variants for my_projects:', getKeyboardButtonVariants('keyboard_my_projects'));
    console.log('DEBUG: Is in variants:', getKeyboardButtonVariants('keyboard_my_projects').includes(ctx.message.text));

    if (getKeyboardButtonVariants('keyboard_my_projects').includes(ctx.message.text)) {
      console.log('DEBUG: Handling keyboard_my_projects');
      const user = await getUser(ctx.from.id);
      if (!user) {
        console.log('DEBUG: User not found');
        return ctx.reply(t(ctx.session?.language, 'user_registered'));
      }
      console.log('DEBUG: User found:', user.id);

      try {
        const projects = await getUserProjects(user.id);
        console.log('DEBUG: Projects count:', projects.length);

        if (projects.length === 0) {
          console.log('DEBUG: Sending no_projects message');
          const result = await ctx.reply(t(ctx.session?.language, 'no_projects'), {
            reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language, 'add_project_button'), callback_data: 'add_project' }]] },
            parse_mode: 'Markdown'
          });
          console.log('DEBUG: no_projects message sent, result:', result);
          return;
        }

        console.log('DEBUG: Processing projects loop');
        // Отправляем каждый проект как отдельное сообщение
        for (const project of projects) {
          console.log('DEBUG: Processing project:', project.id);
          const progress = await require('../database/models').getProjectProgress(project.id);
          console.log('DEBUG: Progress for project', project.id, ':', progress);

          const keyboard = [
            [{ text: t(ctx.session?.language, 'view_performers_button'), callback_data: `view_project_performers_${project.id}` }],
            [{ text: t(ctx.session?.language, 'delete_project_button'), callback_data: `delete_project_${project.id}` }]
          ];

          const message = `**${t(ctx.session?.language, 'project_title')}:** ${project.url}\n\n${t(ctx.session?.language, 'completed_actions')} ${progress.completed} из ${progress.required}${progress.isCompleted ? ' ✅' : ''}\n${t(ctx.session?.language, 'added_date')}: ${new Date(project.added_date).toLocaleDateString(ctx.session?.language === 'en' ? 'en-US' : 'ru-RU')}`;

          console.log('DEBUG: Sending message for project', project.id);
          const result = await ctx.reply(message, {
            reply_markup: { inline_keyboard: keyboard },
            parse_mode: 'Markdown'
          });
          console.log('DEBUG: Message sent for project', project.id, ', result:', result?.message_id);
        }
      } catch (error) {
        console.error('DEBUG: Error in my_projects handler:', error);
      }
      return;
    }
    return next();
  });

  // Кнопка "⚙️ Настройки"
  bot.on('text', async (ctx, next) => {
    if (getKeyboardButtonVariants('keyboard_settings').includes(ctx.message.text)) {
      const user = await getUser(ctx.from.id);
      if (!user) {
        return ctx.reply(t(ctx.session?.language, 'user_registered'));
      }

    const keyboard = [
      [{ text: t(ctx.session?.language, 'set_profiles_button'), callback_data: 'settings_profiles' }],
      [{ text: t(ctx.session?.language, 'change_language_button'), callback_data: 'settings_language' }]
    ];

      ctx.reply(t(ctx.session?.language, 'settings'), {
        reply_markup: { inline_keyboard: keyboard }
      });
      return;
    }
    return next();
  });

  // Кнопка "🏛️ Админ панель"
  bot.on('text', async (ctx, next) => {
    if (getKeyboardButtonVariants('keyboard_admin_panel').includes(ctx.message.text)) {
      if (ctx.from.id !== 366323850) {
        return ctx.reply('❌ У вас нет доступа к этой функции.');
      }

      ctx.reply(t(ctx.session?.language, 'admin_panel'), {
        reply_markup: { inline_keyboard: getAdminKeyboard(ctx.session?.language) },
        parse_mode: 'Markdown'
      });
      return;
    }
    return next();
  });

  // Команда /admin для совместимости
  bot.hears('/admin', adminOnly, (ctx) => {

    ctx.reply(t(ctx.session?.language, 'admin_panel_short'), {
      reply_markup: { inline_keyboard: getAdminKeyboard(ctx.session?.language) },
      parse_mode: 'Markdown'
    });
  });

  bot.hears(/^admin$/i, adminOnly, (ctx) => {
    ctx.reply('Используйте команду /admin');
  });

  // GLOBAL TEXT HANDLER FOR DEBUGGING (moved to end)
  bot.on('text', (ctx, next) => {
    next(); // Allow other handlers to process
  });
}

/**
 * Регистрация или получение пользователя
 */
async function registerOrGetUser(telegramId, username, referralCode = null) {
  // Проверяем был ли пользователь зарегистрирован ДО реферального кода
  const existingUser = await getUser(telegramId);
  const isNewUser = !existingUser;

  // Если есть реферальный код и пользователь либо новый, либо не имеет реферрера
  let wasReferredNow = false;
  if (referralCode && isNewUser) {
    // Новый пользователь по реферальной ссылке
    wasReferredNow = true;
  } else if (referralCode && existingUser) {
    // Существующий пользователь - проверим, имеет ли он реферрера
    const referralCheck = await require('../../db').db.get(
      'SELECT referrer_id FROM referals WHERE referred_id = ?',
      [existingUser.id]
    );
    if (!referralCheck) {
      // Существующий пользователь пришел по реферальной ссылке и у него нет реферрера
      wasReferredNow = true;
    }
  }

  await registerUser(telegramId, username, referralCode);
  const user = await getUser(telegramId);

  // Реферальная система без уведомлений о новых рефералах

  return user;
}

module.exports = registerCommands;
