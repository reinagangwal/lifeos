# LifeOS – Database-Driven Gamified Habit Tracking System

A Flask + MySQL mini-project built to strongly demonstrate relational database concepts:
ER design, constraints, joins, views, triggers, stored procedures, and complex queries.

---

## Project Structure

```
lifeos/
├── sql/
│   ├── 01_schema.sql          # CREATE TABLE statements (3NF, FK constraints)
│   ├── 02_triggers.sql        # Two triggers (habit log → streak/points; expense → budget alert)
│   ├── 03_procedures.sql      # Three stored procedures (points, badges, safe log upsert)
│   ├── 04_views.sql           # Four analytical views
│   ├── 05_complex_queries.sql # Five complex standalone queries (for reference/testing)
│   └── 06_seed_data.sql       # Badge definitions
├── app/
│   ├── __init__.py            # Flask app factory
│   ├── db.py                  # Raw SQL helper (no ORM)
│   ├── auth_utils.py          # Password hashing + JWT
│   └── routes/
│       ├── auth.py            # /api/auth/*
│       ├── habits.py          # /api/habits/*
│       ├── expenses.py        # /api/expenses/*
│       ├── dashboard.py       # /api/dashboard/*  (reads from SQL views)
│       └── reports.py         # /api/reports/*    (complex queries)
├── run.py
└── requirements.txt
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| MySQL | 8.0+ |
| pip | latest |

---

## Local Setup

### 1. Clone / download the project

```bash
cd lifeos
```

### 2. Create a Python virtual environment

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Create and initialise the MySQL database

Log in to MySQL as root (or any user with CREATE DATABASE privileges):

```bash
mysql -u root -p
```

Then run each SQL file in order:

```sql
SOURCE /full/path/to/lifeos/sql/01_schema.sql;
SOURCE /full/path/to/lifeos/sql/02_triggers.sql;
SOURCE /full/path/to/lifeos/sql/03_procedures.sql;
SOURCE /full/path/to/lifeos/sql/04_views.sql;
SOURCE /full/path/to/lifeos/sql/06_seed_data.sql;
```

Or from the shell in one command:

```bash
mysql -u root -p lifeos < sql/01_schema.sql
mysql -u root -p lifeos < sql/02_triggers.sql
mysql -u root -p lifeos < sql/03_procedures.sql
mysql -u root -p lifeos < sql/04_views.sql
mysql -u root -p lifeos < sql/06_seed_data.sql
```

### 4. Configure the Flask app

Edit `app/__init__.py` and update the `DB_*` config values to match your MySQL credentials, or set environment variables and update `create_app()` to read from `os.environ`.

Minimum to change:
```python
DB_USER     = "root"
DB_PASSWORD = "your_mysql_password"
DB_HOST     = "localhost"
```

### 5. Run the server

```bash
python run.py
```

The API will be available at `http://127.0.0.1:5000`.

---

## API Reference

All protected endpoints require:
```
Authorization: Bearer <token>
```

### Auth

| Method | Path | Body / Params | Description |
|--------|------|---------------|-------------|
| POST | `/api/auth/register` | `{name, email, password}` | Register user |
| POST | `/api/auth/login` | `{email, password}` | Login, returns JWT |
| GET  | `/api/auth/me` | — | Current user info |

### Habits

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/habits/` | List all habits |
| POST | `/api/habits/` | Create habit `{habit_name, frequency, target_count, habit_type}` |
| GET  | `/api/habits/<id>` | Get one habit |
| PUT  | `/api/habits/<id>` | Update habit fields |
| DELETE | `/api/habits/<id>` | Soft-delete habit |
| POST | `/api/habits/<id>/log` | Log completion `{log_date?, status?, completion_count?}` |
| GET  | `/api/habits/<id>/logs` | Log history `?limit=30` |
| GET  | `/api/habits/<id>/streak` | Current and best streak |

### Expenses & Budgets

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/expenses/` | Add expense `{category, amount, expense_date?, note?}` |
| GET  | `/api/expenses/` | List expenses `?month=YYYY-MM&category=` |
| DELETE | `/api/expenses/<id>` | Delete expense |
| POST | `/api/expenses/budgets/` | Set budget `{category, monthly_limit, month_year?}` |
| GET  | `/api/expenses/budgets/` | List budgets |
| GET  | `/api/expenses/alerts/` | Budget breach alerts |

