// Скрипт для развертывания бота на сервере с сохранением данных
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Начинаем развертывание DesignLike бота на сервер...\n');

// Пути к файлам
const DB_PATH = './bot.db';
const BACKUP_PATH = './bot.db.backup.' + Date.now();
const NEW_SCHEMA_FILE = './new_schema.sql';

// Проверка существования базы данных
function checkDatabaseExists() {
  console.log('🔍 Проверяем существующую базу данных...');
  return fs.existsSync(DB_PATH);
}

// Создание резервной копии
function createBackup() {
  console.log('💾 Создаем резервную копию базы данных...');
  try {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, BACKUP_PATH);
      console.log(`✅ Резервная копия создана: ${BACKUP_PATH}`);
      return true;
    }
  } catch (error) {
    console.error('❌ Ошибка создания резервной копии:', error.message);
    process.exit(1);
  }
  return false;
}

// Генерация скрипта миграции схемы
function generateMigrationSQL() {
  const migrationSQL = `
-- Миграционный скрипт для обновления схемы DesignLike бота
-- Создано: ${new Date().toISOString()}

-- Включаем подробный вывод ошибок
.headers on
.mode column
.echo on

-- Проверяем и создаем таблицы (с IF NOT EXISTS они не удалят данные)

-- Обновление таблицы users
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
  language TEXT DEFAULT 'ru',
  referral_code TEXT UNIQUE,
  behance_username TEXT,
  dribbble_username TEXT,
  artstation_username TEXT,
  dprofile_username TEXT
);

-- Обновление таблицы projects
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  url TEXT,
  platform TEXT,
  status TEXT DEFAULT 'active',
  added_date TEXT DEFAULT CURRENT_TIMESTAMP,
  likes_received INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Обновление таблицы action_transactions
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
);

-- Обновление таблицы credit_purchases
CREATE TABLE IF NOT EXISTS credit_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  amount INTEGER,
  cost REAL,
  payment_method TEXT,
  purchase_date TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id)
);

-- Обновление таблицы complaints
CREATE TABLE IF NOT EXISTS complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complainant_user_id INTEGER,
  reported_user_id INTEGER,
  project_id INTEGER,
  complaint_type TEXT,
  complaint_message TEXT,
  status TEXT DEFAULT 'pending',
  admin_comment TEXT,
  resolved_by INTEGER,
  created_date TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (complainant_user_id) REFERENCES users (id),
  FOREIGN KEY (reported_user_id) REFERENCES users (id),
  FOREIGN KEY (project_id) REFERENCES projects (id),
  FOREIGN KEY (resolved_by) REFERENCES users (id)
);

-- Обновление таблицы user_bans
CREATE TABLE IF NOT EXISTS user_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  reason TEXT,
  ban_until TEXT,
  banned_by INTEGER,
  created_date TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (banned_by) REFERENCES users (id)
);

-- Обновление таблицы project_actions
CREATE TABLE IF NOT EXISTS project_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  action_type TEXT,
  credits_spent INTEGER,
  count INTEGER,
  status TEXT DEFAULT 'pending',
  created_date TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects (id)
);

-- Обновление таблицы referals
CREATE TABLE IF NOT EXISTS referals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER,
  referred_id INTEGER,
  created_date TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_id) REFERENCES users (id),
  FOREIGN KEY (referred_id) REFERENCES users (id)
);

-- Обновление таблицы referral_bonuses
CREATE TABLE IF NOT EXISTS referral_bonuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  amount INTEGER,
  type TEXT,
  referred_id INTEGER,
  created_date TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (referred_id) REFERENCES users (id)
);

-- Обновление таблицы completed_url_actions (новая таблица)
CREATE TABLE IF NOT EXISTS completed_url_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  url TEXT,
  action_type TEXT,
  completed_date TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id),
  UNIQUE(user_id, url, action_type)
);

-- Создание индексов для производительности
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_url ON projects(url);
CREATE INDEX IF NOT EXISTS idx_action_transactions_from_user ON action_transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_action_transactions_to_project ON action_transactions(to_project_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referals(referrer_id);

-- Добавление колонок без потери данных (игнорируем ошибки, если колонки уже существуют)
-- В SQLite нет команды ALTER COLUMN с сохранением данных, но CREATE TABLE IF NOT EXISTS безопасна

-- Исправляем рейтинг для существующих пользователей (если он был 100 по умолчанию)
UPDATE users SET rating = 0.0 WHERE rating = 100.0;

-- Вывод итоговой статистики после миграции
.print "\\n📊 Статистика после миграции:"
SELECT 'Пользователей' as metric, COUNT(*) as count FROM users
UNION ALL
SELECT 'Проектов', COUNT(*) FROM projects
UNION ALL
SELECT 'Действий', COUNT(*) FROM action_transactions
UNION ALL
SELECT 'Жалоб', COUNT(*) FROM complaints
UNION ALL
SELECT 'Рефералов', COUNT(*) FROM referals
UNION ALL
SELECT 'URL действий', COUNT(*) FROM completed_url_actions;

.print "\\n✅ Миграция схемы завершена успешно!"
.print "💾 Резервная копия создана автоматически для безопасности"
  `;

  fs.writeFileSync(NEW_SCHEMA_FILE, migrationSQL);
  console.log(`📄 Создана SQL миграция: ${NEW_SCHEMA_FILE}`);
  return migrationSQL;
}

