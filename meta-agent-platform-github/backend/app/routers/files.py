from fastapi import APIRouter, Cookie, File, UploadFile
from fastapi.responses import FileResponse

from ..deps import require_current_user
from ..services.document_io import (
    delete_workflow_upload,
    get_artifact_download,
    store_workflow_upload,
)

router = APIRouter(prefix="/api", tags=["workflow-files"])


@router.post("/workflows/{workflow_id}/files")
async def upload_workflow_file(
    workflow_id: int,
    file: UploadFile = File(...),
    agentdemo_session: str | None = Cookie(default=None),
) -> dict:
    user = require_current_user(agentdemo_session)
    return await store_workflow_upload(
        workflow_id=workflow_id,
        user_id=user["id"],
        uploaded_file=file,
    )


@router.delete("/workflows/{workflow_id}/files/{file_id}", status_code=204)
def remove_workflow_file(
    workflow_id: int,
    file_id: int,
    agentdemo_session: str | None = Cookie(default=None),
) -> None:
    user = require_current_user(agentdemo_session)
    delete_workflow_upload(
        workflow_id=workflow_id,
        user_id=user["id"],
        file_id=file_id,
    )


@router.get("/workflow-artifacts/{artifact_id}/download")
def download_workflow_artifact(
    artifact_id: int,
    agentdemo_session: str | None = Cookie(default=None),
) -> FileResponse:
    user = require_current_user(agentdemo_session)
    path, filename, mime_type = get_artifact_download(
        artifact_id=artifact_id,
        user_id=user["id"],
    )
    return FileResponse(
        path=path,
        filename=filename,
        media_type=mime_type,
    )
