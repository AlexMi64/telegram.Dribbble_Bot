require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const { db, getUserDetailedStats, getPendingComplaints, getComplaintById, updateComplaintStatus, banUser, getUserBans, isUserBanned, unbanUser, getUserWarningsCount, incrementUserWarnings, resetUserWarnings, getAllActiveUsers } = require('./db');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session());

bot.use(async (ctx, next) => {
  // Инициализация сессии если нужно
  ctx.session = ctx.session || {};

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
});

bot.start(async (ctx) => {
  const user = await registerUser(ctx.from.id, ctx.from.username);
  const stats = await getUserStats(ctx.from.id); // Получаем статистику чтобы знать количество проектов

  // Проверяем заблокирован ли пользователь
  const isBanned = await isUserBanned(ctx.from.id);

  if (isBanned && ctx.from.id !== 366323850) {
    // Специальная клавиатура для заблокированных пользователей
    const banKeyboard = [
      ['🔓 Подать заявку на разблокировку']
    ];

    return ctx.reply('🚫 **Ваш аккаунт заблокирован**\n\n' +
      'Причина: Многократные нарушения правил взаимной поддержки.\n\n' +
      'Если считаете блокировку несправедливой, обратитесь к администратору.\n\n' +
      'Вы можете подать заявку на разблокировку.', {
      reply_markup: { keyboard: banKeyboard, resize_keyboard: true },
      parse_mode: 'Markdown'
    });
  }

  // Определяем клавиатуру на основе ID пользователя
  let keyboard = [
    ['🎯 Доступные задания', '➕ Добавить проект'],
    ['📂 Мои проекты'],
    ['📈 Мой рейтинг', '💰 Баланс'],
    ['⚙️ Настройки']
  ];

  // Если это администратор (ID 366323850), добавляем кнопку админ панели
  if (ctx.from.id === 366323850) {
    keyboard.push(['🏛️ Админ панель']); // Добавляем в новый ряд
  }

  ctx.reply('🤝 **Взаимная поддержка дизайнеров в DesignLike**\n\n' +
    '🎨 Behance | Dribbble | ArtStation\n\n' +
    '🔥 Система взаимной рекламы: помогаем друг другу расти!\n' +
    '• Публикуй свои проекты и получай поддержку от сообщества\n' +
    '• Зарабатывай кристаллы 💎 за выполнения заданий\n' +
    '• Обменивайся лайками, подписками и комментариями\n\n' +
    '⚠️ ВАЖНО: Все действия проверяются! Нарушители блокируются.\n\n' +
    '🚀 Начни прямо сейчас - добавь свой первый проект и получай поддержку!\n\n' +
    'Выберите действие:', {
    reply_markup: { keyboard: keyboard, resize_keyboard: true },
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
});

bot.hears('📈 Мой рейтинг', async (ctx) => {
  console.log(`📈 DEBUG: Получена команда "Мой рейтинг" от пользователя ${ctx.from.id} (${ctx.from.username})`);

  const user = await getUser(ctx.from.id);
  console.log(`📈 DEBUG: getUser результат: ${user ? 'найден' : 'не найден'}`);

  if (!user) {
    console.log('📈 DEBUG: Отправляем сообщение о регистрации');
    ctx.reply('Сначала зарегистрируйтесь через /start');
    return;
  }

  // Пересчитываем рейтинг на основе текущей статистики для точности
  await updateUserRating(ctx.from.id);

  // Получаем обновленные данные пользователя после пересчета
  const updatedUser = await getUser(ctx.from.id);

  const stats = await getUserStats(ctx.from.id);
  const level = getUserLevel(updatedUser.rating);

  let progressText = '';
  if (level.nextLevel) {
    const progress = updatedUser.rating >= level.maxPoints ? 0 : updatedUser.rating;
    const percentage = Math.round((progress / level.maxPoints) * 100);
    progressText = `\n⭐ Прогресс к уровню "${level.nextLevel}": ${progress}/${level.maxPoints} (${percentage}%)`;
  } else {
    progressText = '\n⭐ Максимальный уровень достигнут!';
  }

  let achievements = '';
  if (stats.actionsSent >= 5) achievements += '\n• 🏃‍♂️ Активный участник (+5 заданий)';
  if (stats.warningsReceived === 0) achievements += '\n• 🛡️ Честный дизайнер (нет предупреждений)';
  if (stats.projectsCount >= 3) achievements += '\n• 📂 Творческий (3+ проекта)';
  if (stats.currentCredits >= 500) achievements += '\n• 💎 Богатый дизайнер (500+ 💎)';
  if (stats.creditsSpent >= 1000) achievements += '\n• 💰 Бизнес-дизайнер (1000+ 💎 потрачено)';
  if (stats.actionsSent >= 50) achievements += '\n• 🧑‍🤝‍🧑 Социальный (50+ человек помогли)';
  if (level.name === 'Эксперт') achievements += '\n• 🌟 Эксперт (достигнут максимальный уровень)';
  if (stats.daysActive >= 30) achievements += '\n• ⚡ Ветеран (30+ дней в системе)';
  if (stats.actionsReceived >= 100) achievements += '\n• 🏅 Генерал (100+ действий получено)';
  if (stats.behanceActions >= 10) achievements += '\n• 🎨 Behance эксперт (10+ на Behance)';
  if (stats.dribbbleActions >= 10) achievements += '\n• 🎯 Dribbble эксперт (10+ на Dribbble)';
  if (stats.artstationActions >= 10) achievements += '\n• ✨ ArtStation эксперт (10+ на ArtStation)';
  if (achievements === '') achievements = '\n• 🌱 Новичок (начните выполнять задания)';

  const message = `${level.emoji} **Ваш уровень: ${level.name}**\n\n📊 Рейтинг: ${updatedUser.rating} баллов${progressText}\n\n📈 **Статистика активности:**
• Выполненных заданий: ${stats.actionsSent}
• Людей помогли вашим проектам: ${stats.actionsReceived}
• Добавленных проектов: ${stats.projectsCount}
• Надежность: ${stats.warningsReceived === 0 ? 'Высокая ✅' : stats.warningsReceived < 3 ? 'Средняя ⚠️' : 'Низкая ❌'}

🏆 **Достижения:**${achievements}

🗓️ В системе ${stats.daysActive} ${stats.daysActive === 1 ? 'день' : 'дней'}`;

  console.log('📈 DEBUG: Отправляем сообщение с рейтингом');
  ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.hears('➕ Добавить проект', (ctx) => {
  ctx.session = ctx.session || {};
  ctx.reply('Отправьте ссылку на ваш проект (Behance, Dribbble, ArtStation):');
  ctx.session.waitingForProject = true;
});

bot.hears('🎯 Доступные задания', async (ctx) => {
  console.log(`🎯 DEBUG: Получена команда "Доступные задания" от пользователя ${ctx.from.id} (${ctx.from.username})`);

  const user = await getUser(ctx.from.id);
  console.log(`🎯 DEBUG: getUser результат: ${user ? 'найден' : 'не найден'}, ID: ${user?.id}, credits: ${user?.credits}`);

  if (!user) {
    console.log('🎯 DEBUG: Отправляем сообщение о регистрации');
    ctx.reply('Сначала зарегистрируйтесь через /start');
    return;
  }

  const internalUserId = user.id;

  const platforms = [];
  if (user.behance_username) platforms.push('behance');
  if (user.dribbble_username) platforms.push('dribbble');
  if (user.artstation_username) platforms.push('artstation');

  console.log(`🎯 DEBUG: Подключенные платформы: ${platforms.join(', ')}`);

  if (platforms.length === 0) {
    console.log('🎯 DEBUG: Нет подключенных платформ, отправляем сообщение о настройках');
    ctx.reply('🔗 **Чтобы получать доступ к заданиям от других пользователей, настройте свои профили на платформах!**\n\nПерейдите в ⚙️ Настройки -> 🔗 Настроить профили и укажите ваши аккаунты Behance, Dribbble или ArtStation.\n\nЭто позволит вам взаимодействовать с заданиями на этих платформах.', {
      reply_markup: { inline_keyboard: [[{ text: '⚙️ Перейти к настройкам', callback_data: 'settings_profiles' }]] },
      parse_mode: 'Markdown'
    });
    return;
  }

  const projects = await getProjectsForAction(internalUserId, platforms);
  console.log(`🎯 DEBUG: Найдено проектов для задания: ${projects.length}`);

  if (projects.length === 0) {
    console.log('🎯 DEBUG: Нет доступных проектов, отправляем сообщение');
    ctx.reply('Пока нет доступных заданий на ваших привязанных платформах. Добавьте свой проект сначала, чтобы другие могли выполнить ваши задания.');
    return;
  }

  console.log('🎯 DEBUG: Отправляем предупреждение');
  ctx.reply('⚠️ **ВАЖНО:** Чтобы получить кристаллы 💎, вы ДОЛЖНЫ поставить настоящий лайк/подписку/комментарий на сайт платформы (Behance/Dribbble/ArtStation).\n\nСистема основана на взаимном доверии. Несоблюдение правил приведет к блокировке.');

  // Показываем только одно задание (первый доступный проект)
  if (projects.length > 0) {
    const project = projects[0]; // Берем только первый проект
    const projectOwner = await getUserById(project.user_id);
    const username = projectOwner ? (projectOwner.username || 'дизайнер') : 'дизайнер';
    const ownerId = projectOwner ? projectOwner.id : 0;

    const availableActions = await getUndoneActionsForProject(project.id, internalUserId);

    const keyboard = [
      ...availableActions.map(action => ([{
        text: getActionText(action),
        callback_data: `${action}_project_${project.id}`
      }])),
      [{ text: '🚨 Пожаловаться на нарушение', callback_data: `complain_${project.id}_${ownerId}` }]
    ].filter(row => row.length > 0);

    const actionType = availableActions[0];
    const credits = await getCreditsForAction(project.id, actionType);
    const actionWord = actionType === 'like' ? 'лайк' : actionType === 'follow' ? 'подписку' : actionType === 'comment' ? 'комментарий' : 'просмотр';

    let actionVerb;
    switch (actionType) {
      case 'view':
        actionVerb = 'Посмотреть';
        break;
      case 'like':
        actionVerb = 'Поставить лайк';
        break;
      case 'follow':
        actionVerb = 'Подписаться';
        break;
      case 'comment':
        actionVerb = 'Оставить комментарий';
        break;
      default:
        actionVerb = 'Посмотреть';
    }

    console.log(`🎯 DEBUG: Отправляем проект ${project.id} с действием ${actionType}`);
    await ctx.reply(`🎯 **${actionVerb} проекту**\n\n🔗 ${project.url}\n\n💰 +${credits} 💎 после выполнения\n\n⚠️ Обязательный настоящий ${actionWord} на сайте`, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }
});

bot.hears('💰 Баланс', async (ctx) => {
  console.log(`🔍 ДЕБАГ: Показ баланса пользователю ${ctx.from.id}`);

  const user = await getUser(ctx.from.id);
  if (!user) {
    console.log('❌ ДЕБАГ: Пользователь не зарегистрирован');
    ctx.reply('Сначала зарегистрируйтесь через /start');
    return;
  }

  console.log(`✅ ДЕБАГ: Баланс пользователя ${ctx.from.username || ctx.from.id}: ${user.credits} кристаллов`);
  console.log('📋 ДЕБАГ: Показ кнопок покупки кристаллов');

  ctx.reply(`Ваши кристаллы 💎: ${user.credits}\n\nКупить кристаллы 💎:`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '100 💎 - 100 ₽', callback_data: 'buy_100' }],
        [{ text: '500 💎 - 450 ₽ (скидка)', callback_data: 'buy_500' }],
        [{ text: '1000 💎 - 850 ₽ (скидка)', callback_data: 'buy_1000' }]
      ]
    }
  });
});

