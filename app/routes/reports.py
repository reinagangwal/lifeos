"""
LifeOS – routes/reports.py

Complex analytical queries — all SQL-driven.

GET /api/reports/perfect-week?year=&week=
    Users who completed every active habit in a given week.

GET /api/reports/max-streak
    Each user's habit with the highest current streak.

GET /api/reports/budget-vs-habits?month=
    Users over budget in ≥1 category but with ≥80% habit completion.

GET /api/reports/top-habits?min_completions=5
    Top 5 habits per user by total completions (≥ min_completions).

GET /api/reports/expense-running-total?month=
    Expenses with running total for the authenticated user.
"""

from flask import Blueprint, request, jsonify
from ..db import query
from ..auth_utils import login_required
import datetime

bp = Blueprint("reports", __name__)


# ---------------------------------------------------------------------------
# GET /api/reports/perfect-week?year=2025&week=22
# Complex Query 1 — GROUP BY + HAVING, nested subquery
# ---------------------------------------------------------------------------
@bp.route("/perfect-week", methods=["GET"])
@login_required
def perfect_week():
    year = int(request.args.get("year", datetime.date.today().isocalendar()[0]))
    week = int(request.args.get("week", datetime.date.today().isocalendar()[1]))

    rows = query(
        """
        SELECT
            u.user_id,
            u.name,
            COUNT(DISTINCT h.habit_id)  AS total_active_habits,
            COUNT(DISTINCT
                CASE
                    WHEN COALESCE(week_logs.completed_days, 0) >=
                         CASE h.frequency WHEN 'daily' THEN 7 ELSE 1 END
                    THEN h.habit_id
                END
            )                            AS habits_fully_completed
        FROM Users u
        JOIN Habits h ON h.user_id = u.user_id AND h.is_active = 1
        LEFT JOIN (
            SELECT
                habit_id,
                COUNT(*) AS completed_days
            FROM Habit_Logs
            WHERE (status = 1 OR completion_count > 0)
              AND YEAR(log_date) = %s
              AND WEEK(log_date, 1) = %s
            GROUP BY habit_id
        ) AS week_logs ON week_logs.habit_id = h.habit_id
        GROUP BY u.user_id, u.name
        HAVING
            total_active_habits > 0
            AND total_active_habits = habits_fully_completed
        ORDER BY u.name
        """,
        (year, week)
    )
    return jsonify({"year": year, "week": week, "users": rows})


# ---------------------------------------------------------------------------
# GET /api/reports/max-streak
# Complex Query 2 — correlated subquery
# ---------------------------------------------------------------------------
@bp.route("/max-streak", methods=["GET"])
@login_required
def max_streak_per_user():
    rows = query(
        """
        SELECT
            u.user_id,
            u.name,
            h.habit_id,
            h.habit_name,
            h.current_streak,
            h.best_streak
        FROM Habits h
        JOIN Users u ON u.user_id = h.user_id
        WHERE h.current_streak = (
            SELECT MAX(h2.current_streak)
            FROM Habits h2
            WHERE h2.user_id = h.user_id
        )
        AND h.is_active = 1
        ORDER BY h.current_streak DESC, u.name
        """
    )
    return jsonify(rows)