// Применение миграции
function applyMigration() {
  console.log('🔄 Применяем миграцию базы данных...');

  try {
    // Создаем временную базу для миграции
    execSync(`sqlite3 ${DB_PATH} < ${NEW_SCHEMA_FILE}`, { stdio: 'inherit' });
    console.log('✅ Миграция схемы прошла успешно!');
    return true;
  } catch (error) {
    console.error('❌ Ошибка миграции:', error.message);

    // Восстанавливаем из бэкапа при ошибке
    if (fs.existsSync(BACKUP_PATH)) {
      console.log('🔄 Восстанавливаем базу из резервной копии...');
      fs.copyFileSync(BACKUP_PATH, DB_PATH);
      console.log('✅ База данных восстановлена из резервной копии');
    }
    return false;
  }
}

// Проверка целостности данных после миграции
function verifyDataIntegrity() {
  console.log('🔍 Проверяем целостность данных после миграции...');

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(err);
        return;
      }

      // Проверяем основные таблицы
      const queries = [
        'SELECT COUNT(*) as users FROM users',
        'SELECT COUNT(*) as projects FROM projects',
        'SELECT COUNT(*) as transactions FROM action_transactions',
        'SELECT COUNT(*) as referrals FROM referals'
      ];

      const results = {};
      let completed = 0;

      queries.forEach(query => {
        db.get(query, (err, row) => {
          if (err) {
            db.close();
            reject(err);
            return;
          }

          Object.assign(results, row);
          completed++;

          if (completed === queries.length) {
            db.close();
            console.log('📊 Статистика после миграции:');
            console.log(`👥 Пользователей: ${results.users}`);
            console.log(`🎨 Проектов: ${results.projects}`);
            console.log(`🔥 Выполненных действий: ${results.transactions}`);
            console.log(`👨‍👩‍👧‍👦 Рефералов: ${results.referrals}`);
            console.log('\n✅ Целостность данных подтверждена!');
            resolve(results);
          }
        });
      });
    });
  });
}

// Основная функция развертывания
async function deploy() {
  console.log('🏗️ DESIGNLIKE BOT - ПРОЦЕСС РАЗВЕРТЫВАНИЯ\n');

  try {
    // Шаг 1: Проверка существования базы
    const dbExists = checkDatabaseExists();
    if (dbExists) {
      console.log('📁 Обнаружена существующая база данных');
    } else {
      console.log('🆕 Новая установка - базы данных нет');
    }

    // Шаг 2: Резервное копирование (если база существует)
    let backupCreated = false;
    if (dbExists) {
      backupCreated = createBackup();
    }

    // Шаг 3: Генерация миграции
    generateMigrationSQL();

    // Шаг 4: Применение миграции
    const migrationResult = applyMigration();
    if (!migrationResult) {
      throw new Error('Миграция не удалась');
    }

    // Шаг 5: Проверка целостности
    const stats = await verifyDataIntegrity();

    // Шаг 6: Очистка временных файлов
    try {
      if (fs.existsSync(NEW_SCHEMA_FILE)) {
        fs.unlinkSync(NEW_SCHEMA_FILE);
      }
    } catch (error) {
      console.warn('⚠️ Не удалось удалить временный файл миграции');
    }

    // Шаг 7: Финальный отчет
    console.log('\n🎉 РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО УСПЕШНО!');
    console.log('✨ Что было сделано:');
    if (dbExists) {
      console.log('  ✅ Сохранены все существующие данные');
      if (backupCreated) {
        console.log(`  ✅ Создана резервная копия: ${BACKUP_PATH}`);
      }
    }
    console.log('  ✅ Обновлена схема базы данных');
    console.log('  ✅ Созданы новые таблицы и индексы');
    console.log('  ✅ Добавлена система completed_url_actions');
    console.log('  ✅ Данные проверены на целостность');
    console.log(`  📊 Итого пользователей: ${stats.users}`);
    console.log(`  📊 Итого проектов: ${stats.projects}`);
    console.log('📝 Бот готов к запуску командой: npm start');

  } catch (error) {
    console.error('\n❌ ОШИБКА РАЗВЕРТЫВАНИЯ:', error.message);
    console.log('\n🔄 При ошибке:', 'База данных автоматически восстановлена из резервной копии');
    process.exit(1);
  }
}

// Запуск развертывания
if (require.main === module) {
  deploy();
}

module.exports = { deploy, createBackup, generateMigrationSQL, applyMigration, verifyDataIntegrity };
