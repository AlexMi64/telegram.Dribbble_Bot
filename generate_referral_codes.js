// Скрипт для генерации реферального кода для существующих пользователей
const { db, getOrCreateReferralCode, generateReferralCode } = require('./db');


db.serialize(() => {
  // Получаем всех пользователей без реферального кода
  db.all('SELECT id, telegram_id, username FROM users WHERE referral_code IS NULL OR referral_code = ""', [], (err, users) => {
    if (err) {
      return;
    }

    if (users.length === 0) {
      return;
    }


    let processed = 0;

    users.forEach(user => {
      getOrCreateReferralCode(user.id).then(code => {
        processed++;

        if (processed === users.length) {
          db.close();
        }
      }).catch(error => {
        processed++;

        if (processed === users.length) {
          db.close();
        }
      });
    });
  });
});
