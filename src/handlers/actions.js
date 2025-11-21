// Обработчики callback actions (inline-кнопки)
const {
  getUser,
  updateUserProfile,
  updateUserLanguage,
  getUserById,
  addProject,
  getProjectById,
  addActionTransaction,
  updateCredits,
  buyCredits,
  saveComplaint,
  getPendingComplaints,
  getComplaintById,
  updateComplaintStatus,
  banUser,
  unbanUser,
  getUserDetailedStats,
  getUserWarningsCount,
  incrementUserWarnings,
  getAllActiveUsers,
  sendBroadcastMessage,
  hasUserDoneAction,
  getCreditsForAction,
  updateUserRating,
  getActionText,
  detectPlatform,
  isValidProjectUrl,
  getLinkType,
  showProjectActionsMenu,
  getUserPlatforms,
  showNextTask,
  getUserProjects,
  getActionsForProject,
  getProjectActionsAndParticipants,
  hasUserDoneAnyActionOnUrl,
  getActionTransactionById,
  hasUserDoneFollowOnUrl,
  getUserStats,
  getProjectProgress,
  addCompletedUrlAction,
  hasUserCompletedActionOnUrl
} = require('../database/models');

const { normalizeKeyboardText, getKeyboardButtonVariants, getAdminKeyboard } = require('../utils/helpers');

const isUserBanned = require('../../db').isUserBanned;

