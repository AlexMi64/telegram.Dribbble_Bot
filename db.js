const sqlite3 = require('sqlite3').verbose();

// Создаем базу данных
const db = new sqlite3.Database('./bot.db', (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Создаем таблицы
db.serialize(() => {
  // Таблица пользователей
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE,
      username TEXT,
      email TEXT,
      rating REAL DEFAULT 0.0,
      credits INTEGER DEFAULT 0,
      warnings_count INTEGER DEFAULT 0,
      subscription TEXT DEFAULT 'free',
      registered_date TEXT DEFAULT CURRENT_TIMESTAMP,
      last_active TEXT DEFAULT CURRENT_TIMESTAMP,
      behance_username TEXT,
      dribbble_username TEXT,
      artstation_username TEXT
    )
  `);

  // Таблица проектов
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      url TEXT,
      platform TEXT, -- 'behance', 'dribbble', 'artstation', 'instagram'
      status TEXT DEFAULT 'active', -- 'active', 'inactive'
      added_date TEXT DEFAULT CURRENT_TIMESTAMP,
      likes_received INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Таблица транзакций действий
  db.run(`
    CREATE TABLE IF NOT EXISTS action_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER,
      to_project_id INTEGER,
      project_url TEXT,
      action_type TEXT,
      credited BOOLEAN DEFAULT 1,
      transaction_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (from_user_id) REFERENCES users (id),
      UNIQUE(from_user_id, to_project_id, action_type)
    )
  `);

  // Таблица покупок кристаллов
  db.run(`
    CREATE TABLE IF NOT EXISTS credit_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      amount INTEGER,
      cost REAL,
      payment_method TEXT,
      purchase_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // Таблица токенов платформ для пользователей
  db.run(`
    CREATE TABLE IF NOT EXISTS platform_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      platform TEXT, -- behance, dribbble, artstation
      access_token TEXT,
      created_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      UNIQUE(user_id, platform)
    )
  `);

  // Таблица жалоб на нарушения
  db.run(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complainant_user_id INTEGER, -- кто жалуется
      reported_user_id INTEGER,    -- на кого жалуются
      project_id INTEGER,          -- проект где нарушение
      complaint_type TEXT,         -- типа нарушения
      complaint_message TEXT,      -- описание
      status TEXT DEFAULT 'pending', -- pending/resolved/rejected
      created_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complainant_user_id) REFERENCES users (id),
      FOREIGN KEY (reported_user_id) REFERENCES users (id),
      FOREIGN KEY (project_id) REFERENCES projects (id)
    )
  `);

  // Таблица банов пользователей
  db.run(`
    CREATE TABLE IF NOT EXISTS user_bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      reason TEXT,
      ban_until TEXT, -- дата истечения бана или 'permanent'
      banned_by INTEGER, -- админ который забанил
      created_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (banned_by) REFERENCES users (id)
    )
  `);

  // Таблица купленных действий для проектов
  db.run(`
    CREATE TABLE IF NOT EXISTS project_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      action_type TEXT, -- 'base', 'view', 'like', 'comment', 'follow'
      credits_spent INTEGER,
      status TEXT DEFAULT 'pending', -- pending, completed, failed
      created_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects (id)
    )
  `);

  // Обновляем таблицу complaints, если нужно добавить admin_comment
  db.run(`
    ALTER TABLE complaints ADD COLUMN admin_comment TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Error adding admin_comment to complaints:', err.message);
    }
  });

  db.run(`
    ALTER TABLE complaints ADD COLUMN resolved_by INTEGER
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Error adding resolved_by to complaints:', err.message);
    }
  });



  // Добавляем колонку project_url в action_transactions если её нет
  db.run(`
    ALTER TABLE action_transactions ADD COLUMN project_url TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Error adding project_url to action_transactions:', err.message);
    } else if (!err) {
      console.log('Added project_url column to action_transactions');
    }
  });

  // Исправляем рейтинг для существующих пользователей (если он был 100 по умолчанию)
  db.run(`UPDATE users SET rating = 0.0 WHERE rating = 100.0`, (err) => {
    if (err) {
      console.log('Error updating existing ratings:', err.message);
    } else {
      console.log('Existing user ratings corrected from 100 to 0');
    }
  });

  console.log('Database tables created.');
});

