from fastapi import APIRouter

from ..database import get_connection


router = APIRouter(prefix="/api", tags=["system"])


@router.get("/hello")
def read_hello() -> dict[str, str]:
    with get_connection() as conn:
        row = conn.execute("SELECT text FROM messages WHERE id = ?", (1,)).fetchone()

    return {"message": row[0] if row else "Hello from AgentDemo API!"}
