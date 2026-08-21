import sqlite3

from .config import DB_PATH
from .security import hash_password


def get_connection() -> sqlite3.Connection:
    """
    创建 SQLite 数据库连接。

    PRAGMA foreign_keys = ON 用于启用 SQLite 外键约束。
    SQLite 默认不会自动启用外键，因此每次连接都需要执行。
    """

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")

    return conn


def _get_table_columns(
    conn: sqlite3.Connection,
    table_name: str,
) -> set[str]:
    """
    获取指定数据库表目前包含的所有字段名称。
    """

    rows = conn.execute(
        f"PRAGMA table_info({table_name})"
    ).fetchall()

    return {str(row[1]) for row in rows}


def _add_column_if_missing(
    conn: sqlite3.Connection,
    table_name: str,
    column_name: str,
    column_definition: str,
) -> None:
    """
    当指定字段不存在时，为已有数据库表增加字段。

    这样旧数据库升级时，不需要手动删除数据库文件。
    """

    columns = _get_table_columns(
        conn,
        table_name,
    )

    if column_name not in columns:
        conn.execute(
            f"""
            ALTER TABLE {table_name}
            ADD COLUMN {column_name} {column_definition}
            """
        )


def _migrate_workflows_table(
    conn: sqlite3.Connection,
) -> None:
    """Add workflow input/output capability configuration to old databases."""

    _add_column_if_missing(
        conn,
        "workflows",
        "input_configuration_json",
        "TEXT NOT NULL DEFAULT '{}'",
    )
    _add_column_if_missing(
        conn,
        "workflows",
        "output_configuration_json",
        "TEXT NOT NULL DEFAULT '{}'",
    )
    _add_column_if_missing(
        conn,
        "workflows",
        "routing_configuration_json",
        "TEXT NOT NULL DEFAULT '{\"mode\":\"sequential\",\"rules\":[]}'",
    )


def _migrate_agents_table(
    conn: sqlite3.Connection,
) -> None:
    """
    为旧版本 agents 表补充新字段。
    """

    _add_column_if_missing(
        conn,
        "agents",
        "workflow_id",
        "INTEGER",
    )

    _add_column_if_missing(
        conn,
        "agents",
        "role",
        "TEXT NOT NULL DEFAULT ''",
    )

    _add_column_if_missing(
        conn,
        "agents",
        "description",
        "TEXT NOT NULL DEFAULT ''",
    )

    _add_column_if_missing(
        conn,
        "agents",
        "agent_order",
        "INTEGER NOT NULL DEFAULT 1",
    )


def _migrate_workflow_runs_table(
    conn: sqlite3.Connection,
) -> None:
    """
    为旧版本 workflow_runs 表补充运行监控字段。
    """

    _add_column_if_missing(
        conn,
        "workflow_runs",
        "duration_ms",
        "INTEGER",
    )

    _add_column_if_missing(
        conn,
        "workflow_runs",
        "input_tokens",
        "INTEGER NOT NULL DEFAULT 0",
    )

    _add_column_if_missing(
        conn,
        "workflow_runs",
        "output_tokens",
        "INTEGER NOT NULL DEFAULT 0",
    )

    _add_column_if_missing(
        conn,
        "workflow_runs",
        "total_tokens",
        "INTEGER NOT NULL DEFAULT 0",
    )

    _add_column_if_missing(
        conn,
        "workflow_runs",
        "model_name",
        "TEXT NOT NULL DEFAULT ''",
    )

    _add_column_if_missing(
        conn,
        "workflow_runs",
        "model_calls",
        "INTEGER NOT NULL DEFAULT 0",
    )


def _migrate_workflow_run_steps_table(
    conn: sqlite3.Connection,
) -> None:
    """
    为旧版本 workflow_run_steps 表补充运行监控字段。
    """

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "input_text",
        "TEXT NOT NULL DEFAULT ''",
    )

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "started_at",
        "TEXT",
    )

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "completed_at",
        "TEXT",
    )

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "duration_ms",
        "INTEGER",
    )

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "input_tokens",
        "INTEGER NOT NULL DEFAULT 0",
    )

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "output_tokens",
        "INTEGER NOT NULL DEFAULT 0",
    )

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "total_tokens",
        "INTEGER NOT NULL DEFAULT 0",
    )

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "model_name",
        "TEXT NOT NULL DEFAULT ''",
    )

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "retry_count",
        "INTEGER NOT NULL DEFAULT 0",
    )

    _add_column_if_missing(
        conn,
        "workflow_run_steps",
        "response_id",
        "TEXT NOT NULL DEFAULT ''",
    )


