from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .database import init_db
from .services.gmail_trigger_monitor import (
    start_gmail_trigger_monitor,
    stop_gmail_trigger_monitor,
)
from .routers import (
    agents,
    auth,
    chat,
    integrations,
    files,
    system,
    workflow_runtime,
    process_mining,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_gmail_trigger_monitor()

    try:
        yield
    finally:
        stop_gmail_trigger_monitor()


def create_app() -> FastAPI:
    init_db()

    app = FastAPI(
        title="AgentDemo API",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system.router)
    app.include_router(auth.router)
    app.include_router(chat.router)
    app.include_router(agents.router)
    app.include_router(integrations.router)
    app.include_router(files.router)
    app.include_router(workflow_runtime.router)
    app.include_router(process_mining.router)

    return app


app = create_app()