// Расширенная статистика пользователя
function getUserDetailedStats(userId) {
  return new Promise(async (resolve, reject) => {
    const stats = {};

    try {
      // Получить текущие кристаллы пользователя
      const userCredits = await new Promise((res, rej) => {
        db.get('SELECT credits FROM users WHERE telegram_id = ?', [userId], (err, row) => {
          if (err) rej(err);
          res(row ? row.credits : 0);
        });
      });

      // Всего выполнено заданий с заработком
      const tasksCompleted = await new Promise((res, rej) => {
        db.get('SELECT COUNT(*) as total FROM action_transactions WHERE from_user_id = ?', [userId], (err, row) => {
          if (err) rej(err);
          res(row.total || 0);
        });
      });

      // Проектов добавлено
      const projectsAdded = await new Promise((res, rej) => {
        db.get('SELECT COUNT(*) as count FROM projects WHERE user_id = ?', [userId], (err, row) => {
          if (err) rej(err);
          res(row.count || 0);
        });
      });

      const basicStats = {
        tasksCompleted: tasksCompleted,
        crystalsEarned: userCredits, // используем текущее значение из users
        projectsAdded: projectsAdded
      };

      // Статистика за последние 7 дней (просто количество задач)
      const weekStats = await new Promise((res, rej) => {
        db.get('SELECT COUNT(*) as tasks_week FROM action_transactions WHERE from_user_id = ? AND transaction_date >= datetime("now", "-7 days")', [userId], (err, row) => {
          if (err) rej(err);
          const stats_week = {
            tasksWeek: row.tasks_week || 0,
            crystalsWeek: 0, // упростим, потом можем добавить
            dailyAverage: Math.round((row.tasks_week || 0) / 7)
          };
          res(stats_week);
        });
      });

      // Статистика по типам действий
      const actionStats = await new Promise((res, rej) => {
        const stats_actions = { view: 0, like: 0, comment: 0, follow: 0 };

        db.all('SELECT action_type, COUNT(*) as count FROM action_transactions WHERE from_user_id = ? GROUP BY action_type', [userId], (err, rows) => {
          if (err) rej(err);

          rows.forEach(row => {
            stats_actions[row.action_type] = row.count;
          });

          res(stats_actions);
        });
      });

      // Взаимопомощь
      const socialStats = await new Promise((res, rej) => {
        const stats_social = {};

        // Я помог другим
        db.get('SELECT COUNT(*) as helped FROM action_transactions WHERE from_user_id = ?', [userId], (err, row) => {
          if (err) rej(err);
          stats_social.iHelpedOthers = row.helped || 0;

          // Другие помогли мне
          db.get('SELECT COUNT(*) as received FROM action_transactions WHERE to_project_id IN (SELECT id FROM projects WHERE user_id = ?)', [userId], (err, row) => {
            if (err) rej(err);
            stats_social.othersHelpedMe = row.received || 0;

            res(stats_social);
          });
        });
      });

      // Эффективность (все действия засчитаны по умолчанию)
      const efficiencyStats = {
        successRate: 100, // пока все credited=1 по умолчанию
        tasksTotal: tasksCompleted
      };

      // Лучший день за неделю
      const bestDayWeek = await new Promise((res, rej) => {
        db.get('SELECT DATE(transaction_date) as day, COUNT(*) as tasks FROM action_transactions WHERE from_user_id = ? AND transaction_date >= datetime("now", "-7 days") GROUP BY DATE(transaction_date) ORDER BY tasks DESC LIMIT 1', [userId], (err, row) => {
          if (err) rej(err);
          if (row) {
            const date = new Date(row.day);
            const best_day = {
              weekday: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][date.getDay()],
              tasks: row.tasks
            };
            res(best_day);
          } else {
            res(null);
          }
        });
      });

      // Объединяем всю статистику
      const detailedStats = Object.assign({}, basicStats, weekStats, actionStats, socialStats, efficiencyStats);
      detailedStats.bestDayWeek = bestDayWeek;

      resolve(detailedStats);

    } catch (error) {
      reject(error);
    }
  });
}