bot.hears('📊 Статистика', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) {
    ctx.reply('Сначала зарегистрируйтесь через /start');
    return;
  }

  const stats = await getUserDetailedStats(user.telegram_id);
  const avgEarningsPerTask = stats.tasksCompleted > 0 ? Math.round(stats.crystalsEarned / stats.tasksCompleted) : 0;

  const actionStats = `👀 Просмотры: ${stats.view || 0}\n❤️ Лайки: ${stats.like || 0}\n💬 Комментарии: ${stats.comment || 0}\n👥 Подписки: ${stats.follow || 0}`;

  const weekActivity = `📅 За последнюю неделю:\n• Выполнено заданий: ${stats.tasksWeek}\n• Заработано 💎: ${stats.crystalsWeek}\n• Средний темп: ${stats.dailyAverage} в день`;

  const socialMetrics = `🤝 Взаимопомощь:\n• Я помог дизайнерам: ${stats.iHelpedOthers}\n• Помогли мне: ${stats.othersHelpedMe}\n• Соотношение: ${stats.iHelpedOthers + stats.othersHelpedMe > 0 ? (stats.iHelpedOthers > stats.othersHelpedMe ? 'даю больше' : 'получаю больше') : 'в балансе'}`;

  const efficiencyBlock = `📈 Эффективность:\n• Засчитано: ${stats.successRate}%\n• Всего задач: ${stats.tasksTotal}`;

  const bestDayBlock = stats.bestDayWeek ? `\n🎯 Лучший день: ${stats.bestDayWeek.weekday} (${stats.bestDayWeek.tasks} заданий)` : '';

  const message = `📊 **Ваша подробная статистика**\n\n💰 **Общая активность:**
• За все время: ${stats.tasksCompleted} заданий
• Заработано: ${stats.crystalsEarned} 💎
• Средние доход: ${avgEarningsPerTask} 💎 за задание
• Добавлено проектов: ${stats.projectsAdded}

${weekActivity}

${actionStats}

${socialMetrics}

${efficiencyBlock}${bestDayBlock}`;

  ctx.reply(message, { parse_mode: 'Markdown' });
});

bot.hears('🏛️ Админ панель', async (ctx) => {
  console.log(`🏛️ АДМИН ПАНЕЛЬ: Запрос от ID ${ctx.from.id}, username ${ctx.from.username}`);

  if (ctx.from.id !== 366323850) {
    console.log(`❌ Запрос в админ панель от неадмина! ID: ${ctx.from.id}`);
    await ctx.reply(`❌ У вас нет доступа к админ панели.`);
    return;
  }

  const keyboard = [
    [{ text: '📋 Просмотреть жалобы', callback_data: 'admin_view_complaints' }],
    [{ text: '📤 Рассылка', callback_data: 'admin_broadcast' }],
    [{ text: '🚫 Заблокировать пользователя', callback_data: 'admin_ban_user' }],
    [{ text: '🔓 Разблокировать пользователя', callback_data: 'admin_unban_user' }],
    [{ text: '📊 Статистика бота', callback_data: 'admin_stats' }]
  ];

  await ctx.reply('🏛️ **Админ панель**\n\nВыберите действие для управления ботом:', {
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: 'Markdown'
  });
});

bot.hears('📂 Мои проекты', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) {
    ctx.reply('Сначала зарегистрируйтесь через /start');
    return;
  }

  const projects = await getUserProjects(ctx.from.id);

  if (projects.length === 0) {
    ctx.reply('📂 У вас пока нет проектов.\n\nДобавьте свой первый проект с помощью кнопки ➕ **Добавить проект**!', {
      reply_markup: { inline_keyboard: [[{ text: '➕ Добавить проект', callback_data: 'add_project' }]] },
      parse_mode: 'Markdown'
    });
    return;
  }

  for (const project of projects) {
    // Получить статистику действий по проекту
    const actions = await getActionsForProject(project.id);
    const actionsCount = actions.length;

    const keyboard = [
      [{ text: '📋 Посмотреть исполнителей', callback_data: `view_project_performers_${project.id}` }],
      [{ text: '❌ Удалить проект', callback_data: `delete_project_${project.id}` }]
    ];

    await ctx.reply(`🎨 **Проект:** ${project.url}\n\n📊 Выполнено действий: ${actionsCount}\n📅 Добавлено: ${new Date(project.added_date).toLocaleDateString('ru-RU')}`, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
    });
  }
});

bot.hears('⚙️ Настройки', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) {
    ctx.reply('Сначала зарегистрируйтесь через /start');
    return;
  }

  const keyboard = [
    [{ text: '🔗 Настроить профили', callback_data: 'settings_profiles' }],
    [{ text: '🔙 Назад в меню', callback_data: 'back_to_main' }]
  ];

  ctx.reply('⚙️ Настройки\n\nЗдесь вы можете настроить свой профиль для полноценного использования системы.', {
    reply_markup: { inline_keyboard: keyboard }
  });
});

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  if (ctx.session && ctx.session.waitingForProject) {
    const url = ctx.message.text.trim();
    if (!url.startsWith('http')) {
      ctx.reply('Отправьте полную ссылку на проект (начинающуюся с http или https). Убедитесь, что ссылка ведет на Behance, Dribbble или ArtStation.');
      return;
    }
    if (!isValidProjectUrl(url)) {
      ctx.reply('Неверная ссылка. Убедитесь, что ссылка ведет на профиль, проект или работу Behance, Dribbble или ArtStation.');
      return;
    }

    const platform = detectPlatform(url);
    if (platform === 'unknown') {
      ctx.reply('Неверная ссылка. Убедитесь, что ссылка ведет на профиль, проект или работу Behance, Dribbble или ArtStation.');
      return;
    }
    ctx.session.pendingProject = { url, platform, userId: ctx.from.id };
    ctx.session.waitingForProject = false;

    showProjectActionsMenu(ctx);
    return;
  }

  if (ctx.session && ctx.session.waitingForBehance) {
    const input = ctx.message.text.trim();
    const username = extractUsername(input, 'behance');

    if (username) {
      await updateUserProfile(ctx.from.id, 'behance', username);
      ctx.reply(`✅ Behance профиль настроен: https://behance.net/${username}\n\nТеперь вы можете использовать API верификацию для Behance проектов!`);
    } else {
      ctx.reply('❌ Неверный формат. Укажите только username (например: alexdesign) или полный URL профиля.');
    }

    ctx.session.waitingForBehance = false;
    return;
  }

  if (ctx.session && ctx.session.waitingForDribbble) {
    const input = ctx.message.text.trim();
    const username = extractUsername(input, 'dribbble');

    if (username) {
      await updateUserProfile(ctx.from.id, 'dribbble', username);
      ctx.reply(`✅ Dribbble профиль настроен: https://dribbble.com/${username}\n\nТеперь вы можете использовать API верификацию для Dribbble проектов!`);
    } else {
      ctx.reply('❌ Неверный формат. Укажите только username (например: alexdesign) или полный URL профиля.');
    }

    ctx.session.waitingForDribbble = false;
    return;
  }

  if (ctx.session && ctx.session.waitingForArtstation) {
    const input = ctx.message.text.trim();
    const username = extractUsername(input, 'artstation');

    if (username) {
      await updateUserProfile(ctx.from.id, 'artstation', username);
      ctx.reply(`✅ ArtStation профиль настроен: https://artstation.com/${username}\n\nТеперь вы можете использовать API верификацию для ArtStation проектов!`);
    } else {
      ctx.reply('❌ Неверный формат. Укажите только username (например: alexdesign) или полный URL профиля.');
    }

    ctx.session.waitingForArtstation = false;
    return;
  }

  if (ctx.session && ctx.session.waitingForViewsCount) {
    const count = parseInt(ctx.message.text.trim());
    if (isNaN(count) || count < 1 || count > 1000) {
      ctx.reply('❌ Введите корректное число от 1 до 1000.');
      return;
    }
    ctx.session.selectedActions.views = count;
    ctx.session.waitingForViewsCount = false;
    await showProjectActionsMenu(ctx);
    return;
  }

  if (ctx.session && ctx.session.waitingForLikesCount) {
    const count = parseInt(ctx.message.text.trim());
    if (isNaN(count) || count < 1 || count > 1000) {
      ctx.reply('❌ Введите корректное число от 1 до 1000.');
      return;
    }
    ctx.session.selectedActions.likes = count;
    ctx.session.waitingForLikesCount = false;
    await showProjectActionsMenu(ctx);
    return;
  }

  if (ctx.session && ctx.session.waitingForCommentsCount) {
    const count = parseInt(ctx.message.text.trim());
    if (isNaN(count) || count < 1 || count > 1000) {
      ctx.reply('❌ Введите корректное число от 1 до 1000.');
      return;
    }
    ctx.session.selectedActions.comments = count;
    ctx.session.waitingForCommentsCount = false;
    await showProjectActionsMenu(ctx);
    return;
  }

  if (ctx.session && ctx.session.waitingForFollowsCount) {
    const count = parseInt(ctx.message.text.trim());
    if (isNaN(count) || count < 1 || count > 1000) {
      ctx.reply('❌ Введите корректное число от 1 до 1000.');
      return;
    }
    ctx.session.selectedActions.follows = count;
    ctx.session.waitingForFollowsCount = false;
    await showProjectActionsMenu(ctx);
    return;
  }

  if (ctx.session && ctx.session.waitingForBroadcastMessage) {
    if (ctx.from.id !== 366323850) return;

    const messageText = ctx.message.text.trim();
    if (!messageText) {
      ctx.reply('❌ Сообщение не может быть пустым.');
      return;
    }

    // Сохраняем текст и переключаем на подтверждение
    ctx.session.broadcastMessage = messageText;
    ctx.session.waitingForBroadcastMessage = false;

    // Показываем подтверждение
    ctx.reply(`📤 **Подтверждение рассылки**\n\n🚨 **Внимание!** Сообщение будет отправлено ВСЕМ активным пользователям бота (не заблокированным пользователям)!\n\n💬 **Текст сообщения:**\n${messageText}\n\nВыберите действие:`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📤 Отправить рассылку', callback_data: 'confirm_broadcast_send' }],
          [{ text: '❌ Отменить', callback_data: 'cancel_broadcast' }]
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
      ctx.reply('❌ Неверный формат ID пользователя. Укажите только Telegram ID пользователя.');
      return;
    }

    try {
      // Получаем пользователя по telegram_id
      const user = await getUser(telegramUserId);
      if (!user) {
        ctx.reply(`❌ Пользователь с Telegram ID ${telegramUserId} не найден в базе данных.`);
        return;
      }

      // Проверяем, заблокирован ли пользователь
      const isBanned = await isUserBanned(telegramUserId);
      if (!isBanned) {
        ctx.reply('❌ Пользователь не заблокирован.');
        return;
      }

      // Разбаниваем по внутреннему id
      const success = await unbanUser(user.id);
      if (success) {
        // Обновляем статистику
        const stats = await getUserStats(user.telegram_id);

        // Формируем клавиатуру как в start() для активного пользователя
        let keyboard = [
          ['🎯 Доступные задания', '➕ Добавить проект'],
          ['📈 Мой рейтинг', '💰 Баланс'],
          ['📊 Статистика', '⚙️ Настройки']
        ];

        // Если у пользователя есть проекты, добавляем кнопку "Мои проекты"
        if (stats.projectsCount > 0) {
          keyboard.splice(1, 0, ['📂 Мои проекты']);
        }

        // Если это администратор (ID 366323850), добавляем кнопку админ панели
        if (user.telegram_id === 366323850) {
          keyboard.push(['🏛️ Админ панель']);
        }

        // Отправляем уведомление о разблокировке сразу с обновленным меню
        await ctx.telegram.sendMessage(user.telegram_id, `🛡️ **Ваша блокировка снята**\n\nВаш аккаунт разблокирован администратором. Добро пожаловать обратно!`, {
          reply_markup: { keyboard: keyboard, resize_keyboard: true },
          parse_mode: 'Markdown'
        });

        ctx.reply(`✅ Пользователь ${user.telegram_id} разблокирован. Пользователь уведомлен.`);
      } else {
        ctx.reply(`❌ Не удалось разблокировать пользователя ${user.telegram_id} (${user.username}). Возможно, он не был заблокирован.`);
      }
    } catch (error) {
      ctx.reply('❌ Ошибка при разблокировке пользователя.');
      console.error('Unban user error:', error);
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
      ctx.reply('❌ Неверный формат ID пользователя. Используйте: `123456789 причина бана`');
      return;
    }

    try {
      // Получить пользователя по Telegram ID
      const user = await getUser(telegramUserId);
      if (!user) {
        ctx.reply(`❌ Пользователь с Telegram ID ${telegramUserId} не найден в базе данных.`);
        return;
      }

      // Заблокировать по внутреннему ID
      await banUser(user.id, reason, ctx.from.id);

      // Отправить уведомление заблокированному пользователю
      try {
        await ctx.telegram.sendMessage(telegramUserId, `🚫 **Ваш аккаунт заблокирован администратором**\n\nПричиной блокировки стало нарушение правил системы.\n\nВы можете подать заявку на разблокировку ниже.`, {
          parse_mode: 'Markdown',
          reply_markup: {
            keyboard: [['🔓 Подать заявку на разблокировку']],
            resize_keyboard: true
          }
        });
        console.log(`✅ Уведомление о принудительном бане отправлено пользователю ${telegramUserId}`);
      } catch (error) {
        console.error(`❌ ОШИБКА отправки уведомления о принудительном бане пользователю ${telegramUserId}:`, error);
        ctx.reply(`🚫 Пользователь ${telegramUserId} заблокирован, но не удалось отправить уведомление.\n\nПричина: ${reason}`);
        return;
      }

      ctx.reply(`🚫 Пользователь ${telegramUserId} заблокирован.\n\nПричина: ${reason}`);
    } catch (error) {
      ctx.reply('❌ Ошибка при блокировке пользователя.');
      console.error('Ban user error:', error);
    }

    ctx.session.waitingForBanUserId = false;
    return;
  }

  if (ctx.message.text === '🔓 Подать заявку на разблокировку') {
    const isBanned = await isUserBanned(ctx.from.id);

    if (!isBanned) {
      ctx.reply('✅ Вы не заблокированы. Добро пожаловать обратно!');
      return;
    }

    // Проверяем время последней заявки (сессия не надежна, но для простоты)
    ctx.session = ctx.session || {};
    const now = Date.now();
    if (ctx.session.lastUnbanRequest && (now - ctx.session.lastUnbanRequest) < 86400000) { // 24 часа
      await ctx.reply('⚠️ **Вы уже подавали заявку**\n\n' +
        'Вы можете отправить новую заявку только через 24 часа после предыдущей.\n' +
        'Пожалуйста, подождите.', {
        reply_markup: { keyboard: [['🔓 Подать заявку на разблокировку']], resize_keyboard: true },
        parse_mode: 'Markdown'
      });
      return;
    }

    // Отправляем заявку админу
    const adminId = 366323850;
    const adminMessage = `🔓 **Заявка на разблокировку**\n\n` +
      `👤 Пользователь: @${ctx.from.username || 'не указан'} (${ctx.from.id})\n` +
      `📅 Дата: ${new Date().toLocaleString('ru-Ru')}\n\n` +
      `Пользователь подал заявку на разблокировку аккаунта. Используйте админ панель для разблокировки.`;

    try {
      const adminKeyboard = [
        [{ text: '🔓 Разблокировать', callback_data: `unblock_user_${ctx.from.id}` }],
        [{ text: '❌ Отказать', callback_data: `decline_unblock_${ctx.from.id}` }]
      ];

      await ctx.telegram.sendMessage(adminId, adminMessage, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: adminKeyboard }
      });

      // Сохраняем время заявки в сессии
      ctx.session.lastUnbanRequest = now;

      await ctx.reply('✅ **Заявка на разблокировку отправлена администратору!**\n\n' +
        'Администратор рассмотрит вашу заявку в ближайшее время.\n' +
        'Если она будет одобрена, вам будет предоставлен доступ ко всем функциям бота.\n\n' +
        'Вы можете подать новую заявку не ранее, чем через 24 часа.', {
        reply_markup: { keyboard: [['🔓 Подать заявку на разблокировку']], resize_keyboard: true },
        parse_mode: 'Markdown'
      });
    } catch (error) {
      console.error('Ошибка отправки заявки на разблокировку:', error);
      ctx.reply('❌ Ошибка при отправке заявки. Попробуйте позже.', {
        reply_markup: { keyboard: [['🔓 Подать заявку на разблокировку']], resize_keyboard: true },
        parse_mode: 'Markdown'
      });
    }
    return;
  }
});

