import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'schoolrun.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('parent','driver','admin')),
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      vehicle_plate TEXT DEFAULT '',
      verified INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS children (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      school TEXT DEFAULT 'Greenfield School',
      grade TEXT DEFAULT 'Grade 5',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rides (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL REFERENCES users(id),
      driver_id TEXT REFERENCES users(id),
      child_id TEXT NOT NULL REFERENCES children(id),
      child_name TEXT NOT NULL,
      pickup TEXT NOT NULL,
      dropoff TEXT NOT NULL,
      ride_date TEXT NOT NULL,
      ride_time TEXT NOT NULL,
      trip_type TEXT NOT NULL DEFAULT 'pickup',
      status TEXT NOT NULL DEFAULT 'pending_payment',
      fare_cents INTEGER NOT NULL DEFAULT 250000,
      currency TEXT NOT NULL DEFAULT 'ngn',
      handover_pin TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      stripe_payment_intent_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      ride_id TEXT NOT NULL REFERENCES rides(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'ngn',
      status TEXT NOT NULL DEFAULT 'pending',
      provider TEXT NOT NULL DEFAULT 'stripe',
      provider_ref TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      ride_id TEXT NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rides_parent ON rides(parent_id);
    CREATE INDEX IF NOT EXISTS idx_rides_driver ON rides(driver_id);
    CREATE INDEX IF NOT EXISTS idx_rides_status ON rides(status);
    CREATE INDEX IF NOT EXISTS idx_messages_ride ON messages(ride_id);
  `);

  seedIfEmpty();
  return db;
}

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const hash = bcrypt.hashSync('password123', 10);
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, role, name, phone, vehicle_plate, verified)
    VALUES (@id, @email, @password_hash, @role, @name, @phone, @vehicle_plate, @verified)
  `);

  insertUser.run({
    id: 'user_driver_demo',
    email: 'driver@schoolrun.app',
    password_hash: hash,
    role: 'driver',
    name: 'David K.',
    phone: '+2348000000001',
    vehicle_plate: '56A-902-LGS',
    verified: 1,
  });

  insertUser.run({
    id: 'user_admin_demo',
    email: 'admin@schoolrun.app',
    password_hash: hash,
    role: 'admin',
    name: 'SchoolRun Admin',
    phone: '+2348000000002',
    vehicle_plate: '',
    verified: 1,
  });

  insertUser.run({
    id: 'user_parent_demo',
    email: 'parent@schoolrun.app',
    password_hash: hash,
    role: 'parent',
    name: 'Aisha Bello',
    phone: '+2348000000003',
    vehicle_plate: '',
    verified: 1,
  });

  db.prepare(`
    INSERT INTO children (id, parent_id, name, school, grade)
    VALUES ('child_demo_1', 'user_parent_demo', 'Ada Bello', 'Greenfield School', 'Grade 5')
  `).run();

  console.log('[db] Seeded demo users (password: password123)');
  console.log('  parent@schoolrun.app / driver@schoolrun.app / admin@schoolrun.app');
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    name: row.name,
    phone: row.phone || '',
    vehiclePlate: row.vehicle_plate || '',
    verified: !!row.verified,
    // Compatibility aliases used by existing UI
    parentName: row.role === 'parent' || row.role === 'admin' ? row.name : undefined,
    driverName: row.role === 'driver' ? row.name : 'David K.',
  };
}

export default db;