// Функции для работы с жалобами
function getPendingComplaints() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT c.*,
             u1.username as complainant_username,
             u2.username as reported_username,
             p.url as project_url
      FROM complaints c
      LEFT JOIN users u1 ON c.complainant_user_id = u1.id
      LEFT JOIN users u2 ON c.reported_user_id = u2.id
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.status = 'pending'
      ORDER BY c.created_date DESC
    `, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getComplaintById(id) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT c.*,
             u1.username as complainant_username, u1.telegram_id as complainant_telegram_id,
             u2.username as reported_username, u2.telegram_id as reported_telegram_id,
             p.url as project_url, p.platform
      FROM complaints c
      LEFT JOIN users u1 ON c.complainant_user_id = u1.id
      LEFT JOIN users u2 ON c.reported_user_id = u2.id
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.id = ?
    `, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function updateComplaintStatus(id, status, adminId, adminComment = '') {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE complaints SET status = ?, resolved_by = ?, admin_comment = ? WHERE id = ?',
      [status, adminId, adminComment, id],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

// Функции для работы с банами
function banUser(userId, reason, bannedBy, banUntil = 'permanent') {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO user_bans (user_id, reason, ban_until, banned_by) VALUES (?, ?, ?, ?)',
      [userId, reason, banUntil, bannedBy],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getUserBans(userId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM user_bans WHERE user_id = ? ORDER BY created_date DESC', [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function isUserBanned(telegramUserId) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT ub.* FROM user_bans ub
      JOIN users u ON ub.user_id = u.id
      WHERE u.telegram_id = ? AND (ub.ban_until = 'permanent' OR ub.ban_until > datetime('now'))
      ORDER BY ub.created_date DESC LIMIT 1
    `, [telegramUserId], (err, row) => {
      if (err) reject(err);
      else resolve(!!row); // возвращает true если бан активен
    });
  });
}

function unbanUser(userId, unbannedBy) {
  return new Promise((resolve, reject) => {
    // Удаляем все активные баны пользователя - просто убираем записи
    db.run(
      'DELETE FROM user_bans WHERE user_id = ? AND (ban_until = \'permanent\' OR ban_until > datetime(\'now\'))',
      [userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

// Функции для работы с предупреждениями
function getUserWarningsCount(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT warnings_count FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.warnings_count : 0);
    });
  });
}

function incrementUserWarnings(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET warnings_count = warnings_count + 1 WHERE id = ?',
      [userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

function resetUserWarnings(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET warnings_count = 0 WHERE id = ?',
      [userId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

// Функция для получения всех активных пользователей (не забаненных)
function getAllActiveUsers(excludeAdminId = null) {
  return new Promise((resolve, reject) => {
    let query = `
      SELECT u.telegram_id, u.username
      FROM users u
      LEFT JOIN user_bans ub ON u.id = ub.user_id AND (ub.ban_until = 'permanent' OR ub.ban_until > datetime('now'))
      WHERE ub.id IS NULL
    `;
    const params = [];

    if (excludeAdminId) {
      query += ' AND u.telegram_id != ?';
      params.push(excludeAdminId);
    }

    console.log(`🔍 ДЕБАГ getAllActiveUsers: Запрос: ${query}`);
    console.log(`🔍 ДЕБАГ getAllActiveUsers: Параметры:`, params);

    // Сначала посмотрим всех пользователей
    db.all('SELECT u.id, u.telegram_id, u.username FROM users u', [], (err, allUsers) => {
      if (err) {
        console.log('❌ Ошибка при получении всех пользователей:', err);
      } else {
        console.log(`👥 ДЕБАГ Всего пользователей в БД: ${allUsers.length}`, allUsers.map(u => `${u.telegram_id} (${u.username})`).join(', '));
      }

      // Теперь посмотрим все баны
      db.all('SELECT * FROM user_bans', [], (err, allBans) => {
        if (err) {
          console.log('❌ Ошибка при получении всех банов:', err);
        } else {
          console.log(`🚫 ДЕБАГ Всего банов в БД: ${allBans.length}`, allBans.map(b => `user ${b.user_id} until ${b.ban_until}`).join(', '));
        }

        // Теперь выполняем основной запрос
        db.all(query, params, (err, rows) => {
          if (err) {
            console.log('❌ Ошибка при получении активных пользователей:', err);
            reject(err);
          } else {
            console.log(`✅ ДЕБАГ Активных пользователей найдено: ${rows.length}`);
            console.log(`👤 Список активных:`, rows.map(u => `${u.telegram_id} (${u.username})`).join(', '));
            resolve(rows);
          }
        });
      });
    });
  });
}

module.exports = {
  db,
  getUserDetailedStats,
  getPendingComplaints,
  getComplaintById,
  updateComplaintStatus,
  banUser,
  getUserBans,
  isUserBanned,
  unbanUser,
  getUserWarningsCount,
  incrementUserWarnings,
  resetUserWarnings,
  getAllActiveUsers
};
