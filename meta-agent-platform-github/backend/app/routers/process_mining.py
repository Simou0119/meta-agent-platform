from fastapi import APIRouter, Cookie

from ..deps import require_current_user
from ..schemas import ProcessMiningAdvisorResponse, ProcessMiningResponse
from ..services.process_mining import analyze_workflow_process
from ..services.process_mining_advisor import generate_process_mining_advice
from .workflow_runtime import _load_workflow


router = APIRouter(prefix="/api", tags=["process-mining"])


@router.get(
    "/workflows/{workflow_id}/process-mining",
    response_model=ProcessMiningResponse,
)
def get_workflow_process_mining(
    workflow_id: int,
    agentdemo_session: str | None = Cookie(default=None),
) -> ProcessMiningResponse:
    """Read-only process analysis over existing workflow execution history."""

    user = require_current_user(agentdemo_session)
    _load_workflow(workflow_id, user["id"])

    return ProcessMiningResponse.model_validate(
        analyze_workflow_process(
            workflow_id=workflow_id,
            user_id=user["id"],
        )
    )


@router.post(
    "/workflows/{workflow_id}/process-mining/advisor",
    response_model=ProcessMiningAdvisorResponse,
)
def get_process_mining_advisor(
    workflow_id: int,
    agentdemo_session: str | None = Cookie(default=None),
) -> ProcessMiningAdvisorResponse:
    """Generate LLM advice grounded only in current Process Mining evidence."""

    user = require_current_user(agentdemo_session)
    _load_workflow(workflow_id, user["id"])
    return generate_process_mining_advice(
        workflow_id=workflow_id,
        user_id=user["id"],
    )