// Обработчики действий бота
function registerActions(bot) {
  const { t } = require('../utils/lang');

  // Выбор русского языка - ПЕРВЫЙ В ПЕРЕД!
  bot.on('callback_query', async (ctx, next) => {
    if (ctx.callbackQuery.data === 'select_language_ru') {
      await ctx.answerCbQuery();

      await updateUserLanguage(ctx.from.id, 'ru');
      ctx.session.language = 'ru';

      await ctx.editMessageText(t(ctx.session?.language, 'language_selected_ru'), {
        reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language, 'continue'), callback_data: 'continue_after_language' }]] }
      });

      return; // Завершаем обработку
    }
    await next();
  });

  // Выбор английского языка - ВТОРОЙ
  bot.on('callback_query', async (ctx, next) => {
    if (ctx.callbackQuery.data === 'select_language_en') {
      await ctx.answerCbQuery();

      await updateUserLanguage(ctx.from.id, 'en');
      ctx.session.language = 'en';

      await ctx.editMessageText(t('en', 'language_selected_en'), {
        reply_markup: { inline_keyboard: [[{ text: t('en', 'continue_en'), callback_data: 'continue_after_language' }]] }
      });
      return; // Завершаем обработку
    }
    await next();
  });

  // Общий callback_query handler для отладки - ПОСЛЕ СТРОКИ
  bot.on('callback_query', async (ctx, next) => {
    await next();
  });

  // Action для покупки кристаллов
  bot.action(/^buy_(\d+)$/, async (ctx) => {
    const amount = parseInt(ctx.match[1]);

    await ctx.answerCbQuery();

    const user = await getUser(ctx.from.id);
    if (!user) {
      await ctx.editMessageText(t(ctx.session?.language || 'ru', 'user_registered'));
      return;
    }

    const prices = { 100: 100, 500: 450, 1000: 850 };
    const cost = prices[amount];

    await ctx.editMessageText(t(ctx.session?.language || 'ru', 'payment_confirmation', { amount, cost }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t(ctx.session?.language || 'ru', 'pay_button'), callback_data: `confirm_buy_${amount}` }]
        ]
      }
    });
  });



  // Actions for setting up platform profiles
  bot.action('settings_profiles', async (ctx) => {
    const user = await getUser(ctx.from.id);
    const language = user.language || 'ru';
    ctx.editMessageText(t(language, 'settings_profiles_menu', {
      behance: user.behance_username || t(language, 'not_specified'),
      dribbble: user.dribbble_username || t(language, 'not_specified'),
      artstation: user.artstation_username || t(language, 'not_specified'),
      dprofile: user.dprofile_username || t(language, 'not_specified')
    }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t(language, 'behance_profile_button'), callback_data: 'set_behance' }],
          [{ text: t(language, 'dribbble_profile_button'), callback_data: 'set_dribbble' }],
          [{ text: t(language, 'artstation_profile_button'), callback_data: 'set_artstation' }],
          [{ text: t(language, 'dprofile_profile_button'), callback_data: 'set_dprofile' }],
          [{ text: t(language, 'view_profiles_button'), callback_data: 'view_profiles' }],
          [{ text: t(language, 'back_button'), callback_data: 'back_to_settings' }]
        ]
      },
      parse_mode: 'Markdown'
    });
  });

  bot.action('set_behance', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.waitingForBehance = true;
    const language = ctx.session?.language || 'ru';
    ctx.editMessageText(t(language, 'behance_profile_setup_prompt'), {
      reply_markup: { inline_keyboard: [[{ text: t(language, 'back_button'), callback_data: 'settings_profiles' }]] },
      parse_mode: 'Markdown'
    });
  });

  bot.action('set_dribbble', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.waitingForDribbble = true;
    const language = ctx.session?.language || 'ru';
    ctx.editMessageText(t(language, 'dribbble_profile_setup_prompt'), {
      reply_markup: { inline_keyboard: [[{ text: t(language, 'back_button'), callback_data: 'settings_profiles' }]] },
      parse_mode: 'Markdown'
    });
  });

  bot.action('set_artstation', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.waitingForArtstation = true;
    const language = ctx.session?.language || 'ru';
    ctx.editMessageText(t(language, 'artstation_profile_setup_prompt'), {
      reply_markup: { inline_keyboard: [[{ text: t(language, 'back_button'), callback_data: 'settings_profiles' }]] },
      parse_mode: 'Markdown'
    });
  });

  bot.action('set_dprofile', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.waitingForDprofile = true;
    const language = ctx.session?.language || 'ru';
    ctx.editMessageText(t(language, 'dprofile_profile_setup_prompt'), {
      reply_markup: { inline_keyboard: [[{ text: t(language, 'back_button'), callback_data: 'settings_profiles' }]] },
      parse_mode: 'Markdown'
    });
  });

  // Обработчик для смены языка в настройках
  bot.action('settings_language', async (ctx) => {
    const language = ctx.session?.language || 'ru';
    const keyboard = [
      [{ text: '🇷🇺 Русский', callback_data: 'select_language_ru' }],
      [{ text: '🇺🇸 English', callback_data: 'select_language_en' }]
    ];

    await ctx.editMessageText(t(language, 'select_language'), {
      reply_markup: { inline_keyboard: keyboard }
    });
  });

  bot.action('view_profiles', async (ctx) => {
    const user = await getUser(ctx.from.id);
    const language = ctx.session?.language || 'ru';
    ctx.editMessageText(t(language, 'view_profiles_message', {
      behance: user.behance_username ? `https://behance.net/${user.behance_username}` : t(language, 'not_specified'),
      dribbble: user.dribbble_username ? `https://dribbble.com/${user.dribbble_username}` : t(language, 'not_specified'),
      artstation: user.artstation_username ? `https://artstation.com/${user.artstation_username}` : t(language, 'not_specified'),
      dprofile: user.dprofile_username ? `https://${user.dprofile_username}.dprofile.ru` : t(language, 'not_specified')
    }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: `🔗 ${t(language, 'change_profiles')}`, callback_data: 'settings_profiles' }],
          [{ text: t(language, 'back_to_settings_button'), callback_data: 'back_to_settings' }]
        ]
      },
      parse_mode: 'Markdown'
    });
  });

  // Просмотр деталей одного проекта (отдельный обработчик должен быть ПЕРВЫМ!)
  bot.action(/^view_single_project_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    console.log(`[DEBUG] view_single_project action triggered for project ID: ${ctx.match[1]}`);
    const projectId = ctx.match[1];
    const lang = ctx.session?.language || 'ru';

    const project = await getProjectById(projectId);
    console.log(`[DEBUG] Project found: ${!!project}, projectId: ${projectId}`);
    if (!project) {
      console.log(`[DEBUG] Project not found, sending error message`);
      ctx.editMessageText(t(lang, 'project_not_found'), {
        reply_markup: { inline_keyboard: [[{ text: t(lang, 'back_to_projects'), callback_data: 'user_projects' }]] }
      });
      return;
    }

    const user = await getUser(ctx.from.id);
    console.log(`[DEBUG] User found: ${!!user}, user.id: ${user?.id}, project.user_id: ${project.user_id},telegram_id: ${project.user_id}`);
    if (!user || (project.user_id !== user.id && project.user_id !== user.telegram_id)) {
      console.log(`[DEBUG] Access denied, project.user_id: ${project.user_id}, user.id: ${user?.id}, user.telegram_id: ${user?.telegram_id}`);
      ctx.editMessageText(t(lang, 'no_access'), {
        reply_markup: { inline_keyboard: [[{ text: t(lang, 'back_to_projects'), callback_data: 'user_projects' }]] }
      });
      return;
    }

    const actions = await getActionsForProject(projectId);
    const actionsCount = actions.length;
    const progress = await getProjectProgress(projectId);
    console.log(`[DEBUG] Progress: completed=${progress.completed}, required=${progress.required}, isCompleted=${progress.isCompleted}`);

    const message = `**${t(lang, 'project_title')}:** ${project.url}\n\n${t(lang, 'project_progress')}: ${progress.completed} из ${progress.required}${progress.isCompleted ? ' ✅' : ''}\n${t(lang, 'added_date')}: ${new Date(project.added_date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}`;

    const keyboard = [
      [{ text: `${t(lang, 'view_performers_button')}`, callback_data: `view_project_performers_${projectId}` }],
      [{ text: `${t(lang, 'delete_project_button')}`, callback_data: `delete_project_${projectId}` }]
    ];

    console.log(`[DEBUG] Language: ${lang}, t('project_title'): ${t(lang, 'project_title')}, t('project_progress'): ${t(lang, 'project_progress')}, t('added_date'): ${t(lang, 'added_date')}`);
    console.log(`[DEBUG] Message to edit: ${message}`);
    console.log(`[DEBUG] About to edit message text for single project view`);
    try {
      await ctx.editMessageText(message, {
        reply_markup: { inline_keyboard: keyboard }
        // Remove parse_mode to avoid markdown issues
      });
      console.log(`[DEBUG] Message edited successfully for single project view`);
    } catch (error) {
      console.log(`[DEBUG] Error editing message: ${error.message}`);
    }
  });

  // Actions для выполнения заданий и удаления проектов
  bot.action(/^(\w+)_project_(\d+)$/, async (ctx) => {
    const actionType = ctx.match[1];
    const projectId = ctx.match[2];
    const userId = ctx.from.id;


    if (!["like", "follow", "comment", "view", "delete"].includes(actionType)) {
      return;
    }

    // Специальная логика для удаления проекта
    if (actionType === 'delete') {

      const project = await getProjectById(projectId);
      if (!project) {
        await ctx.reply('Проект не найден');
        return;
      }

      const user = await getUser(ctx.from.id);
      if (!user) {
        await ctx.reply('Пользователь не найден');
        return;
      }


      if (project.user_id !== user.id && project.user_id !== user.telegram_id) {
        await ctx.reply('❌ У вас нет прав на удаление этого проекта.');
        return;
      }


      // Рассчитать возврат кристаллов
      const refundAmount = await require('../database/models').calculateProjectRefund(projectId);

      // Показываем диалог подтверждения
      try {
        await ctx.answerCbQuery();
        const { t } = require('../utils/lang');
        const lang = ctx.session?.language || 'ru';

        let confirmMessage = `⚠️ **Подтверждение удаления проекта**\n\n🔗 ${project.url}\n\n‼️ Это действие нельзя отменить!\nБудут удалены:\n• Проект\n• Все выполненные действия по нему\n• Созданные жалобы`;

        if (refundAmount > 0) {
          confirmMessage += `\n\n💰 **Возврат кристаллов:** ${refundAmount} (80% от невыполненных действий)`;
        } else {
          confirmMessage += `\n\n💰 Проект полностью выполнен - возврат невозможен`;
        }

        confirmMessage += `\n\nУдалить проект?`;

        await ctx.editMessageText(confirmMessage, {
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'yes_delete'), callback_data: 'confirm_delete_project' }],
              [{ text: t(lang, 'cancel'), callback_data: `view_single_project_${projectId}` }]
            ]
          },
          parse_mode: 'Markdown'
        });
      } catch (editError) {
      }

      // Сохраняем projectId в сессии для подтверждения
      try {
        ctx.session.projectToDelete = projectId;
      } catch (sessionError) {
      }

      return; // Завершаем обработку delete
    }

    // Стандартная логика для like/follow/comment/view
    const alreadyDone = await hasUserDoneAction(userId, projectId, actionType);
    if (alreadyDone) {
      return;
    }

    const project = await getProjectById(projectId);
    if (!project) {
      await ctx.reply(t(ctx.session?.language, 'project_not_found'));
      return;
    }

    if (project.user_id === userId) {
      await ctx.reply(t(ctx.session?.language, 'self_project_action'));
      return;
    }

    try {
      await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
    } catch (error) {}

    const actionWord = actionType === 'like' ? 'лайк' : actionType === 'follow' ? 'подписку' : actionType === 'comment' ? 'комментарий' : 'просмотр';

    const credits = await getCreditsForAction(projectId, actionType);

    const actionVerb = t(ctx.session?.language || 'ru', `action_verb_${actionType}`);

    await ctx.reply(t(ctx.session?.language, 'project_task_info', {
      actionVerb,
      url: project.url,
      credits,
      actionWord
    }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: t(ctx.session?.language || 'ru', 'open_project'), url: project.url }],
          [{ text: t(ctx.session?.language || 'ru', 'confirm_execution'), callback_data: `confirm_${actionType}_${projectId}` }]
        ]
      },
      parse_mode: 'Markdown'
    });
  });

  // Обработчик завершения проекта (для уже завершенных проектов)
  bot.action(/^complete_project_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];
    await ctx.answerCbQuery();

    const { t } = require('../utils/lang');
    const lang = ctx.session?.language || 'ru';

    const resultMessage = await ctx.editMessageText(t(lang, 'project_completed_message'), {
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'back_to_projects'), callback_data: 'menu_my_projects' }]] },
      parse_mode: 'Markdown'
    });
  });

  // Actions для добавления проектов
  bot.action(/^select_(\w+)$/, async (ctx) => {
    const actionType = ctx.match[1];
    // Эти handlers управляют обработкой в text handlers,
    // но нужно создать действие для настройки количества
    ctx.session.waitingForViewsCount = actionType === 'views';
    ctx.session.waitingForLikesCount = actionType === 'likes';
    ctx.session.waitingForCommentsCount = actionType === 'comments';
    ctx.session.waitingForFollowsCount = actionType === 'follows';

    let countTypeKey = actionType === 'views' ? 'count_views' :
                       actionType === 'likes' ? 'count_likes' :
                       actionType === 'comments' ? 'count_comments' :
                       actionType === 'follows' ? 'count_follows' : '';

    await ctx.editMessageText(t(ctx.session?.language || 'ru', 'select_count', { type: t(ctx.session?.language || 'ru', countTypeKey) }), {
      reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language || 'ru', 'cancel'), callback_data: 'cancel_project_add' }]] },
      parse_mode: 'Markdown'
    });
  });

  // Обработчик для возврата к списку проектов
  bot.action('back_to_projects_list', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return;

    const projects = await getUserProjects(user.id);

    if (projects.length === 0) {
      await ctx.editMessageText('📂 У вас пока нет проектов.\n\nДобавьте свой первый проект с помощью кнопки ➕ **Добавить проект**!', {
        reply_markup: { inline_keyboard: [[{ text: '➕ Добавить проект', callback_data: 'add_project' }]] },
        parse_mode: 'Markdown'
      });
      return;
    }

    // Создаем одно сообщение со всеми проектами
    let messageText = '';
    const keyboard = [];
    const lang = ctx.session?.language || 'ru';

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      const progress = await getProjectProgress(project.id);

      messageText += `${i + 1}. 🎨 **Проект:** ${project.url}\n`;
      messageText += `   📊 ${t(lang, 'project_progress')}: ${progress.completed} из ${progress.required}${progress.isCompleted ? ' ✅' : ''}\n`;
      messageText += `    Добавлено: ${new Date(project.added_date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}\n\n`;

      // Добавляем кнопки для каждого проекта - локализуем текст
      keyboard.push([
        { text: `${t(lang, 'view_performers_button')} ${i + 1}`, callback_data: `view_project_performers_${project.id}` },
        { text: `${t(lang, 'delete_project_button')} ${i + 1}`, callback_data: `delete_project_${project.id}` }
      ]);
    }

    // Добавляем кнопку возврата в меню
    keyboard.push([{ text: t(lang, 'back_to_main'), callback_data: 'back_to_main' }]);

    await ctx.editMessageText(messageText, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
    });
  });

  // Основные навигационные actions
  bot.action(/^menu_stats|back_to_main$/, async (ctx) => {
    const stats = await getUserStats(ctx.from.id);
    let keyboard = [
      [{ text: '🎯 Доступные задания', callback_data: 'menu_available_tasks' }, { text: '➕ Добавить проект', callback_data: 'menu_add_project' }],
      [{ text: '🤝 Рефералы', callback_data: 'menu_referrals' }, { text: '📈 Мой рейтинг', callback_data: 'menu_rating' }],
      [{ text: '💰 Баланс', callback_data: 'menu_balance' }, { text: '⚙️ Настройки', callback_data: 'menu_settings' }]
    ];

    // Если у пользователя есть проекты, добавляем кнопку "Мои проекты"
    if (stats.projectsCount > 0) {
      keyboard.splice(1, 0, [{ text: '📂 Мои проекты', callback_data: 'menu_my_projects' }]);
    }

    if (ctx.from.id === parseInt(process.env.ADMIN_ID || '366323850')) {
      keyboard.push([{ text: '🏛️ Админ панель', callback_data: 'admin_panel' }]);
    }

    await ctx.editMessageText('🤝 **Взаимная поддержка дизайнеров в DesignLike**\n\n🎨 Behance | Dribbble | ArtStation | Dprofile\n\n🔥 Система взаимной рекламы: помогаем друг другу расти!\n\nВыберите действие:', {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  });

  // Обработчик для доступных заданий
  bot.action('menu_available_tasks', async (ctx) => {
    await ctx.answerCbQuery();

    const user = await getUser(ctx.from.id);
    if (!user) return;

    const platforms = await getUserPlatforms(user.id);
    await showNextTask(ctx, user.id, platforms);
  });

  // Обработчик для реферальной системы
  bot.action('menu_referrals', async (ctx) => {
    await ctx.answerCbQuery();

    const user = await getUser(ctx.from.id);
    if (!user) return;

    // Получаем реферальную статистику
    const { getReferralStats, getOrCreateReferralCode, getUserReferrals, getUserReferralEarnings } = require('../database/models');
    const code = await getOrCreateReferralCode(user.id);
    const stats = await getReferralStats(user.id);
    const referrals = await getUserReferrals(user.id);
    const totalEarned = await getUserReferralEarnings(user.telegram_id);

    const { t } = require('../utils/lang');
    const lang = ctx.session?.language || 'ru';

    // Форматируем статистику
    const referralCount = referrals && referrals.length > 0 ? referrals.length : 0;
    let earnedFromReferrals = totalEarned || 0;

    // Структурируем сообщение
    let message = t(lang, 'referals.menu_title', { total: referralCount, earned: earnedFromReferrals });
    const referralLink = `https://t.me/${process.env.BOT_USERNAME || 'designlikebot'}?start=REF${code}`;
    message += referralLink;

    // Создаем клавиатуру
    const keyboard = [
      [{ text: t(lang, 'referals.copy_link_button'), callback_data: `referrals_copy` }],
      [{ text: t(lang, 'referals.invite_friends_button'), callback_data: `referrals_share` }],
      [{ text: t(lang, 'referals.my_referrals_button'), callback_data: `referrals_list` }],
      [{ text: t(lang, 'referals.stats_button'), callback_data: `referrals_stats` }]
    ];

    await ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard }
});
  });

  // Реферальные действия
  bot.action('referrals_copy', async (ctx) => {
    await ctx.answerCbQuery();
    const { t } = require('../utils/lang');
    const { getOrCreateReferralCode } = require('../database/models');
    const { getUser } = require('../database/models');

    const user = await getUser(ctx.from.id);
    if (!user) return;

    const code = await getOrCreateReferralCode(user.id);
    const botUsername = process.env.BOT_USERNAME || '@designlikebot';
    const referralLink = `https://t.me/${botUsername.replace('@', '')}?start=REF${code}`;

    const lang = ctx.session?.language || 'ru';
    await ctx.editMessageText(t(lang, 'referals.copy_link_template', { link: referralLink }), {
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'referals.back_to_referral_menu'), callback_data: 'menu_referrals' }]] },
      parse_mode: 'Markdown'
    });
  });

  bot.action('referrals_share', async (ctx) => {
    await ctx.answerCbQuery();
    const { t } = require('../utils/lang');
    const { getOrCreateReferralCode } = require('../database/models');
    const { getUser } = require('../database/models');

    const user = await getUser(ctx.from.id);
    if (!user) return;

    const code = await getOrCreateReferralCode(user.id);
    const botUsername = process.env.BOT_USERNAME || '@designlikebot';
    const referralLink = `https://t.me/${botUsername.replace('@', '')}?start=REF${code}`;

    const lang = ctx.session?.language || 'ru';
    const shareText = t(lang, 'referals.share_text', { link: referralLink });

    await ctx.editMessageText(shareText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: t(lang, 'referals.invite_friends_button'), switch_inline_query: shareText }],
          [{ text: t(lang, 'referals.back_to_referral_menu'), callback_data: 'menu_referrals' }]
        ]
      }
    });
  });

  bot.action('referrals_list', async (ctx) => {
    await ctx.answerCbQuery();
    const { t } = require('../utils/lang');
    const { getUserReferralsWithEarnings } = require('../database/models');
    const { getUser } = require('../database/models');

    const user = await getUser(ctx.from.id);
    if (!user) return;

    const referrals = await getUserReferralsWithEarnings(user.id);
    const lang = ctx.session?.language || 'ru';

    let message = t(lang, 'referals.referral_list', { count: referrals ? referrals.length : 0 });

    if (!referrals || referrals.length === 0) {
      message += '\n\n' + t(lang, 'referals.no_referrals', { code: await require('../database/models').getOrCreateReferralCode(user.id) });
    } else {
      message += '\n\n';
      referrals.forEach((ref, index) => {
        const earnings = ref.earnings || 0;
        const username = ref.username ? (ref.username.startsWith('@') ? ref.username : '@' + ref.username) : t(lang, 'not_specified');
        message += `${username} - ${earnings}💎\n`;
      });
    }

    await ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'referals.back_to_referral_menu'), callback_data: 'menu_referrals' }]] },
      parse_mode: 'Markdown'
    });
  });

  bot.action('referrals_stats', async (ctx) => {
    await ctx.answerCbQuery();
    const { t } = require('../utils/lang');
    const { getReferralStats } = require('../database/models');
    const { getUser } = require('../database/models');

    const user = await getUser(ctx.from.id);
    if (!user) return;

    const stats = await getReferralStats(user.id);
    const lang = ctx.session?.language || 'ru';

    let message = t(lang, 'referals.stats_title');

    message += t(lang, 'referals.referral_earn_total', { amount: stats.totalEarnedReferrals || 0 }) + '\n';
    message += t(lang, 'referals.referral_earn_today', { amount: stats.todayEarnedReferrals || 0 }) + '\n\n';

    // Определяем уровень
    const earned = stats.totalEarnedReferrals || 0;
    let level;
    if (earned <= 99) { // бронза
      level = t(lang, 'referals.referral_level_bronze');
    } else if (earned <= 499) { // серебро
      level = t(lang, 'referals.referral_level_silver');
    } else { // золото
      level = t(lang, 'referals.referral_level_gold');
    }

    message += t(lang, 'referals.stats_level') + `${level}`;
    message += t(lang, 'referals.stats_ending');

    await ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'referals.back_to_referral_menu'), callback_data: 'menu_referrals' }]] },
      parse_mode: 'Markdown'
    });
  });

  // Показать мои проекты
  bot.action('menu_my_projects', async (ctx) => {
    console.log(`[LOG] menu_my_projects action started for user ${ctx.from.id}`);
    await ctx.answerCbQuery();
    console.log(`[LOG] menu_my_projects callback answered`);

    const user = await getUser(ctx.from.id);
    if (!user) {
      console.log(`[LOG] User not found for ID ${ctx.from.id}`);
      return;
    }

    const projects = await getUserProjects(user.id);
    console.log(`[LOG] Got projects: ${projects.length} items`);

    const lang = ctx.session?.language || 'ru';

    if (projects.length === 0) {
      await ctx.editMessageText(t(lang, 'no_projects_text'), {
        reply_markup: { inline_keyboard: [[{ text: '➕ Добавить проект', callback_data: 'add_project' }]] },
        parse_mode: 'Markdown'
      });
      return;
    }

    // Отправляем отдельное сообщение для каждого проекта
    console.log(`[LOG] Starting projects loop for ${projects.length} projects`);

    for (let i = 0; i < projects.length; i++) {
      console.log(`[LOG] Processing project ${i + 1} of ${projects.length}`);
      const project = projects[i];
      console.log(`[LOG] Getting progress for project ${project.id}`);
      const progress = await getProjectProgress(project.id);
      console.log(`[LOG] Progress: completed=${progress.completed}, required=${progress.required}, isCompleted=${progress.isCompleted}`);

      const messageText = `🎨 **Проект:** ${project.url}\n\n📊 ${t(lang, 'project_progress')}: ${progress.completed} из ${progress.required}${progress.isCompleted ? ' ✅' : ''}\n\n📅 Добавлено: ${new Date(project.added_date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}`;

      const keyboard = [];
      if (progress.isCompleted) {
        keyboard.push([
          { text: t(lang, 'view_performers_button'), callback_data: `view_project_performers_${project.id}` },
          { text: `✅ ${t(lang, 'complete_project_button')}`, callback_data: `complete_project_${project.id}` }
        ]);
      } else {
        keyboard.push([
          { text: t(lang, 'view_performers_button'), callback_data: `view_project_performers_${project.id}` },
          { text: t(lang, 'delete_project_button'), callback_data: `delete_project_${project.id}` }
        ]);
      }

      // Добавляем в конец кнопку возврата к списку всех проектов (или в начало)
      keyboard.push([{ text: '🔙 К списку проектов', callback_data: 'back_to_projects_list' }]);

      console.log(`[LOG] Sending message for project ${project.id}`);
      try {
        const sentMessage = await ctx.reply(messageText, {
          reply_markup: { inline_keyboard: keyboard },
          parse_mode: 'Markdown'
        });
        console.log(`[LOG] Message sent successfully for project ${project.id}, message_id: ${sentMessage.message_id}`);
      } catch (error) {
        console.log(`[LOG] Error sending message for project ${project.id}: ${error.message}`);
        // Fallback без parse_mode
        try {
          await ctx.reply(messageText, {
            reply_markup: { inline_keyboard: keyboard }
          });
        } catch (fallbackError) {
          console.log(`[LOG] Fallback also failed for project ${project.id}: ${fallbackError.message}`);
        }
      }
    }

    // Они принимают new reply для каждого проекта
    console.log(`[LOG] All projects sent as separate messages`);
  });

  // Actions для подтверждения добавления проекта
  bot.action('confirm_project_add', async (ctx) => {
    const project = ctx.session.pendingProject;
    const selected = ctx.session.selectedActions;

    if (!project || !selected) {
      await ctx.editMessageText('❌ Данные проекта не найдены.');
      return;
    }

    const user = await getUser(ctx.from.id);
    if (!user) {
      await ctx.editMessageText('❌ Пользователь не найден.');
      return;
    }

    // Проверяем, что выбрано хотя бы одно действие
    const totalActions = (selected.views || 0) + (selected.likes || 0) + (selected.comments || 0) + (selected.follows || 0);
    if (totalActions === 0) {
      const errorMessage = await ctx.reply('❌ Выберите хотя бы одно действие (просмотры, лайки, комментарии или подписки).');

      // Удалить сообщение через 3 секунды
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(errorMessage.message_id);
        } catch (error) {
        }
      }, 3000);

      return;
    }

    const totalCredits = selected.views * 1 + selected.likes * 5 + selected.comments * 10 + selected.follows * 30;

    if (user.credits < totalCredits) {
      await ctx.editMessageText(`❌ Недостаточно кристаллов! У вас ${user.credits} 💎, требуется ${totalCredits} 💎.`);
      return;
    }

    // Добавляем проект в базу данных - исправлено: используем user.id вместо ctx.from.id
    const projectId = await addProject(user.id, project.url, project.platform);
    if (projectId) {
      const actions = [];
      if (selected.views > 0) actions.push({ type: 'view', count: selected.views, credits: selected.views * 1 });
      if (selected.likes > 0) actions.push({ type: 'like', count: selected.likes, credits: selected.likes * 5 });
      if (selected.comments > 0) actions.push({ type: 'comment', count: selected.comments, credits: selected.comments * 10 });
      if (selected.follows > 0) actions.push({ type: 'follow', count: selected.follows, credits: selected.follows * 30 });

      try {
        for (const action of actions) {
          const creditsPerAction = Math.round(action.credits / action.count);
          await new Promise((resolve, reject) => {
            require('../../db').db.run(
              'INSERT INTO project_actions (project_id, action_type, credits_spent, count) VALUES (?, ?, ?, ?)',
              [projectId, action.type, creditsPerAction, action.count],
              function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
              }
            );
          });
        }

        await updateCredits(user.id, user.credits - totalCredits);
        await updateUserRating(ctx.from.id);

        delete ctx.session.pendingProject;
        delete ctx.session.selectedActions;
        delete ctx.session.actionsMessageId;

        await ctx.editMessageText(t(ctx.session?.language || 'ru', 'project_added_success', {
          views: selected.views,
          likes: selected.likes,
          comments: selected.comments,
          follows: selected.follows,
          total: totalCredits
        }));
      } catch (error) {
        await ctx.editMessageText('❌ Ошибка при добавлении проекта.');
        return;
      }
    } else {
      await ctx.editMessageText('❌ Ошибка при добавлении проекта.');
      delete ctx.session.pendingProject;
      delete ctx.session.selectedActions;
      delete ctx.session.actionsMessageId;
    }
  });

  bot.action('cancel_project_add', async (ctx) => {
    ctx.editMessageText('❌ Добавление проекта отменено.');
    delete ctx.session.pendingProject;
    delete ctx.session.selectedActions;
  });

  // Добавить проект из меню
  bot.action('add_project', async (ctx) => {
    ctx.reply('Отправьте ссылку на ваш проект (Behance, Dribbble, ArtStation):');
    ctx.session = ctx.session || {};
    ctx.session.waitingForProject = true;
  });

  // Админ действия
  bot.action('admin_broadcast', async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    ctx.session = ctx.session || {};
    ctx.session.waitingForBroadcastMessage = true;
    ctx.editMessageText(t(ctx.session?.language || 'ru', 'admin_broadcast_prompt'), {
      reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language || 'ru', 'cancel'), callback_data: 'back_to_admin' }]] },
      parse_mode: 'Markdown'
    });
  });

  bot.action(/^confirm_broadcast_send$/, async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    const messageText = ctx.session.broadcastMessage;
    if (!messageText) {
      ctx.editMessageText('❌ Ошибка: текст сообщения не найден. Попробуйте снова.');
      return;
    }

    // Очищаем сессию
    delete ctx.session.broadcastMessage;

    // Уведомляем, что рассылка началась
    ctx.editMessageText('📤 Рассылка отправляется...\n\n⏳ Подождите, идет отправка сообщений пользователям...');

    // Отправляем рассылку
    try {
      const result = await sendBroadcastMessage(ctx, messageText, ctx.from.id);
      ctx.editMessageText(`✅ Рассылка завершена!\n\n📤 Отправлено: ${result.sentCount} пользователям\n❌ Ошибок: ${result.errors.length}\n\n📅 ${new Date().toLocaleString('ru-RU')}`, {
        reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language || 'ru', 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
      });
    } catch (error) {
      ctx.editMessageText('❌ Ошибка при отправке рассылки.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
      });
    }
  });

  bot.action('cancel_broadcast', async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    // Очищаем сессию
    delete ctx.session.broadcastMessage;

    ctx.editMessageText(t(ctx.session?.language || 'ru', 'broadcast_cancelled'), {
      reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language || 'ru', 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
    });
  });

  // Подтверждение покупки кристаллов
  bot.action(/^confirm_buy_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const amount = parseInt(ctx.match[1]);
    const user = await getUser(ctx.from.id);
    if (!user) {
      await ctx.editMessageText(t(ctx.session?.language || 'ru', 'user_registered'));
      return;
    }

    await buyCredits(ctx.from.id, amount);
    await ctx.editMessageText(t(ctx.session?.language || 'ru', 'success_payment', { amount }));
  });

    // Подтверждение выполнения задания
  bot.action(/^confirm_(?!buy)(\w+)_(\d+)$/, async (ctx) => {
    const actionType = ctx.match[1];
    const projectId = ctx.match[2];
    const userId = ctx.from.id;

    // Получаем внутренний ID пользователя
    const user = await getUser(userId);
    if (!user) {
      await ctx.reply('Пользователь не найден.');
      return;
    }

    const project = await getProjectById(projectId);
    if (!project) {
      await ctx.reply('Проект не найден.');
      return;
    }

    // Проверяем, выполнял ли пользователь уже это действие над данной ссылкой
    const alreadyDoneOnUrl = await hasUserCompletedActionOnUrl(user.id, project.url, actionType);

    if (alreadyDoneOnUrl) {
      await ctx.editMessageText(t(ctx.session?.language || 'ru', 'action_already_done'), {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад к заданию', callback_data: `${actionType}_project_${projectId}` }]] },
        parse_mode: 'Markdown'
      }).catch(() => {});
      return;
    }

    let alreadyDone = await hasUserDoneAction(user.id, projectId, actionType);

    // Для подписки дополнительно проверяем, не подписывался ли пользователь на этот URL за последние 30 дней
    if (actionType === 'follow' && !alreadyDone) {
      alreadyDone = await hasUserDoneFollowOnUrl(user.id, project.url);
    }

    if (alreadyDone) {
      if (actionType === 'follow') {
        await ctx.editMessageText(t(ctx.session?.language || 'ru', 'follow_limit_reached'), {
          reply_markup: { inline_keyboard: [[{ text: '🔙 Вернуться к заданиям', callback_data: 'back_to_main' }]] },
          parse_mode: 'Markdown'
        }).catch(() => {});
      } else {
        await ctx.editMessageText(t(ctx.session?.language || 'ru', 'action_already_done'), {
          reply_markup: { inline_keyboard: [[{ text: '🔙 Назад к заданию', callback_data: `${actionType}_project_${projectId}` }]] },
          parse_mode: 'Markdown'
        }).catch(() => {});
      }
      return;
    }

    try {
      await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
    } catch (error) {}

    const credits = await getCreditsForAction(projectId, actionType);
    const transaction = await addActionTransaction(userId, projectId, actionType);

    if (transaction) {
      // Записываем выполненное действие в перманентную историю
      await addCompletedUrlAction(user.id, project.url, actionType);

      await updateCredits(user.id, user.credits + credits);
      await updateUserRating(userId);

      // Обрабатываем реферальные бонусы за выполнение действия
      try {
        await require('../database/models').processActionReferralBonuses(user.id, credits);
      } catch (referralError) {
        // Не прерываем основной поток из-за ошибки в рефералах
      }

      // Проверяем, завершен ли проект
      try {
        await require('../database/models').checkAndCompleteProject(projectId);
      } catch (completeError) {
        // Не прерываем основной поток из-за ошибки
        console.error('Error checking project completion:', completeError);
      }

      // Получаем прогресс проекта после выполнения действия
      const progress = await getProjectProgress(projectId);

      let unit = 'кредит';
      let plural = '';
      if (credits === 1) {
        unit = 'кредит';
        plural = '';
      } else if (credits >= 2 && credits <= 4) {
        unit = 'кредита';
        plural = 'ы';
      } else {
        unit = 'кредитов';
        plural = 'ы';
      }

      const thankYouText = t(ctx.session?.language || 'ru', 'thank_you_message', {
        credits,
        unit,
        plural,
        action: getActionText(actionType, ctx.session?.language || 'ru').toLowerCase()
      });

      const thankYouMessage = await ctx.reply(thankYouText, {
        parse_mode: 'Markdown'
      });

      // Сохраняем ID сообщения "Спасибо!", чтобы потом удалить
      ctx.session.thankYouMessageId = thankYouMessage.message_id;

      setTimeout(async () => {
        const platforms = await getUserPlatforms(user.id);
        await showNextTask(ctx, user.id, platforms);
      }, 1000);
    } else {
      await ctx.reply(`❌ Ошибка при обработке ${getActionText(actionType, ctx.session?.language || 'ru').toLowerCase()}. Попробуйте позже.`);
    }
  });

  // Просмотр исполнителей проекта
  bot.action(/^view_project_performers_(\d+)$/, async (ctx) => {
    const projectId = ctx.match[1];

    const actions = await getActionsForProject(projectId);

    const project = await getProjectById(projectId);
    if (!project) {
      ctx.editMessageText(t(ctx.session?.language || 'ru', 'project_not_found_hardcoded'), {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад к проектам', callback_data: 'user_projects' }]] }
      });
      return;
    }

  let message = '';
  const lang = ctx.session?.language || 'ru';

  const keyboard = [];

  if (actions.length === 0) {
    message += t(lang, 'performers_list_caption');
  } else {
    actions.sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

    for (const [index, action] of actions.entries()) {
      const performerUser = await getUserById(action.from_user_id);
      const platformUsername = action.platform === 'behance' ? action.behance_username :
                               action.platform === 'dribbble' ? action.dribbble_username :
                               action.platform === 'artstation' ? action.artstation_username : null;

      const actionText = t(lang, `action_${action.action_type}`); // Like, Подписка, etc.

      message += `${index + 1}. ${actionText} ${t(lang, 'performer_action_from')} ${performerUser ? performerUser.username || t(lang, 'not_specified') : t(lang, 'not_specified')}\n`;
      if (platformUsername) message += `   ${t(lang, 'nickname')}: ${platformUsername}\n`;

      keyboard.push([
        { text: `${t(lang, 'complain_button')}`, callback_data: `complain_on_performer_${action.id}` },
        { text: t(lang, 'open_project'), url: action.project_url }
      ]);
    }
  }

  console.log(`[LOG] Adding back_to_project button for project ${projectId}`);
  keyboard.push([{ text: t(lang, 'back_to_project'), callback_data: `view_single_project_${projectId}` }]);

    ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  });

  // Удаление проекта - прямой callback handler вместо action
  bot.on('callback_query', async (ctx, next) => {
    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData || !callbackData.startsWith('delete_project_')) {
      return next();
    }
    const projectId = callbackData.split('_')[2];

    try {
      await ctx.answerCbQuery();
    } catch (error) {
      return;
    }


    let project;
    try {
      project = await getProjectById(projectId);
      } catch (error) {
        try {
          await ctx.editMessageText(t(ctx.session?.language || 'ru', 'project_not_found_hardcoded'), {
            reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
          });
        } catch (editError) {
        }
        return;
      }

    if (!project) {
      try {
        await ctx.editMessageText('❌ Проект не найден.', {
          reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
        });
      } catch (editError) {
      }
      return;
    }

    let user;
    try {
      user = await getUser(ctx.from.id);
    } catch (error) {
      try {
        await ctx.editMessageText('❌ Пользователь не найден.', {
          reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }],] }
        });
      } catch (editError) {
      }
      return;
    }

    if (!user) {
      try {
        await ctx.editMessageText('❌ Пользователь не найден.', {
          reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }],] }
        });
      } catch (editError) {
      }
      return;
    }


    if (project.user_id !== user.id && project.user_id !== user.telegram_id) {
      try {
        await ctx.editMessageText('❌ У вас нет прав на удаление этого проекта.', {
          reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }],] }
        });
      } catch (editError) {
      }
      return;
    }


    try {
      ctx.session.projectToDelete = projectId;
    } catch (sessionError) {
    }

    try {
      const { t } = require('../utils/lang');
      const lang = ctx.session?.language || 'ru';

        await ctx.editMessageText(t(lang, 'delete_project_confirm', { url: project.url }), {
          reply_markup: {
            inline_keyboard: [
              [{ text: t(lang, 'yes_delete'), callback_data: 'confirm_delete_project' }],
              [{ text: t(lang, 'cancel'), callback_data: 'user_projects' }]
            ]
          },
          parse_mode: 'Markdown'
        });
    } catch (editError) {
    }
  });

  // Подтверждение удаления проекта
  bot.action('confirm_delete_project', async (ctx) => {
    await ctx.answerCbQuery();

    if (!ctx.session.projectToDelete) {
      ctx.editMessageText('❌ Ошибка: проект для удаления не найден.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
      });
      return;
    }

    const projectId = ctx.session.projectToDelete;
    const project = await getProjectById(projectId);

    if (!project) {
      ctx.editMessageText('❌ Ошибка: проект не найден.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
      });
      return;
    }

    const user = await getUser(ctx.from.id);
    if (!user) {
      ctx.editMessageText('❌ Пользователь не найден.');
      return;
    }


    if (project.user_id !== user.id && project.user_id !== user.telegram_id) {
      ctx.editMessageText('❌ Ошибка: проект не найден или нет прав.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
      });
      return;
    }

    // Рассчитать возврат кристаллов ДО удаления
    const refundAmount = await require('../database/models').calculateProjectRefund(projectId);

    try {
      await new Promise((resolve, reject) => {
        const db = require('../../db').db;
        db.serialize(() => {
          db.run('BEGIN TRANSACTION');

          db.run('DELETE FROM complaints WHERE project_id = ?', [projectId]);
          db.run('DELETE FROM action_transactions WHERE to_project_id = ?', [projectId]);
          db.run('DELETE FROM project_actions WHERE project_id = ?', [projectId]);
          db.run('DELETE FROM projects WHERE id = ?', [projectId], function(err) {
            if (err) {
              db.run('ROLLBACK');
              reject(err);
            } else {
              db.run('COMMIT');
              resolve();
            }
          });
        });
      });

      // Вернуть кристаллов пользователю
      if (refundAmount > 0) {
        await require('../database/models').updateCredits(user.id, user.credits + refundAmount);
      }

      delete ctx.session.projectToDelete;

      const resultMessage = await ctx.editMessageText(t(ctx.session?.language, 'delete_project_success'), {
        parse_mode: 'Markdown'
      });

      // Удалить сообщение через 5 секунд
      setTimeout(async () => {
        try {
          await ctx.deleteMessage(resultMessage.message_id);
        } catch (error) {
        }
      }, 5000);

    } catch (error) {
      delete ctx.session.projectToDelete;

      ctx.editMessageText(t(ctx.session?.language, 'delete_project_error'), {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
      });
    }
  });

  // Обработчик для возврата к "Мои проекты" - показывает все проекты в одном сообщении
  bot.action('user_projects', async (ctx) => {
    const user = await getUser(ctx.from.id);
    if (!user) return;

    const projects = await getUserProjects(user.id);

    if (projects.length === 0) {
      await ctx.editMessageText('📂 У вас пока нет проектов.\n\nДобавьте свой первый проект с помощью кнопки ➕ **Добавить проект**!', {
        reply_markup: { inline_keyboard: [[{ text: '➕ Добавить проект', callback_data: 'add_project' }]] },
        parse_mode: 'Markdown'
      });
      return;
    }

    // Создаем одно сообщение со всеми проектами
    let messageText = '';
    const keyboard = [];
    const lang = ctx.session?.language || 'ru';

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      const progress = await getProjectProgress(project.id);

      messageText += `${i + 1}. 🎨 **Проект:** ${project.url}\n`;
      messageText += `   📊 ${t(lang, 'project_progress')}: ${progress.completed} из ${progress.required}${progress.isCompleted ? ' ✅' : ''}\n`;
      messageText += `    Добавлено: ${new Date(project.added_date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}\n\n`;

      // Добавляем кнопки для каждого проекта - локализуем текст
      keyboard.push([
        { text: `${t(lang, 'view_performers_button')} ${i + 1}`, callback_data: `view_project_performers_${project.id}` },
        { text: `${t(lang, 'delete_project_button')} ${i + 1}`, callback_data: `delete_project_${project.id}` }
      ]);
    }

    // Добавляем кнопку возврата в меню
    keyboard.push([{ text: t(lang, 'back_to_main'), callback_data: 'back_to_main' }]);

    await ctx.editMessageText(messageText, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
    });
  });

  // Жалоба на исполнителя - старый формат для обратной совместимости
  bot.action(/^complain_(\d+)_(\d+)$/, async (ctx) => {
    try {
      // Показываем сообщение о том, что система обновлена и нужно использовать новый интерфейс
      ctx.editMessageText(`⚠️ **Система жалоб обновлена**\n\n🔄 Старые кнопки жалоб больше не поддерживаются.\n\nДля подачи жалобы используйте:\n📂 **Мои проекты** → **Посмотреть исполнителей** → **🚨 Пожаловаться**`, {
        parse_mode: 'Markdown'
      });
    } catch (error) {
      ctx.editMessageText('❌ Система жалоб обновлена. Используйте новый интерфейс в меню "Мои проекты".');
}
    return;
  });

  // Жалоба на исполнителя - новый формат
  bot.action(/^complain_on_performer_(.+)$/, async (ctx) => {
    const actionId = ctx.match[1];

    const transaction = await getActionTransactionById(actionId);

    if (!transaction) {
      ctx.editMessageText(t(ctx.session?.language || 'ru', 'transaction_not_found'), {
        reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language || 'ru', 'back_to_project'), callback_data: `view_project_performers_${transaction?.to_project_id || 0}` }]] },
        parse_mode: 'Markdown'
      });
      return;
    }

    const project = await getProjectById(transaction.to_project_id);
    const user = await getUser(ctx.from.id); // Получаем внутренний ID пользователя

    if (!project || !user || project.user_id !== user.id) {
      ctx.editMessageText('❌ У вас нет прав на эту операцию.', {
        reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language || 'ru', 'back_to_project'), callback_data: `view_project_performers_${transaction.to_project_id}` }]] },
        parse_mode: 'Markdown'
      });
      return;
    }

    const performer = await getUserById(transaction.from_user_id);

    const platformUsername = transaction.project_url.includes('behance.net') ? performer.behance_username :
                             transaction.project_url.includes('dribbble.com') ? performer.dribbble_username :
                             transaction.project_url.includes('artstation.com') ? performer.artstation_username : null;

    let complaintType = t(ctx.session?.language || 'ru', 'complaint_did_not_perform');
    switch (transaction.action_type) {
      case 'like': complaintType = t(ctx.session?.language || 'ru', 'complaint_no_like'); break;
      case 'follow': complaintType = t(ctx.session?.language || 'ru', 'complaint_no_follow'); break;
      case 'comment': complaintType = t(ctx.session?.language || 'ru', 'complaint_no_comment'); break;
      case 'view': complaintType = t(ctx.session?.language || 'ru', 'complaint_no_view'); break;
    }

    const complainantUser = await getUser(ctx.from.id);

    const complaintId = await saveComplaint(
      complainantUser.id,
      transaction.from_user_id,
      transaction.to_project_id,
      complaintType,
      `Автоматическая жалоба через проект: ${transaction.project_url}`
    );

    // Удалить транзакцию действия
    const { db } = require('../../db');
    await new Promise((resolve) => {
      db.run('DELETE FROM action_transactions WHERE id = ?', [actionId], function(err) {
        resolve();
      });
    });

    const adminId = 366323850;
    const adminMessage = t(ctx.session?.language || 'ru', 'admin_complaint_notification', {
      ownerUsername: ctx.from.username || '',
      ownerId: ctx.from.id,
      performerUsername: performer.username || '',
      performerId: performer.id,
      platformUsername: platformUsername || 'не указан',
      projectUrl: transaction.project_url,
      complaintType: complaintType,
      transactionDate: new Date(transaction.transaction_date).toLocaleString(ctx.session?.language === 'en' ? 'en-US' : 'ru-RU')
    });

    try {
      await ctx.telegram.sendMessage(adminId, adminMessage, { parse_mode: 'Markdown' });
    } catch (error) {
    }

    ctx.editMessageText(`✅ Жалоба отправлена!\n\nИсполнитель удален из проекта, повторная жалоба невозможна. Админ рассмотрит нарушение.`, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К исполнителям', callback_data: `view_project_performers_${transaction.to_project_id}` }]] },
      parse_mode: 'Markdown'
    });
  });

  // Админ просмотр жалоб
  bot.action('admin_view_complaints', async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    const complaints = await getPendingComplaints();

    if (complaints.length === 0) {
      ctx.editMessageText(t(ctx.session?.language || 'ru', 'admin_complaints_none_loc'), {
        reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language || 'ru', 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
      });
      return;
    }

    const message = '📋 **Незавершенные жалобы:**\n\nВыберите жалобу для просмотра:';

    const keyboard = [
      ...complaints.map(complaint => [{
        text: `Жалоба #${complaint.id} (${complaint.complainant_username} → ${complaint.reported_username})`,
        callback_data: `view_complaint_${complaint.id}`
      }]),
      [{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]
    ];

    ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
    });
  });

  // Просмотр детальной жалобы
  bot.action(/^view_complaint_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    const complaintId = ctx.match[1];
    const complaint = await getComplaintById(complaintId);

    if (!complaint) {
      ctx.editMessageText('❌ Жалоба не найдена.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'admin_view_complaints' }]] }
      });
      return;
    }

    const reportedUser = await getUserById(complaint.reported_user_id);
    let platformUsername = 'не указан';
    if (complaint.project_url.includes('behance.net')) {
      platformUsername = reportedUser?.behance_username || 'не указан';
    } else if (complaint.project_url.includes('dribbble.com')) {
      platformUsername = reportedUser?.dribbble_username || 'не указан';
    } else if (complaint.project_url.includes('artstation.com')) {
      platformUsername = reportedUser?.artstation_username || 'не указан';
    }

    const platform = complaint.project_url.includes('behance.net') ? 'Behance' :
                     complaint.project_url.includes('dribbble.com') ? 'Dribbble' : 'ArtStation';

    const message = `🚨 **Подробности жалобы #${complaint.id}**\n\n` +
      `👤 **Владелец проекта:** ${complaint.complainant_username} (@${complaint.complainant_telegram_id})\n` +
      `😤 **Обвиняемый исполнитель:** ${complaint.reported_username} (@${complaint.reported_telegram_id})\n` +
      `\n📱 **Ник для проверки на ${platform}:** ${platformUsername}\n\n` +
      `🔗 **Проект:** ${complaint.project_url}\n` +
      `📝 **Причина:** ${complaint.complaint_type}\n` +
      `📅 **Дата:** ${new Date(complaint.created_date).toLocaleString('ru-RU')}`;

    const keyboard = [
      [{ text: '⚠️ Нарушение подтверждено (выдать предупреждение)', callback_data: `reject_complaint_${complaint.id}` }],
      [{ text: '❌ Жалоба несостоятельна', callback_data: `resolve_complaint_${complaint.id}` }],
      [{ text: '🚫 Принудительный бан', callback_data: `ban_user_${complaint.reported_user_id}_${complaint.reported_username}_${complaint.id}` }],
      [{ text: '🔙 Назад к списку', callback_data: 'admin_view_complaints' }]
    ];

    ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
    });
  });

  // Разрешение жалобы (жалоба отклонена)
  bot.action(/^resolve_complaint_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    const complaintId = ctx.match[1];
    const complaint = await getComplaintById(complaintId);

    if (complaint) {
      const reportedUser = await getUserById(complaint.reported_user_id);
      const lang = reportedUser ? (reportedUser.language || 'ru') : 'ru';

      try {
        const complainantMessage = `🛡️ **Жалоба рассмотрена**\n\n❌ **Администратор решил:** Жалоба отклонена, администратор не нашел нарушения\n\n➡️ **Действие от:** ${complaint.reported_username ? `@${complaint.reported_username}` : 'пользователя'}\n💬 **Причина:** ${complaint.complaint_type}\n🔗 **Проект:** ${complaint.project_url}`;

        if (complaint.complainant_telegram_id) {
          await ctx.telegram.sendMessage(complaint.complainant_telegram_id, complainantMessage, { parse_mode: 'Markdown' });
        }

        await updateComplaintStatus(complaintId, 'rejected', ctx.from.id);

        ctx.editMessageText('✅ Жалоба отклонена, уведомления отправлены участникам.', {
          reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
        });

      } catch (error) {
        ctx.editMessageText('❌ Ошибка при отправке уведомлений.', {
          reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
        });
      }
    } else {
      ctx.editMessageText('❌ Жалоба не найдена.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
      });
    }
  });

  // Отклонение жалобы (нарушение подтверждено - выдать предупреждение или бан)
  bot.action(/^reject_complaint_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    const complaintId = ctx.match[1];
    const complaint = await getComplaintById(complaintId);

    if (complaint) {
      const reportedUser = await getUserById(complaint.reported_user_id);
      const lang = reportedUser ? (reportedUser.language || 'ru') : 'ru';

      try {
        const currentWarnings = await getUserWarningsCount(complaint.reported_user_id);

        let complainantMessage = '';
        let reportedMessage = '';
        let actionText = '';

        if (currentWarnings === 0) {
          complainantMessage = t(lang, 'complaint_first_warning_decision', {complaint_type: complaint.complaint_type, project_url: complaint.project_url});
          reportedMessage = t(lang, 'first_warning_notification', {complaint_type: complaint.complaint_type, project_url: complaint.project_url});
          actionText = '⚠️ Исполнителю выдано первое предупреждение.';
          await incrementUserWarnings(complaint.reported_user_id);

        } else if (currentWarnings === 1) {
          complainantMessage = t(lang, 'complaint_second_warning_decision', {complaint_type: complaint.complaint_type, project_url: complaint.project_url});
          reportedMessage = t(lang, 'second_warning_notification', {complaint_type: complaint.complaint_type, project_url: complaint.project_url});
          actionText = '⚠️ Исполнителю выдано второе предупреждение.';
          await incrementUserWarnings(complaint.reported_user_id);

        } else {
          await incrementUserWarnings(complaint.reported_user_id);
          complainantMessage = t(lang, 'complaint_ban_decision', {complaint_type: complaint.complaint_type, project_url: complaint.project_url, reported_username: complaint.reported_username ? `@${complaint.reported_username}` : 'пользователь'});
          reportedMessage = t(lang, 'ban_notification', {complaint_type: complaint.complaint_type, project_url: complaint.project_url, complainant_username: complaint.complainant_username ? `@${complaint.complainant_username}` : 'пользователь'});
          actionText = '🚫 Исполнитель заблокирован за многократные нарушения.';
          await banUser(complaint.reported_user_id, `Жалоба: ${complaint.complaint_type} (3 нарушения)`, ctx.from.id);
        }

        if (complaint.complainant_telegram_id) {
          await ctx.telegram.sendMessage(complaint.complainant_telegram_id, complainantMessage, { parse_mode: 'Markdown' });
        }

        if (complaint.reported_telegram_id) {
          await ctx.telegram.sendMessage(complaint.reported_telegram_id, reportedMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [[t(lang, 'keyboard_unblock_request')]],
              resize_keyboard: true
            }
          });
        }

        await updateComplaintStatus(complaintId, 'resolved', ctx.from.id);

        ctx.editMessageText(actionText + ' Уведомления отправлены.', {
          reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
        });

      } catch (error) {
        ctx.editMessageText('❌ Ошибка при обработке жалобы.', {
          reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
        });
      }
    } else {
      ctx.editMessageText('❌ Жалоба не найдена.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
      });
    }
  });

  // Принудительный бан пользователя из жалобы
  bot.action(/^ban_user_(\d+)_(.+)_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    const reportedUserId = parseInt(ctx.match[1]);
    const reportedUsername = ctx.match[2];
    const complaintId = parseInt(ctx.match[3]);

    try {
      const reportedUser = await getUserById(reportedUserId);
      if (!reportedUser) {
        ctx.editMessageText('❌ Пользователь не найден в базе данных.', {
          reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
        });
        return;
      }

      const telegramUserId = reportedUser.telegram_id;

      await banUser(reportedUserId, `Жалоба от админа на нарушение (ID жалобы: ${complaintId})`, ctx.from.id);

      const reportedMessage = t(reportedUser.language || 'ru', 'user_account_banned_admin');

      try {
      await ctx.telegram.sendMessage(telegramUserId, reportedMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [[t(reportedUser.language || 'ru', 'keyboard_unblock_request')]],
          resize_keyboard: true
        }
      });
      } catch (error) {
      }

      await updateComplaintStatus(complaintId, 'resolved', ctx.from.id);

      ctx.editMessageText(`🚫 Пользователь ${reportedUsername} (@${telegramUserId}) заблокирован. Уведомление отправлено.`, {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
      });
    } catch (error) {
      ctx.editMessageText('❌ Ошибка при блокировке пользователя.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
      });
    }
  });

  // Админ статистика
  bot.action('admin_stats', async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    try {
      const stats = {};

      const totalUsers = await new Promise((resolve, reject) => {
        require('../../db').db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      stats.totalUsers = totalUsers;

      const activeUsers = await new Promise((resolve, reject) => {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        require('../../db').db.get('SELECT COUNT(DISTINCT from_user_id) as count FROM action_transactions WHERE transaction_date > ?', [weekAgo.toISOString()], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      stats.activeUsers = activeUsers;

      const totalProjects = await new Promise((resolve, reject) => {
        require('../../db').db.get('SELECT COUNT(*) as count FROM projects', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      stats.totalProjects = totalProjects;

      const totalActions = await new Promise((resolve, reject) => {
        require('../../db').db.get('SELECT COUNT(*) as count FROM action_transactions', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      stats.totalActions = totalActions;

      const actionsStats = await new Promise((resolve, reject) => {
        require('../../db').db.all('SELECT action_type, COUNT(*) as count FROM action_transactions GROUP BY action_type', (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const totalComplaints = await new Promise((resolve, reject) => {
        require('../../db').db.get('SELECT COUNT(*) as count FROM complaints', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      stats.totalComplaints = totalComplaints;

      const pendingComplaints = await new Promise((resolve, reject) => {
        require('../../db').db.get('SELECT COUNT(*) as count FROM complaints WHERE status IN ("pending", "new")', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      stats.pendingComplaints = pendingComplaints;

      const totalCreditsEarned = await new Promise((resolve, reject) => {
        require('../../db').db.get('SELECT SUM(amount) as total FROM credit_purchases', (err, row) => {
          if (err) reject(err);
          else resolve(row.total || 0);
        });
      });
      stats.totalCreditsEarned = totalCreditsEarned;

      const totalCreditsSpent = await new Promise((resolve, reject) => {
        require('../../db').db.get('SELECT SUM(pa.credits_spent) as total FROM action_transactions at JOIN project_actions pa ON at.to_project_id = pa.project_id AND at.action_type = pa.action_type', (err, row) => {
          if (err) reject(err);
          else resolve(row.total || 0);
        });
      });
      stats.totalCreditsSpent = totalCreditsSpent;

      const bannedUsers = await new Promise((resolve, reject) => {
        require('../../db').db.get('SELECT COUNT(*) as count FROM user_bans', (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      stats.bannedUsers = bannedUsers;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayActions = await new Promise((resolve, reject) => {
        require('../../db').db.get('SELECT COUNT(*) as count FROM action_transactions WHERE transaction_date >= ?', [today.toISOString()], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });
      stats.todayActions = todayActions;

      let message = t(ctx.session?.language || 'ru', 'admin_bot_statistics', {
        totalUsers: stats.totalUsers,
        activeUsers: stats.activeUsers,
        bannedUsers: stats.bannedUsers,
        totalProjects: stats.totalProjects,
        totalActions: stats.totalActions,
        totalComplaints: stats.totalComplaints,
        pendingComplaints: stats.pendingComplaints,
        totalCreditsEarned: stats.totalCreditsEarned,
        totalCreditsSpent: stats.totalCreditsSpent
      });

      // Добавляем раздел пользователей
      message += t(ctx.session?.language || 'ru', 'admin_stats_users_section', {
        totalUsers: stats.totalUsers,
        activeUsers: stats.activeUsers,
        bannedUsers: stats.bannedUsers
      });

      // Добавляем раздел контента
      message += t(ctx.session?.language || 'ru', 'admin_stats_content_section', {
        totalProjects: stats.totalProjects,
        totalActions: stats.totalActions
      });

      if (actionsStats.length > 0) {
        const actionDetails = actionsStats.map(stat => {
          const icon = stat.action_type === 'like' ? '❤️' : stat.action_type === 'follow' ? '👥' : stat.action_type === 'comment' ? '💬' : '👀';
          return `${icon}${stat.count}`;
        }).join(', ');
        message += t(ctx.session?.language || 'ru', 'admin_stats_content_detail', { actionDetails });
      }

      // Добавляем сегодняшние действия
      message += t(ctx.session?.language || 'ru', 'admin_stats_today_actions', {
        todayActions: stats.todayActions
      });

      // Добавляем раздел жалоб
      message += t(ctx.session?.language || 'ru', 'admin_stats_complaints_section', {
        totalComplaints: stats.totalComplaints,
        pendingComplaints: stats.pendingComplaints
      });

      // Добавляем экономический раздел
      message += t(ctx.session?.language || 'ru', 'admin_stats_economy_section', {
        totalCreditsEarned: stats.totalCreditsEarned,
        totalCreditsSpent: stats.totalCreditsSpent
      });

      if (stats.totalUsers > 5000) {
        message += t(ctx.session?.language || 'ru', 'admin_stats_high_load');
      }

      message += t(ctx.session?.language || 'ru', 'admin_stats_last_update', {
        date: new Date().toLocaleString(ctx.session?.language === 'en' ? 'en-US' : 'ru-RU')
      });

      ctx.editMessageText(message, {
        reply_markup: { inline_keyboard: [[{ text: '🔄 Обновить', callback_data: 'admin_stats' }, { text: '🔙 Назад', callback_data: 'back_to_admin' }]] },
        parse_mode: 'Markdown'
      });

    } catch (error) {
      ctx.editMessageText('❌ Ошибка при получении статистики. Попробуйте позже.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
      });
    }
  });

  // Разблокировка пользователей
  bot.action('admin_unban_user', async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    ctx.session = ctx.session || {};
    ctx.session.waitingForUnbanUserId = true;
    ctx.session.waitingForBanUserId = false; // Clear ban flag
    ctx.session.waitingForBroadcastMessage = false; // Clear broadcast flag
    ctx.editMessageText(t(ctx.session?.language || 'ru', 'admin_unban_confirm'), {
      reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language || 'ru', 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] },
      parse_mode: 'Markdown'
    });
  });

  // Разблокировка пользователя по ID
  bot.action(/^unblock_user_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    const telegramUserId = parseInt(ctx.match[1]);

    try {
      const user = await getUser(telegramUserId);
      if (!user) {
        ctx.editMessageText(`❌ Пользователь с Telegram ID ${telegramUserId} не найден в базе данных.`, {
          reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
        });
        return;
      }

      const success = await unbanUser(user.id);
      if (success) {
        const stats = await getUserStats(user.telegram_id);
        const userLang = user.language || 'ru';

        let keyboard = [
          [t(userLang, 'keyboard_available_tasks'), t(userLang, 'keyboard_add_project')],
          [t(userLang, 'keyboard_rating'), t(userLang, 'keyboard_balance')],
          [t(userLang, 'keyboard_settings')]
        ];

        if (stats.projectsCount > 0) {
          keyboard.splice(1, 0, [t(userLang, 'keyboard_my_projects')]);
        }

        if (user.telegram_id === 366323850) {
          keyboard.push([t(userLang, 'keyboard_admin_panel')]);
        }

        await ctx.telegram.sendMessage(user.telegram_id, t(userLang, 'user_unbanned_notify_user'), {
          reply_markup: { keyboard: keyboard, resize_keyboard: true },
          parse_mode: 'Markdown'
        });

        ctx.editMessageText(t(adminLang, 'admin_user_unbanned', { id: user.telegram_id, username: user.username || t(adminLang, 'not_specified') }), {
          reply_markup: { inline_keyboard: [[{ text: t(adminLang, 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
        });
      } else {
        const adminLang = ctx.session?.language || 'ru';
        ctx.editMessageText(t(adminLang, 'unban_user_failed', { id: user.telegram_id, username: user.username || t(adminLang, 'not_specified') }), {
          reply_markup: { inline_keyboard: [[{ text: t(adminLang, 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
        });
      }
    } catch (error) {
      const adminLang = ctx.session?.language || 'ru';
      ctx.editMessageText(t(adminLang, 'error_unlocking_user'), {
        reply_markup: { inline_keyboard: [[{ text: t(adminLang, 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
      });
    }
  });

  // Блокировка пользователей
  bot.action('admin_ban_user', async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    ctx.session = ctx.session || {};
    ctx.session.waitingForBanUserId = true;
    ctx.editMessageText(t(ctx.session?.language || 'ru', 'admin_ban_confirm'), {
      reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language || 'ru', 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] },
      parse_mode: 'Markdown'
    });
  });

  // Принятие заявки на разблокировку
  bot.action(/^approve_unlock_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    const userId = parseInt(ctx.match[1]);

    try {
      const user = await getUserById(userId);
      if (!user) {
        ctx.editMessageText(`❌ Пользователь не найден.`, {
          reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в меню', callback_data: 'back_to_admin' }]] }
        });
        return;
      }

      const isBanned = await isUserBanned(user.telegram_id);
      if (!isBanned) {
        ctx.editMessageText(`❌ Пользователь не забанен.`, {
          reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в меню', callback_data: 'back_to_admin' }]] }
        });
        return;
      }

      const success = await unbanUser(userId);
      if (!success) {
        ctx.editMessageText(`❌ Ошибка при разблокировке.`, {
          reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в меню', callback_data: 'back_to_admin' }]] }
        });
        return;
      }

      // Уведомить пользователя
      const stats = await getUserStats(user.telegram_id);
      const userLang = user.language || 'ru';

      let keyboard = [
        [t(userLang, 'keyboard_available_tasks'), t(userLang, 'keyboard_add_project')],
        [t(userLang, 'keyboard_rating'), t(userLang, 'keyboard_balance')],
        [t(userLang, 'keyboard_settings')]
      ];

      if (stats.projectsCount > 0) {
        keyboard.splice(1, 0, [t(userLang, 'keyboard_my_projects')]);
      }

      if (user.telegram_id === 366323850) {
        keyboard.push([t(userLang, 'keyboard_admin_panel')]);
      }

      try {
        await ctx.telegram.sendMessage(user.telegram_id, t(userLang, 'user_unbanned_notify_user'), {
          reply_markup: { keyboard: keyboard, resize_keyboard: true },
          parse_mode: 'Markdown'
        });
      } catch (error) {
      }

      const adminLang = ctx.session?.language || 'ru';
      ctx.editMessageText(t(adminLang, 'admin_user_unbanned', { id: user.telegram_id, username: user.username || t(adminLang, 'not_specified') }), {
        reply_markup: { inline_keyboard: [[{ text: t(adminLang, 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
      });
    } catch (error) {
      const adminLang = ctx.session?.language || 'ru';
      ctx.editMessageText(t(adminLang, 'error_processing_request'), {
        reply_markup: { inline_keyboard: [[{ text: t(adminLang, 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
      });
    }
  });

  // Отклонение заявки на разблокировку
  bot.action(/^decline_unblock_(\d+)$/, async (ctx) => {
    if (ctx.from.id !== 366323850) return;

    const userId = parseInt(ctx.match[1]);

    try {
      // Получить пользователя для определения языка
      const user = await getUser(userId);
      const userLanguage = user ? (user.language || 'ru') : 'ru';
      const declineMessage = t(userLanguage, 'user_unban_request_rejected');

      await ctx.telegram.sendMessage(userId, declineMessage, { parse_mode: 'Markdown' });
      const adminLang = ctx.session?.language || 'ru';
      ctx.editMessageText(t(adminLang, 'admin_unblock_request_declined', { id: userId }), {
        reply_markup: { inline_keyboard: [[{ text: t(adminLang, 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
      });
    } catch (error) {
      const adminLang = ctx.session?.language || 'ru';
      ctx.editMessageText(t(adminLang, 'error_processing_request'), {
        reply_markup: { inline_keyboard: [[{ text: t(adminLang, 'back_to_admin_menu'), callback_data: 'back_to_admin' }]] }
      });
    }
  });



  // Продолжение после выбора языка
  bot.action('continue_after_language', async (ctx) => {
    try {
      await ctx.answerCbQuery();
    } catch (error) {
    }

    const { t } = require('../utils/lang');
    const { getUser, getUserStats } = require('../database/models');
    const { getMainKeyboard } = require('../utils/helpers');

    const userObj = await getUser(ctx.from.id);
    const stats = await getUserStats(ctx.from.id);
    const language = userObj.language || 'ru';
    const keyboard = getMainKeyboard(userObj, language);

    // Отправляем новое сообщение и удаляем старое
    await ctx.reply(t(language, 'welcome'), {
      reply_markup: { keyboard: keyboard, resize_keyboard: true },
      parse_mode: 'Markdown'
    });

    // Попытка удалить старое сообщение
    try {
      await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
    } catch (error) {
    }
  });

  // Admin panel and back to admin handlers
  bot.action('admin_panel', async (ctx) => {
    if (ctx.from.id !== 366323850) return;
    ctx.editMessageText(t(ctx.session?.language || 'ru', 'admin_panel'), {
      reply_markup: { inline_keyboard: getAdminKeyboard(ctx.session?.language || 'ru') },
      parse_mode: 'Markdown'
    });
  });

  bot.action('back_to_admin', async (ctx) => {
    if (ctx.from.id !== 366323850) return;
    ctx.editMessageText(t(ctx.session?.language || 'ru', 'admin_panel'), {
      reply_markup: { inline_keyboard: getAdminKeyboard(ctx.session?.language || 'ru') },
      parse_mode: 'Markdown'
    });
  });

}

module.exports = { registerActions };