// Команда /admin - используем hears для надежности
// ГЛОБАЛЬНЫЙ ДЕБАГ - ловим все сообщения
bot.on('message', async (ctx, next) => {
  console.log(`📨 ВХОДЯЩЕЕ СООБЩЕНИЕ: "${ctx.message.text}" от ${ctx.from.id} (${ctx.from.username})`);

  // Проверяем не заблокирован ли пользователь
  if (ctx.from.id !== 366323850) { // Админ может все делать
    const isBanned = await isUserBanned(ctx.from.id);
    if (isBanned) {
      console.log(`🚫 ЗАБЛОКИРОВАННЫЙ ПОЛЬЗОВАТЕЛЬ: ID ${ctx.from.id} (${ctx.from.username}) пытается использовать бота`);

      // Специальная клавиатура для заблокированных пользователей
      const banKeyboard = [
        ['🔓 Подать заявку на разблокировку']
      ];

      await ctx.reply(
        '🚫 **Ваш аккаунт заблокирован**\n\n' +
        'Причина: Многократные нарушения правил взаимной поддержки.\n\n' +
        'Если считаете блокировку несправедливой, обратитесь к администратору.',
        {
          reply_markup: { keyboard: banKeyboard, resize_keyboard: true },
          parse_mode: 'Markdown'
        }
      );
      return; // Полностью блокируем любые действия заблокированных пользователей
    }
  }

  await next(); // Продолжаем обработку если не заблокирован
});

// Глобальная проверка callback_query для заблокированных пользователей
bot.on('callback_query', async (ctx, next) => {
  if (ctx.from.id !== 366323850) { // Админ может все делать
    const isBanned = await isUserBanned(ctx.from.id);
    if (isBanned) {
      console.log(`🚫 ЗАБЛОКИРОВАННЫЙ ПОЛЬЗОВАТЕЛЬ: ID ${ctx.from.id} (${ctx.from.username}) пытается использовать callback ${ctx.callbackQuery.data}`);

      // Специальная клавиатура для забокированных пользователей
      const banKeyboard = [
        ['🚫 Подать заявку на разблокировку']
      ];

      await ctx.reply(
        '🚫 **Ваш аккаунт заблокирован**\n\n' +
        'Причина: Многократные нарушения правил взаимной поддержки.\n\n' +
        'Если считаете блокировку несправедливой, обратитесь к администратору.',
        {
          reply_markup: { keyboard: banKeyboard, resize_keyboard: true },
          parse_mode: 'Markdown'
        }
      );
      await ctx.answerCbQuery();
      return; // Полностью блокируем callback для забокированных пользователей
    }
  }

  await next();
});

bot.hears('/admin', async (ctx) => {
  console.log(`🔧 /ADMIN: КОМАНДА ОБНАРУЖЕНА! ID: ${ctx.from.id}, username: ${ctx.from.username}`);
  console.log(`🔧 /ADMIN: ТЕКСТ СООБЩЕНИЯ: "${ctx.message.text}"`);

  if (ctx.from.id !== 366323850) {
    console.log(`❌ Доступ запрещен для ID: ${ctx.from.id}`);
    await ctx.reply(`❌ Доступ запрещен. Ваш ID: ${ctx.from.id}`);
    return;
  }

  const keyboard = [
    [{ text: '📋 Просмотреть жалобы', callback_data: 'admin_view_complaints' }],
    [{ text: '📤 Рассылка', callback_data: 'admin_broadcast' }],
    [{ text: '🚫 Заблокировать пользователя', callback_data: 'admin_ban_user' }],
    [{ text: '🔓 Разблокировать пользователя', callback_data: 'admin_unban_user' }],
    [{ text: '📊 Статистика бота', callback_data: 'admin_stats' }]
  ];

  ctx.reply('🏛️ **Админ панель**\n\nВыберите действие:', {
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: 'Markdown'
  });
});

bot.hears(/^admin$/i, async (ctx) => {
  console.log(`🔧 ADMIN TEXT: Вызвал пользователь ID: ${ctx.from.id}, username: ${ctx.from.username}`);
  await ctx.reply('Используйте команду /admin');
});

// Обработка админ действий
bot.action('admin_broadcast', async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  ctx.session = ctx.session || {};
  ctx.session.waitingForBroadcastMessage = true;

  ctx.editMessageText('📤 **Рассылка сообщения всем пользователям**\n\nОтправьте сообщение, которое будет разослано всем активным пользователям бота (не заблокированным).\n\n⚠️ **Внимание:** Сообщение будет отправлено немедленно!', {
    reply_markup: { inline_keyboard: [[{ text: '❌ Отменить', callback_data: 'back_to_admin' }]] },
    parse_mode: 'Markdown'
  });
});

bot.action('admin_view_complaints', async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  const complaints = await getPendingComplaints();

  if (complaints.length === 0) {
    ctx.editMessageText('✅ Нет новых жалоб.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
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

bot.action(/^view_project_performers_(\d+)$/, async (ctx) => {
  const projectId = ctx.match[1];

  const actions = await getActionsForProject(projectId);

  const project = await getProjectById(projectId);
  if (!project) {
    ctx.editMessageText('❌ Проект не найден.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад к проектам', callback_data: 'user_projects' }]] }
    });
    return;
  }

  let message = '';

  const keyboard = [];

  if (actions.length === 0) {
    message += '📋 Пока никто не выполнил действий для этого проекта.';
  } else {
    actions.sort((a, b) => new Date(a.transaction_date) - new Date(b.transaction_date));

    for (const [index, action] of actions.entries()) {
      const performerUser = await getUserById(action.from_user_id);
      const platformUsername = action.platform === 'behance' ? action.behance_username :
                             action.platform === 'dribbble' ? action.dribbble_username :
                             action.platform === 'artstation' ? action.artstation_username : null;

      const actionText = action.action_type === 'like' ? 'Лайк' : action.action_type === 'follow' ? 'Подписка' : action.action_type === 'comment' ? 'Комментарий' : 'Просмотр';

      message += `Действие: ${actionText}\nНик: ${platformUsername || 'не указан'}\n\n`;

      keyboard.push([
        { text: `🚨 Пожаловаться`, callback_data: `complain_on_performer_${action.id}_${action.project_url ? action.project_url.split('/').pop() : 'project'}` },
        { text: '🔗 Открыть проект', url: action.project_url }
      ]);
    }
  }

  keyboard.push([{ text: '🔙 Назад к проектам', callback_data: 'user_projects' }]);

  ctx.editMessageText(message, {
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: 'Markdown',
    disable_web_page_preview: true
  });
});

bot.action(/^delete_project_(\d+)$/, async (ctx) => {
  const projectId = ctx.match[1];

  // Проверить что проект существует и принадлежит пользователю
  const project = await getProjectById(projectId);
  if (!project) {
    ctx.editMessageText('❌ Проект не найден.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
    });
    return;
  }

  if (project.user_id !== ctx.from.id) {
    ctx.editMessageText('❌ У вас нет прав на удаление этого проекта.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
    });
    return;
  }

  // Сохранить ID проекта для подтверждения
  ctx.session.projectToDelete = projectId;

  ctx.editMessageText('⚠️ **Подтверждение удаления проекта**\n\n' +
    '🔗 ' + project.url + '\n\n' +
    '‼️ **Это действие нельзя отменить!**\n' +
    'Будут удалены:\n' +
    '• Проект\n' +
    '• Все выполненные действия по нему\n' +
    '• Созданные жалобы\n\n' +
    'Удалить проект?', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Да, удалить', callback_data: 'confirm_delete_project' }],
        [{ text: '❌ Отменить', callback_data: 'user_projects' }]
      ]
    },
    parse_mode: 'Markdown'
  });
});