# ---------------------------------------------------------------------------
# GET /api/reports/budget-vs-habits?month=2025-05
# Complex Query 3 — multi-table join + subquery + HAVING
# ---------------------------------------------------------------------------
@bp.route("/budget-vs-habits", methods=["GET"])
@login_required
def budget_vs_habits():
    month = request.args.get("month", datetime.date.today().strftime("%Y-%m"))

    rows = query(
        """
        SELECT
            u.user_id,
            u.name,
            budget_status.over_budget_categories,
            habit_status.completion_pct
        FROM Users u
        JOIN (
            SELECT
                b.user_id,
                COUNT(*) AS over_budget_categories
            FROM Budgets b
            JOIN (
                SELECT user_id, category,
                       DATE_FORMAT(expense_date, '%%Y-%%m') AS month_year,
                       SUM(amount) AS total_spent
                FROM Expenses
                GROUP BY user_id, category, DATE_FORMAT(expense_date, '%%Y-%%m')
            ) AS monthly_spend
            ON  monthly_spend.user_id    = b.user_id
            AND monthly_spend.category   = b.category
            AND monthly_spend.month_year = b.month_year
            WHERE b.month_year = %s
              AND monthly_spend.total_spent > b.monthly_limit
            GROUP BY b.user_id
            HAVING COUNT(*) >= 1
        ) AS budget_status ON budget_status.user_id = u.user_id
        JOIN (
            SELECT
                h.user_id,
                ROUND(
                    100.0 * SUM(
                        CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 ELSE 0 END
                    ) / NULLIF(COUNT(hl.log_id), 0),
                    1
                ) AS completion_pct
            FROM Habits h
            JOIN Habit_Logs hl ON hl.habit_id = h.habit_id
            WHERE DATE_FORMAT(hl.log_date, '%%Y-%%m') = %s
            GROUP BY h.user_id
            HAVING completion_pct >= 80
        ) AS habit_status ON habit_status.user_id = u.user_id
        ORDER BY habit_status.completion_pct DESC
        """,
        (month, month)
    )
    return jsonify({"month": month, "users": rows})


# ---------------------------------------------------------------------------
# GET /api/reports/top-habits?min_completions=5
# Complex Query 4 — GROUP BY + HAVING + correlated rank subquery
# ---------------------------------------------------------------------------
@bp.route("/top-habits", methods=["GET"])
@login_required
def top_habits():
    min_c = int(request.args.get("min_completions", 5))

    rows = query(
        """
        SELECT
            u.user_id,
            u.name,
            ranked.habit_id,
            ranked.habit_name,
            ranked.total_completions,
            ranked.user_rank
        FROM (
            SELECT
                h.habit_id,
                h.user_id,
                h.habit_name,
                COUNT(
                    CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
                ) AS total_completions,
                (
                    SELECT COUNT(*) + 1
                    FROM Habits h2
                    LEFT JOIN Habit_Logs hl2 ON hl2.habit_id = h2.habit_id
                    WHERE h2.user_id = h.user_id
                    GROUP BY h2.habit_id
                    HAVING COUNT(
                        CASE WHEN hl2.status = 1 OR hl2.completion_count > 0 THEN 1 END
                    ) > COUNT(
                        CASE WHEN hl.status = 1 OR hl.completion_count > 0 THEN 1 END
                    )
                ) AS user_rank
            FROM Habits h
            LEFT JOIN Habit_Logs hl ON hl.habit_id = h.habit_id
            WHERE h.user_id = %s
            GROUP BY h.habit_id, h.user_id, h.habit_name
            HAVING total_completions >= %s
        ) AS ranked
        JOIN Users u ON u.user_id = ranked.user_id
        WHERE COALESCE(ranked.user_rank, 1) <= 5
        ORDER BY ranked.user_rank
        """,
        (request.user_id, min_c)
    )
    return jsonify(rows)


# ---------------------------------------------------------------------------
# GET /api/reports/expense-running-total?month=2025-05
# Complex Query 5 — running total with correlated subquery
# ---------------------------------------------------------------------------
@bp.route("/expense-running-total", methods=["GET"])
@login_required
def expense_running_total():
    month = request.args.get("month", datetime.date.today().strftime("%Y-%m"))

    rows = query(
        """
        SELECT
            e.expense_id,
            e.category,
            e.amount,
            e.expense_date,
            e.note,
            (
                SELECT COALESCE(SUM(e2.amount), 0)
                FROM Expenses e2
                WHERE e2.user_id = e.user_id
                  AND DATE_FORMAT(e2.expense_date, '%%Y-%%m') = %s
                  AND e2.expense_id <= e.expense_id
            ) AS running_total
        FROM Expenses e
        WHERE e.user_id = %s
          AND DATE_FORMAT(e.expense_date, '%%Y-%%m') = %s
        ORDER BY e.expense_date, e.expense_id
        """,
        (month, request.user_id, month)
    )
    return jsonify({"month": month, "expenses": rows})
