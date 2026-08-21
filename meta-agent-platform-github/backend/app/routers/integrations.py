import json
import os
import secrets
from datetime import timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, HTTPException
from fastapi.responses import RedirectResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from google_auth_oauthlib.flow import Flow

from ..schemas import (
    GmailDraftTestRequest,
    GmailReadTestRequest,
)
from ..tools.gmail_tool import (
    GmailToolError,
    create_gmail_draft,
    read_gmail_message,
)

from ..config import (
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_OAUTH_SCOPES,
    GOOGLE_REDIRECT_URI,
    SESSION_COOKIE_NAME,
    validate_google_oauth_config,
)
from ..database import get_connection
from ..deps import require_current_user
from ..security import utc_now


router = APIRouter(
    prefix="/api/integrations",
    tags=["integrations"],
)


def create_google_flow(
    state: str | None = None,
) -> Flow:
    """
    创建 Google OAuth Flow。

    当前使用的是 Google OAuth Web Application：
    - Client ID 和 Client Secret 保存在 FastAPI 后端
    - 后端负责使用 authorization code 换取 token

    这里关闭自动 PKCE，避免 connect 和 callback
    分别创建 Flow 时丢失 code_verifier。
    """

    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [
                GOOGLE_REDIRECT_URI,
            ],
        }
    }

    flow = Flow.from_client_config(
        client_config=client_config,
        scopes=GOOGLE_OAUTH_SCOPES,
        state=state,
        autogenerate_code_verifier=False,
    )

    flow.redirect_uri = GOOGLE_REDIRECT_URI

    return flow


@router.get("/google/connect")
def connect_google(
    agentdemo_session: str | None = Cookie(
        default=None,
        alias=SESSION_COOKIE_NAME,
    ),
) -> RedirectResponse:
    """
    开始 Google OAuth。

    浏览器访问这个接口后：
    1. 检查当前平台用户是否登录
    2. 生成随机 state
    3. 保存 state
    4. 跳转到 Google 授权页面
    """

    validate_google_oauth_config()

    current_user = require_current_user(agentdemo_session)
    user_id = int(current_user["id"])

    state = secrets.token_urlsafe(32)
    expires_at = utc_now() + timedelta(minutes=10)

    with get_connection() as conn:
        # 清理这个用户之前未完成或过期的 Google OAuth state
        conn.execute(
            """
            DELETE FROM oauth_states
            WHERE user_id = ?
              AND provider = 'google'
            """,
            (user_id,),
        )

        conn.execute(
            """
            INSERT INTO oauth_states (
                user_id,
                provider,
                state,
                expires_at
            )
            VALUES (?, 'google', ?, ?)
            """,
            (
                user_id,
                state,
                expires_at.isoformat(),
            ),
        )

        conn.commit()

    flow = create_google_flow(state=state)

    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="false",
        prompt="consent",
    )

    return RedirectResponse(
        url=authorization_url,
        status_code=302,
    )