// Подтверждение удаления проекта
bot.action('confirm_delete_project', async (ctx) => {
  if (!ctx.session.projectToDelete) {
    ctx.editMessageText('❌ Ошибка: проект для удаления не найден.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
    });
    return;
  }

  const projectId = ctx.session.projectToDelete;
  const project = await getProjectById(projectId);

  if (!project || project.user_id !== ctx.from.id) {
    ctx.editMessageText('❌ Ошибка: проект не найден или нет прав.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
    });
    return;
  }

  try {
    // Начнем транзакцию для безопасного удаления
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        // Удалить связанные жалобы
        db.run('DELETE FROM complaints WHERE project_id = ?', [projectId]);

        // Удалить связанные транзакции действий
        db.run('DELETE FROM action_transactions WHERE to_project_id = ?', [projectId]);

        // Удалить связанные действия проекта
        db.run('DELETE FROM project_actions WHERE project_id = ?', [projectId]);

        // Удалить сам проект
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

    // Очистить сессию
    delete ctx.session.projectToDelete;

    ctx.editMessageText('✅ **Проект успешно удален!**\n\n' +
      'Все связанные данные были удалены.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К моим проектам', callback_data: 'user_projects' }]] },
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('Error deleting project:', error);
    delete ctx.session.projectToDelete;

    ctx.editMessageText('❌ Ошибка при удалении проекта. Попробуйте позже или обратитесь к администратору.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К проектам', callback_data: 'user_projects' }]] }
    });
  }
});

// Обработчик жалобы на конкретного исполнителя
bot.action(/^complain_on_performer_(\d+)_(.+)$/, async (ctx) => {
  const transactionId = ctx.match[1];
  const projectName = ctx.match[2];

  // Получить детали транзакции
  const transaction = await new Promise((resolve, reject) => {
    db.get(`SELECT at.*, p.url as project_url FROM action_transactions at
            JOIN projects p ON at.to_project_id = p.id
            WHERE at.id = ?`, [transactionId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });

  if (!transaction) {
    ctx.editMessageText('❌ Транзакция не найдена.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К исполнителям', callback_data: `view_project_performers_${transaction.to_project_id}` }]] },
      parse_mode: 'Markdown'
    });
    return;
  }

  // Получить проект чтобы проверить права
  const project = await getProjectById(transaction.to_project_id);

  // Проверить что текущий пользователь владелец проекта
  if (!project || project.user_id !== ctx.from.id) {
    ctx.editMessageText('❌ У вас нет прав на эту операцию.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К проекту', callback_data: `view_project_performers_${transaction.to_project_id}` }]] },
      parse_mode: 'Markdown'
    });
    return;
  }

  // Получить детали исполнителя
  const performer = await getUserById(transaction.from_user_id);
  const platformUsername = transaction.project_url.includes('behance.net') ? performer.behance_username :
                           transaction.project_url.includes('dribbble.com') ? performer.dribbble_username :
                           transaction.project_url.includes('artstation.com') ? performer.artstation_username : null;

  // Определить причину жалобы
  let complaintType = 'Не выполнил действие';
  switch (transaction.action_type) {
    case 'like': complaintType = 'Не поставил лайк'; break;
    case 'follow': complaintType = 'Не подписался'; break;
    case 'comment': complaintType = 'Не оставил комментарий'; break;
    case 'view': complaintType = 'Не просмотрели проект'; break;
  }

  // Получить внутренние id пользователей
  const complainantUser = await getUser(ctx.from.id);
  if (!complainantUser) {
    ctx.editMessageText('❌ Ошибка: жаловщик не найден в базе.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К исполнителям', callback_data: `view_project_performers_${transaction.to_project_id}` }]] },
      parse_mode: 'Markdown'
    });
    return;
  }

  // Создать жалобу
  const complaintId = await saveComplaint(
    complainantUser.id, // complainantId - владелец проекта, внутренний id
    transaction.from_user_id, // reportedUserId - исполнитель, уже внутренний id
    transaction.to_project_id, // projectId
    complaintType,
    `Автоматическая жалоба через проект: ${transaction.project_url}`
  );

  // Удалить исполнителя из проекта после жалобы
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM action_transactions WHERE id = ?', [transactionId], function(err) {
      if (err) reject(err);
      else resolve();
    });
  });

  // Сообщить админу
  const adminId = 366323850;
  const adminMessage = `🚨 **Новая жалоба от владельца проекта**\n\n` +
    `👤 **Владелец:** @${ctx.from.username} (@${ctx.from.id})\n` +
    `😤 **Исполнитель:** @${performer.username} (@${performer.id})\n` +
    `\n📱 **Ник для проверки:** ${platformUsername || 'не указан'}\n\n` +
    `🔗 **Проект:** ${transaction.project_url}\n` +
    `📝 **Причина:** ${complaintType}\n` +
    `📅 **Дата транзакции:** ${new Date(transaction.transaction_date).toLocaleString('ru-RU')}`;

  try {
    await ctx.telegram.sendMessage(adminId, adminMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Ошибка отправки уведомления админу:', error);
  }

  ctx.editMessageText(`✅ Жалоба отправлена!\n\nИсполнитель удален из проекта, повторная жалоба невозможна. Админ рассмотрит нарушение.`, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 К исполнителям', callback_data: `view_project_performers_${transaction.to_project_id}` }]] },
    parse_mode: 'Markdown'
  });
});

// Заглушка для возврата к "Мои проекты"
bot.action('user_projects', async (ctx) => {
  const user = await getUser(ctx.from.id);
  if (!user) return;

  const projects = await getUserProjects(ctx.from.id);

  if (projects.length === 0) {
    ctx.editMessageText('📂 У вас пока нет проектов.\n\nДобавьте свой первый проект с помощью кнопки ➕ **Добавить проект**!', {
      reply_markup: { inline_keyboard: [[{ text: '➕ Добавить проект', callback_data: 'add_project' }]] },
      parse_mode: 'Markdown'
    });
    return;
  }

  ctx.editMessageText('📂 **Ваши проекты:**\n\nВыберите проект для просмотра информации или управления:', {
    parse_mode: 'Markdown'
  });

  for (const project of projects) {
    const actions = await getActionsForProject(project.id);
    const actionsCount = actions.length;

    const keyboard = [
      [{ text: '📋 Посмотреть исполнителей', callback_data: `view_project_performers_${project.id}` }],
      [{ text: '❌ Удалить проект', callback_data: `delete_project_${project.id}` }]
    ];

    await ctx.reply(`🎨 **Проект:** ${project.url}\n\n📊 Выполнено действий: ${actionsCount}\n📅 Добавлено: ${new Date(project.added_date).toLocaleDateString('ru-RU')}`, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown'
    });
  }
});

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

  // Получить информацию о платформе исполнителя
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

bot.action(/^resolve_complaint_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  const complaintId = ctx.match[1];
  const complaint = await getComplaintById(complaintId);

  if (complaint) {
    // Отправляем уведомления участникам
    try {
      const complainantMessage = `🛡️ **Жалоба рассмотрена**\n\n❌ **Администратор решил:** Жалоба отклонена, администратор не нашел нарушения\n\n➡️ **Действие от:** ${complaint.reported_username ? `@${complaint.reported_username}` : 'пользователя'}\n💬 **Причина:** ${complaint.complaint_type}\n🔗 **Проект:** ${complaint.project_url}`;

      const reportedMessage = `⚠️ **Жалоба на вас рассмотрена**\n\n✅ **Решение администратора:** Нарушение не подтверждено, жалоба отклонена\n\n👤 **Жаловался:** ${complaint.complainant_username ? `@${complaint.complainant_username}` : 'пользователь'}\n💬 **Причина:** ${complaint.complaint_type}\n🔗 **Проект:** ${complaint.project_url}`;

      // Уведомляем только жаловщика
      if (complaint.complainant_telegram_id) {
        await ctx.telegram.sendMessage(complaint.complainant_telegram_id, complainantMessage, { parse_mode: 'Markdown' });
      }

      // НЕ уведомляем обвиняемого при отклонении жалобы - только когда нарушение подтверждено

      // Обновляем статус жалобы
      await updateComplaintStatus(complaintId, 'rejected', ctx.from.id);

      ctx.editMessageText('✅ Жалоба отклонена, уведомления отправлены участникам.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
      });

    } catch (error) {
      console.error('Ошибка отправки уведомлений:', error);
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

bot.action(/^reject_complaint_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  const complaintId = ctx.match[1];
  const complaint = await getComplaintById(complaintId);

  if (complaint) {
    try {
      console.log(`🔍 ДЕБАГ ЖАЛОБЫ: Обработка жалобы ID ${complaintId}, reported_user_id: ${complaint.reported_user_id}`);
      // Получаем текущее количество предупреждений для пользователя
      const currentWarnings = await getUserWarningsCount(complaint.reported_user_id);
      console.log(`⚠️ ДЕБАГ ЖАЛОБЫ: Количество предупреждений пользователя: ${currentWarnings}`);

      let complainantMessage = '';
      let reportedMessage = '';
      let actionText = '';

      if (currentWarnings === 0) {
        // Первое нарушение - предупреждение
        complainantMessage = `✅ **Жалоба рассмотрена**\n\n⚠️ **Администратор решил:** Нарушение подтверждено, исполнителю выдано первое предупреждение\n\n💬 **Причина жалобы:** ${complaint.complaint_type}\n🔗 **Проект:** ${complaint.project_url}`;
        reportedMessage = `⚠️ **Предупреждение за нарушение правил**\n\n👤 **Причина:** ${complaint.complaint_type}\n🔗 **Проект:** ${complaint.project_url}\n\n⚠️ **Это первое предупреждение.** При повторном нарушении вы получите второе, а после третьего - блокировка аккаунта.`;
        actionText = '⚠️ Исполнителю выдано первое предупреждение.';
        await incrementUserWarnings(complaint.reported_user_id);

      } else if (currentWarnings === 1) {
        // Второе нарушение - предупреждение о бане
        complainantMessage = `✅ **Жалоба рассмотрена**\n\n⚠️ **Администратор решил:** Нарушение подтверждено, исполнителю выдано второе предупреждение\n\n💬 **Причина жалобы:** ${complaint.complaint_type}\n🔗 **Проjekt:** ${complaint.project_url}`;
        reportedMessage = `⚠️ **Второе предупреждение за нарушение**\n\n👤 **Причина:** ${complaint.complaint_type}\n🔗 **Проект:** ${complaint.project_url}\n\n⚠️ **Это второе предупреждение.** При следующем нарушении ваш аккаунт будет заблокирован!\n\nПожалуйста, соблюдайте правила взаимной поддержки.`;
        actionText = '⚠️ Исполнителю выдано второе предупреждение.';
        await incrementUserWarnings(complaint.reported_user_id);

      } else {
        // Третье нарушение - бан (warnings_count уже 2, становятся 3)
        await incrementUserWarnings(complaint.reported_user_id); // делаем warnings_count = 3
        complainantMessage = `✅ **Жалоба удовлетворена**\n\n🚫 **Администратор решил:** Исполнитель нарушал правила три раза, ${complaint.reported_username ? `@${complaint.reported_username}` : 'пользователь'} заблокирован\n\n💬 **Причина жалобы:** ${complaint.complaint_type}\n🔗 **Проект:** ${complaint.project_url}`;
        reportedMessage = `🚫 **Ваш аккаунт заблокирован за многократные нарушения**\n\n⚠️ **Причина:** ${complaint.complaint_type}\n👤 **Жаловался:** ${complaint.complainant_username ? `@${complaint.complainant_username}` : 'пользователь'}\n🔗 **Проект:** ${complaint.project_url}\n\nЭто третье нарушение правил. Если считаете блокировку несправедливой, обратитесь к администратору.\n\nВы можете подать заявку на разблокировку ниже.`;
        actionText = '🚫 Исполнитель заблокирован за многократные нарушения.';
        await banUser(complaint.reported_user_id, `Жалоба: ${complaint.complaint_type} (3 нарушения)`, ctx.from.id);
        await updateUserRating(complaint.reported_telegram_id); // обновляем рейтинг после бана
      }

      // Уведомляем жаловщика
      if (complaint.complainant_telegram_id) {
        await ctx.telegram.sendMessage(complaint.complainant_telegram_id, complainantMessage, { parse_mode: 'Markdown' });
      }

      // Уведомляем обвиняемого
      if (complaint.reported_telegram_id) {
        console.log(`📨 ОТПРАВКА УВЕДОМЛЕНИЯ АККУЗИЕРУ: ID ${complaint.reported_telegram_id} (${complaint.reported_username})`);
        console.log(`📩 ТЕКСТ УВЕДОМЛЕНИЯ: ${reportedMessage}`);
        try {
          await ctx.telegram.sendMessage(complaint.reported_telegram_id, reportedMessage, { 
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [['🔓 Подать заявку на разблокировку']],
              resize_keyboard: true
            }
          });
          console.log(`✅ Уведомление отправлено успешно обвиняемому`);
        } catch (error) {
          console.error(`❌ ОШИБКА отправки уведомления обвиняемому:`, error);
        }
      } else {
        console.log(`⚠️ НЕТ TELEGRAM_ID обвиняемого для уведомления`);
      }

      // Обновляем статус жалобы
      await updateComplaintStatus(complaintId, 'resolved', ctx.from.id);

      ctx.editMessageText(actionText + ' Уведомления отправлены.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
      });

    } catch (error) {
      console.error('Ошибка обработки жалобы:', error);
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

bot.action('admin_ban_user', async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  ctx.session = ctx.session || {};
  ctx.session.waitingForBanUserId = true;
  ctx.editMessageText(
    `🚫 **Блокировка пользователя**\n\nОтправьте Telegram ID пользователя и причину блокировки в формате:\n\`ID причина\`\n\nПример: \`123456789 Спам\``,
    {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] },
      parse_mode: 'Markdown'
    }
  );
});