### Dashboard (reads SQL views)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/summary` | Quick home-screen stats |
| GET | `/api/dashboard/weekly?year=&week=` | `v_weekly_habit_summary` |
| GET | `/api/dashboard/monthly?month=YYYY-MM` | `v_monthly_performance_summary` |
| GET | `/api/dashboard/habits` | `v_habit_performance` |
| GET | `/api/dashboard/budget?month=YYYY-MM` | `v_budget_usage` |
| GET | `/api/dashboard/badges` | Earned badges |

### Reports (complex SQL queries)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reports/perfect-week?year=&week=` | Users who completed all habits in a week |
| GET | `/api/reports/max-streak` | Habit with max streak per user |
| GET | `/api/reports/budget-vs-habits?month=` | Over-budget users with high habit consistency |
| GET | `/api/reports/top-habits?min_completions=5` | Top 5 habits by completions |
| GET | `/api/reports/expense-running-total?month=` | Expenses with running total |

---

## Database Concepts Demonstrated

### Schema Design
- 8 tables in 3NF; no transitive dependencies
- Primary keys (surrogate INT UNSIGNED AUTO_INCREMENT on all tables)
- Unique constraints: `Users.email`, `Habit_Logs(habit_id, log_date)`, `Budgets(user_id, category, month_year)`
- CHECK constraints: `Expenses.amount > 0`, `Budgets.monthly_limit > 0`
- Foreign keys with `ON DELETE CASCADE` on all child tables

### Triggers
| Trigger | Event | Purpose |
|---------|-------|---------|
| `trg_after_habit_log_insert` | AFTER INSERT on Habit_Logs | Recalculates streak via pure SQL window traversal, calls `sp_award_points` and `sp_check_and_award_badges` |
| `trg_after_expense_insert` | AFTER INSERT on Expenses | Compares cumulative spend against budget; inserts into `Budget_Alerts` if exceeded |

### Stored Procedures
| Procedure | Purpose |
|-----------|---------|
| `sp_award_points` | Tiered point calculation (base + streak bonus) applied via UPDATE |
| `sp_check_and_award_badges` | Evaluates all badge criteria; uses `INSERT IGNORE` for idempotency |
| `sp_log_habit` | Safe DELETE + INSERT to ensure trigger always fires on updates |

### Views
| View | Purpose |
|------|---------|
| `v_weekly_habit_summary` | Completion % per habit per ISO week |
| `v_monthly_performance_summary` | Monthly aggregate stats per user |
| `v_habit_performance` | Lifetime totals, streaks per habit |
| `v_budget_usage` | Budget vs actual spend with over-budget flag |

### Complex Queries
1. Users completing **all** habits in a week (GROUP BY + HAVING + nested subquery)
2. Habit with **max streak** per user (correlated subquery)
3. **Budget-over + high habit consistency** users (multi-join across two independent subqueries)
4. **Top 5 habits** per user by completions (GROUP BY + HAVING + correlated rank)
5. Expenses with **running total** (correlated subquery per row)

---

## Quick curl Test

```bash
# Register
curl -s -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret123"}' | jq

# Login
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}' | jq -r .token)

# Create a habit
curl -s -X POST http://localhost:5000/api/habits/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"habit_name":"Morning Run","frequency":"daily","target_count":1,"habit_type":"binary"}' | jq

# Log the habit (trigger fires → streak, points, badges updated)
curl -s -X POST http://localhost:5000/api/habits/1/log \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":1}' | jq

# Check dashboard summary
curl -s http://localhost:5000/api/dashboard/summary \
  -H "Authorization: Bearer $TOKEN" | jq
```
