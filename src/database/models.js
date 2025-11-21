// Модели данных для работы с пользователями и основными сущностями
const { db } = require('../../db');
const { t } = require('../utils/lang');

// Пользовательские функции
function registerUser(telegramId, username, referralCode = null) {
  return new Promise(async (resolve, reject) => {
    try {
      // Сначала проверяем, существует ли пользователь
      const existingUser = await getUser(telegramId);
      if (existingUser) {
        // Пользователь уже существует
        // Проверяем, есть ли у него уже реферрер
        const existingReferrer = await new Promise((resolve, reject) => {
          db.get('SELECT referrer_id FROM referals WHERE referred_id = ?', [existingUser.id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        // Если есть реферальный код, но у пользователя еще нет реферрера, применяем его
        if (referralCode && !existingReferrer) {
          try {
            const referrerId = await getReferrerByCode(referralCode);
            if (referrerId) {
              await applyReferralCode(existingUser.id, referralCode);
              await addReferralBonus(referrerId, 50, 'registration', existingUser.id);
            } else {
            }
          } catch (referralError) {
          }
        } else {
        }

        // Возвращаем ID существующего пользователя
        resolve(existingUser.id);
        return;
      }

      // Создаем нового пользователя
      db.run(
        `INSERT INTO users (telegram_id, username) VALUES (?, ?)`,
        [telegramId, username],
        async function(err) {
          if (err) reject(err);
          else {
            const userId = this.lastID;

            // Генерируем реферальный код для нового пользователя
            try {
              await require('../../db').getOrCreateReferralCode(userId);
            } catch (codeError) {
              // Не прерываем регистрацию из-за ошибки
            }

            // Если есть реферальный код, обрабатываем его
            if (referralCode) {
              try {
                // Начисляем бонус за регистрацию 50 кристаллов рефереру
                const referrerId = await getReferrerByCode(referralCode);

                if (referrerId) {
              await applyReferralCode(userId, referralCode);
              await addReferralBonus(referrerId, 50, 'registration', userId);
                }
              } catch (referralError) {
                // Не прерываем регистрацию из-за ошибки в рефералах
              }
            }

            resolve(userId);
          }
        }
      );
    } catch (error) {
      reject(error);
    }
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

function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

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

function updateUserLanguage(telegramId, language) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET language = ? WHERE telegram_id = ?`,
      [language, telegramId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
}

// Функции проектов
function getUserProjects(userId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM projects WHERE user_id = ? ORDER BY added_date DESC', [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
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

function getProjectById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM projects WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Функции для работы с рефералами
function getReferralCode(userId) {
  return new Promise((resolve, reject) => {
    require('../../db').getOrCreateReferralCode(userId).then(resolve).catch(reject);
  });
}

function createReferral(referrerId, referredId) {
  return new Promise((resolve, reject) => {
    require('../../db').createReferral(referrerId, referredId).then(resolve).catch(reject);
  });
}

function getReferralStats(userId) {
  return new Promise((resolve, reject) => {
    require('../../db').getReferralStats(userId).then(resolve).catch(reject);
  });
}

function getReferralTree(userId) {
  return new Promise((resolve, reject) => {
    require('../../db').getReferralTree(userId).then(resolve).catch(reject);
  });
}

function getOrCreateReferralCode(userId) {
  return new Promise((resolve, reject) => {
    require('../../db').getOrCreateReferralCode(userId).then(resolve).catch(reject);
  });
}

function getUserReferrals(userId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT u.*, r.created_date as referral_date FROM referals r JOIN users u ON r.referred_id = u.id WHERE r.referrer_id = ? ORDER BY r.created_date DESC', [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getUserReferralsWithEarnings(userId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT u.*, r.created_date as referral_date,
             COALESCE(SUM(rb.amount), 0) as earnings
      FROM referals r
      JOIN users u ON r.referred_id = u.id
      LEFT JOIN referral_bonuses rb ON rb.user_id = r.referrer_id AND rb.referred_id = r.referred_id
      WHERE r.referrer_id = ?
      GROUP BY r.referred_id
      ORDER BY r.created_date DESC
    `, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Функция для проверки реферального кода и получения реферера
function getReferrerByCode(referralCode) {
  return new Promise((resolve, reject) => {
    db.get('SELECT id, telegram_id FROM users WHERE referral_code = ?', [referralCode], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.id : null);
    });
  });
}

// Функция для применения реферального кода
function applyReferralCode(userId, referralCode) {
  return new Promise(async (resolve, reject) => {
    try {
      // Проверим, что пользователь еще не имеет реферера
      const existingReferral = await new Promise((resolve, reject) => {
        db.get('SELECT id FROM referals WHERE referred_id = ?', [userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existingReferral) {
        reject(new Error('User already has a referrer'));
        return;
      }

      // Найдем реферера по коду
      const referrerId = await getReferrerByCode(referralCode);
      if (!referrerId) {
        reject(new Error('Invalid referral code'));
        return;
      }

      // Создадим реферал
      const result = await new Promise((resolve, reject) => {
        db.run('INSERT INTO referals (referrer_id, referred_id) VALUES (?, ?)', [referrerId, userId], function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        });
      });

      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

// Функции для распределения реферальных бонусов
function addReferralBonus(userId, amount, bonusType, referredId = null) {
  return new Promise(async (resolve, reject) => {
    try {
      const user = await getUserById(userId);
      if (!user) {
        reject(new Error('User not found for referral bonus'));
        return;
      }

      // Обновляем баланс пользователя
      const oldCredits = user.credits || 0;
      const newCredits = oldCredits + amount;
      await updateCredits(userId, newCredits);

      const { t } = require('../utils/lang');
      const lang = user.language || 'ru';
      let bonusMessage = '';

      // Отправляем уведомление ТОЛЬКО за регистрацию, остальные бонусы тихие
      if (bonusType === 'registration') {
        bonusMessage = t(lang, 'referals.referral_bonus_registration', { amount });

        // Отправляем уведомление через webhook callback
        if (bonusMessage) {
          try {
            // Ищем экземпляр бота глобально
            // Это должно работать если бот запущен
            const botInstance = global.botInstance;
            if (botInstance) {
              await botInstance.telegram.sendMessage(user.telegram_id, bonusMessage, { parse_mode: 'Markdown' });
            } else {
            }
          } catch (error) {
          }
        }
      }

      // Логируем реферальный бонус всегда
      const result = await new Promise((resolve, reject) => {
        db.run('INSERT INTO referral_bonuses (user_id, amount, type, referred_id) VALUES (?, ?, ?, ?)', [userId, amount, bonusType, referredId], function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        });
      });

      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
}

function calculateReferralPercentage(baseAmount) {
  // 20% от покупок и заработка приглашенных пользователей
  return Math.round(baseAmount * 0.2);
}

function getUserReferralEarnings(telegramId) {
  return new Promise(async (resolve, reject) => {
    try {
      // Сначала получаем database ID по telegram ID
      const user = await getUser(telegramId);
      if (!user) {
        resolve(0);
        return;
      }

      // Сумма всех реферальных бонусов пользователя
      db.get('SELECT SUM(amount) as total FROM referral_bonuses WHERE user_id = ?', [user.id], (err, row) => {
        if (err) reject(err);
        else resolve(row.total || 0);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Эта функция устарела, используем processActionReferralBonuses
async function processReferralBonuses(userId, actionType) {
  return processActionReferralBonuses(userId, 0); // Не используем, так как не знаем конкретные кристаллы
}

// Функция для обработки реферальных бонусов за выполнение действия (20% от заработанных кристаллов)
async function processActionReferralBonuses(userId, earnedCredits) {
  try {
    // Проверяем, есть ли у пользователя реферрер
    const userReferrer = await new Promise((resolve, reject) => {
      db.get('SELECT referrer_id FROM referals WHERE referred_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!userReferrer) {
      return; // Нет реферрера, нет бонусов
    }

    // Рассчитываем реферальный бонус (20% от заработанных кристаллов)
    const referralBonus = calculateReferralPercentage(earnedCredits);

    if (referralBonus > 0) {
      // addReferralBonus уже отправляет уведомление
      await addReferralBonus(userReferrer.referrer_id, referralBonus, 'referred_action', userId);
    }

  } catch (error) {
  }
}

// Функция для обработки реферальных бонусов за покупку кредитов (20% от суммы покупки)
async function processReferralPurchaseBonuses(userId, purchaseAmount) {
  try {
    // Проверяем, есть ли у пользователя реферал
    const userReferrer = await new Promise((resolve, reject) => {
      db.get('SELECT referrer_id FROM referals WHERE referred_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!userReferrer) {
      return; // Нет реферера, нет бонусов
    }

    // Рассчитываем реферальный бонус (20% от суммы покупки)
    const referralBonus = calculateReferralPercentage(purchaseAmount);

    if (referralBonus > 0) {
      // addReferralBonus уже отправляет уведомление
      await addReferralBonus(userReferrer.referrer_id, referralBonus, 'purchase', userId);
    }

  } catch (error) {
  }
}

// Функция для получения списка реферальных связей пользователя
function getReferralList(userId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM referals WHERE referrer_id = ? OR referred_id = ?', [userId, userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Статистика пользователя
function getUserStats(telegramId) {
  return new Promise(async (resolve, reject) => {
    const stats = {};

    try {
      // Получить данные пользователя сначала
      const user = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (user) {
        stats.projectsCount = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM projects WHERE user_id = ?', [user.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });

        stats.actionsSent = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM action_transactions WHERE from_user_id = ?', [user.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });

        stats.actionsReceived = await new Promise((resolve, reject) => {
          db.get('SELECT COUNT(*) as count FROM action_transactions at JOIN projects p ON at.to_project_id = p.id WHERE p.user_id = ?', [user.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.count);
          });
        });

        stats.warningsReceived = user.warnings_count;
        stats.creditsPurchased = await new Promise((resolve, reject) => {
          db.get('SELECT SUM(amount) as total FROM credit_purchases WHERE user_id = ?', [user.id], (err, row) => {
            if (err) reject(err);
            else resolve(row.total || 0);
          });
        });

        stats.creditsSpent = await new Promise((resolve, reject) => {
          db.get('SELECT SUM(pa.credits_spent) as total FROM project_actions pa JOIN projects p ON pa.project_id = p.id WHERE p.user_id = ?', [user.id], (err, row) => {
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
        // Если пользователь не найден, возвращаем пустые значения
        stats.actionsSent = 0;
        stats.actionsReceived = 0;
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

// Дополнительные сервисные функции
function detectPlatform(url) {
  if (url.includes('behance.net')) return 'behance';
  if (url.includes('dribbble.com')) return 'dribbble';
  if (url.includes('artstation.com')) return 'artstation';
  if (url.includes('dprofile.ru')) return 'dprofile';
  return 'unknown';
}

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

function getLinkType(url) {
  if (url.includes('/shots/') || url.includes('/gallery/') || url.includes('/artwork/') || url.includes('/case/')) {
    return 'project';
  } else {
    return 'profile';
  }
}

function buyCredits(trueUserId, amount) {

  return new Promise(async (resolve, reject) => {
    try {
      const user = await getUser(trueUserId);
      if (!user) {
        reject(new Error('User not found'));
        return;
      }

      const newCredits = user.credits + amount;

      const prices = { 100: 100, 500: 450, 1000: 850 };
      const cost = prices[amount];


      const { db } = require('../../db');
      db.run('UPDATE users SET credits = ? WHERE id = ?', [newCredits, user.id], function(err) {
        if (err) {
          reject(err);
        } else {

          db.run('INSERT INTO credit_purchases (user_id, amount, cost) VALUES (?, ?, ?)', [user.id, amount, cost], async function(err) {
            if (err) {
              reject(err);
            } else {

              // Обрабатываем реферальные бонусы за покупку
              try {
                await processReferralPurchaseBonuses(user.id, cost); // передаем реальную стоимость в рублях
              } catch (error) {
                // Не прерываем основной поток
              }

              resolve();
            }
          });
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Реализация функции добавления проекта
async function showProjectActionsMenu(ctx) {
  const { t } = require('../utils/lang');
  const project = ctx.session.pendingProject;

  if (!project) {
    ctx.reply(t(ctx.session?.language, 'error'));
    return;
  }

  // Инициализируем счетчики действий
  if (!ctx.session.selectedActions) {
    ctx.session.selectedActions = {
      views: 0,
      likes: 0,
      comments: 0,
      follows: 0
    };
  }

  const selected = ctx.session.selectedActions;
  const user = await getUser(ctx.from.id);
  if (!user) {
    ctx.reply(t(ctx.session?.language, 'error'));
    return;
  }

  const linkType = getLinkType(project.url);

  let availableActions = [];
  if (linkType === 'profile') {
    availableActions = ['follow'];
  } else {
    availableActions = ['view', 'like', 'comment'];
  }

  const actionRows = [];
  const rows = [];

  availableActions.forEach(action => {
    const icon = action === 'view' ? t(ctx.session?.language, 'views_icon') : action === 'like' ? t(ctx.session?.language, 'likes_icon') : action === 'comment' ? t(ctx.session?.language, 'comments_icon') : t(ctx.session?.language, 'follows_icon');
    const basePrice = action === 'view' ? 1 : action === 'like' ? 5 : action === 'comment' ? 10 : 30;
    const count = selected[action + 's'] || selected[action] || 0;
    const displayText = count > 0 ? ` ${basePrice}💎 | ${count}` : ` ${basePrice}💎`;

    rows.push({
      text: `${icon}${displayText}`,
      callback_data: `select_${action}s`
    });
  });

  const actionRowsPush = rows.map(row => [row]);

  const totalCredits = selected.views * 1 + selected.likes * 5 + selected.comments * 10 + selected.follows * 30;

  const keyboard = [
    ...actionRowsPush,
    [{ text: t(ctx.session?.language, 'add_project_confirm'), callback_data: 'confirm_project_add' }],
    [{ text: t(ctx.session?.language, 'cancel_add_project'), callback_data: 'cancel_project_add' }]
  ];

  let message = `${t(ctx.session?.language, 'adding_project')}\n\n` +
    `🔗 ${project.url}\n` +
    `${t(ctx.session?.language, 'platform_label', {platform: project.platform.charAt(0).toUpperCase() + project.platform.slice(1)})}\n\n` +
    `${t(ctx.session?.language, 'your_balance', {credits: user.credits})}\n\n` +
    `${t(ctx.session?.language, 'select_actions')}`;

  availableActions.forEach(action => {
    const icon = action === 'view' ? t(ctx.session?.language, 'views_icon') : action === 'like' ? t(ctx.session?.language, 'likes_icon') : action === 'comment' ? t(ctx.session?.language, 'comments_icon') : t(ctx.session?.language, 'follows_icon');
    const basePrice = action === 'view' ? 1 : action === 'like' ? 5 : action === 'comment' ? 10 : 30;
    const count = selected[action + 's'] || selected[action] || 0;
    const totalPrice = basePrice * count;
    const priceText = count > 0 ? ` (${count}, ${totalPrice}💎)` : ` (${basePrice}💎)`;
    message += `\n${icon}${priceText}`;
  });

  message += `\n\n${t(ctx.session?.language, 'total_to_pay', {total: totalCredits})}`;

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

function hasUserDoneAction(userId, projectId, actionType) {
  return new Promise((resolve, reject) => {
    require('../../db').db.get(
      'SELECT id FROM action_transactions WHERE from_user_id = ? AND to_project_id = ? AND action_type = ?',
      [userId, projectId, actionType],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

function addActionTransaction(fromUserId, toProjectId, actionType) {
  const db = require('../../db');
  const getUser = require('./models').getUser;
  return getUser(fromUserId).then(user => {
    if (!user) throw new Error('User not found');
    return getProjectById(toProjectId).then(project => {
      if (!project) throw new Error('Project not found');
      return new Promise((resolve, reject) => {
        db.db.run(
          'INSERT INTO action_transactions (from_user_id, to_project_id, project_url, action_type, credited) VALUES (?, ?, ?, ?, ?)',
          [user.id, toProjectId, project.url, actionType, 1], // credited = 1 по умолчанию
          function(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
      });
    });
  });
}

// Функция для подтверждения покупки кредитов (например, через mock payment)
function confirmBuyCredits(ctx, amount) {
  return new Promise((resolve, reject) => {
    const user = require('./models').getUser(ctx.from.id);

    user.then(userData => {
      if (!userData) {
        reject(new Error('User not found'));
        return;
      }

      const prices = { 100: 100, 500: 450, 1000: 850 };
      const cost = prices[amount];

      return require('./models').buyCredits(userData.telegram_id, amount).then(() => {
        ctx.editMessageText(`✅ Оплата прошла успешно! Начислено ${amount} 💎.`);
        resolve();
      });
    }).catch(reject);
  });
}

// Вспомогательная функция для проверки подписки на URL
function hasUserDoneFollowOnUrl(userId, projectUrl) {
  return new Promise((resolve, reject) => {
    require('../../db').db.get(`SELECT at.id FROM action_transactions at
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

// Функции для работы с выполненными действиями по ссылкам
function addCompletedUrlAction(userId, url, actionType) {
  return new Promise((resolve, reject) => {
    require('../../db').db.run(
      'INSERT OR IGNORE INTO completed_url_actions (user_id, url, action_type) VALUES (?, ?, ?)',
      [userId, url, actionType],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function hasUserCompletedActionOnUrl(userId, url, actionType) {
  return new Promise((resolve, reject) => {
    require('../../db').db.get(
      'SELECT id FROM completed_url_actions WHERE user_id = ? AND url = ? AND action_type = ?',
      [userId, url, actionType],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
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

  const projects = require('../../db').getProjectsForAction(userId, platforms);
  return projects.then(projectsData => {
    if (projectsData.length === 0) {
      const { t } = require('../utils/lang');
      if (platforms.length === 0) {
      ctx.reply(t(ctx.session?.language, 'setup_profiles_warning'), {
        reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language, 'go_to_settings'), callback_data: 'settings_profiles' }]] },
        parse_mode: 'Markdown'
      });
      } else {
        ctx.reply(t(ctx.session?.language, 'all_tasks_completed'), {
          reply_markup: { inline_keyboard: [[{ text: t(ctx.session?.language, 'add_project_button'), callback_data: 'add_project' }]] },
          parse_mode: 'Markdown'
        });
      }
      return;
    }

    // Показываем только одно задание (первый доступный проект), как в меню "Доступные задания"
    if (projectsData.length > 0) {
      const project = projectsData[0]; // Берем только первый проект
      const getUserById = require('./models').getUserById;
      const getUndoneActionsForProject = require('../../db').getUndoneActionsForProject;
      const getCreditsForAction = require('../../db').getCreditsForAction;

      return getUserById(project.user_id).then(projectOwner => {
        const username = projectOwner ? (projectOwner.username || 'дизайнер') : 'дизайнер';
        const ownerId = projectOwner ? projectOwner.id : 0;

        return getUndoneActionsForProject(project.id, userId).then(availableActions => {
          // Убираем дубликаты действий
          const uniqueActions = [...new Set(availableActions)];

          // Берем ТОЛЬКО ПЕРВОЕ доступное действие для этого проекта
          const firstAction = uniqueActions[0];
          // getActionText локализуемая функция определена ниже в этом файле
          const keyboard = [
            [{
              text: getActionText(firstAction, ctx.session?.language || 'ru'),
              callback_data: `${firstAction}_project_${project.id}`
            }]
          ];

          return getCreditsForAction(project.id, firstAction).then(credits => {
            const actionWord = t(ctx.session?.language || 'ru', `action_word_${firstAction}`);
            const actionVerb = t(ctx.session?.language || 'ru', `action_verb_${firstAction}`);

            ctx.reply(t(ctx.session?.language || 'ru', 'project_task_info', {actionVerb, url: project.url, credits, actionWord}), {
              reply_markup: { inline_keyboard: keyboard },
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            });
          });
        });
      });
    }
  });
}

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

// Дополнительные функции из db.js
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

// Вспомогательная функция для проверки подписки на URL
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

// Функция для получения платформ пользователя
function getUserPlatforms(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT behance_username, dribbble_username, artstation_username, dprofile_username FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else {
        const platforms = [];
        if (row.behance_username) platforms.push('behance');
        if (row.dribbble_username) platforms.push('dribbble');
        if (row.artstation_username) platforms.push('artstation');
        if (row.dprofile_username) platforms.push('dprofile');
        resolve(platforms);
      }
    });
  });
}

// Функция для обновления кредитов
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

// Функция для проверки забаненности пользователя
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

// Функция extractUsername
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

// Функция для получения прогресса проекта (выполнено/требуется)
function getProjectProgress(projectId) {
  return new Promise(async (resolve, reject) => {
    try {
      // Получить суммарное требуемое количество действий
      const requiredActions = await new Promise((resolve, reject) => {
        db.get('SELECT SUM(count) as total FROM project_actions WHERE project_id = ?', [projectId], (err, row) => {
          if (err) reject(err);
          else resolve(row.total || 0);
        });
      });

      // Получить выполненное количество действий
      const completedActions = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as total FROM action_transactions WHERE to_project_id = ?', [projectId], (err, row) => {
          if (err) reject(err);
          else resolve(row.total || 0);
        });
      });

      resolve({
        completed: completedActions,
        required: requiredActions,
        percentage: requiredActions > 0 ? Math.round((completedActions / requiredActions) * 100) : 0,
        isCompleted: completedActions >= requiredActions && requiredActions > 0
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Функция для проверки и автоматического завершения проекта
async function checkAndCompleteProject(projectId) {
  try {
    // Получить статус проекта
    const project = await new Promise((resolve, reject) => {
      db.get('SELECT status, user_id FROM projects WHERE id = ?', [projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!project || project.status === 'completed') {
      return false; // Проект уже завершен или не найден
    }

    // Проверить наличие активных жалоб на проект
    const pendingComplaints = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM complaints WHERE project_id = ? AND status = "pending"', [projectId], (err, row) => {
        if (err) reject(err);
        else resolve(row.count || 0);
      });
    });

    if (pendingComplaints > 0) {
      return false; // Есть активные жалобы, не завершаем
    }

    // Проверить прогресс
    const progress = await getProjectProgress(projectId);

    if (progress.isCompleted) {
      // Завершить проект
      await new Promise((resolve, reject) => {
        db.run('UPDATE projects SET status = "completed" WHERE id = ?', [projectId], function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        });
      });

      // Уведомить владельца проекта о завершении
      try {
        const { t } = require('../utils/lang');
        const projectOwner = await getUserById(project.user_id);
        if (projectOwner) {
          const completionMessage = t(projectOwner.language || 'ru', 'project_completed_notification', {
            completed: progress.completed,
            required: progress.required
          });

          // Отправляем уведомление через webhook callback (глобальный бот)
          if (completionMessage) {
            const botInstance = global.botInstance;
            if (botInstance) {
              await botInstance.telegram.sendMessage(projectOwner.telegram_id, completionMessage, { parse_mode: 'Markdown' });
            }
          }
        }
      } catch (notificationError) {
        // Не прерываем процесс из-за ошибки уведомления
      }

      return true; // Проект завершен
    }

    return false; // Проект еще не завершен
  } catch (error) {
    return false;
  }
}

// Дополнительные функции из index.js
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

// Функция для расчета возврата кристаллов при удалении проекта
async function calculateProjectRefund(projectId) {
  try {
    // Получить все действия проекта с count
    const projectActions = await new Promise((resolve, reject) => {
      db.all('SELECT action_type, count, credits_spent FROM project_actions WHERE project_id = ?', [projectId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    if (!projectActions || projectActions.length === 0) {
      return 0;
    }

    let refund = 0;

    for (const action of projectActions) {
      const { action_type, count, credits_spent } = action;

      // Посчитать сколько выполнено для этого типа действия
      const executedCount = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM action_transactions WHERE to_project_id = ? AND action_type = ?', [projectId, action_type], (err, row) => {
          if (err) reject(err);
          else resolve(row.count || 0);
        });
      });

      // Невыполненные действия
      const unexecutedCount = Math.max(0, count - executedCount);

      // Возврат 80% стоимости невыполненных действий
      refund += Math.round((unexecutedCount * credits_spent) * 0.8);
    }

    return refund;
  } catch (error) {
    console.error('Error calculating project refund:', error);
    return 0;
  }
}

// Функция для получения деталей транзакции по ID (для обработки жалоб)
function getActionTransactionById(transactionId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT at.*, p.url as project_url FROM action_transactions at
            JOIN projects p ON at.to_project_id = p.id
            WHERE at.id = ?`, [transactionId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

module.exports = {
  registerUser,
  getUser,
  getUserById,
  updateUserProfile,
  updateUserLanguage,
  getUserProjects,
  getProjectActionsAndParticipants,
  hasUserDoneAnyActionOnUrl,
  addProject,
  getProjectById,
  getUserStats,
  updateUserRating,
  buyCredits,
  getUserDetailedStats,
  getPendingComplaints,
  getComplaintById,
  updateComplaintStatus,
  banUser,
  unbanUser,
  getUserWarningsCount,
  incrementUserWarnings,
  getAllActiveUsers,
  getProjectsForAction,
  getUndoneActionsForProject,
  getCreditsForAction,
  getActionText,
  getActionsForProject,
  saveComplaint,
  sendBroadcastMessage,
  hasUserDoneAction,
  addActionTransaction,
  showNextTask,
  hasUserDoneFollowOnUrl,
  getUserPlatforms,
  updateCredits,
  isUserBanned,
  extractUsername,
  detectPlatform,
  isValidProjectUrl,
  getLinkType,
  showProjectActionsMenu,
  confirmBuyCredits,
  getActionTransactionById,
  calculateProjectRefund,
  getProjectProgress,
  checkAndCompleteProject,
  addCompletedUrlAction,
  hasUserCompletedActionOnUrl,
  // Referral functions
  getReferralCode,
  createReferral,
  getReferralStats,
  getReferralTree,
  getOrCreateReferralCode,
  getUserReferrals,
  getReferrerByCode,
  applyReferralCode,
  addReferralBonus,
  calculateReferralPercentage,
  getUserReferralEarnings,
  processReferralBonuses,
  processReferralPurchaseBonuses,
  processActionReferralBonuses,
  getReferralList,
  getUserReferralsWithEarnings
};