bot.action(/^ban_user_(\d+)_(.+)_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  const reportedUserId = parseInt(ctx.match[1]); // внутренний ID пользователя в базе данных
  const reportedUsername = ctx.match[2];
  const complaintId = parseInt(ctx.match[3]); // ID жалобы для обновления статуса

  try {
    // Получаем telegram_id пользователя по внутреннему ID
    const reportedUser = await getUserById(reportedUserId);
    if (!reportedUser) {
      ctx.editMessageText('❌ Пользователь не найден в базе данных.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
      });
      return;
    }

    const telegramUserId = reportedUser.telegram_id; // получаем настоящий telegram_id

    await banUser(reportedUserId, `Жалоба от админа на нарушение (ID жалобы: ${complaintId})`, ctx.from.id);

    // Отправляем уведомление заблокированному пользователю
    const reportedMessage = `🚫 **Ваш аккаунт заблокирован администратором**\n\nПричиной блокировки стало нарушение правил системы.\n\nВы можете подать заявку на разблокировку ниже.`;

    try {
      await ctx.telegram.sendMessage(telegramUserId, reportedMessage, {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [['🔓 Подать заявку на разблокировку']],
          resize_keyboard: true
        }
      });
      console.log(`✅ Уведомление о принудительном бане отправлено пользователю ${telegramUserId} (${reportedUsername})`);
    } catch (error) {
      console.error(`❌ ОШИБКА отправки уведомления о принудительном бане пользователю ${telegramUserId}:`, error);
    }

    // Обновляем статус жалобы на "resolved"
    await updateComplaintStatus(complaintId, 'resolved', ctx.from.id);
    console.log(`✅ Статус жалобы ${complaintId} обновлен на 'resolved'`);

    ctx.editMessageText(`🚫 Пользователь ${reportedUsername} (@${telegramUserId}) заблокирован. Уведомление отправлено.`,
      { reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] } }
    );
  } catch (error) {
    console.error('Ошибка принудительного бана:', error);
    ctx.editMessageText('❌ Ошибка при блокировке пользователя.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 К жалобам', callback_data: 'admin_view_complaints' }]] }
    });
  }
});

bot.action('admin_stats', async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  try {
    // Собираем статистику бота
    const stats = {};

    // Всего пользователей
    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    stats.totalUsers = totalUsers;

    // Активные пользователи (с действиями за последнюю неделю)
    const activeUsers = await new Promise((resolve, reject) => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      db.get('SELECT COUNT(DISTINCT from_user_id) as count FROM action_transactions WHERE transaction_date > ?', [weekAgo.toISOString()], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    stats.activeUsers = activeUsers;

    // Всего проектов
    const totalProjects = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM projects', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    stats.totalProjects = totalProjects;

    // Всего действий/транзакций
    const totalActions = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM action_transactions', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    stats.totalActions = totalActions;

    // Статистика по типам действий
    const actionsStats = await new Promise((resolve, reject) => {
      db.all('SELECT action_type, COUNT(*) as count FROM action_transactions GROUP BY action_type', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Всего жалоб
    const totalComplaints = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM complaints', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    stats.totalComplaints = totalComplaints;

    // Незавершенные жалобы
    const pendingComplaints = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM complaints WHERE status IN ("pending", "new")', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    stats.pendingComplaints = pendingComplaints;

    // Всего купленных кристаллов
    const totalCreditsEarned = await new Promise((resolve, reject) => {
      db.get('SELECT SUM(amount) as total FROM credit_purchases', (err, row) => {
        if (err) reject(err);
        else resolve(row.total || 0);
      });
    });
    stats.totalCreditsEarned = totalCreditsEarned;

    // Всего потраченных кристаллов на проекты
    const totalCreditsSpent = await new Promise((resolve, reject) => {
      db.get('SELECT SUM(pa.credits_spent) as total FROM action_transactions at JOIN project_actions pa ON at.to_project_id = pa.project_id AND at.action_type = pa.action_type', (err, row) => {
        if (err) reject(err);
        else resolve(row.total || 0);
      });
    });
    stats.totalCreditsSpent = totalCreditsSpent;

    // Заблокированные пользователи
    const bannedUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM user_bans', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    stats.bannedUsers = bannedUsers;

    // Статистика за сегодня
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayActions = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM action_transactions WHERE transaction_date >= ?', [today.toISOString()], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
    stats.todayActions = todayActions;

    // Создаем сформированный текст статистики
    let message = `📊 **Статистика бота DesignLike**\n\n`;

    message += `👥 **Пользователи:**\n• Всего: ${stats.totalUsers}\n• Активных (за неделю): ${stats.activeUsers}\n• Заблокировано: ${stats.bannedUsers}\n\n`;

    message += `🎨 **Контент:**\n• Проектов: ${stats.totalProjects}\n• Выполненных действий: ${stats.totalActions}\n`;

    if (actionsStats.length > 0) {
      message += `   └ Детально: `;
      const actionDetails = actionsStats.map(stat => {
        const icon = stat.action_type === 'like' ? '❤️' : stat.action_type === 'follow' ? '👥' : stat.action_type === 'comment' ? '💬' : '👀';
        return `${icon}${stat.count}`;
      }).join(', ');
      message += actionDetails + '\n';
    }

    message += `🌅 Сегодня: ${stats.todayActions} действий\n\n`;

    message += `🚨 **Жалобы:**\n• Всего: ${stats.totalComplaints}\n• Ожидают рассмотрения: ${stats.pendingComplaints}\n\n`;

    message += `💎 **Экономика:**\n• Куплено кристаллов: ${stats.totalCreditsEarned}\n• Потрачено на проекты: ${stats.totalCreditsSpent}\n\n`;

    // Предупреждение о нагрузке
    if (stats.totalUsers > 5000) {
      message += `⚡ **Высокая нагрузка!**\nРекомендуется оптимизация.\n`;
    }

    message += `_Последнее обновление: ${new Date().toLocaleString('ru-RU')}_`;

    ctx.editMessageText(message, {
      reply_markup: { inline_keyboard: [[{ text: '🔄 Обновить', callback_data: 'admin_stats' }, { text: '🔙 Назад', callback_data: 'back_to_admin' }]] },
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('Ошибка получения статистики бота:', error);
    ctx.editMessageText('❌ Ошибка при получении статистики. Попробуйте позже.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
    });
  }
});

bot.action('admin_unban_user', async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  ctx.session = ctx.session || {};
  ctx.session.waitingForUnbanUserId = true;
  ctx.editMessageText(
    `🔓 **Разблокировка пользователя**\n\nОтправьте Telegram ID пользователя для разблокировки.`,
    {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] },
      parse_mode: 'Markdown'
    }
  );
});

bot.action(/^unblock_user_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  const telegramUserId = parseInt(ctx.match[1]); // telegram_id из callback_data

  try {
    // Получаем пользователя по telegram_id
    const user = await getUser(telegramUserId);
    if (!user) {
      ctx.editMessageText(`❌ Пользователь с Telegram ID ${telegramUserId} не найден в базе данных.`, {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
      });
      return;
    }

    // Разбаниваем по внутреннему id
    const success = await unbanUser(user.id);
    if (success) {
      // Обновляем статистику
      const stats = await getUserStats(user.telegram_id);

      // Формируем клавиатуру как в start() для активного пользователя
      let keyboard = [
        ['🎯 Доступные задания', '➕ Добавить проект'],
        ['📈 Мой рейтинг', '💰 Баланс'],
        ['📊 Статистика', '⚙️ Настройки']
      ];

      // Если у пользователя есть проекты, добавляем кнопку "Мои проекты"
      if (stats.projectsCount > 0) {
        keyboard.splice(1, 0, ['📂 Мои проекты']);
      }

      // Если это администратор (ID 366323850), добавляем кнопку админ панели
      if (user.telegram_id === 366323850) {
        keyboard.push(['🏛️ Админ панель']);
      }

      // Отправляем уведомление с новой клавиатурой
      await ctx.telegram.sendMessage(user.telegram_id, `🛡️ **Ваша блокировка снята**\n\nВаш аккаунт разблокирован администратором. Добро пожаловать обратно!\n\nДля продолжения работы используйте меню ниже.`, {
        reply_markup: { keyboard: keyboard, resize_keyboard: true },
        parse_mode: 'Markdown'
      });

      ctx.editMessageText(`✅ Пользователь ${user.telegram_id} (${user.username}) разблокирован. Пользователь уведомлен.`, {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
      });
    } else {
      ctx.editMessageText(`❌ Не удалось разблокировать пользователя ${user.telegram_id} (${user.username}). Возможно, он не был заблокирован.`, {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
      });
    }
  } catch (error) {
    console.error('Ошибка разблокировки:', error);
    ctx.editMessageText('❌ Ошибка при разблокировке пользователя.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
    });
  }
});

bot.action(/^decline_unblock_(\d+)$/, async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  const userId = parseInt(ctx.match[1]);

  const declineMessage = `❌ **Заявка на разблокировку отклонена**\n\nВаш запрос на разблокировку был отклонен администратором.\n\nЕсли считаете, что это несправедливо, напишите администратору напрямую.`;
  
  try {
    await ctx.telegram.sendMessage(userId, declineMessage, { parse_mode: 'Markdown' });
    ctx.editMessageText(`❌ Заявка пользователя ${userId} отклонена. Пользователь уведомлен.`, {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
    });
  } catch (error) {
    console.error('Ошибка отправки отказа:', error);
    ctx.editMessageText('❌ Ошибка при отправке уведомления пользователю.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
    });
  }
});

bot.action('back_to_admin', async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  const keyboard = [
    [{ text: '📋 Просмотреть жалобы', callback_data: 'admin_view_complaints' }],
    [{ text: '📤 Рассылка', callback_data: 'admin_broadcast' }],
    [{ text: '🚫 Заблокировать пользователя', callback_data: 'admin_ban_user' }],
    [{ text: '🔓 Разблокировать пользователя', callback_data: 'admin_unban_user' }],
    [{ text: '📊 Статистика бота', callback_data: 'admin_stats' }]
  ];

  ctx.editMessageText('🏛️ **Админ панель**\n\nВыберите действие:', {
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: 'Markdown'
  });
});

