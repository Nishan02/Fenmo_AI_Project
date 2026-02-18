# Expense Tracker (Full Stack)

A minimal production-minded personal expense tracker with:
- JWT auth (`signup`, `login`)
- Idempotent expense creation for retry safety
- Expense listing with category filter and date sort
- Total for currently visible expenses in the UI

## Tech Stack
- Backend: Node.js, Express, MongoDB, Mongoose, JWT
- Frontend: React + Vite, Axios

## Why MongoDB
MongoDB with Mongoose was chosen for speed of implementation and schema validation while still using real persistence (not in-memory). It is sufficient for this scope and easy to evolve.

## Core API

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Expenses (protected with Bearer token)
- `POST /api/expenses`
  - Body: `amount`, `category`, `description`, `date`, `idempotencyKey`
  - Idempotent behavior: same `idempotencyKey` for same user returns the already-created expense.
- `GET /api/expenses`
  - Optional query params:
  - `category=<string>`
  - `sort=date_desc` (default), also supports `date_asc`

Expense model fields:
- `id` (`_id`)
- `amount`
- `category`
- `description`
- `date`
- `created_at`

## Assignment Coverage

Implemented:
- Create expense with amount/category/description/date
- Delete expense from list
- View expense list
- Filter by category
- Sort by date (newest first default)
- Show total for currently visible list (`INR`)
- Summary view (total per category for current visible list)
- Handles retries/refreshes/duplicate submits via idempotency keys
- Loading and error states in UI
- Basic validation (frontend + backend)
- Default category options with custom category support
- Automated tests for expense controller behaviors

## Reliability Behaviors
- Frontend keeps pending expense submission in `localStorage` and retries safely.
- Backend enforces idempotency per user with unique compound index:
  - `{ user, idempotencyKey }`

## Run Locally

## 1) Backend
```bash
cd backend
npm install
```

Create `backend/.env`:
```env
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
```

Start backend:
```bash
npm run dev
```

## 2) Frontend
```bash
cd frontend
npm install
```

Optional frontend env (`frontend/.env`):
```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Start frontend:
```bash
npm run dev
```

## Notes (Design Decisions / Trade-offs / Not Done)
- Money is stored as `Number` with 2-decimal normalization in controller for simplicity. In a stricter financial system, storing minor units (paise/cents as integers) would be safer.
- Auth + user-scoped expenses were included to align with real-world usage.
- Tests are focused on controller-level behavior using Node's built-in `node:test` to keep setup light.
- No edit/delete expense endpoints were added because they were out of assignment scope.
- Deploy links are not included in this repo yet; add them after deployment.

## Automated Tests
Run backend tests:
```bash
cd backend
npm test
```

Current tests cover:
- validation for invalid amount
- idempotent create behavior (same key returns existing row)
- list filter/sort behavior and total calculation
