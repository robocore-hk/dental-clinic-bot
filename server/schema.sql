-- Zeeno Dental for temi: D1 schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', role TEXT NOT NULL CHECK (role IN ('admin','owner')),
  pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', website TEXT DEFAULT '',
  hours TEXT DEFAULT '{}', parking TEXT DEFAULT '{}', payment TEXT DEFAULT '{}', accessibility TEXT DEFAULT '{}', welcome TEXT DEFAULT '{}',
  reviewer TEXT DEFAULT '', data_source_url TEXT DEFAULT '',
  booking_url TEXT DEFAULT '', video_user_id TEXT DEFAULT '', video_name TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS owner_clinics (user_id TEXT NOT NULL, clinic_id TEXT NOT NULL, PRIMARY KEY (user_id, clinic_id));
CREATE TABLE IF NOT EXISTS dentists (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT DEFAULT '',
  bio_en TEXT DEFAULT '', bio_es TEXT DEFAULT '', bio_zh_hans TEXT DEFAULT '', bio_zh_hant TEXT DEFAULT '',
  languages TEXT DEFAULT '[]', specialties TEXT DEFAULT '', photo_url TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, kind TEXT NOT NULL, slug TEXT NOT NULL, category TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0, version_label TEXT DEFAULT '1.0', reviewer TEXT DEFAULT '', approved INTEGER NOT NULL DEFAULT 0,
  media_kind TEXT DEFAULT 'text', media_url TEXT DEFAULT '',
  title_en TEXT DEFAULT '', title_es TEXT DEFAULT '', title_zh_hans TEXT DEFAULT '', title_zh_hant TEXT DEFAULT '',
  body_en TEXT DEFAULT '', body_es TEXT DEFAULT '', body_zh_hans TEXT DEFAULT '', body_zh_hant TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS content_clinic ON content(clinic_id, kind, sort_order);
CREATE TABLE IF NOT EXISTS destinations (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, location_name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'waiting',
  requires_staff INTEGER NOT NULL DEFAULT 0, sort_order INTEGER DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  label_en TEXT DEFAULT '', label_es TEXT DEFAULT '', label_zh_hans TEXT DEFAULT '', label_zh_hant TEXT DEFAULT '',
  note_en TEXT DEFAULT '', note_es TEXT DEFAULT '', note_zh_hans TEXT DEFAULT '', note_zh_hant TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS robots (
  id TEXT PRIMARY KEY, clinic_id TEXT, name TEXT NOT NULL, serial TEXT DEFAULT '', token_hash TEXT, pair_code TEXT, pair_expires INTEGER,
  settings TEXT NOT NULL DEFAULT '{}', status TEXT DEFAULT '{}', pose TEXT, pose_at INTEGER, last_seen INTEGER, live_until INTEGER DEFAULT 0,
  locations TEXT DEFAULT '[]', version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS robot_maps (
  robot_id TEXT PRIMARY KEY, map_id TEXT, map_name TEXT, width INTEGER, height INTEGER, resolution REAL, origin_x REAL, origin_y REAL, flip_y INTEGER,
  asset_id TEXT, locations TEXT DEFAULT '[]', updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS overlays (
  robot_id TEXT NOT NULL, map_id TEXT NOT NULL, asset_id TEXT, img_w INTEGER, img_h INTEGER, cx REAL, cy REAL, scale REAL, rot REAL, opacity REAL DEFAULT 0.5,
  locked INTEGER DEFAULT 0, display TEXT DEFAULT 'temi', updated_at INTEGER, PRIMARY KEY (robot_id, map_id)
);
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL, chunks INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS asset_chunks (asset_id TEXT NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (asset_id, idx));
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY, robot_id TEXT NOT NULL, type TEXT NOT NULL, payload TEXT DEFAULT '{}', status TEXT NOT NULL DEFAULT 'pending',
  result TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS commands_robot ON commands(robot_id, status, created_at);
CREATE TABLE IF NOT EXISTS arrivals (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, robot_id TEXT, kind TEXT NOT NULL,
  reference TEXT DEFAULT '', patient_name TEXT DEFAULT '', appointment_time TEXT DEFAULT '',
  service TEXT DEFAULT '', preferred_date TEXT DEFAULT '', contact_name TEXT DEFAULT '', contact_phone TEXT DEFAULT '', contact_email TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', delivery TEXT NOT NULL DEFAULT 'stored', created_at INTEGER NOT NULL, acknowledged_at INTEGER
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, robot_id TEXT, reason TEXT NOT NULL, note TEXT DEFAULT '', private INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', delivery TEXT NOT NULL DEFAULT 'stored', created_at INTEGER NOT NULL, acknowledged_at INTEGER
);
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, robot_id TEXT, ease TEXT DEFAULT '', help TEXT DEFAULT '', comment TEXT DEFAULT '',
  contact_me INTEGER NOT NULL DEFAULT 0, contact_details TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', delivery TEXT NOT NULL DEFAULT 'stored', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS escorts (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, robot_id TEXT, destination_id TEXT, location_name TEXT DEFAULT '', label TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', delivery TEXT NOT NULL DEFAULT 'stored', created_at INTEGER NOT NULL, decided_at INTEGER
);
CREATE TABLE IF NOT EXISTS takeaway (
  token TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, content_id TEXT NOT NULL, lang TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, robot_id TEXT, clinic_id TEXT, type TEXT, ref TEXT, value TEXT, at INTEGER);
CREATE INDEX IF NOT EXISTS events_clinic ON events(clinic_id, at);
CREATE TABLE IF NOT EXISTS queue_tickets (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, robot_id TEXT, arrival_id TEXT,
  code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'checked_in', wait_minutes INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS queue_clinic ON queue_tickets(clinic_id, created_at);
CREATE TABLE IF NOT EXISTS form_templates (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, slug TEXT NOT NULL, version_label TEXT DEFAULT '1.0', reviewer TEXT DEFAULT '',
  approved INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  title_en TEXT DEFAULT '', title_es TEXT DEFAULT '', title_zh_hans TEXT DEFAULT '', title_zh_hant TEXT DEFAULT '',
  intro_en TEXT DEFAULT '', intro_es TEXT DEFAULT '', intro_zh_hans TEXT DEFAULT '', intro_zh_hant TEXT DEFAULT '',
  fields TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS form_issues (
  token TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, template_id TEXT NOT NULL, robot_id TEXT, lang TEXT NOT NULL,
  answers TEXT, status TEXT NOT NULL DEFAULT 'issued', expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
  completed_at INTEGER, reviewed_at INTEGER
);
CREATE TABLE IF NOT EXISTS consent_questions (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, robot_id TEXT, content_id TEXT, questions TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', delivery TEXT NOT NULL DEFAULT 'stored', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reminder_templates (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, name TEXT NOT NULL,
  body_en TEXT DEFAULT '', body_es TEXT DEFAULT '', body_zh_hans TEXT DEFAULT '', body_zh_hant TEXT DEFAULT '', updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY, clinic_id TEXT NOT NULL, label TEXT DEFAULT '', channel TEXT NOT NULL DEFAULT 'phone',
  contact TEXT DEFAULT '', due_at INTEGER, template_id TEXT, message TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, sent_at INTEGER
);
