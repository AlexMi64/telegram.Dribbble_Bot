
// Вспомогательные функции для работы с ссылками и платформами
const { t } = require('./lang');

/**
 * Определяет платформу по URL
 */
function detectPlatform(url) {
  if (url.includes('behance.net')) return 'behance';
  if (url.includes('dribbble.com')) return 'dribbble';
  if (url.includes('artstation.com')) return 'artstation';
  if (url.includes('dprofile.ru')) return 'dprofile';
  return 'unknown';
}

/**
 * Определяет тип ссылки (проект или профиль)
 */
function getLinkType(url) {
  if (url.includes('/shots/') || url.includes('/gallery/') || url.includes('/artwork/') || url.includes('/case/')) {
    return 'project';
  } else {
    return 'profile';
  }
}

/**
 * Проверяет валидность URL проекта
 */
function isValidProjectUrl(url) {
  const patterns = [
    /behance\.net\/gallery\//,
    /behance\.net\/([^\/]+)/,
    /dribbble\.com\/shots\//,
    /dribbble\.com\/([^\/\?#]+)/,
    /artstation\.com\//,
    /dprofile\.ru\//
  ];
  return patterns.some(pattern => pattern.test(url));
}

/**
 * Извлекает username из URL или текста
 */
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

/**
 * Получает текстовое описание действия (локализованное)
 */
function getActionText(action, lang = 'ru') {
  switch (action) {
    case 'like': return t(lang, 'action_like');
    case 'follow': return t(lang, 'action_follow');
    case 'comment': return t(lang, 'action_comment');
    case 'view': return t(lang, 'action_view');
    default: return '';
  }
}

/**
 * Получает уровень пользователя по рейтингу с локализацией
 */
function getUserLevel(rating, lang = 'ru') {
  if (rating < 100) return {
    name: t(lang, 'level_novice'),
    emoji: t(lang, 'level_novice_emoji'),
    maxPoints: 100,
    nextLevel: t(lang, 'level_designer')
  };
  if (rating < 500) return {
    name: t(lang, 'level_designer'),
    emoji: t(lang, 'level_designer_emoji'),
    maxPoints: 500,
    nextLevel: t(lang, 'level_profi')
  };
  if (rating < 1500) return {
    name: t(lang, 'level_profi'),
    emoji: t(lang, 'level_profi_emoji'),
    maxPoints: 1500,
    nextLevel: t(lang, 'level_expert')
  };
  return {
    name: t(lang, 'level_expert'),
    emoji: t(lang, 'level_expert_emoji'),
    maxPoints: null,
    nextLevel: null
  };
}

/**
 * Нормализует текст кнопки, переводя английскую клавиатуру обратно на русскую
 */
function normalizeKeyboardText(text) {
  if (!text) return text;

  // Словарь: английская кнопка → русская кнопка
  const buttonTranslations = {
    '🎯 Available Tasks': '🎯 Доступные задания',
    '➕ Add Project': '➕ Добавить проект',
    '📂 My Projects': '📂 Мои проекты',
    '📈 My Rating': '📈 Мой рейтинг',
    '💰 Balance': '💰 Баланс',
    '⚙️ Settings': '⚙️ Настройки',
    '🏛️ Admin Panel': '🏛️ Админ панель'
  };

  return buttonTranslations[text] || text;
}

/**
 * Форматирует клавиатуру для главного меню
 */
function getMainKeyboard(user = null, lang = 'ru') {

  let keyboard = [
    [t(lang, 'keyboard_available_tasks'), t(lang, 'keyboard_add_project')],
    [t(lang, 'keyboard_referrals'), t(lang, 'keyboard_rating')],
    [t(lang, 'keyboard_my_projects')],
    [t(lang, 'keyboard_balance'), t(lang, 'keyboard_settings')]
  ];

  // Добавляем отладочные логи для каждой кнопки
  keyboard.forEach((row, i) => {
    row.forEach((btn, j) => {
    });
  });

  // Если административный пользователь
  if (user?.telegram_id === 366323850) {
    keyboard.push([t(lang, 'keyboard_admin_panel')]);
  }

  return keyboard;
}

/**
 * Получает все варианты текста кнопок для универсального обработки
 */
function getKeyboardButtonVariants(buttonKey) {
  const variants = [];
  for (const lang of ['ru', 'en']) {
    const text = t(lang, buttonKey);
    if (!variants.includes(text)) {
      variants.push(text);
    }
  }
  return variants;
}

/**
 * Форматирует клавиатуру для админ панели (локализованную)
 */
function getAdminKeyboard(lang = 'ru') {
  return [
    [{ text: t(lang, 'admin_view_complaints'), callback_data: 'admin_view_complaints' }],
    [{ text: t(lang, 'admin_broadcast'), callback_data: 'admin_broadcast' }],
    [{ text: t(lang, 'admin_ban_user'), callback_data: 'admin_ban_user' }],
    [{ text: t(lang, 'admin_unban_user'), callback_data: 'admin_unban_user' }],
    [{ text: t(lang, 'admin_stats'), callback_data: 'admin_stats' }]
  ];
}

module.exports = {
  detectPlatform,
  getLinkType,
  isValidProjectUrl,
  extractUsername,
  getActionText,
  getUserLevel,
  normalizeKeyboardText,
  getMainKeyboard,
  getKeyboardButtonVariants,
  getAdminKeyboard
};
