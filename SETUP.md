# LifeOS — Cofounder Setup Guide
### Oracle SQL + Flask Backend + React Frontend

> Written for Reina's cofounder based on the full migration experience.  
> Read **every warning section** before you run anything. It will save you hours.

---

## What This Project Is

**LifeOS** is a gamified habit-tracking web app with:
- A **Flask REST API** backend (Python) on port `5000`
- A **React frontend** (Vite) on port `5174`
- An **Oracle SQL XE 21.3** database handling all data persistence, triggers, stored procedures, and views

The project was originally built on MySQL and was migrated to Oracle SQL from scratch. All SQL files in `sql/` are already in Oracle PL/SQL dialect.

---

## Prerequisites

Make sure you have ALL of the following installed before starting:

| Tool | Version | Notes |
|---|---|---|
| Python | 3.10+ | Check with `python --version` |
| Oracle Database XE | **21.3** | Must be running as a Windows Service |
| SQL*Plus | 21.3 | Comes with Oracle XE install |
| Node.js | 18+ | Check with `node --version` |
| npm | 9+ | Check with `npm --version` |

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/reinagangwal/lifeos.git
cd lifeos
```

---

## Step 2: Install Python Dependencies

```bash
pip install -r requirements.txt
```

This installs `oracledb`, `flask`, `flask-cors`, and other packages. The project uses **`oracledb` in Thin Mode** — this means you do NOT need Oracle Instant Client installed separately.

---

## Step 3: Set Up the Oracle Database

> [!WARNING]
> **Read this entire section before running a single SQL file.** The order matters and there are several gotchas.

### 3a. Find your Oracle service name

Open a new terminal and run:
```bash
lsnrctl status
```

Look for lines that say `Service "..." has 1 instance(s)`. You will likely see:
- `XE` — the main container database (CDB)
- `XEPDB1` — the pluggable database (PDB)

**You need to determine which one your schema lives in.** When you run the scripts below, they will go to whichever service you connect to in SQL*Plus.

### 3b. Connect to SQL*Plus

Connect using your system credentials:
```bash
sqlplus system/YOUR_PASSWORD@localhost:1521/XE
```

> [!CAUTION]
> **Use `XE`, not `XEPDB1`.** The tables in this project live in the CDB (XE). If you mistakenly create all your tables in XEPDB1, the Flask app won't find them even though the SQL scripts ran without errors. Reina learned this the hard way.

### 3c. Run the SQL scripts IN THIS EXACT ORDER

```sql
SQL> @"C:\path\to\lifeos\sql\01_schema.sql"
SQL> @"C:\path\to\lifeos\sql\03_procedures.sql"
SQL> @"C:\path\to\lifeos\sql\02_triggers.sql"
SQL> @"C:\path\to\lifeos\sql\04_views.sql"
SQL> @"C:\path\to\lifeos\sql\05_complex_queries.sql"
SQL> @"C:\path\to\lifeos\sql\06_seed_data.sql"
```

> [!IMPORTANT]
> **`03_procedures.sql` MUST be run before `02_triggers.sql`.**  
> The triggers call `sp_award_points` and `sp_check_and_award_badges` which are defined in `03_procedures.sql`. If you run triggers first, Oracle will compile them but mark them as **Invalid** because the procedures don't exist yet. You won't get a hard error — just a silent `Warning: Trigger created with compilation errors.` that will cause runtime failures later.

---

## Roadblock Reference — Things That Will Go Wrong

### ❌ SP2-0734: unknown command beginning "CONSTRAINT..."

**Cause:** SQL*Plus treats blank lines *inside* a `CREATE TABLE` block as the end of the SQL statement. This causes it to misparse inline constraints.

**Fix:** Already handled in `01_schema.sql` via `SET SQLBLANKLINES ON;` at the top. If you ever edit the schema file, **do not add blank lines between column definitions** inside a `CREATE TABLE`.

---

### ❌ `Warning: Trigger created with compilation errors`

**Cause:** You ran `02_triggers.sql` before `03_procedures.sql`.

**Fix:** Run `03_procedures.sql` first, then re-run `02_triggers.sql`. Oracle will recompile and all warnings will disappear.

---

### ❌ `ORA-00001: unique constraint violated` on seed data

**Cause:** `06_seed_data.sql` was run more than once (or the badges already exist).

**Fix:** This is safe to ignore — the script is idempotent. It uses `EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL` to silently skip duplicates. The badges are already in the database.

---

### ❌ `ORA-04091: mutating table`

**Cause:** Oracle does not allow a row-level trigger to query the same table it is currently modifying (unlike MySQL).

**Fix:** Already resolved. Both triggers in `02_triggers.sql` use **Compound Triggers** (`FOR ... COMPOUND TRIGGER`) which collect row data in memory during `AFTER EACH ROW` and process them after the statement completes in `AFTER STATEMENT`.

---

### ❌ `ORA-00979: not a GROUP BY expression`

**Cause:** Oracle's `HAVING` clause is stricter than MySQL about correlated subqueries that reference un-aggregated columns.

**Fix:** Already resolved in `05_complex_queries.sql` and `app/routes/reports.py` — Query 4 now uses `RANK() OVER (PARTITION BY user_id ORDER BY ...)` instead of the correlated subquery.

---

## Step 4: Configure the Flask App

Open `app/__init__.py` and update the database config block:

```python
app.config.update(
    SECRET_KEY     = "change-me-in-production",
    DB_HOST        = "localhost",
    DB_PORT        = 1521,
    DB_USER        = "system",
    DB_PASSWORD    = "YOUR_ORACLE_PASSWORD",
    DB_NAME        = "XE",          # ← Must be Oracle service name, NOT "lifeos"
    DB_POOL_SIZE   = 5,
)
```

> [!CAUTION]
> **`DB_NAME` must be your Oracle service name, not anything else.**  
> A common mistake is leaving it as `"lifeos"` (the old MySQL database name). Oracle will throw `DPY-6001: Service "lifeos" is not registered with the listener` and every API call will return 500. Use `"XE"` (or `"XEPDB1"` if you chose to set up there).

---

## Step 5: Start the Flask Backend

In **Terminal 1**:
```bash
python run.py
```

You should see:
```
 * Serving Flask app 'app'
 * Debug mode: on
 * Running on http://127.0.0.1:5000
