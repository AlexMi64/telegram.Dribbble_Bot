const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Создаем путь к файлу базы данных
const dbPath = path.join(__dirname, 'bot.db');

// Подключаемся к базе данных
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    process.exit(1);
  } else {
  }
});

// Функция для очистки таблиц
function clearDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {

      // Очищаем все таблицы (кроме схемы)
      const tables = [
        'referral_bonuses',
        'referral_codes',
        'referals',
        'action_transactions',
        'project_actions',
        'credit_purchases',
        'projects',
        'users',
        'complaints',
        'unban_requests',
        'user_bans',
        'platform_tokens'
      ];

      const promises = tables.map(tableName => {
        return new Promise((resolve, reject) => {
          db.run(`DELETE FROM ${tableName}`, function(err) {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });

      // Ожидаем завершения всех очисток
      Promise.all(promises).then(() => {
        // Сбрасываем автоннкрементные счетчики (сделать счетчики с 1)
        const resetPromises = tables.map(tableName => {
          return new Promise((resolve) => {
            db.run(`DELETE FROM sqlite_sequence WHERE name='${tableName}'`, function(err) {
              if (err) {
                // Игнорируем ошибки - эта таблица может не существовать
              }
              resolve();
            });
          });
        });

        Promise.all(resetPromises).then(() => {

          // Закрываем соединение
          db.close((err) => {
            if (err) {
            } else {
            }
            resolve();
          });
        });
      }).catch(reject);
    });
  });
}

// Запускаем очистку
clearDatabase()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    process.exit(1);
  });
