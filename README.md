# School POS System

Multi-school POS, inventory, student, billing, transfer, return/exchange, GST, audit, notification and reporting system built with Next.js, TypeScript, Prisma and PostgreSQL.

## Requirements

- Node.js 20.19+ (Node 22 LTS recommended)
- npm
- Docker Desktop (recommended for local PostgreSQL)

## Local setup

```powershell
cd C:\office\school-pos
npm ci
Copy-Item .env.example .env
```

Set a strong `AUTH_SECRET` in `.env`. The default Docker database URL is:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/school_pos_system?schema=public"
AUTH_SECRET="replace-with-at-least-32-random-characters"
```

Start PostgreSQL and prepare Prisma:

```powershell
docker compose up -d
npm run db:generate
npm run db:deploy
npm run db:seed
```

Start development:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Demo users after seeding

Main account:

- Email: `admin@schoolpos.com`
- Password: `Admin@12345`

School accounts use password `School@12345`:

- `hpgms@schoolpos.com`
- `aranghata@schoolpos.com`
- `taldi@schoolpos.com`
- `chakdaha@schoolpos.com`

Change demo passwords before production use.

## Checks and tests

Run each check separately while developing:

```powershell
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

Or run the combined verification commands:

```powershell
npm run check
npm run verify
```

`npm test` currently tests the Excel import parser, including the legacy multi-school opening-stock workbook format and student required fields.

## Database utilities

```powershell
npm run db:studio
npm run db:format
npm run db:deploy
```

To completely reset a **local development** database and reseed it:

```powershell
npm run db:reset
npm run db:seed
npm run db:generate
```

Never run `db:reset` against production.

## Multi-school stock import

The product/stock importer supports one workbook containing multiple schools. It can map schools using `School`, `School Code`, or legacy `Branch` / `Warehouse` headers. Existing opening-stock files with columns such as `Item`, `Code`, `SIZE`, `Qty(Opening stock)`, `MRP`, and `Price` are supported.

During upload the form is locked and shows processing feedback to prevent repeated submissions. Import history shows successful/failed row counts and row-level error details.

## Production checklist

Before deployment:

```powershell
npm ci
npm run verify
npm run db:deploy
npm start
```

Back up the production database before applying migrations. Do not run the demo seed on an existing production database unless that is intentional.
