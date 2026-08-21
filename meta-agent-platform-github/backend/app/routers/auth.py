# from datetime import datetime, timedelta

# from fastapi import APIRouter, Cookie, HTTPException, Response

# from ..config import SESSION_COOKIE_NAME, SESSION_DAYS
# from ..database import get_connection
# from ..schemas import LoginRequest
# from ..security import create_session_token, utc_now, verify_password


# router = APIRouter(prefix="/api", tags=["auth"])


# @router.post("/login")
# def login(request: LoginRequest, response: Response) -> dict[str, object]:
#     username = request.username.strip().lower()

#     if not username or not request.password:
#         raise HTTPException(status_code=400, detail="Please enter your email and password.")

#     with get_connection() as conn:
#         user = conn.execute(
#             """
#             SELECT id, username, password_hash, display_name, status
#             FROM users
#             WHERE username = ?
#             """,
#             (username,),
#         ).fetchone()

#         if user is None:
#             raise HTTPException(status_code=404, detail="User not found.")

#         user_id, user_username, password_hash, display_name, status = user

#         if status != "active":
#             raise HTTPException(status_code=403, detail="User is disabled.")

#         if not verify_password(request.password, password_hash):
#             raise HTTPException(status_code=401, detail="Incorrect password.")

#         expires_at = utc_now() + timedelta(days=SESSION_DAYS)
#         session_token = create_session_token()
#         conn.execute(
#             """
#             INSERT INTO sessions (user_id, session_token, expires_at)
#             VALUES (?, ?, ?)
#             """,
#             (user_id, session_token, expires_at.isoformat()),
#         )

#     response.set_cookie(
#         key=SESSION_COOKIE_NAME,
#         value=session_token,
#         httponly=True,
#         max_age=SESSION_DAYS * 24 * 60 * 60,
#         path="/",
#         samesite="lax",
#     )

#     return {
#         "user": {
#             "id": user_id,
#             "username": user_username,
#             "display_name": display_name,
#         }
#     }


# @router.get("/me")
# def read_current_user(agentdemo_session: str | None = Cookie(default=None)) -> dict[str, object]:
#     if not agentdemo_session:
#         raise HTTPException(status_code=401, detail="Not authenticated.")

#     with get_connection() as conn:
#         session = conn.execute(
#             """
#             SELECT users.id, users.username, users.display_name, sessions.expires_at
#             FROM sessions
#             JOIN users ON users.id = sessions.user_id
#             WHERE sessions.session_token = ? AND users.status = 'active'
#             """,
#             (agentdemo_session,),
#         ).fetchone()

#         if session is None:
#             raise HTTPException(status_code=401, detail="Not authenticated.")

#         user_id, username, display_name, expires_at = session

#         if datetime.fromisoformat(expires_at) <= utc_now():
#             conn.execute("DELETE FROM sessions WHERE session_token = ?", (agentdemo_session,))
#             raise HTTPException(status_code=401, detail="Session expired.")

#     return {
#         "user": {
#             "id": user_id,
#             "username": username,
#             "display_name": display_name,
#         }
#     }


from datetime import datetime, timedelta

from fastapi import APIRouter, Cookie, HTTPException, Response
from fastapi.responses import RedirectResponse

from ..config import SESSION_COOKIE_NAME, SESSION_DAYS
from ..database import get_connection
from ..schemas import LoginRequest
from ..security import create_session_token, utc_now, verify_password


router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/login")
def login(
    request: LoginRequest,
    response: Response,
) -> dict[str, object]:
    """
    用户登录。

    验证用户名和密码后：
    1. 在 sessions 表中创建登录 Session
    2. 把 Session Token 保存到浏览器 Cookie
    """

    username = request.username.strip().lower()

    if not username or not request.password:
        raise HTTPException(
            status_code=400,
            detail="Please enter your email and password.",
        )

    with get_connection() as conn:
        user = conn.execute(
            """
            SELECT id, username, password_hash, display_name, status
            FROM users
            WHERE username = ?
            """,
            (username,),
        ).fetchone()

        if user is None:
            raise HTTPException(
                status_code=404,
                detail="User not found.",
            )

        user_id, user_username, password_hash, display_name, status = user

        if status != "active":
            raise HTTPException(
                status_code=403,
                detail="User is disabled.",
            )

        if not verify_password(request.password, password_hash):
            raise HTTPException(
                status_code=401,
                detail="Incorrect password.",
            )

        expires_at = utc_now() + timedelta(days=SESSION_DAYS)
        session_token = create_session_token()

        conn.execute(
            """
            INSERT INTO sessions (user_id, session_token, expires_at)
            VALUES (?, ?, ?)
            """,
            (
                user_id,
                session_token,
                expires_at.isoformat(),
            ),
        )

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        httponly=True,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        path="/",
        samesite="lax",
    )

    return {
        "user": {
            "id": user_id,
            "username": user_username,
            "display_name": display_name,
        }
    }


@router.get("/me")
def read_current_user(
    agentdemo_session: str | None = Cookie(default=None),
) -> dict[str, object]:
    """
    根据浏览器 Cookie 检查当前用户是否已经登录。
    """

    if not agentdemo_session:
        raise HTTPException(
            status_code=401,
            detail="Not authenticated.",
        )

    with get_connection() as conn:
        session = conn.execute(
            """
            SELECT
                users.id,
                users.username,
                users.display_name,
                sessions.expires_at
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.session_token = ?
              AND users.status = 'active'
            """,
            (agentdemo_session,),
        ).fetchone()

        if session is None:
            raise HTTPException(
                status_code=401,
                detail="Not authenticated.",
            )

        user_id, username, display_name, expires_at = session

        if datetime.fromisoformat(expires_at) <= utc_now():
            conn.execute(
                """
                DELETE FROM sessions
                WHERE session_token = ?
                """,
                (agentdemo_session,),
            )

            raise HTTPException(
                status_code=401,
                detail="Session expired.",
            )

    return {
        "user": {
            "id": user_id,
            "username": username,
            "display_name": display_name,
        }
    }


@router.get("/logout")
def logout(
    agentdemo_session: str | None = Cookie(default=None),
):
    """
    退出当前账号。

    1. 删除数据库中的 Session
    2. 删除浏览器中的 Session Cookie
    3. 跳转回前端登录页面
    """

    if agentdemo_session:
        with get_connection() as conn:
            conn.execute(
                """
                DELETE FROM sessions
                WHERE session_token = ?
                """,
                (agentdemo_session,),
            )

    response = RedirectResponse(
        url="http://localhost:3000/",
        status_code=302,
    )

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        samesite="lax",
    )

    return response