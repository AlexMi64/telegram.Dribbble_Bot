// Импорт плоских переводов
const ruTranslations = require('./ru_flat');
const engTranslations = require('./eng_flat');

// Объединяем переводы в один объект
const translations = {
  ru: ruTranslations,
  eng: engTranslations
};


// Функция для получения перевода
function t(lang, key, params = {}) {
  // Маппинг языков: 'en' -> 'eng', другие -> 'ru'
  let language = 'ru'; // default
  if (lang === 'en') language = 'eng';
  else if (lang === 'ru') language = 'ru';
  else if (lang === 'eng') language = 'eng'; // для прямого использования
  else language = 'ru'; // fallback


  // Прямой доступ по ключу
  let text = translations[language]?.[key];
  let fallbackText = translations.ru[key]; // fallback на русский


  text = text || fallbackText || key;


  if (key === 'select_language') {
  }

  // Заменяем плейсхолдеры
  Object.keys(params).forEach(paramKey => {
    const beforeReplace = text;
    text = text.replace(new RegExp(`{${paramKey}}`, 'g'), params[paramKey]);
  });


  return text;
}

// Доступные языки
function getSupportedLanguages() {
  return Object.keys(translations);
}

module.exports = {
  t,
  getSupportedLanguages,
  translations
};