function updateUserProfile(telegramId, platform, username) {
  return new Promise((resolve, reject) => {
    const columnName = `${platform}_username`;
    db.run(
      `UPDATE users SET ${columnName} = ? WHERE telegram_id = ?`,
      [username, telegramId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

function extractUsername(input, platform) {
  if (!input.includes('.') && !input.includes('/')) {
    return input.trim();
  }

  const patterns = {
    behance: /behance\.net\/([^\/\?#]+)/,
    dribbble: /dribbble\.com\/([^\/\?#]+)/,
    artstation: /artstation\.com\/([^\/\?#]+)/
  };

  const pattern = patterns[platform];
  if (pattern) {
    const match = input.match(pattern);
    return match ? match[1] : null;
  }

  return null;
}

bot.action(/^(\w+)_project_(\d+)$/, async (ctx) => {
  const actionType = ctx.match[1];
  const projectId = ctx.match[2];
  const userId = ctx.from.id;

  if (!["like", "follow", "comment", "view"].includes(actionType)) {
    return;
  }

  const alreadyDone = await hasUserDoneAction(userId, projectId, actionType);
  if (alreadyDone) {
    return;
  }

  const project = await getProjectById(projectId);
  if (!project) {
    await ctx.reply('Проект не найден');
    return;
  }

  if (project.user_id === userId) {
    await ctx.reply('Вы не можете выполнять действия на своем собственном проекте');
    return;
  }

  try {
    await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
  } catch (error) {}

  const actionWord = actionType === 'like' ? 'лайк' : actionType === 'follow' ? 'подписку' : actionType === 'comment' ? 'комментарий' : 'просмотр';

  await ctx.reply(`🎯 **Для получения кристаллов 💎 выполните действие:**\n\n${actionType === 'like' ? 'Поставьте лайк' : actionType === 'follow' ? 'Подпишитесь' : actionType === 'comment' ? 'Оставьте комментарий' : 'Посмотрите проект'} на проекте ниже:\n\n🔗 ${project.url}\n\n⚠️ **ВАЖНО:** Выполните настоящее ${actionWord} на платформе!\n\nПосле выполнения действия нажмите "Подтвердить выполнение"`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔗 Открыть проект', url: project.url }],
        [{ text: `✅ Подтвердить выполнение`, callback_data: `confirm_${actionType}_${projectId}` }]
      ]
    },
    parse_mode: 'Markdown'
  });
});

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

  let alreadyDone = await hasUserDoneAction(user.id, projectId, actionType);

  // Для подписки дополнительно проверяем, не подписывался ли пользователь на этот URL за последние 30 дней
  if (actionType === 'follow' && !alreadyDone) {
    const project = await getProjectById(projectId);
    if (project) {
      alreadyDone = await hasUserDoneFollowOnUrl(user.id, project.url);
    }
  }

  if (alreadyDone) {
    if (actionType === 'follow') {
      await ctx.editMessageText('⚠️ Вы уже выполняли подписку на этот профиль за последние 30 дней. Повторные подписки на тот же URL невозможны.', {
        reply_markup: { inline_keyboard: [[{ text: '🔙 Вернуться к заданиям', callback_data: 'back_to_main' }]] },
        parse_mode: 'Markdown'
      }).catch(() => {});
    } else {
      await ctx.editMessageText('⚠️ Это действие уже выполнено.', {
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
    const user = await getUser(userId);
    await updateCredits(user.id, user.credits + credits);
    await updateUserRating(ctx.from.id);

    const thankYouMessage = await ctx.reply(`✅ Спасибо за взаимную поддержку!\n\n💰 +${credits} кредит${credits !== 1 ? 'ов' : ''} начислен${credits !== 1 ? 'ы' : ''} за ${getActionText(actionType).toLowerCase()}!`);

    // Сохраняем ID сообщения "Спасибо!", чтобы потом удалить
    ctx.session.thankYouMessageId = thankYouMessage.message_id;

    setTimeout(async () => {
      const platforms = await getUserPlatforms(user.id);
      await showNextTask(ctx, user.id, platforms);
    }, 1000);
  } else {
    await ctx.reply(`❌ Ошибка при обработке ${getActionText(actionType).toLowerCase()}. Попробуйте позже.`);
  }
});

bot.action(/^buy_(\d+)$/, async (ctx) => {
  const amount = parseInt(ctx.match[1]);

  await ctx.editMessageText(`Подтверждение оплаты ${amount} 💎 за ${amount === 100 ? 100 : amount === 500 ? 450 : 850} ₽`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Оплатить', callback_data: `confirm_buy_${amount}` }]
      ]
    }
  });
});

bot.action(/^confirm_buy_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();

  const amount = parseInt(ctx.match[1]);
  const user = await getUser(ctx.from.id);
  if (!user) {
    await ctx.editMessageText('Сначала зарегистрируйтесь через /start');
    return;
  }

  const prices = { 100: 100, 500: 450, 1000: 850 };
  const cost = prices[amount];

  await buyCredits(user.id, amount);
  await ctx.editMessageText(`✅ Оплата прошла успешно! Начислено ${amount} 💎.`);
});

bot.action(/^complain_(\d+)_(\d+)$/, async (ctx) => {
  const projectId = ctx.match[1];
  const reportedUserId = ctx.match[2];

  // Получаем внутренний ID жалобщика
  const complainantUser = await getUser(ctx.from.id);
  if (!complainantUser) {
    ctx.editMessageText('❌ Ошибка: не удалось определить пользователя.');
    return;
  }
  const complainantId = complainantUser.id;

  if (complainantId === reportedUserId) {
    ctx.editMessageText('❌ Вы не можете жаловаться на самого себя.');
    return;
  }

  const complaintId = await saveComplaint(complainantId, reportedUserId, projectId, 'Не выполнил требуемое действие на платформе');

  ctx.editMessageText('✅ Жалоба отправлена! Модераторы рассмотрят её в ближайшее время. Спасибо за сотрудничество!');

  const complaint = await getComplaintById(complaintId);
  if (complaint) {
    const adminId = 366323850;
    const message = `🚨 **Новая жалоба #${complaint.id}**\n\n` +
      `👤 От: ${complaint.complainant_username} (@${complaint.complainant_telegram_id})\n` +
      `😤 На: ${complaint.reported_username} (@${complaint.reported_telegram_id})\n` +
      `🔗 Проект: ${complaint.project_url}\n` +
      `📝 Тип: ${complaint.complaint_type}\n` +
      `📅 Дата: ${new Date(complaint.created_date).toLocaleString('ru-RU')}`;

    try {
      await ctx.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' });
      console.log(`Уведомление о жалобе отправлено админу ${adminId}`);
    } catch (error) {
      console.error('Ошибка отправки уведомления админу:', error);
    }
  }
});

bot.action('settings_profiles', async (ctx) => {
  const user = await getUser(ctx.from.id);
  ctx.editMessageText(
    `🔗 **Настройка профилей**\n\nПодключите свои профили на платформах для автоматической верификации лайков:\n\nТекущие профили:\n• Behance: ${user.behance_username || 'не указан'}\n• Dribbble: ${user.dribbble_username || 'не указан'}\n• ArtStation: ${user.artstation_username || 'не указан'}`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎨 Behance профиль', callback_data: 'set_behance' }],
        [{ text: '🎯 Dribbble профиль', callback_data: 'set_dribbble' }],
        [{ text: '✨ ArtStation профиль', callback_data: 'set_artstation' }],
        [{ text: '👀 Посмотреть мои профили', callback_data: 'view_profiles' }],
        [{ text: '🔙 Назад в настройки', callback_data: 'back_to_settings' }]
      ]
    },
    parse_mode: 'Markdown'
  });
});

bot.action('set_behance', async (ctx) => {
  ctx.session.waitingForBehance = true;
  ctx.editMessageText(
    `🎨 **Настройка Behance профиля**\n\nУкажите ваш Behance username (имя профиля после behance.net/).\n\nПример: для https://www.behance.net/alexdesign введите: **alexdesign**\n\nИли укажите полный URL профиля.`, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'settings_profiles' }]] },
    parse_mode: 'Markdown'
  });
});

bot.action('set_dribbble', async (ctx) => {
  ctx.session.waitingForDribbble = true;
  ctx.editMessageText(
    `🎯 **Настройка Dribbble профиля**\n\nУкажите ваш Dribbble username (имя профиля после dribbble.com/).\n\nПример: для https://dribbble.com/alexdesign введите: **alexdesign**\n\nИли укажите полный URL профиля.`, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'settings_profiles' }]] },
    parse_mode: 'Markdown'
  });
});

bot.action('set_artstation', async (ctx) => {
  ctx.session.waitingForArtstation = true;
  ctx.editMessageText(
    `✨ **Настройка ArtStation профиля**\n\nУкажите ваш ArtStation username (имя профиля после artstation.com/).\n\nПример: для https://www.artstation.com/alexdesign введите: **alexdesign**\n\nИли укажите полный URL профиля.`, {
    reply_markup: { inline_keyboard: [[{ text: '🔙 Назад', callback_data: 'settings_profiles' }]] },
    parse_mode: 'Markdown'
  });
});

bot.action('view_profiles', async (ctx) => {
  const user = await getUser(ctx.from.id);
  ctx.editMessageText(
    `👀 **Ваши подключенные профили**\n\n*Behance:* ${user.behance_username ? `https://behance.net/${user.behance_username}` : 'не указан'}\n*Dribbble:* ${user.dribbble_username ? `https://dribbble.com/${user.dribbble_username}` : 'не указан'}\n*ArtStation:* ${user.artstation_username ? `https://artstation.com/${user.artstation_username}` : 'не указан'}\n\nПодключите ваши профили для верификации лайков через API.`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔗 Изменить профили', callback_data: 'settings_profiles' }],
        [{ text: '🔙 Назад в настройки', callback_data: 'back_to_settings' }]
      ]
    },
    parse_mode: 'Markdown'
  });
});

bot.action('notifications_on', async (ctx) => {
  ctx.editMessageText('✅ Уведомления включены (функция в разработке)');
});

bot.action('notifications_off', async (ctx) => {
  ctx.editMessageText('🔕 Уведомления отключены');
});



bot.action('back_to_main', async (ctx) => {
  const stats = await getUserStats(ctx.from.id); // Получаем статистику чтобы знать количество проектов

  // Определяем клавиатуру на основе ID пользователя
  let keyboard = [
    ['🎯 Доступные задания', '➕ Добавить проект'],
    ['📂 Мои проекты'],
    ['📈 Мой рейтинг', '💰 Баланс'],
    ['⚙️ Настройки']
  ];

  // Если у пользователя есть проекты, добавляем рядом статистику позже, но базовое меню уже имеет "Мои проекты"
  // Для админа добавляем админ панель
  if (ctx.from.id === 366323850) {
    keyboard.push(['🏛️ Админ панель']); // Добавляем в новый ряд
  }

  await ctx.reply('🏠 Главное меню\n\nВыберите действие:', {
    reply_markup: { keyboard: keyboard, resize_keyboard: true }
  });
});

bot.action('back_to_settings', async (ctx) => {
  const user = await getUser(ctx.from.id);
  const keyboard = [
    [{ text: '🔗 Настроить профили', callback_data: 'settings_profiles' }],
    [{ text: '🔙 Назад в меню', callback_data: 'back_to_main' }]
  ];

  ctx.editMessageText('⚙️ Настройки\n\nЗдесь вы можете настроить свой профиль для полноценного использования системы.', {
    reply_markup: { inline_keyboard: keyboard }
  });
});

bot.action('enable_notifications', async (ctx) => {
  await ctx.editMessageText('🔔 **Включение уведомлений**\n\nФункция пока в разработке. Вы будете автоматически получать уведомления, когда появятся новые проекты!', {
    reply_markup: { inline_keyboard: [[{ text: '🏠 В меню', callback_data: 'back_to_main' }]] },
    parse_mode: 'Markdown'
  });
});

bot.action('add_project', async (ctx) => {
  ctx.reply('Отправьте ссылку на ваш проект (Behance, Dribbble, ArtStation):');
  ctx.session = ctx.session || {};
  ctx.session.waitingForProject = true;
});

bot.action('select_views', async (ctx) => {
  ctx.session.waitingForViewsCount = true;
  ctx.reply('👀 Введите количество просмотров (1-1000):');
});

bot.action('select_likes', async (ctx) => {
  ctx.session.waitingForLikesCount = true;
  ctx.reply('❤️ Введите количество лайков (1-1000):');
});

bot.action('select_comments', async (ctx) => {
  ctx.session.waitingForCommentsCount = true;
  ctx.reply('💬 Введите количество комментариев (1-1000):');
});

bot.action('select_follows', async (ctx) => {
  ctx.session.waitingForFollowsCount = true;
  ctx.reply('👥 Введите количество подписчиков (1-1000):');
});

bot.action('confirm_broadcast_send', async (ctx) => {
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
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
    });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    ctx.editMessageText('❌ Ошибка при отправке рассылки.', {
      reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
    });
  }
});

