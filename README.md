# HSA Expense Tracker

Track HSA-eligible medical expenses across family members with receipt storage, reimbursement workflows, and export for IRS documentation.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + React Query
- **Backend**: Node.js + Express + Prisma
- **Database**: PostgreSQL 16
- **File storage**: MinIO (S3-compatible)
- **Auth**: JWT (bcrypt passwords)

---

## Production — Docker Compose

### Prerequisites
- Docker Desktop

### Steps

```bash
cd hsa-tracker

# Copy and optionally edit env
cp .env.example .env

# Build and start
docker compose up --build
```

App runs at **http://localhost:3001**. MinIO console at **http://localhost:9001** (user: `minioadmin`, pass: `minioadmin`).

---

## Local Development (no Docker)

### Prerequisites
- Node.js 20+
- PostgreSQL 16 running locally
- MinIO running locally (or use Docker just for services)

### Start services only

```bash
docker compose up db minio
```

### Backend

```bash
cd backend
npm install
cp ../.env.example .env      # edit DATABASE_URL etc.
npx prisma migrate dev
npx prisma db seed
npm run dev
# runs on http://localhost:3001
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# runs on http://localhost:5173, proxies /api to :3001
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | `postgres` | PostgreSQL password |
| `JWT_SECRET` | `change-me-...` | JWT signing secret — **change in production** |
| `MINIO_ROOT_USER` | `minioadmin` | MinIO access key |
| `MINIO_ROOT_PASSWORD` | `minioadmin` | MinIO secret key |

---

## Features

- **Multi-member** expense tracking (Self, Spouse, Dependents — configurable)
- **13 pre-seeded HSA categories** + custom categories
- **Payment method**: Out-of-Pocket or Direct HSA
- **Reimbursement workflow**: Pending → Reimbursed with date
- **Bulk reimbursement**: select multiple expenses, mark all at once
- **Receipt storage**: PDF/JPG/PNG, served via MinIO signed URLs
- **Filters**: year, member, category, payment method, status, date range
- **Summary**: totals by member + category, pending/reimbursed/direct HSA stats
- **Export**: CSV and PDF for IRS documentation
