from datetime import datetime

from fastapi import HTTPException

from .database import get_connection
from .security import utc_now


def require_current_user(session_token: str | None) -> dict[str, object]:
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated.")

    with get_connection() as conn:
        session = conn.execute(
            """
            SELECT users.id, users.username, users.display_name, sessions.expires_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.session_token = ? AND users.status = 'active'
            """,
            (session_token,),
        ).fetchone()

        if session is None:
            raise HTTPException(status_code=401, detail="Not authenticated.")

        user_id, username, display_name, expires_at = session

        if datetime.fromisoformat(expires_at) <= utc_now():
            conn.execute("DELETE FROM sessions WHERE session_token = ?", (session_token,))
            raise HTTPException(status_code=401, detail="Session expired.")

    return {"id": user_id, "username": username, "display_name": display_name}