bot.action('cancel_broadcast', async (ctx) => {
  if (ctx.from.id !== 366323850) return;

  // Очищаем сессию
  delete ctx.session.broadcastMessage;

  ctx.editMessageText('❌ Рассылка отменена.', {
    reply_markup: { inline_keyboard: [[{ text: '🔙 Назад в админ меню', callback_data: 'back_to_admin' }]] }
  });
});

bot.action('cancel_project_add', async (ctx) => {
  delete ctx.session.pendingProject;
  delete ctx.session.selectedActions;
  delete ctx.session.actionsMessageId;
  ctx.editMessageText('❌ Добавление проекта отменено.');
});

bot.action('confirm_project_add', async (ctx) => {
  const selected = ctx.session.selectedActions;
  const totalCredits = selected.views * 1 + selected.likes * 5 + selected.comments * 10 + selected.follows * 30;
  const user = await getUser(ctx.from.id);

  if (totalCredits === 0) {
    ctx.editMessageText('❌ Выберите хотя бы одно действие для покупки.');
    return;
  }

  if (user.credits < totalCredits) {
    ctx.editMessageText(`💰 Недостаточно кристаллов 💎!\n\nВаш баланс: ${user.credits} 💎\nНужно: ${totalCredits} 💎\n\nКупите кристаллы в разделе 💰 Баланс.`);
    return;
  }

  try {
    const projectId = await addProject(ctx.session.pendingProject.userId, ctx.session.pendingProject.url, ctx.session.pendingProject.platform);

    if (projectId) {
      const actions = [];
      if (selected.views > 0) actions.push({ type: 'view', count: selected.views, credits: selected.views * 1 });
      if (selected.likes > 0) actions.push({ type: 'like', count: selected.likes, credits: selected.likes * 5 });
      if (selected.comments > 0) actions.push({ type: 'comment', count: selected.comments, credits: selected.comments * 10 });
      if (selected.follows > 0) actions.push({ type: 'follow', count: selected.follows, credits: selected.follows * 30 });

      for (const action of actions) {
        const creditsPerAction = Math.round(action.credits / action.count);
        await db.run(
          'INSERT INTO project_actions (project_id, action_type, credits_spent) VALUES (?, ?, ?)',
          [projectId, action.type, creditsPerAction]
        );
      }

      await updateCredits(user.id, user.credits - totalCredits);
      await updateUserRating(user.id);

      delete ctx.session.pendingProject;
      delete ctx.session.selectedActions;
      delete ctx.session.actionsMessageId;

      ctx.editMessageText(`✅ Проект добавлен успешно!\n\n🎉 Куплено действий: ${selected.views} просмотров, ${selected.likes} лайков, ${selected.comments} комментариев, ${selected.follows} подписчиков\n💰 Потрачено: ${totalCredits} 💎\n\nПроект скоро появится в списке для взаимных лайков!`);
    } else {
      ctx.editMessageText('❌ Ошибка при добавлении проекта. Попробуйте позже.');
    }
  } catch (error) {
    if (error.message === 'Дубликат URL: У вас уже есть проект с этим URL') {
      ctx.editMessageText(`❌ ${error.message}\n\nПожалуйста, используйте другой URL проекта или удалите существующий проект с этим URL сначала.`);
    } else {
      console.error('Ошибка при добавлении проекта:', error);
      ctx.editMessageText('❌ Произошла ошибка при добавлении проекта. Попробуйте позже.');
    }

    delete ctx.session.pendingProject;
    delete ctx.session.selectedActions;
    delete ctx.session.actionsMessageId;
  }
});

bot.on('callback_query', async (ctx) => {
  console.log(`🔬 DEBUG ALL CALLBACK: ${ctx.callbackQuery.data} от user ${ctx.from.id}`);
  console.log(`Match данные: ${JSON.stringify(ctx.match)}`);
  await ctx.answerCbQuery();
});

async function sendBroadcastMessage(ctx, messageText, adminId) {
  const result = {
    sentCount: 0,
    errors: [],
    totalUsers: 0
  };

  try {
    // Получаем всех активных пользователей (не забаненных)
    const activeUsers = await getAllActiveUsers(adminId);
    result.totalUsers = activeUsers.length;

    console.log(`📤 Начинаем рассылку. Всего активных пользователей: ${activeUsers.length}`);
    console.log(`📤 Список пользователей для рассылки:`, activeUsers.map(u => `${u.telegram_id} (${u.username})`).join(', '));

    // Отправляем сообщение каждому пользователю
    for (const user of activeUsers) {
      try {
        await ctx.telegram.sendMessage(user.telegram_id, messageText, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });

        result.sentCount++;
        console.log(`✅ Отправлено пользователю ${user.telegram_id} (${user.username})`);

        // Небольшая задержка, чтобы избежать блокировки API Telegram
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        console.error(`❌ Ошибка отправки пользователю ${user.telegram_id} (${user.username}):`, error.message);
        result.errors.push({
          userId: user.telegram_id,
          username: user.username,
          error: error.message
        });
      }
    }

    console.log(`📤 Рассылка завершена. Отправлено: ${result.sentCount}, Ошибок: ${result.errors.length}`);

  } catch (error) {
    console.error('❌ Критическая ошибка при рассылке:', error);
    throw error;
  }

  return result;
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

bot.launch();
console.log('Bot is running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Complete function definitions
function registerUser(telegramId, username) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO users (telegram_id, username) VALUES (?, ?)`,
      [telegramId, username],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getUser(telegramId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function addProject(userId, url, platform) {
  return new Promise(async (resolve, reject) => {
    try {
      db.run(
        'INSERT INTO projects (user_id, url, platform) VALUES (?, ?, ?)',
        [userId, url, platform],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

function getProjectsForAction(userId, allowedPlatforms = []) {
  return new Promise((resolve, reject) => {
    const placeholder = allowedPlatforms.length > 0 ? `AND p.platform IN (${allowedPlatforms.map(() => '?').join(', ')})` : '';
    db.all(`
      SELECT DISTINCT p.* FROM projects p
      WHERE p.user_id != ?
        AND EXISTS (
          SELECT 1 FROM project_actions pa
          WHERE pa.project_id = p.id
            AND NOT EXISTS (
              SELECT 1 FROM action_transactions at_projects
              WHERE at_projects.from_user_id = ?
                AND at_projects.to_project_id = p.id
                AND at_projects.action_type = pa.action_type
            )
            AND NOT EXISTS (
              SELECT 1 FROM action_transactions at_url
              JOIN projects old_p ON at_url.to_project_id = old_p.id
              WHERE at_url.from_user_id = ?
                AND old_p.url = p.url
                AND at_url.action_type = pa.action_type
                AND at_url.transaction_date >= datetime('now', '-30 days')
            )
        )
        ${placeholder}
      ORDER BY p.added_date DESC
      LIMIT 5
    `, [userId, userId, userId, ...allowedPlatforms], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function addActionTransaction(fromUserId, toProjectId, actionType) {
  const user = await getUser(fromUserId);
  if (!user) throw new Error('User not found');

  const project = await getProjectById(toProjectId);
  if (!project) throw new Error('Project not found');

  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO action_transactions (from_user_id, to_project_id, project_url, action_type) VALUES (?, ?, ?, ?)',
      [user.id, toProjectId, project.url, actionType],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function addLikeTransaction(fromUserId, toProjectId) {
  return addActionTransaction(fromUserId, toProjectId, 'like');
}

function updateCredits(userId, credits) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET credits = ? WHERE id = ?',
      [credits, userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

function buyCredits(userId, amount) {
  console.log(`🎯 ДЕБАГ: Начало buyCredits - userId: ${userId}, amount: ${amount}`);

  return new Promise(async (resolve, reject) => {
    try {
      console.log(`👤 ДЕБАГ: Получаем данные пользователя по ID: ${userId}`);
      const user = await getUserById(userId);
      if (!user) {
        console.log(`❌ ДЕБАГ: Пользователь с ID ${userId} не найден`);
        reject(new Error('User not found'));
        return;
      }

      const newCredits = user.credits + amount;
      const prices = { 100: 100, 500: 450, 1000: 850 };
      const cost = prices[amount];

      console.log(`💰 ДЕБАГ: Текущий баланс: ${user.credits}, Новый баланс: ${newCredits}`);
      console.log(`💵 ДЕБАГ: Стоимость покупки ${amount} кредитов: ${cost} руб.`);

      console.log(`🔄 ДЕБАГ: Обновляем кредиты пользователя в БД`);
      db.run('UPDATE users SET credits = ? WHERE id = ?', [newCredits, userId], function(err) {
        if (err) {
          console.log(`❌ ДЕБАГ: Ошибка обновления кредитов: ${err.message}`);
          reject(err);
        } else {
          console.log(`✅ ДЕБАГ: Кредиты успешно обновлены`);

          console.log(`🧾 ДЕБАГ: Добавляем запись о покупке в credit_purchases`);
          db.run('INSERT INTO credit_purchases (user_id, amount, cost) VALUES (?, ?, ?)', [userId, amount, cost], function(err) {
            if (err) {
              console.log(`❌ ДЕБАГ: Ошибка добавления записи покупки: ${err.message}`);
              reject(err);
            } else {
              console.log(`✅ ДЕБАГ: Запись о покупке успешно добавлена`);
              console.log(`🎉 ДЕБАГ: buyCredits завершен успешно!`);
              resolve();
            }
          });
        }
      });
    } catch (error) {
      console.log(`❌ ДЕБАГ: Исключение в buyCredits: ${error.message}`);
      reject(error);
    }
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getProjectById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM projects WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function hasUserDoneAction(userId, projectId, actionType) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id FROM action_transactions WHERE from_user_id = ? AND to_project_id = ? AND action_type = ?',
      [userId, projectId, actionType],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

function hasUserLikedProject(userId, projectId) {
  return hasUserDoneAction(userId, projectId, 'like');
}

function hasUserDoneFollowOnUrl(userId, projectUrl) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT at.id FROM action_transactions at
            JOIN projects p ON at.to_project_id = p.id
            WHERE at.from_user_id = ?
              AND at.action_type = 'follow'
              AND p.url = ?
              AND at.transaction_date >= datetime('now', '-30 days')`, [userId, projectUrl], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}

