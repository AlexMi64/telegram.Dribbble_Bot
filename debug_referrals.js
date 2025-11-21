// Скрипт для отладки реферальной системы
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bot.db');

// Проверяем все реферальные данные

// Проверим ID пользователей
db.all('SELECT id, telegram_id, username, referral_code FROM users', (err, users) => {
  if (err) {
    return;
  }

  users.forEach(user => {
    console.log(`User: ${user.username} (ID: ${user.id}, Telegram: ${user.telegram_id}, Code: ${user.referral_code})`);
  });

  // Проверим рефералы
  db.all('SELECT * FROM referals', (err, referrals) => {
    if (err) {
      return;
    }

    if (referrals.length === 0) {
      console.log('No referrals found');
    } else {
      console.log(`Found ${referrals.length} referrals:`);
      referrals.forEach(ref => {
        console.log(`Referral: referrer ${ref.referrer_id} -> referred ${ref.referred_id} at ${ref.created_date}`);
      });
    }

    // Проверим бонусы
    db.all('SELECT * FROM referral_bonuses', (err, bonuses) => {
      if (err) {
        return;
      }

      if (bonuses.length === 0) {
        console.log('No referral bonuses found');
      } else {
        console.log(`Found ${bonuses.length} referral bonuses:`);
        bonuses.forEach(bonus => {
          console.log(`Bonus: user ${bonus.user_id}, amount ${bonus.amount}, type ${bonus.type}, referred ${bonus.referred_id}`);
        });
      }

      // Fix database: set referred_id for old records
      console.log('\nFixing old referral bonuses...');
      db.run(`
        UPDATE referral_bonuses
        SET referred_id = (
          SELECT r.referred_id
          FROM referals r
          WHERE r.referrer_id = referral_bonuses.user_id
          LIMIT 1
        )
        WHERE referred_id IS NULL
      `, function(err) {
        if (err) {
          console.log('Error updating: ', err);
        } else {
          console.log(`Updated ${this.changes} rows`);
        }

        // Test today's referral earnings
        const { getReferralStats } = require('./db');
        getReferralStats(1).then(stats => {
          console.log('Referral stats for user 1:', stats);
        });

        db.close((err) => {
          if (err) {
            console.log('Error closing: ', err);
          } else {
            console.log('Database closed');
          }
        });
      });
    });
  });
});
