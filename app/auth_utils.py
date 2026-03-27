"""
LifeOS – auth_utils.py
JWT helpers and password hashing.
"""

import hashlib, hmac, os, time, base64, json
from functools import wraps
from flask import request, jsonify, current_app


# ── Password hashing (PBKDF2-SHA256 via hashlib) ─────────────────────────────

def hash_password(plain: str) -> str:
    salt = os.urandom(16)
    dk   = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, 260_000)
    return base64.b64encode(salt + dk).decode()


def verify_password(plain: str, stored: str) -> bool:
    raw  = base64.b64decode(stored.encode())
    salt = raw[:16]
    dk   = raw[16:]
    check = hashlib.pbkdf2_hmac("sha256", plain.encode(), salt, 260_000)
    return hmac.compare_digest(dk, check)


# ── Minimal JWT (HS256 using hmac) ────────────────────────────────────────────

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _sign(data: str, secret: str) -> str:
    return _b64url(
        hmac.new(secret.encode(), data.encode(), hashlib.sha256).digest()
    )


def create_token(user_id: int, secret: str, ttl: int = 86400) -> str:
    header  = _b64url(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
    payload = _b64url(json.dumps({"sub": user_id, "exp": int(time.time()) + ttl}).encode())
    sig     = _sign(f"{header}.{payload}", secret)
    return f"{header}.{payload}.{sig}"


def decode_token(token: str, secret: str) -> dict | None:
    try:
        header, payload, sig = token.split(".")
        if _sign(f"{header}.{payload}", secret) != sig:
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=="))
        if data["exp"] < time.time():
            return None
        return data
    except Exception:
        return None


# ── Route decorator ───────────────────────────────────────────────────────────

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not token:
            return jsonify({"error": "Missing token"}), 401
        data = decode_token(token, current_app.config["SECRET_KEY"])
        if not data:
            return jsonify({"error": "Invalid or expired token"}), 401
        request.user_id = data["sub"]
        return f(*args, **kwargs)
    return decorated
