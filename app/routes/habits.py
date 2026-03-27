"""
LifeOS – routes/habits.py

GET    /api/habits/              list user's habits
POST   /api/habits/              create habit
GET    /api/habits/<id>          get single habit
PUT    /api/habits/<id>          update habit
DELETE /api/habits/<id>          soft-delete (is_active = 0)
POST   /api/habits/<id>/log      log a habit (calls sp_log_habit stored procedure)
GET    /api/habits/<id>/logs     history of logs
GET    /api/habits/<id>/streak   current & best streak
"""

from flask import Blueprint, request, jsonify
from ..db import query
from ..auth_utils import login_required
import datetime

bp = Blueprint("habits", __name__)


def _owned_habit(habit_id: int, user_id: int):
    """Return habit row or None if not found / not owned by user."""
    return query(
        "SELECT * FROM Habits WHERE habit_id = %s AND user_id = %s",
        (habit_id, user_id), fetch_one=True
    )


# ---------------------------------------------------------------------------
# GET /api/habits/
# ---------------------------------------------------------------------------
@bp.route("/", methods=["GET"])
@login_required
def list_habits():
    rows = query(
        """
        SELECT habit_id, habit_name, frequency, target_count, habit_type,
               current_streak, best_streak, is_active, created_at
        FROM Habits
        WHERE user_id = %s
        ORDER BY is_active DESC, created_at DESC
        """,
        (request.user_id,)
    )
    return jsonify(rows)


