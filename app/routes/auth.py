"""
LifeOS – routes/auth.py
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
"""

from flask import Blueprint, request, jsonify, current_app
from ..db import query
from ..auth_utils import hash_password, verify_password, create_token, login_required

bp = Blueprint("auth", __name__)


# ---------------------------------------------------------------------------
# POST /api/auth/register
# Body: { name, email, password }
# ---------------------------------------------------------------------------
@bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(force=True) or {}
    name     = (data.get("name") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or not email or not password:
        return jsonify({"error": "name, email and password are required"}), 400
    if len(password) < 8:
        return jsonify({"error": "password must be ≥ 8 characters"}), 400

    # Check unique email (enforced by DB constraint too, but nice UX message)
    existing = query(
        "SELECT user_id FROM Users WHERE email = %s",
        (email,), fetch_one=True
    )
    if existing:
        return jsonify({"error": "Email already registered"}), 409

    pw_hash = hash_password(password)
    user_id = query(
        "INSERT INTO Users (name, email, password_hash) VALUES (%s, %s, %s)",
        (name, email, pw_hash), commit=True
    )
    token = create_token(user_id, current_app.config["SECRET_KEY"])
    return jsonify({"user_id": user_id, "token": token}), 201


# ---------------------------------------------------------------------------
# POST /api/auth/login
# Body: { email, password }
# ---------------------------------------------------------------------------
@bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True) or {}
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "email and password are required"}), 400

    user = query(
        "SELECT user_id, name, password_hash, points FROM Users WHERE email = %s",
        (email,), fetch_one=True
    )
    if not user or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "Invalid credentials"}), 401

    token = create_token(user["user_id"], current_app.config["SECRET_KEY"])
    return jsonify({
        "user_id": user["user_id"],
        "name":    user["name"],
        "points":  user["points"],
        "token":   token,
    })


# ---------------------------------------------------------------------------
# GET /api/auth/me  (protected)
# ---------------------------------------------------------------------------
@bp.route("/me", methods=["GET"])
@login_required
def me():
    user = query(
        "SELECT user_id, name, email, points, created_at FROM Users WHERE user_id = %s",
        (request.user_id,), fetch_one=True
    )
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user)