def init_db() -> None:
    """
    初始化数据库。

    CREATE TABLE IF NOT EXISTS 不会删除已有数据。
    如果表已经存在，则保持原有数据不变。
    """

    with get_connection() as conn:
        # ====================================================
        # Basic messages
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY,
                text TEXT NOT NULL
            )
            """
        )

        # ====================================================
        # Users
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                display_name TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        # ====================================================
        # Login sessions
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        # ====================================================
        # Google / external integration connections
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS integration_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                provider TEXT NOT NULL,

                account_email TEXT NOT NULL DEFAULT '',

                access_token TEXT NOT NULL DEFAULT '',

                refresh_token TEXT NOT NULL DEFAULT '',

                token_uri TEXT NOT NULL DEFAULT '',

                scopes_json TEXT NOT NULL DEFAULT '[]',

                expires_at TEXT,

                status TEXT NOT NULL DEFAULT 'connected',

                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                UNIQUE(user_id, provider)
            )
            """
        )

        # ====================================================
        # Temporary OAuth state values
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS oauth_states (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id INTEGER NOT NULL,

                provider TEXT NOT NULL,

                state TEXT NOT NULL UNIQUE,

                expires_at TEXT NOT NULL,

                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        # ====================================================
        # Workflows
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflows (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'published',
                input_configuration_json TEXT NOT NULL DEFAULT '{}',
                output_configuration_json TEXT NOT NULL DEFAULT '{}',
                routing_configuration_json TEXT NOT NULL DEFAULT '{"mode":"sequential","rules":[]}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        _migrate_workflows_table(conn)

        # ====================================================
        # Agents
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                workflow_id INTEGER,
                name TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                agent_order INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (workflow_id)
                    REFERENCES workflows(id)
                    ON DELETE CASCADE
            )
            """
        )

        _migrate_agents_table(conn)

        # ====================================================
        # Workflow triggers
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflow_triggers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                trigger_type TEXT NOT NULL DEFAULT 'manual',
                conditions_json TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (workflow_id)
                    REFERENCES workflows(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        # ====================================================
        # Agent tool bindings
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS agent_tool_bindings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                agent_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                tool_type TEXT NOT NULL,
                permissions_json TEXT NOT NULL DEFAULT '[]',
                configuration_json TEXT NOT NULL DEFAULT '{}',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (workflow_id)
                    REFERENCES workflows(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (agent_id)
                    REFERENCES agents(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        # ====================================================
        # Workflow runs
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflow_runs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                input_text TEXT NOT NULL,
                final_output TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'running',
                error_message TEXT NOT NULL DEFAULT '',
                duration_ms INTEGER,
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                model_name TEXT NOT NULL DEFAULT '',
                model_calls INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,

                FOREIGN KEY (workflow_id)
                    REFERENCES workflows(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        _migrate_workflow_runs_table(conn)

        # ====================================================
        # Workflow run steps
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflow_run_steps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL,
                agent_id INTEGER,
                agent_name TEXT NOT NULL,
                agent_role TEXT NOT NULL DEFAULT '',
                agent_description TEXT NOT NULL DEFAULT '',
                agent_order INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'running',
                input_text TEXT NOT NULL DEFAULT '',
                output TEXT NOT NULL DEFAULT '',
                error_message TEXT NOT NULL DEFAULT '',
                started_at TEXT,
                completed_at TEXT,
                duration_ms INTEGER,
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                model_name TEXT NOT NULL DEFAULT '',
                retry_count INTEGER NOT NULL DEFAULT 0,
                response_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (run_id)
                    REFERENCES workflow_runs(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (agent_id)
                    REFERENCES agents(id)
                    ON DELETE SET NULL
            )
            """
        )

        _migrate_workflow_run_steps_table(conn)

        # ====================================================
        # Workflow uploaded files
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflow_uploaded_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workflow_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                original_filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                file_type TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                file_path TEXT NOT NULL,
                extracted_text TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (workflow_id)
                    REFERENCES workflows(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        # ====================================================
        # Generated workflow run files
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS workflow_run_artifacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL,
                workflow_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                artifact_type TEXT NOT NULL,
                filename TEXT NOT NULL,
                stored_filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (run_id)
                    REFERENCES workflow_runs(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (workflow_id)
                    REFERENCES workflows(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        # ====================================================
        # Gmail trigger polling state
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS gmail_polling_state (
                user_id INTEGER PRIMARY KEY,
                last_checked_ms INTEGER NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        # ====================================================
        # Per-workflow Gmail listening baseline
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS gmail_workflow_polling_state (
                workflow_id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL,
                last_checked_ms INTEGER NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (workflow_id)
                    REFERENCES workflows(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
            """
        )

        # ====================================================
        # Processed external trigger events
        # ====================================================

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS processed_trigger_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                workflow_id INTEGER NOT NULL,
                provider TEXT NOT NULL,
                event_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'processing',
                error_message TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,

                FOREIGN KEY (user_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (workflow_id)
                    REFERENCES workflows(id)
                    ON DELETE CASCADE,

                UNIQUE(provider, event_id, workflow_id)
            )
            """
        )

        # ====================================================
        # Indexes
        # ====================================================

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_workflows_user_id
            ON workflows(user_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agents_workflow_id
            ON agents(workflow_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agents_user_id
            ON agents(user_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow_id
            ON workflow_triggers(workflow_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_tool_bindings_workflow_id
            ON agent_tool_bindings(workflow_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_agent_tool_bindings_agent_id
            ON agent_tool_bindings(agent_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_user
            ON workflow_runs(workflow_id, user_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at
            ON workflow_runs(created_at)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_run_id
            ON workflow_run_steps(run_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_workflow_run_steps_started_at
            ON workflow_run_steps(started_at)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_processed_trigger_events_lookup
            ON processed_trigger_events(provider, event_id, workflow_id)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_processed_trigger_events_user
            ON processed_trigger_events(user_id, created_at)
            """
        )

        # Google integration indexes

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS
                idx_integration_connections_user_provider
            ON integration_connections(user_id, provider)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_oauth_states_state
            ON oauth_states(state)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_oauth_states_user_provider
            ON oauth_states(user_id, provider)
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at
            ON oauth_states(expires_at)
            """
        )

        # ====================================================
        # Default data
        # ====================================================

        conn.execute(
            """
            INSERT OR IGNORE INTO messages (
                id,
                text
            )
            VALUES (?, ?)
            """,
            (
                1,
                "Hello World from FastAPI & SQLite!",
            ),
        )

        conn.execute(
            """
            INSERT OR IGNORE INTO users (
                username,
                password_hash,
                display_name
            )
            VALUES (?, ?, ?)
            """,
            (
                "user@example.com",
                hash_password("123456"),
                "Test User",
            ),
        )

        conn.commit()