# ---------------------------------------------------------------------------
# POST /api/habits/
# Body: { habit_name, frequency, target_count, habit_type }
# ---------------------------------------------------------------------------
@bp.route("/", methods=["POST"])
@login_required
def create_habit():
    d = request.get_json(force=True) or {}
    name         = (d.get("habit_name") or "").strip()
    frequency    = d.get("frequency", "daily")
    target_count = int(d.get("target_count", 1))
    habit_type   = d.get("habit_type", "binary")

    if not name:
        return jsonify({"error": "habit_name is required"}), 400
    if frequency not in ("daily", "weekly"):
        return jsonify({"error": "frequency must be daily or weekly"}), 400
    if habit_type not in ("binary", "count"):
        return jsonify({"error": "habit_type must be binary or count"}), 400
    if target_count < 1:
        return jsonify({"error": "target_count must be ≥ 1"}), 400

    habit_id = query(
        """
        INSERT INTO Habits (user_id, habit_name, frequency, target_count, habit_type)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (request.user_id, name, frequency, target_count, habit_type),
        commit=True
    )
    return jsonify({"habit_id": habit_id, "habit_name": name}), 201


# ---------------------------------------------------------------------------
# GET /api/habits/<id>
# ---------------------------------------------------------------------------
@bp.route("/<int:habit_id>", methods=["GET"])
@login_required
def get_habit(habit_id):
    habit = _owned_habit(habit_id, request.user_id)
    if not habit:
        return jsonify({"error": "Habit not found"}), 404
    return jsonify(habit)


# ---------------------------------------------------------------------------
# PUT /api/habits/<id>
# Body: any subset of { habit_name, frequency, target_count, habit_type }
# ---------------------------------------------------------------------------
@bp.route("/<int:habit_id>", methods=["PUT"])
@login_required
def update_habit(habit_id):
    if not _owned_habit(habit_id, request.user_id):
        return jsonify({"error": "Habit not found"}), 404

    d = request.get_json(force=True) or {}
    fields, vals = [], []

    if "habit_name" in d:
        fields.append("habit_name = %s");   vals.append(d["habit_name"].strip())
    if "frequency" in d:
        if d["frequency"] not in ("daily", "weekly"):
            return jsonify({"error": "Invalid frequency"}), 400
        fields.append("frequency = %s");    vals.append(d["frequency"])
    if "target_count" in d:
        fields.append("target_count = %s"); vals.append(int(d["target_count"]))
    if "habit_type" in d:
        if d["habit_type"] not in ("binary", "count"):
            return jsonify({"error": "Invalid habit_type"}), 400
        fields.append("habit_type = %s");   vals.append(d["habit_type"])

    if not fields:
        return jsonify({"error": "Nothing to update"}), 400

    vals.append(habit_id)
    query(
        f"UPDATE Habits SET {', '.join(fields)} WHERE habit_id = %s",
        vals, commit=True
    )
    return jsonify({"message": "Habit updated"})


# ---------------------------------------------------------------------------
# DELETE /api/habits/<id>  (soft delete)
# ---------------------------------------------------------------------------
@bp.route("/<int:habit_id>", methods=["DELETE"])
@login_required
def delete_habit(habit_id):
    if not _owned_habit(habit_id, request.user_id):
        return jsonify({"error": "Habit not found"}), 404
    query(
        "UPDATE Habits SET is_active = 0 WHERE habit_id = %s",
        (habit_id,), commit=True
    )
    return jsonify({"message": "Habit deactivated"})


# ---------------------------------------------------------------------------
# POST /api/habits/<id>/log
# Body: { log_date?, status?, completion_count? }
#
# Delegates to the stored procedure sp_log_habit which internally fires
# the insert trigger → streak recalc → points → badges.
# ---------------------------------------------------------------------------
@bp.route("/<int:habit_id>/log", methods=["POST"])
@login_required
def log_habit(habit_id):
    habit = _owned_habit(habit_id, request.user_id)
    if not habit:
        return jsonify({"error": "Habit not found"}), 404

    d                = request.get_json(force=True) or {}
    log_date         = d.get("log_date", str(datetime.date.today()))
    status           = int(d.get("status", 1))
    completion_count = int(d.get("completion_count", 0))

    # For binary habits, completion_count mirrors status; for count habits,
    # status is 1 if count >= target.
    if habit["habit_type"] == "binary":
        completion_count = status
    else:
        status = 1 if completion_count >= habit["target_count"] else 0

    # Call the stored procedure (trigger fires inside on INSERT)
    query(
        "sp_log_habit",
        [habit_id, log_date, status, completion_count],
        call_proc=True, commit=True
    )

    # Return refreshed habit data so client sees updated streak / points
    updated_habit = _owned_habit(habit_id, request.user_id)
    user_points = query(
        "SELECT points FROM Users WHERE user_id = %s",
        (request.user_id,), fetch_one=True
    )
    return jsonify({
        "message":        "Habit logged",
        "current_streak": updated_habit["current_streak"],
        "best_streak":    updated_habit["best_streak"],
        "user_points":    user_points["points"],
    })


# ---------------------------------------------------------------------------
# GET /api/habits/<id>/logs?limit=30
# ---------------------------------------------------------------------------
@bp.route("/<int:habit_id>/logs", methods=["GET"])
@login_required
def habit_logs(habit_id):
    if not _owned_habit(habit_id, request.user_id):
        return jsonify({"error": "Habit not found"}), 404
    limit = min(int(request.args.get("limit", 30)), 365)
    rows = query(
        """
        SELECT log_id, log_date, status, completion_count, logged_at
        FROM Habit_Logs
        WHERE habit_id = %s
        ORDER BY log_date DESC
        LIMIT %s
        """,
        (habit_id, limit)
    )
    return jsonify(rows)


# ---------------------------------------------------------------------------
# GET /api/habits/<id>/streak
# ---------------------------------------------------------------------------
@bp.route("/<int:habit_id>/streak", methods=["GET"])
@login_required
def habit_streak(habit_id):
    habit = _owned_habit(habit_id, request.user_id)
    if not habit:
        return jsonify({"error": "Habit not found"}), 404
    return jsonify({
        "habit_id":      habit_id,
        "current_streak": habit["current_streak"],
        "best_streak":    habit["best_streak"],
    })
