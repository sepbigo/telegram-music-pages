-- D1 schema
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, token TEXT UNIQUE, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS channels (chat_id TEXT PRIMARY KEY, title TEXT, cover TEXT, description TEXT, updated_at INTEGER);
CREATE TABLE IF NOT EXISTS songs (file_id TEXT PRIMARY KEY, title TEXT, performer TEXT, duration INTEGER, mime TEXT, file_name TEXT, date INTEGER, chat_id TEXT);
