# SchoolRun

Safe school transport for parents, drivers, and admins — **real API**, **payments**, **live chat**, and **Mapbox tracking**.

## Stack

| Layer | Tech |
|--------|------|
| Frontend | React 19, Vite 8, Tailwind 4, React Router 7 |
| API | Express, SQLite (`better-sqlite3`), JWT auth |
| Realtime | Socket.IO chat rooms per ride |
| Payments | Stripe Payment Intents **or** built-in demo checkout |
| Maps | Mapbox GL Directions |

## Quick start

```bash
cd schoolRun
npm install
npm run dev
```

This starts:

- **API** → http://localhost:5000  
- **Web** → http://localhost:3000 (proxies `/api` and `/socket.io`)

### Environment

Copy `.env.example` → `.env` (already configured for local demo):

```env
VITE_MAPBOX_TOKEN=pk....
PORT=5000
JWT_SECRET=...
DEMO_PAYMENTS=true
# Optional real Stripe:
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Demo accounts

Password for all: **`password123`**

| Role | Email |
|------|--------|
| Parent | `parent@schoolrun.app` |
| Driver | `driver@schoolrun.app` |
| Admin | `admin@schoolrun.app` |

## End-to-end flows

### Parent: book + pay + chat + track

1. Sign in as parent (or register).
2. **Book a ride** → select child → locations → schedule → review.
3. **Pay** (demo card `4242 4242 4242 4242`, or real Stripe if keys set).
4. Ride becomes **open** for drivers; you get a **handover PIN**.
5. **Chat** and **Live tracking** work for that ride.

### Driver: accept + chat

1. Sign in as driver.
2. See **available** paid rides → Accept.
3. Open **Active trip** / map / **Chat** with parent.

### Admin

1. Sign in as admin → live user/ride/revenue stats from the API.

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login → JWT |
| GET | `/api/auth/me` | Current user |
| GET/POST | `/api/children` | Parent children |
| GET/POST | `/api/rides` | List / create rides |
| GET | `/api/rides/available` | Open rides (driver) |
| POST | `/api/rides/:id/accept` | Driver accepts |
| POST | `/api/payments/create-intent` | Start payment |
| POST | `/api/payments/confirm-demo` | Demo card pay |
| POST | `/api/payments/confirm-stripe` | Confirm Stripe |
| GET/POST | `/api/chat/:rideId/messages` | Chat history / send |
| GET | `/api/admin/stats` | Admin metrics |
| WS | Socket.IO `chat:join` / `chat:send` | Realtime chat |

Health: `GET /api/health`

## Scripts

```bash
npm run dev       # API + Vite together
npm run server    # API only
npm run client    # frontend only
npm run build     # production frontend
npm run start     # API only (production serve frontend separately)
```

## Stripe (optional)

1. Create a Stripe test account.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` in `.env`.
3. Set `DEMO_PAYMENTS=false` if you want to disable the demo card form.
4. Restart `npm run dev`.

Currency is **NGN** (amounts stored in kobo; default fare ₦2,500).

## Project layout

```
schoolRun/
  server/           Express API + SQLite + Socket.IO
  src/
    lib/api.js      HTTP client
    lib/socket.js   Socket.IO client
    pages/          UI screens
  .env              secrets (gitignored)
```
