const sqlite3 = require('sqlite3').verbose();

// Создаем базу данных
const db = new sqlite3.Database('./bot.db', (err) => {
  if (err) {
  } else {
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
      artstation_username TEXT,
      dprofile_username TEXT
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

  // Таблица заявок на разблокировку
  db.run(`
    CREATE TABLE IF NOT EXISTS unban_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,              -- пользователь подающий заявку
      reason TEXT DEFAULT '',        -- причина (необязательно)
      status TEXT DEFAULT 'pending', -- pending/approved/declined
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TEXT,
      reviewed_by INTEGER,           -- админ рассмотревший
      review_comment TEXT,           -- комментарий админа
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (reviewed_by) REFERENCES users (id)
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
      count INTEGER, -- количество действий данного типа
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
    }
  });

  db.run(`
    ALTER TABLE complaints ADD COLUMN resolved_by INTEGER
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
    }
  });



  // Добавляем колонку project_url в action_transactions если её нет
  db.run(`
    ALTER TABLE action_transactions ADD COLUMN project_url TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
    } else if (!err) {
    }
  });

  // Добавляем колонку dprofile_username если её нет
  db.run(`
    ALTER TABLE users ADD COLUMN dprofile_username TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
    } else if (!err) {
    }
  });

  // Добавляем колонку language если её нет
  db.run(`
    ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'ru'
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
    } else if (!err) {
    }
  });

  // Добавляем колонку referral_code если её нет
  db.run(`
    ALTER TABLE users ADD COLUMN referral_code TEXT
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
    }
  });

  // Добавляем уникальный индекс на referral_code, если его нет
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)
  `, (err) => {
    if (err) {
    } else {
    }
  });

  // Исправляем рейтинг для существующих пользователей (если он был 100 по умолчанию)
  db.run(`UPDATE users SET rating = 0.0 WHERE rating = 100.0`, (err) => {
    if (err) {
    } else {
    }
  });

  // Таблица рефералов
  db.run(`
    CREATE TABLE IF NOT EXISTS referals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER,      -- пригласивший пользователь
      referred_id INTEGER,      -- приглашенный пользователь
      created_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referrer_id) REFERENCES users (id),
      FOREIGN KEY (referred_id) REFERENCES users (id)
    )
  `);

  // Таблица реферальных бонусов
  db.run(`
    CREATE TABLE IF NOT EXISTS referral_bonuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      amount INTEGER,
      type TEXT, -- 'registration', 'referred_action', 'purchase'
      description TEXT,
      referred_id INTEGER, -- ID реферала, от которого пришел бонус
      created_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (referred_id) REFERENCES users (id)
    )
  `);

  // Таблица реферальных кодов
  db.run(`
    CREATE TABLE IF NOT EXISTS referral_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_user_id INTEGER UNIQUE,
      code TEXT UNIQUE,
      created_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referrer_user_id) REFERENCES users (id)
    )
  `);

  // Таблица выполненных действий по ссылкам (для перманентного запоминания)
  db.run(`
    CREATE TABLE IF NOT EXISTS completed_url_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      url TEXT,
      action_type TEXT,
      completed_date TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      UNIQUE(user_id, url, action_type)
    )
  `);

  // Добавляем колонку referred_id в referral_bonuses если её нет
  db.run(`
    ALTER TABLE referral_bonuses ADD COLUMN referred_id INTEGER REFERENCES users(id)
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
    } else if (!err) {
    }
  });

  // Добавляем колонку count в project_actions если её нет
  db.run(`
    ALTER TABLE project_actions ADD COLUMN count INTEGER
  `, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
    } else if (!err) {
    }
  });

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


    // Сначала посмотрим всех пользователей
    db.all('SELECT u.id, u.telegram_id, u.username FROM users u', [], (err, allUsers) => {
      if (err) {
      } else {
      }

      // Теперь посмотрим все баны
      db.all('SELECT * FROM user_bans', [], (err, allBans) => {
        if (err) {
        } else {
        }

        // Теперь выполняем основной запрос
        db.all(query, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
    });
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
            AND NOT EXISTS (
              SELECT 1 FROM completed_url_actions cua
              WHERE cua.user_id = ?
                AND cua.url = p.url
                AND cua.action_type = pa.action_type
            )
        )
        ${placeholder}
      ORDER BY p.added_date DESC
      LIMIT 5
    `, [userId, userId, userId, userId, ...allowedPlatforms], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getUndoneActionsForProject(projectId, userId) {
  return new Promise(async (resolve, reject) => {
    try {
      // Получаем URL проекта для проверки по URL
      const project = await new Promise((resolve, reject) => {
        db.get('SELECT url FROM projects WHERE id = ?', [projectId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

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

function getActionText(action, language = 'ru') {
  const emoji = {
    like: '❤️',
    follow: '👥',
    comment: '💬',
    view: '👀'
  }[action] || '';

  const verbKeys = {
    like: 'put_like',
    follow: 'subscribe',
    comment: 'leave_comment',
    view: 'view_project'
  };

  const verbKey = verbKeys[action];
  if (!verbKey) return '';

  // Импортируем функцию t из lang.js
  const { t } = require('./src/utils/lang');
  return `${emoji} ${t(language, verbKey)}`;
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

// Функция для сохранения жалобы
function saveComplaint(complainantId, reportedUserId, projectId, complaintType, message = '') {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO complaints (complainant_user_id, reported_user_id, project_id, complaint_type, complaint_message) VALUES (?, ?, ?, ?, ?)',
      [complainantId, reportedUserId, projectId, complaintType, message],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Функция для массовой рассылки сообщений
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


    // Отправляем сообщение каждому пользователю
    for (const user of activeUsers) {
      try {
        await ctx.telegram.sendMessage(user.telegram_id, messageText, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });

        result.sentCount++;

        // Небольшая задержка, чтобы избежать блокировки API Telegram
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        result.errors.push({
          userId: user.telegram_id,
          username: user.username,
          error: error.message
        });
      }
    }


  } catch (error) {
    throw error;
  }

  return result;
}

// Функция для декримента кредитов (если нужно)
function decrementCredits(userId, credits) {
  return updateCredits(userId, -credits);
}

// Функция для генерации уникального реферального кода
function generateReferralCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result; // Убираем префикс REF - он добавляется в другом месте
}

// Функция для получения или создания реферального кода пользователя
function getOrCreateReferralCode(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT referral_code FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else if (row && row.referral_code) {
        resolve(row.referral_code);
      } else {
        // Генерируем уникальный код
        let code;
        let attempts = 0;
        const maxAttempts = 10;

        const tryGenerateCode = () => {
          code = generateReferralCode();
          db.get('SELECT id FROM users WHERE referral_code = ?', [code], (err, existingRow) => {
            if (err) reject(err);
            else if (existingRow) {
              attempts++;
              if (attempts >= maxAttempts) {
                reject(new Error('Не удалось сгенерировать уникальный реферальный код'));
              } else {
                tryGenerateCode();
              }
            } else {
              // Код уникален, обновляем пользователя
              db.run('UPDATE users SET referral_code = ? WHERE id = ?', [code, userId], function(err) {
                if (err) reject(err);
                else resolve(code);
              });
            }
          });
        };

        tryGenerateCode();
      }
    });
  });
}

// Функция для создания реферальной связи
function createReferral(referrerId, referredId) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR IGNORE INTO referals (referrer_id, referred_id) VALUES (?, ?)',
      [referrerId, referredId],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Функция для получения реферального дерева пользователя
function getReferralTree(userId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT r.*, u.username, u.telegram_id, u.registered_date
      FROM referals r
      JOIN users u ON r.referred_id = u.id
      WHERE r.referrer_id = ?
      ORDER BY r.created_date DESC
    `, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Функция для получения статистики рефералов пользователя
function getReferralStats(userId) {
  return new Promise(async (resolve, reject) => {
    try {
      const stats = {};

      // Количество приглашенных
      const totalReferrals = await new Promise((res, rej) => {
        db.get('SELECT COUNT(*) as count FROM referals WHERE referrer_id = ?', [userId], (err, row) => {
          if (err) rej(err);
          res(row ? row.count : 0);
        });
      });

      // Сумма заработанных реферальных бонусов за все время
      const totalEarnedReferrals = await new Promise((res, rej) => {
        db.get('SELECT SUM(amount) as total FROM referral_bonuses WHERE user_id = ?', [userId], (err, row) => {
          if (err) rej(err);
          res(row ? row.total || 0 : 0);
        });
      });

      // Сумма заработанных реферальных бонусов за сегодняшний день
      const todayEarnedReferrals = await new Promise((res, rej) => {
        const today = new Date().toISOString().split('T')[0];
        db.get('SELECT SUM(amount) as total FROM referral_bonuses WHERE user_id = ? AND DATE(created_date) = ?', [userId, today], (err, row) => {
          if (err) rej(err);
          res(row ? row.total || 0 : 0);
        });
      });

      stats.totalReferrals = totalReferrals;
      stats.totalEarnedReferrals = totalEarnedReferrals;
      stats.todayEarnedReferrals = todayEarnedReferrals;

      resolve(stats);

    } catch (error) {
      reject(error);
    }
  });
}

// Функция для получения реферрера пользователя
function getUserReferrer(userId) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT r.*, u.username, u.telegram_id
      FROM referals r
      JOIN users u ON r.referrer_id = u.id
      WHERE r.referred_id = ?
    `, [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
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
  getAllActiveUsers,
  getProjectsForAction,
  getUndoneActionsForProject,
  getCreditsForAction,
  getActionText,
  getActionsForProject,
  saveComplaint,
  sendBroadcastMessage,
  decrementCredits,
  generateReferralCode,
  getOrCreateReferralCode,
  createReferral,
  getReferralTree,
  getReferralStats,
  getUserReferrer
};
