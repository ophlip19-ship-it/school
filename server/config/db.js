import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import Child from '../models/Child.js';

const MONGODB_URI =
  process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not defined in evs")
}

let memoryServer = null;

export async function connectDb() {
  mongoose.set('strictQuery', true);

  const preferMemory =
    process.env.USE_MEMORY_DB === 'true' ||
    MONGODB_URI === 'memory' ||
    MONGODB_URI === 'mongodb-memory';

  if (preferMemory) {
    await connectMemory();
  } else {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log(`[db] Connected to MongoDB (${redactUri(MONGODB_URI)})`);
    } catch (err) {
      console.warn(`[db] Could not connect to ${redactUri(MONGODB_URI)}: ${err.message}`);
      if (process.env.NODE_ENV === 'production') {
        throw err;
      }
      console.warn('[db] Falling back to in-memory MongoDB for local development');
      await connectMemory();
    }
  }

  await seedIfEmpty();
}

async function connectMemory() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  const uri = memoryServer.getUri();
  await mongoose.connect(uri);
  console.log('[db] Connected to in-memory MongoDB');
}

function redactUri(uri) {
  try {
    const u = new URL(uri);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return uri;
  }
}

async function seedIfEmpty() {
  const count = await User.countDocuments();
  if (count > 0) return;

  const passwordHash = await bcrypt.hash('password123', 10);

  const now = new Date();
  // Seed drivers near Lagos anchors so nearest-driver assignment works in demo
  const [, , , , parent] = await User.create([
    {
      email: 'driver@schoolrun.app',
      passwordHash,
      role: 'driver',
      name: 'David K.',
      phone: '+2348000000001',
      vehiclePlate: '56A-902-LGS',
      verified: true,
      lastLocation: {
        lng: 3.4701,
        lat: 6.4492,
        heading: 90,
        updatedAt: now,
      },
    },
    {
      email: 'driver2@schoolrun.app',
      passwordHash,
      role: 'driver',
      name: 'Chioma Okafor',
      phone: '+2348000000004',
      vehiclePlate: 'ABC-441-LG',
      verified: true,
      lastLocation: {
        lng: 3.425,
        lat: 6.431,
        heading: 180,
        updatedAt: now,
      },
    },
    {
      email: 'driver3@schoolrun.app',
      passwordHash,
      role: 'driver',
      name: 'Ibrahim Musa',
      phone: '+2348000000005',
      vehiclePlate: 'KJA-228-AB',
      verified: true,
      lastLocation: {
        lng: 3.38,
        lat: 6.455,
        heading: 45,
        updatedAt: now,
      },
    },
    {
      email: 'admin@schoolrun.app',
      passwordHash,
      role: 'admin',
      name: 'SchoolRun Admin',
      phone: '+2348000000002',
      verified: true,
    },
    {
      email: 'parent@schoolrun.app',
      passwordHash,
      role: 'parent',
      name: 'Aisha Bello',
      phone: '+2348000000003',
      verified: true,
      homeAddress: 'Home · 12 Admiralty Way, Lekki',
      homeCoords: { lng: 3.4734, lat: 6.4474 },
    },
  ]);

  await Child.create({
    parentId: parent._id,
    name: 'Ada Bello',
    school: 'Greenfield School',
    grade: 'Grade 5',
  });

  console.log('[db] Seeded demo users (password: password123)');
  console.log('  parent@schoolrun.app / driver@schoolrun.app / admin@schoolrun.app');
}

export default mongoose;