function hasUserDoneAnyActionOnUrl(userId, projectUrl) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT at.id FROM action_transactions at
            JOIN projects p ON at.to_project_id = p.id
            WHERE at.from_user_id = ?
              AND p.url = ?
              AND at.transaction_date >= datetime('now', '-30 days')
            LIMIT 1`, [userId, projectUrl], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}

function getUndoneActionsForProject(projectId, userId) {
  return new Promise(async (resolve, reject) => {
    try {
      // Получаем URL проекта για проверки по URL
      const project = await getProjectById(projectId);
      if (!project) {
        resolve([]);
        return;
      }

      db.all(
        'SELECT pa.action_type FROM project_actions pa WHERE pa.project_id = ? AND NOT EXISTS (SELECT 1 FROM action_transactions at WHERE at.from_user_id = ? AND at.to_project_id = pa.project_id AND at.action_type = pa.action_type) AND NOT EXISTS (SELECT 1 FROM action_transactions at WHERE at.from_user_id = ? AND at.project_url = ? AND at.action_type = pa.action_type AND at.transaction_date >= datetime("now", "-30 days")) ORDER BY pa.id ASC',
        [projectId, userId, userId, project.url],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(r => r.action_type));
        }
      );
    } catch (error) {
      reject(error);
    }
  });
}

function getCreditsForAction(projectId, actionType) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT credits_spent FROM project_actions WHERE project_id = ? AND action_type = ?',
      [projectId, actionType],
      (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.credits_spent : 1);
      }
    );
  });
}

function getActionText(action) {
  switch (action) {
    case 'like': return '❤️ Поставить лайк';
    case 'follow': return '👥 Подписаться';
    case 'comment': return '💬 Оставить комментарий';
    case 'view': return '👀 Посмотреть проект';
    default: return '';
  }
}

function saveComplaint(complainantId, reportedUserId, projectId, complaintType, complaintMessage = '') {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO complaints (complainant_user_id, reported_user_id, project_id, complaint_type, complaint_message) VALUES (?, ?, ?, ?, ?)',
      [complainantId, reportedUserId, projectId, complaintType, complaintMessage],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function updateUserRating(telegramId) {
  return new Promise(async (resolve, reject) => {
    const stats = await getUserStats(telegramId);

    const newRating = (stats.actionsSent * 5) + (stats.projectsCount * 10) + (stats.actionsReceived * 1);

    const finalRating = Math.max(0, newRating);

    db.run('UPDATE users SET rating = ? WHERE telegram_id = ?', [finalRating, telegramId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function getUserStats(telegramId) {
  return new Promise(async (resolve, reject) => {
    const stats = {};

    try {
      stats.projectsCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM projects p JOIN users u ON p.user_id = u.telegram_id WHERE u.telegram_id = ?', [telegramId], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });

      stats.actionsSent = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM action_transactions at JOIN users u ON at.from_user_id = u.id WHERE u.telegram_id = ?', [telegramId], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });

      stats.actionsReceived = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM action_transactions at JOIN projects p ON at.to_project_id = p.id JOIN users u ON p.user_id = u.telegram_id WHERE u.telegram_id = ?', [telegramId], (err, row) => {
          if (err) reject(err);
          else resolve(row.count);
        });
      });

      const user = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (user) {
        stats.warningsReceived = user.warnings_count;
        stats.creditsPurchased = await new Promise((resolve, reject) => {
          db.get('SELECT SUM(amount) as total FROM credit_purchases cp JOIN users u ON cp.user_id = u.id WHERE u.telegram_id = ?', [telegramId], (err, row) => {
            if (err) reject(err);
            else resolve(row.total || 0);
          });
        });

        stats.creditsSpent = await new Promise((resolve, reject) => {
          db.get('SELECT SUM(pa.credits_spent) as total FROM project_actions pa JOIN projects p ON pa.project_id = p.id JOIN users u ON p.user_id = u.telegram_id WHERE u.telegram_id = ?', [telegramId], (err, row) => {
            if (err) reject(err);
            else resolve(row.total || 0);
          });
        });

        stats.currentCredits = user.credits;

        if (user.registered_date) {
          const registered = new Date(user.registered_date);
          const now = new Date();
          stats.daysActive = Math.floor((now - registered) / (1000 * 60 * 60 * 24)) + 1;
        } else {
          stats.daysActive = 1;
        }

        // Действия по платформам
        stats.behanceActions = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM action_transactions at JOIN projects p ON at.to_project_id = p.id WHERE at.from_user_id = ? AND p.platform = "behance"', [user.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });

        stats.dribbbleActions = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM action_transactions at JOIN projects p ON at.to_project_id = p.id WHERE at.from_user_id = ? AND p.platform = "dribbble"', [user.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });

        stats.artstationActions = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM action_transactions at JOIN projects p ON at.to_project_id = p.id WHERE at.from_user_id = ? AND p.platform = "artstation"', [user.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });
      } else {
        stats.warningsReceived = 0;
        stats.creditsPurchased = 0;
        stats.creditsSpent = 0;
        stats.currentCredits = 0;
        stats.daysActive = 1;
        stats.behanceActions = 0;
        stats.dribbbleActions = 0;
        stats.artstationActions = 0;
      }

      resolve(stats);

    } catch (error) {
      reject(error);
    }
  });
}

function getUserLevel(rating) {
  if (rating < 100) return { name: 'Новичок', emoji: '🌱', maxPoints: 100, nextLevel: 'Дизайнер' };
  if (rating < 500) return { name: 'Дизайнер', emoji: '🎨', maxPoints: 500, nextLevel: 'Профи' };
  if (rating < 1500) return { name: 'Профи', emoji: '🏆', maxPoints: 1500, nextLevel: 'Эксперт' };
  return { name: 'Эксперт', emoji: '🚀', maxPoints: null, nextLevel: null };
}

function isValidProjectUrl(url) {
  const patterns = [
    /behance\.net\/gallery\//,
    /behance\.net\/([^\/]+)/,
    /dribbble\.com\/shots\//,
    /dribbble\.com\/([^\/\?#]+)/,
    /artstation\.com\//
  ];
  return patterns.some(pattern => pattern.test(url));
}

function getLinkType(url) {
  if (url.includes('/shots/') || url.includes('/gallery/') || url.includes('/artwork/')) {
    return 'project';
  } else {
    return 'profile';
  }
}

async function showProjectActionsMenu(ctx) {
  const project = ctx.session.pendingProject;
  const user = await getUser(ctx.from.id);
  const linkType = getLinkType(project.url);

  let availableActions = [];
  if (linkType === 'profile') {
    availableActions = ['follow'];
  } else {
    availableActions = ['view', 'like', 'comment'];
  }

  if (!ctx.session.selectedActions) {
    ctx.session.selectedActions = {
      views: 0,
      likes: 0,
      comments: 0,
      follows: 0
    };
  }

  const selected = ctx.session.selectedActions;
  const totalCredits = selected.views * 1 + selected.likes * 5 + selected.comments * 10 + selected.follows * 30;

  const actionRows = [];
  const rows = [];

  availableActions.forEach(action => {
    const icon = action === 'view' ? '👀' : action === 'like' ? '❤️' : action === 'comment' ? '💬' : '👥';
    const name = action === 'view' ? 'Просмотры' : action === 'like' ? 'Лайки' : action === 'comment' ? 'Комментарии' : 'Подписчики';
    const cost = action === 'view' ? 1 : action === 'like' ? 5 : action === 'comment' ? 10 : 30;
    const count = selected[action + 's'] || selected[action];

    rows.push({
      text: `${icon} ${name}: ${cost}💎 ${count > 0 ? `(${count})` : ''}`,
      callback_data: `select_${action}s`
    });
  });

  actionRows.push(...rows.map(row => [row]));

  const keyboard = [
    ...actionRows,
    [{ text: `✅ Подтвердить (${totalCredits} 💎)`, callback_data: 'confirm_project_add' }],
    [{ text: '❌ Отменить', callback_data: 'cancel_project_add' }]
  ];

  let actionsList = '';
  availableActions.forEach(action => {
    const icon = action === 'view' ? '🥇' : action === 'like' ? '❤️' : action === 'comment' ? '💬' : '👥';
    const name = action === 'view' ? 'Просмотры' : action === 'like' ? 'Лайки' : action === 'comment' ? 'Комментарии' : 'Подписчики';
    const count = selected[action + 's'] || selected[action] || 0;
    const cost = count * (action === 'view' ? 1 : action === 'like' ? 5 : action === 'comment' ? 10 : 30);
    actionsList += `${icon} ${name}: ${count} (+${cost}💎)\n`;
  });

  const message = `🆕 **Добавление проекта**\n\n**Проект:** ${project.url}\n**Платформа:** ${project.platform}\n\n💰 **Ваш баланс:** ${user.credits} 💎\n\nВыберите действия для покупки:\n\n${actionsList}\n**Итого к оплате:** ${totalCredits} 💎`;

  if (ctx.session.actionsMessageId) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.actionsMessageId);
    } catch (error) {}
  }

  const sentMessage = await ctx.reply(message, {
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: 'Markdown'
  });
  ctx.session.actionsMessageId = sentMessage.message_id;
}

async function getUserPlatforms(userId) {
  const user = await getUserById(userId);
  const platforms = [];
  if (user.behance_username) platforms.push('behance');
  if (user.dribbble_username) platforms.push('dribbble');
  if (user.artstation_username) platforms.push('artstation');
  return platforms;
}

async function showNextTask(ctx, userId, platforms = []) {
  // Удаляем предыдущее сообщение "Спасибо за взаимную поддержку!" если оно есть
  if (ctx.session.thankYouMessageId) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, ctx.session.thankYouMessageId);
    } catch (error) {
      // Игнорируем ошибки удаления (сообщение может уже быть удалено)
    }
    delete ctx.session.thankYouMessageId;
  }

  const projects = await getProjectsForAction(userId, platforms);
  if (projects.length === 0) {
    if (platforms.length === 0) {
      await ctx.reply('🔗 **Чтобы получать доступ к заданиям от других пользователей, настройте свои профили на платформах!**\n\nПерейдите в ⚙️ Настройки -> 🔗 Настроить профили и укажите ваши аккаунты Behance, Dribbble или ArtStation.\n\nЭто позволит вам взаимодействовать с заданиями на этих платформах.', {
        reply_markup: { inline_keyboard: [[{ text: '⚙️ Перейти к настройкам', callback_data: 'settings_profiles' }]] },
        parse_mode: 'Markdown'
      });
    } else {
    const keyboard = [
      [{ text: '➕ Добавить проект', callback_data: 'add_project' }]
    ];

      await ctx.reply('🎉 **Все доступные задания выполнены!**\n\nВ настоящий момент нет новых проектов для поддержки. Подключите уведомления, чтобы получать оповещения о новых проектах и продолжать зарабатывать кредиты!\n\nПока что вы можете добавить свой проект в систему взаимной поддержки.', {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });
    }
    return;
  }

  // Показываем только одно задание (первый доступный проект), как в меню "Доступные задания"
  if (projects.length > 0) {
    const project = projects[0]; // Берем только первый проект
    const projectOwner = await getUserById(project.user_id);
    const username = projectOwner ? (projectOwner.username || 'дизайнер') : 'дизайнер';
    const ownerId = projectOwner ? projectOwner.id : 0;

    const availableActions = await getUndoneActionsForProject(project.id, userId);

    const keyboard = [
      ...availableActions.map(action => ([{
        text: getActionText(action),
        callback_data: `${action}_project_${project.id}`
      }])),
      [{ text: '🚨 Пожаловаться на нарушение', callback_data: `complain_${project.id}_${ownerId}` }]
    ].filter(row => row.length > 0);

    const actionType = availableActions[0];
    const credits = await getCreditsForAction(project.id, actionType);
    const actionWord = actionType === 'like' ? 'лайк' : actionType === 'follow' ? 'подписку' : actionType === 'comment' ? 'комментарий' : 'просмотр';

    let actionVerb;
    switch (actionType) {
      case 'view':
        actionVerb = 'Посмотреть';
        break;
      case 'like':
        actionVerb = 'Поставить лайк';
        break;
      case 'follow':
        actionVerb = 'Подписаться';
        break;
      case 'comment':
        actionVerb = 'Оставить комментарий';
        break;
      default:
        actionVerb = 'Посмотреть';
    }

    console.log(`🎯 DEBUG: Отправляем проект ${project.id} с действием ${actionType}`);
    await ctx.reply(`🎯 **${actionVerb} проекту**\n\n🔗 ${project.url}\n\n💰 +${credits} 💎 после выполнения\n\n⚠️ Обязательный настоящий ${actionWord} на сайте`, {
      reply_markup: { inline_keyboard: keyboard },
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }
}

function detectPlatform(url) {
  if (url.includes('behance.net')) return 'behance';
  if (url.includes('dribbble.com')) return 'dribbble';
  if (url.includes('artstation.com')) return 'artstation';
  return 'unknown';
}

function getUserProjects(userId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM projects WHERE user_id = ? ORDER BY added_date DESC', [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getProjectActionsAndParticipants(projectId) {
  return new Promise((resolve, reject) => {
    const result = {};

    db.all(`
      SELECT pa.action_type, COUNT(at.id) as performed_count,
             GROUP_CONCAT(DISTINCT at.from_user_id) as users
      FROM project_actions pa
      LEFT JOIN action_transactions at ON pa.project_id = at.to_project_id AND pa.action_type = at.action_type
      WHERE pa.project_id = ?
      GROUP BY pa.action_type
    `, [projectId], (err, rows) => {
      if (err) reject(err);

      result.actions = rows;
      resolve(result);
    });
  });
}

function getActionsForProject(projectId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT DISTINCT at.*, u.username AS performer_username,
             u.behance_username, u.dribbble_username, u.artstation_username,
             p.platform, p.url as project_url
      FROM action_transactions at
      JOIN users u ON at.from_user_id = u.id
      JOIN projects p ON at.to_project_id = p.id
      WHERE at.to_project_id = ?
      ORDER BY at.transaction_date DESC
    `, [projectId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  bot
};
