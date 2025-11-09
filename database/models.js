const Logger = require('../utils/logger');

const TABLE_SCHEMAS = [
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    internal_chat_id INTEGER NOT NULL,
    external_chat_id TEXT NOT NULL UNIQUE
  )`,

  `CREATE TABLE IF NOT EXISTS event_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT,
    first_name TEXT NOT NULL,
    is_reserve BOOLEAN DEFAULT FALSE,
    plus_count INTEGER DEFAULT 1,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events (id)
  )`,

  `CREATE TABLE IF NOT EXISTS event_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events (id)
  )`,

  `CREATE TABLE IF NOT EXISTS team_split_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    waiting_for_teams BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events (id)
  )`,

  `CREATE TABLE IF NOT EXISTS id_mapping (
    external_id TEXT PRIMARY KEY,
    internal_id TEXT UNIQUE NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    internal_id TEXT NOT NULL,
    language TEXT,
    event_name TEXT,
    frequency TEXT,
    regular_frequency TEXT,
    start_date TEXT,
    yearly_dates TEXT,
    day_number INTEGER,
    weekly_days TEXT,
    start_time TEXT,
    duration_value INTEGER,
    duration_unit TEXT,
    poll_start_value INTEGER,
    poll_start_unit TEXT,
    poll_end_value INTEGER,
    poll_end_unit TEXT,
    city_timezone TEXT,
    location TEXT,
    comment TEXT,
    participant_limit_type TEXT,
    participant_limit INTEGER,
    reserve TEXT,
    payment_type TEXT,
    payment_method TEXT,
    cost_type TEXT,
    fixed_cost INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (internal_id) REFERENCES id_mapping(internal_id)
  )`,

  `CREATE TABLE IF NOT EXISTS chat_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_external_id TEXT UNIQUE NOT NULL,
    group_external_id TEXT NOT NULL,
    group_chat_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`
];

function createTables(db) {
  db.serialize(() => {
    TABLE_SCHEMAS.forEach(schema => {
      db.run(schema, (err) => {
        if (err) {
          Logger.error(`Ошибка создания таблицы: ${err}`);
        }
      });
    });
  });
}

module.exports = { createTables };