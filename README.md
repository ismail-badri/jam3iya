# Smart Irrigation Water Management System

Full-stack web application for an agricultural water distribution association.

## Features

- Arabic RTL government-style dashboard.
- Farmer registration and login.
- JWT authentication with secure password hashing.
- Role-based API permissions for farmers, admins, and staff.
- Farmer profile, fields, meters, readings, bills, requests, and notifications.
- Admin dashboard, farmer management, meter readings, automatic consumption and billing.
- Irrigation request approvals/rejections with farmer notifications.
- Staff roles, audit logs, reports, revenue statistics, dark/light mode.
- PostgreSQL schema and seed files for production-style persistence.
- Local JSON persistence for quick demo runs without installing dependencies.

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

Demo accounts:

- Admin: `admin@irrigation.local` / `Admin@123`
- Farmer: `farmer1@irrigation.local` / `Farmer@123`
- Staff: `staff@irrigation.local` / `Staff@123`

The demo server stores local data in `work/dev-db.json`.

## PostgreSQL setup

Create a database, then run:

```bash
psql "$DATABASE_URL" -f database/schema.sql
psql "$DATABASE_URL" -f database/seed.sql
```

The included schema mirrors the application entities and is ready to connect through a PostgreSQL adapter or service layer.

## API overview

- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/me`
- `GET /api/farmer/overview`
- `POST /api/farmer/requests`
- `PATCH /api/farmer/notifications/:id/read`
- `GET /api/admin/dashboard`
- `GET|POST /api/admin/farmers`
- `PUT|DELETE /api/admin/farmers/:id`
- `GET|POST /api/admin/fields`
- `PUT /api/admin/fields/:id`
- `GET /api/admin/meters`
- `POST /api/admin/meter-readings`
- `GET /api/admin/requests`
- `PATCH /api/admin/requests/:id`
- `GET /api/admin/bills`
- `PATCH /api/admin/bills/:id/pay`
- `GET|POST /api/admin/staff`
- `GET /api/admin/reports`
- `GET /api/admin/audit-logs`
- `POST /api/admin/notifications`
