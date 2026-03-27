"""
LifeOS – routes/expenses.py

POST   /api/expenses/                   log an expense (triggers budget check)
GET    /api/expenses/                   list expenses (filter: ?month=YYYY-MM&category=)
DELETE /api/expenses/<id>               delete expense

POST   /api/expenses/budgets/           set or update a monthly budget
GET    /api/expenses/budgets/           list budgets
GET    /api/expenses/alerts/            list budget alerts for current user
"""

from flask import Blueprint, request, jsonify
from ..db import query
from ..auth_utils import login_required
import datetime

bp = Blueprint("expenses", __name__)


# ---------------------------------------------------------------------------
# POST /api/expenses/
# Body: { category, amount, expense_date?, note? }
# After insert, trg_after_expense_insert fires and checks the budget.
# ---------------------------------------------------------------------------
@bp.route("/", methods=["POST"])
@login_required
def add_expense():
    d            = request.get_json(force=True) or {}
    category     = (d.get("category") or "").strip()
    amount       = d.get("amount")
    expense_date = d.get("expense_date", str(datetime.date.today()))
    note         = (d.get("note") or "").strip() or None

    if not category:
        return jsonify({"error": "category is required"}), 400
    try:
        amount = float(amount)
        assert amount > 0
    except Exception:
        return jsonify({"error": "amount must be a positive number"}), 400

    expense_id = query(
        """
        INSERT INTO Expenses (user_id, category, amount, note, expense_date)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (request.user_id, category, amount, note, expense_date),
        commit=True
    )

    # Check if this insert triggered a budget alert
    alert = query(
        """
        SELECT overage FROM Budget_Alerts
        WHERE expense_id = %s
        LIMIT 1
        """,
        (expense_id,), fetch_one=True
    )

    resp = {"expense_id": expense_id, "message": "Expense logged"}
    if alert:
        resp["warning"] = f"Over budget by {alert['overage']:.2f}"
    return jsonify(resp), 201


# ---------------------------------------------------------------------------
# GET /api/expenses/?month=YYYY-MM&category=Food
# ---------------------------------------------------------------------------
@bp.route("/", methods=["GET"])
@login_required
def list_expenses():
    month    = request.args.get("month")      # optional YYYY-MM
    category = request.args.get("category")   # optional

    sql    = "SELECT * FROM Expenses WHERE user_id = %s"
    params = [request.user_id]

    if month:
        sql    += " AND DATE_FORMAT(expense_date, '%Y-%m') = %s"
        params.append(month)
    if category:
        sql    += " AND category = %s"
        params.append(category)

    sql += " ORDER BY expense_date DESC"
    return jsonify(query(sql, params))


# ---------------------------------------------------------------------------
# DELETE /api/expenses/<id>
# ---------------------------------------------------------------------------
@bp.route("/<int:expense_id>", methods=["DELETE"])
@login_required
def delete_expense(expense_id):
    existing = query(
        "SELECT expense_id FROM Expenses WHERE expense_id = %s AND user_id = %s",
        (expense_id, request.user_id), fetch_one=True
    )
    if not existing:
        return jsonify({"error": "Expense not found"}), 404
    query(
        "DELETE FROM Expenses WHERE expense_id = %s",
        (expense_id,), commit=True
    )
    return jsonify({"message": "Expense deleted"})


# ---------------------------------------------------------------------------
# POST /api/expenses/budgets/
# Body: { category, monthly_limit, month_year? }
# Uses INSERT … ON DUPLICATE KEY UPDATE for upsert.
# ---------------------------------------------------------------------------
@bp.route("/budgets/", methods=["POST"])
@login_required
def set_budget():
    d             = request.get_json(force=True) or {}
    category      = (d.get("category") or "").strip()
    monthly_limit = d.get("monthly_limit")
    month_year    = d.get("month_year", datetime.date.today().strftime("%Y-%m"))

    if not category:
        return jsonify({"error": "category is required"}), 400
    try:
        monthly_limit = float(monthly_limit)
        assert monthly_limit > 0
    except Exception:
        return jsonify({"error": "monthly_limit must be a positive number"}), 400

    query(
        """
        INSERT INTO Budgets (user_id, category, monthly_limit, month_year)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)
        """,
        (request.user_id, category, monthly_limit, month_year),
        commit=True
    )
    return jsonify({"message": "Budget set"}), 201


# ---------------------------------------------------------------------------
# GET /api/expenses/budgets/
# ---------------------------------------------------------------------------
@bp.route("/budgets/", methods=["GET"])
@login_required
def list_budgets():
    return jsonify(query(
        "SELECT * FROM Budgets WHERE user_id = %s ORDER BY month_year DESC, category",
        (request.user_id,)
    ))


# ---------------------------------------------------------------------------
# GET /api/expenses/alerts/
# Returns budget breach alerts for the current user.
# ---------------------------------------------------------------------------
@bp.route("/alerts/", methods=["GET"])
@login_required
def budget_alerts():
    return jsonify(query(
        """
        SELECT ba.*, e.category AS expense_category
        FROM Budget_Alerts ba
        JOIN Expenses e ON e.expense_id = ba.expense_id
        WHERE ba.user_id = %s
        ORDER BY ba.triggered_at DESC
        """,
        (request.user_id,)
    ))
