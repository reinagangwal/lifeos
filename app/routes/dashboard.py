"""
LifeOS – routes/dashboard.py

All endpoints read from SQL views — no business logic in Python.

GET /api/dashboard/weekly?year=&week=          v_weekly_habit_summary
GET /api/dashboard/monthly?month=YYYY-MM       v_monthly_performance_summary
GET /api/dashboard/habits                      v_habit_performance (all habits)
GET /api/dashboard/budget?month=YYYY-MM        v_budget_usage
GET /api/dashboard/badges                      user's earned badges
GET /api/dashboard/summary                     quick stats for home screen
"""

from flask import Blueprint, request, jsonify
from ..db import query
from ..auth_utils import login_required
import datetime

bp = Blueprint("dashboard", __name__)


# ---------------------------------------------------------------------------
# GET /api/dashboard/weekly?year=2025&week=22
# Uses view: v_weekly_habit_summary
# ---------------------------------------------------------------------------
@bp.route("/weekly", methods=["GET"])
@login_required
def weekly_summary():
    # Accept either date=YYYY-MM-DD (preferred) or year=&week= (legacy)
    date_str = request.args.get("date")
    if date_str:
        try:
            d = datetime.date.fromisoformat(date_str)
            iso = d.isocalendar()  # (iso_year, iso_week, iso_weekday)
            year = iso[0]
            week = iso[1]
        except (ValueError, TypeError):
            year = datetime.date.today().isocalendar()[0]
            week = datetime.date.today().isocalendar()[1]
    else:
        year = int(request.args.get("year", datetime.date.today().isocalendar()[0]))
        week = int(request.args.get("week", datetime.date.today().isocalendar()[1]))

    rows = query(
        """
        SELECT *
        FROM v_weekly_habit_summary
        WHERE user_id = %s
          AND log_year = %s
          AND iso_week = %s
        ORDER BY habit_name
        """,
        (request.user_id, year, week)
    )
    return jsonify({"year": year, "week": week, "habits": rows})


# ---------------------------------------------------------------------------
# GET /api/dashboard/monthly?month=2025-05
# Uses view: v_monthly_performance_summary
# ---------------------------------------------------------------------------
@bp.route("/monthly", methods=["GET"])
@login_required
def monthly_summary():
    month = request.args.get("month", datetime.date.today().strftime("%Y-%m"))
    row = query(
        """
        SELECT *
        FROM v_monthly_performance_summary
        WHERE user_id  = %s
          AND month_year = %s
        """,
        (request.user_id, month), fetch_one=True
    )
    return jsonify(row or {"month_year": month, "total_completions": 0})


# ---------------------------------------------------------------------------
# GET /api/dashboard/habits
# Uses view: v_habit_performance
# ---------------------------------------------------------------------------
@bp.route("/habits", methods=["GET"])
@login_required
def habit_performance():
    rows = query(
        """
        SELECT *
        FROM v_habit_performance
        WHERE user_id = %s
        ORDER BY total_completions DESC
        """,
        (request.user_id,)
    )
    return jsonify(rows)


# ---------------------------------------------------------------------------
# GET /api/dashboard/budget?month=2025-05
# Uses view: v_budget_usage
# ---------------------------------------------------------------------------
@bp.route("/budget", methods=["GET"])
@login_required
def budget_dashboard():
    month = request.args.get("month", datetime.date.today().strftime("%Y-%m"))
    rows = query(
        """
        SELECT *
        FROM v_budget_usage
        WHERE user_id   = %s
          AND month_year = %s
        ORDER BY pct_used DESC
        """,
        (request.user_id, month)
    )
    return jsonify(rows)


# ---------------------------------------------------------------------------
# GET /api/dashboard/badges
# ---------------------------------------------------------------------------
@bp.route("/badges", methods=["GET"])
@login_required
def user_badges():
    rows = query(
        """
        SELECT b.badge_id, b.badge_name, b.description, b.criteria,
               b.points_reward, ub.awarded_date
        FROM User_Badges ub
        JOIN Badges b ON b.badge_id = ub.badge_id
        WHERE ub.user_id = %s
        ORDER BY ub.awarded_date DESC
        """,
        (request.user_id,)
    )
    return jsonify(rows)


# ---------------------------------------------------------------------------
# GET /api/dashboard/summary
# Returns a quick home-screen stats object.
# One trip to the DB using a multi-table aggregate query.
# ---------------------------------------------------------------------------
@bp.route("/summary", methods=["GET"])
@login_required
def summary():
    stats = query(
        """
        SELECT
            u.name,
            u.points,
            (SELECT COUNT(*) FROM Habits WHERE user_id = u.user_id AND is_active = 1)
                AS active_habits,
            (SELECT COALESCE(MAX(current_streak), 0) FROM Habits WHERE user_id = u.user_id)
                AS best_current_streak,
            (SELECT COUNT(DISTINCT badge_id) FROM User_Badges WHERE user_id = u.user_id)
                AS badge_count,
            (SELECT COUNT(*)
             FROM Habit_Logs hl
             JOIN Habits h ON h.habit_id = hl.habit_id
             WHERE h.user_id = u.user_id
               AND hl.log_date = TRUNC(SYSDATE)
               AND (hl.status = 1 OR hl.completion_count > 0))
                AS completed_today
        FROM Users u
        WHERE u.user_id = %s
        """,
        (request.user_id,), fetch_one=True
    )
    return jsonify(stats or {})
