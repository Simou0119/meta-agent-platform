from datetime import datetime, timezone
import hashlib
import secrets


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    password_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100_000)

    return f"pbkdf2_sha256$100000${salt}${password_hash.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected_hash = stored_hash.split("$", 3)
        iteration_count = int(iterations)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iteration_count,
    ).hex()

    return secrets.compare_digest(password_hash, expected_hash)


def create_session_token() -> str:
    return secrets.token_urlsafe(32)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