@router.get("/google/callback")
def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """
    接收 Google OAuth 回调。

    Google 授权成功后会访问：

    /api/integrations/google/callback
        ?code=...
        &state=...
    """

    if error:
        query = urlencode(
            {
                "google": "error",
                "message": error,
            }
        )

        return RedirectResponse(
            url=f"{FRONTEND_URL}/app/builder?{query}",
            status_code=302,
        )

    if not code:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth callback is missing code.",
        )

    if not state:
        raise HTTPException(
            status_code=400,
            detail="Google OAuth callback is missing state.",
        )

    with get_connection() as conn:
        state_row = conn.execute(
            """
            SELECT
                id,
                user_id,
                expires_at
            FROM oauth_states
            WHERE state = ?
              AND provider = 'google'
            """,
            (state,),
        ).fetchone()

        if state_row is None:
            raise HTTPException(
                status_code=400,
                detail="Invalid Google OAuth state.",
            )

        oauth_state_id, user_id, expires_at = state_row

        if utc_now().isoformat() >= expires_at:
            conn.execute(
                """
                DELETE FROM oauth_states
                WHERE id = ?
                """,
                (oauth_state_id,),
            )

            conn.commit()

            raise HTTPException(
                status_code=400,
                detail="Google OAuth state has expired.",
            )

    flow = create_google_flow(state=state)

    # Google 账号可能仍返回以前已经授权的附加 Scope。
    # 允许 OAuthLib 接受这些额外权限，并在后面保存实际返回的 Scope。
    os.environ.setdefault(
        "OAUTHLIB_RELAX_TOKEN_SCOPE",
        "1",
    )

    flow.fetch_token(
        code=code,
    )

    credentials = flow.credentials

    account_email = ""

    # Google 返回 id_token 时，可以从中取用户邮箱。
    if credentials.id_token:
        try:
            token_info = id_token.verify_oauth2_token(
                credentials.id_token,
                GoogleRequest(),
                GOOGLE_CLIENT_ID,
            )

            account_email = str(
                token_info.get("email", "")
            )

        except ValueError:
            account_email = ""

    scopes = list(credentials.scopes or GOOGLE_OAUTH_SCOPES)

    expires_at = (
        credentials.expiry.isoformat()
        if credentials.expiry
        else None
    )

    with get_connection() as conn:
        existing_connection = conn.execute(
            """
            SELECT id
            FROM integration_connections
            WHERE user_id = ?
              AND provider = 'google'
            """,
            (user_id,),
        ).fetchone()

        if existing_connection is None:
            conn.execute(
                """
                INSERT INTO integration_connections (
                    user_id,
                    provider,
                    account_email,
                    access_token,
                    refresh_token,
                    token_uri,
                    scopes_json,
                    expires_at,
                    status,
                    updated_at
                )
                VALUES (
                    ?,
                    'google',
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    ?,
                    'connected',
                    CURRENT_TIMESTAMP
                )
                """,
                (
                    user_id,
                    account_email,
                    credentials.token or "",
                    credentials.refresh_token or "",
                    credentials.token_uri or "",
                    json.dumps(scopes),
                    expires_at,
                ),
            )

        else:
            connection_id = int(existing_connection[0])

            # Google 不一定每次都返回 refresh token。
            #
            # 如果本次没有返回，就保留数据库中原来的值。
            conn.execute(
                """
                UPDATE integration_connections
                SET
                    account_email = ?,
                    access_token = ?,
                    refresh_token = CASE
                        WHEN ? != ''
                        THEN ?
                        ELSE refresh_token
                    END,
                    token_uri = ?,
                    scopes_json = ?,
                    expires_at = ?,
                    status = 'connected',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    account_email,
                    credentials.token or "",
                    credentials.refresh_token or "",
                    credentials.refresh_token or "",
                    credentials.token_uri or "",
                    json.dumps(scopes),
                    expires_at,
                    connection_id,
                ),
            )

        # state 只能使用一次
        conn.execute(
            """
            DELETE FROM oauth_states
            WHERE id = ?
            """,
            (oauth_state_id,),
        )

        conn.commit()

    query = urlencode(
        {
            "google": "connected",
        }
    )

    return RedirectResponse(
        url=f"{FRONTEND_URL}/app/builder?{query}",
        status_code=302,
    )


@router.get("/google/status")
def google_status(
    agentdemo_session: str | None = Cookie(
        default=None,
        alias=SESSION_COOKIE_NAME,
    ),
) -> dict[str, object]:
    """
    查询当前平台用户是否连接 Google。
    """

    current_user = require_current_user(agentdemo_session)
    user_id = int(current_user["id"])

    with get_connection() as conn:
        connection = conn.execute(
            """
            SELECT
                account_email,
                status,
                scopes_json,
                expires_at,
                updated_at
            FROM integration_connections
            WHERE user_id = ?
              AND provider = 'google'
            """,
            (user_id,),
        ).fetchone()

    if connection is None:
        return {
            "connected": False,
            "provider": "google",
            "account_email": None,
            "status": "disconnected",
            "scopes": [],
            "expires_at": None,
        }

    (
        account_email,
        status,
        scopes_json,
        expires_at,
        updated_at,
    ) = connection

    try:
        scopes = json.loads(scopes_json)
    except json.JSONDecodeError:
        scopes = []

    return {
        "connected": status == "connected",
        "provider": "google",
        "account_email": account_email or None,
        "status": status,
        "scopes": scopes,
        "expires_at": expires_at,
        "updated_at": updated_at,
    }

@router.post("/google/gmail/test-read")
def test_read_gmail_message(
    payload: GmailReadTestRequest,
    agentdemo_session: str | None = Cookie(
        default=None,
        alias=SESSION_COOKIE_NAME,
    ),
) -> dict[str, object]:
    """Read one Gmail message to verify the Gmail Read Message tool."""

    current_user = require_current_user(agentdemo_session)
    user_id = int(current_user["id"])

    try:
        result = read_gmail_message(
            user_id=user_id,
            message_id=payload.message_id,
        )
    except GmailToolError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    return result


@router.post("/google/gmail/test-draft")
def test_create_gmail_draft(
    payload: GmailDraftTestRequest,
    agentdemo_session: str | None = Cookie(
        default=None,
        alias=SESSION_COOKIE_NAME,
    ),
) -> dict[str, object]:
    """
    测试 Gmail Create Draft。

    这个接口只用于开发阶段验证：
    - Google OAuth 是否连接成功
    - Token 是否可用
    - Gmail API 是否可以创建草稿
    """

    current_user = require_current_user(
        agentdemo_session
    )

    user_id = int(current_user["id"])

    try:
        result = create_gmail_draft(
            user_id=user_id,
            to=payload.to,
            subject=payload.subject,
            body=payload.body,
        )

    except GmailToolError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    return result