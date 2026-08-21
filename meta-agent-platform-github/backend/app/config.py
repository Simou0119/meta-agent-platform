import os
from pathlib import Path

from dotenv import load_dotenv


# backend 目录
BASE_DIR = Path(__file__).resolve().parents[1]

# 明确读取 backend/.env
ENV_PATH = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH)


# ============================================================
# Database
# ============================================================

DB_PATH = BASE_DIR / "meta_agent.db"

# ============================================================
# Workflow file storage
# ============================================================

STORAGE_DIR = BASE_DIR / "storage"
UPLOAD_STORAGE_DIR = STORAGE_DIR / "uploads"
ARTIFACT_STORAGE_DIR = STORAGE_DIR / "artifacts"
MAX_WORKFLOW_UPLOAD_BYTES = max(
    1,
    int(os.getenv("MAX_WORKFLOW_UPLOAD_MB", "10")),
) * 1024 * 1024


# ============================================================
# Frontend / CORS
# ============================================================

FRONTEND_URL = os.getenv(
    "FRONTEND_URL",
    "http://localhost:3000",
)

CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]


# ============================================================
# Session
# ============================================================

SESSION_COOKIE_NAME = "agentdemo_session"
SESSION_DAYS = 7


# ============================================================
# OpenAI
# ============================================================

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

OPENAI_MODEL = "gpt-5.4-mini"
OPENAI_TIMEOUT_SECONDS = 60
BUILDER_HISTORY_MESSAGE_LIMIT = 20


# ============================================================
# Google OAuth
# ============================================================

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")

GMAIL_TRIGGER_POLL_SECONDS = max(15, int(os.getenv("GMAIL_TRIGGER_POLL_SECONDS", "60")))

GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI",
    "http://127.0.0.1:8000/api/integrations/google/callback",
)


# Optional proxy for Google API calls.
#
# Leave GOOGLE_PROXY_URL empty on networks where Google APIs can be reached
# directly.  In the current local Windows development environment, for
# example:
#
# GOOGLE_PROXY_URL=http://127.0.0.1:7897
#
# This value is intentionally not hard-coded so the project remains portable
# to other computers and deployment environments.
GOOGLE_PROXY_URL = os.getenv(
    "GOOGLE_PROXY_URL",
    "",
).strip()

GOOGLE_HTTP_TIMEOUT_SECONDS = max(
    5,
    int(
        os.getenv(
            "GOOGLE_HTTP_TIMEOUT_SECONDS",
            "30",
        )
    ),
)


# Gmail 与 Google Calendar 所需权限。
#
# gmail.compose:
# - 创建草稿
# - 修改草稿
# - 发送草稿
#
# openid / userinfo.email:
# - 获取当前连接的 Google 账号邮箱
GOOGLE_OAUTH_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.events",
]


def validate_google_oauth_config() -> None:
    """
    在真正启动 Google OAuth 前检查环境变量。

    不在应用启动时强制检查，是因为：
    即使用户暂时没有配置 Google OAuth，
    其他 Workflow 功能仍然应该能够正常运行。
    """

    missing_variables: list[str] = []

    if not GOOGLE_CLIENT_ID:
        missing_variables.append("GOOGLE_CLIENT_ID")

    if not GOOGLE_CLIENT_SECRET:
        missing_variables.append("GOOGLE_CLIENT_SECRET")

    if not GOOGLE_REDIRECT_URI:
        missing_variables.append("GOOGLE_REDIRECT_URI")

    if missing_variables:
        missing_text = ", ".join(missing_variables)

        raise RuntimeError(
            "Google OAuth configuration is incomplete. "
            f"Missing environment variables: {missing_text}"
        )