```

Verify it's working by visiting `http://localhost:5000/` — you should see a JSON welcome message:
```json
{"message": "Welcome to LifeOS! The Oracle SQL API backend is successfully running.", "status": "online"}
```

---

## Step 6: Start the React Frontend

In **Terminal 2** (keep Terminal 1 running):
```bash
npm install
npm run dev
```

> [!WARNING]
> **The frontend dev server might start on port 5174 instead of 5173** if something else is already using 5173. Check the terminal output carefully — it will tell you the actual port:
> ```
>   ➜  Local:   http://localhost:5174/
> ```
> Use **that** URL to open the app in your browser.

---

## Step 7: Open the App

Navigate to `http://localhost:5174` (or whichever port Vite reported).

You should see the LifeOS login screen. Create an account and you're in!

---

## Architecture Overview

```
Browser (React / Vite :5174)
        │
        │  HTTP + JSON (JWT Bearer token in headers)
        ▼
Flask API (:5000)
  ├── /api/auth      → Register, Login, Profile
  ├── /api/habits    → CRUD + daily log toggle
  ├── /api/expenses  → Expenses, Budgets, Alerts
  ├── /api/dashboard → Summary, Weekly, Monthly, Badges
  └── /api/reports   → Analytics & complex queries
        │
        │  oracledb (Thin Mode, connection pool)
        ▼
Oracle XE 21.3 (localhost:1521/XE)
  ├── Tables:    Users, Habits, Habit_Logs, Badges, User_Badges, Expenses, Budgets, Budget_Alerts
  ├── Triggers:  trg_after_habit_log_insert, trg_after_expense_insert
  ├── Procedures: sp_award_points, sp_check_and_award_badges, sp_log_habit
  └── Views:     v_weekly_habit_summary, v_monthly_performance_summary, v_habit_performance, v_budget_usage
```

---

## Key Design Notes (from your AI assistant)

- **`%s` → `:1, :2` conversion is automatic.** The `app/db.py` file has a custom SQL preprocessor that converts MySQL-style `%s` placeholders into Oracle positional bind variables (`:1`, `:2`, etc.) at runtime. You do not need to manually write Oracle bind syntax in the route files.

- **Inserted IDs via `RETURNING INTO`.** Oracle has no `cursor.lastrowid` like MySQL. We use `RETURNING habit_id INTO :out_var` and pass `out_id_type='NUMBER'` to the `query()` helper. Check `app/db.py` for how this is implemented if you add new `INSERT` routes.

- **`INSERT IGNORE` doesn't exist in Oracle.** Use `EXCEPTION WHEN DUP_VAL_ON_INDEX THEN NULL;` inside a PL/SQL block, or a `MERGE INTO ... USING DUAL` statement for upserts.

- **`CURDATE()` → `TRUNC(SYSDATE)`.** All MySQL date functions have Oracle equivalents already applied in the codebase. If you ever write new queries, use `TO_CHAR(date_col, 'YYYY-MM')` instead of `DATE_FORMAT`.

- **No `ENUM` columns.** Oracle doesn't support `ENUM`. All enum-like columns use `VARCHAR2` with a `CHECK` constraint. Valid values are defined in `sql/01_schema.sql`.

---

## Troubleshooting Quick Reference

| Error | Likely Cause | Fix |
|---|---|---|
| `DPY-6001: Service "X" not registered` | Wrong `DB_NAME` in `__init__.py` | Change to `"XE"` |
| `Failed to fetch` in browser | CORS blocked or Flask not running | Check both terminals; ensure `CORS(app)` is in `__init__.py` |
| `Warning: Trigger created with compilation errors` | Ran triggers before procedures | Re-run `03_procedures.sql` then `02_triggers.sql` |
| `SP2-0734: unknown command beginning "CONSTRAINT"` | Blank lines in CREATE TABLE in SQL*Plus | Ensure `SET SQLBLANKLINES ON` is at top of schema file |
| `ORA-00001: unique constraint violated` on seed | Seeds already exist | Safe to ignore — script is idempotent |
| `500` on every API call | Oracle pool can't connect | Check DB_NAME, DB_PASSWORD, and that Oracle service is running |
| Browser shows `localhost:5173` not found | Vite started on 5174 | Check Vite terminal output for actual port |
