# Recurring Task Tracker

Household app to track recurring tasks with browser push notifications.

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 20 (for local dev)

### First run

1. Copy and fill in environment variables:
```
cp .env.example .env
# Edit .env: set JWT_SECRET, VAPID keys (generate with: cd backend && node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k))"), VAPID_EMAIL
```

2. Start the stack:
```
docker compose up --build
```
DB schema is applied automatically on first start.

3. Create your first user (no registration UI — by design for a household app):
```
docker compose exec api node -e "
const b=require('bcryptjs');
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});
b.hash('yourpassword',10).then(h=>p.query('INSERT INTO users(id,name,password_hash) VALUES(gen_random_uuid(),\$1,\$2)',['alice',h]).then(()=>{console.log('User created');p.end()}));
"
```

4. Open `http://localhost:3000` and log in.

## Local Development

```bash
# Start Postgres
docker compose up postgres -d

# Backend
cd backend && cp .env.example .env  # fill in vars
npm install && npm run dev

# Frontend
cd frontend && echo "VITE_VAPID_PUBLIC_KEY=<your-key>" > .env
npm install && npm run dev
```

## Stack
- Backend: Express + TypeScript + Drizzle ORM + node-schedule + web-push
- Frontend: React + Vite + TypeScript
- DB: PostgreSQL 16
- Deploy: Docker Compose
