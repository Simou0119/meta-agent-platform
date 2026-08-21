# import json
# import re
# from collections.abc import Iterator

# from fastapi import APIRouter, Cookie, HTTPException
# from fastapi.responses import StreamingResponse

# from ..config import (
#     BUILDER_HISTORY_MESSAGE_LIMIT,
#     OPENAI_MODEL,
#     OPENAI_TIMEOUT_SECONDS,
# )
# from ..deps import require_current_user
# from ..prompts import BUILDER_SYSTEM_PROMPT
# from ..schemas import BuilderChatMessage, BuilderChatRequest


# router = APIRouter(prefix="/api", tags=["chat"])

# _AGENT_CONFIG_RE = re.compile(
#     r"<!--AGENT_CONFIG:(\{.*?\})-->",
#     re.DOTALL,
# )

# _WORKFLOW_CONFIG_RE = re.compile(
#     r"<!--WORKFLOW_CONFIG:(\{.*?\})-->",
#     re.DOTALL,
# )

# _SENTINEL_STARTS = (
#     "<!--AGENT_CONFIG:",
#     "<!--WORKFLOW_CONFIG:",
# )


# def prepare_messages(
#     messages: list[BuilderChatMessage],
# ) -> list[dict[str, str]]:
#     if not messages:
#         raise HTTPException(
#             status_code=400,
#             detail="Please send at least one message.",
#         )

#     prepared_messages = [
#         {
#             "role": message.role,
#             "content": message.content.strip(),
#         }
#         for message in messages
#     ]

#     if any(
#         not message["content"]
#         for message in prepared_messages
#     ):
#         raise HTTPException(
#             status_code=400,
#             detail="Message content cannot be empty.",
#         )

#     if prepared_messages[-1]["role"] != "user":
#         raise HTTPException(
#             status_code=400,
#             detail="The latest message must be from the user.",
#         )

#     return prepared_messages[
#         -BUILDER_HISTORY_MESSAGE_LIMIT:
#     ]


# def create_openai_stream(
#     messages: list[dict[str, str]],
# ) -> Iterator[object]:
#     try:
#         from openai import (
#             APITimeoutError,
#             OpenAI,
#             OpenAIError,
#         )
#     except ImportError as exc:
#         raise HTTPException(
#             status_code=500,
#             detail="OpenAI SDK is not installed.",
#         ) from exc

#     try:
#         client = OpenAI(
#             timeout=OPENAI_TIMEOUT_SECONDS,
#         )

#         return client.responses.create(
#             model=OPENAI_MODEL,
#             instructions=BUILDER_SYSTEM_PROMPT,
#             input=messages,
#             stream=True,
#         )

#     except APITimeoutError as exc:
#         raise HTTPException(
#             status_code=504,
#             detail="Builder Agent response timed out.",
#         ) from exc

#     except OpenAIError as exc:
#         raise HTTPException(
#             status_code=502,
#             detail="Builder Agent is unavailable.",
#         ) from exc


# def _sse(payload: dict) -> str:
#     return (
#         f"data: "
#         f"{json.dumps(payload, ensure_ascii=False)}"
#         f"\n\n"
#     )


# def _safe_yield_length(text: str) -> int:
#     """
#     Return how many leading characters are safe to stream.

#     This prevents AGENT_CONFIG or WORKFLOW_CONFIG sentinel
#     content from leaking into the visible assistant reply.
#     """

#     earliest_position: int | None = None

#     for sentinel_start in _SENTINEL_STARTS:
#         position = text.find(sentinel_start)

#         if position != -1:
#             if (
#                 earliest_position is None
#                 or position < earliest_position
#             ):
#                 earliest_position = position

#     if earliest_position is not None:
#         return earliest_position

#     safe_length = len(text)

#     for sentinel_start in _SENTINEL_STARTS:
#         for length in range(
#             len(sentinel_start),
#             0,
#             -1,
#         ):
#             if text.endswith(
#                 sentinel_start[:length],
#             ):
#                 safe_length = min(
#                     safe_length,
#                     len(text) - length,
#                 )
#                 break

#     return safe_length


# def _normalize_workflow_config(
#     config: dict,
# ) -> dict:
#     workflow_name = str(
#         config.get("workflow_name")
#         or config.get("name")
#         or "Generated Workflow"
#     ).strip()

#     raw_agents = config.get("agents")

#     if not isinstance(raw_agents, list):
#         raise KeyError("agents")

#     agents: list[dict] = []

#     for index, raw_agent in enumerate(raw_agents):
#         if not isinstance(raw_agent, dict):
#             continue

#         name = str(
#             raw_agent.get("name")
#             or f"Agent {index + 1}"
#         ).strip()

#         system_prompt = str(
#             raw_agent.get("system_prompt")
#             or raw_agent.get("systemPrompt")
#             or ""
#         ).strip()

#         role = str(
#             raw_agent.get("role")
#             or ""
#         ).strip()

#         description = str(
#             raw_agent.get("description")
#             or ""
#         ).strip()

#         agents.append(
#             {
#                 "id": f"draft-{index + 1}",
#                 "name": name,
#                 "system_prompt": system_prompt,
#                 "role": role,
#                 "description": description,
#             }
#         )

#     raw_input = config.get("input_capabilities")
#     if not isinstance(raw_input, dict):
#         raw_input = {}

#     raw_upload = raw_input.get("file_upload")
#     if not isinstance(raw_upload, dict):
#         raw_upload = {}

#     accepted_formats = [
#         value
#         for value in dict.fromkeys(
#             str(item).lower()
#             for item in raw_upload.get("accepted_formats", [])
#         )
#         if value in {"docx", "pdf"}
#     ]

#     upload_enabled = bool(raw_upload.get("enabled")) and bool(accepted_formats)
#     multiple = bool(raw_upload.get("multiple"))
#     max_files = int(raw_upload.get("max_files") or (5 if multiple else 1))
#     max_files = min(10, max(1, max_files))

#     raw_output = config.get("output_capabilities")
#     if not isinstance(raw_output, dict):
#         raw_output = {}

#     download_formats = [
#         value
#         for value in dict.fromkeys(
#             str(item).lower()
#             for item in raw_output.get("download_formats", [])
#         )
#         if value in {"docx", "pdf", "bpmn"}
#     ]

#     return {
#         "workflow_name": workflow_name,
#         "agents": agents,
#         "input_capabilities": {
#             "allow_text": bool(raw_input.get("allow_text", True)),
#             "file_upload": {
#                 "enabled": upload_enabled,
#                 "accepted_formats": accepted_formats,
#                 "multiple": multiple,
#                 "max_files": max_files,
#             },
#         },
#         "output_capabilities": {
#             "download_formats": download_formats,
#         },
#     }


# def _normalize_agent_config(
#     config: dict,
# ) -> dict:
#     name = str(
#         config.get("name")
#         or "Generated Agent"
#     ).strip()

#     system_prompt = str(
#         config.get("system_prompt")
#         or config.get("systemPrompt")
#         or ""
#     ).strip()

#     role = str(
#         config.get("role")
#         or ""
#     ).strip()

#     description = str(
#         config.get("description")
#         or ""
#     ).strip()

#     return {
#         "id": "draft-1",
#         "name": name,
#         "system_prompt": system_prompt,
#         "role": role,
#         "description": description,
#     }


# def stream_events(
#     openai_stream: Iterator[object],
# ) -> Iterator[str]:
#     full_text = ""
#     yielded_length = 0

#     for event in openai_stream:
#         if (
#             getattr(event, "type", "")
#             == "response.output_text.delta"
#         ):
#             delta = getattr(event, "delta", "")

#             if not delta:
#                 continue

#             full_text += delta

#             safe_length = _safe_yield_length(
#                 full_text,
#             )

#             if safe_length > yielded_length:
#                 yield _sse(
#                     {
#                         "type": "text_delta",
#                         "content": full_text[
#                             yielded_length:safe_length
#                         ],
#                     }
#                 )

#                 yielded_length = safe_length

#     workflow_match = _WORKFLOW_CONFIG_RE.search(
#         full_text,
#     )

#     if workflow_match:
#         try:
#             raw_config = json.loads(
#                 workflow_match.group(1),
#             )

#             config = _normalize_workflow_config(
#                 raw_config,
#             )

#             clean_text = _WORKFLOW_CONFIG_RE.sub(
#                 "",
#                 full_text,
#             ).rstrip()

#             yield _sse(
#                 {
#                     "type": "set_content",
#                     "content": clean_text,
#                 }
#             )

#             # 这里只返回草案，不写数据库
#             yield _sse(
#                 {
#                     "type": "workflow_created",
#                     "workflow_name": config[
#                         "workflow_name"
#                     ],
#                     "agents": config["agents"],
#                     "input_capabilities": config["input_capabilities"],
#                     "output_capabilities": config["output_capabilities"],
#                 }
#             )

#         except (
#             json.JSONDecodeError,
#             KeyError,
#             TypeError,
#         ):
#             return

#         return

#     agent_match = _AGENT_CONFIG_RE.search(
#         full_text,
#     )

#     if agent_match:
#         try:
#             raw_config = json.loads(
#                 agent_match.group(1),
#             )

#             agent = _normalize_agent_config(
#                 raw_config,
#             )

#             clean_text = _AGENT_CONFIG_RE.sub(
#                 "",
#                 full_text,
#             ).rstrip()

#             yield _sse(
#                 {
#                     "type": "set_content",
#                     "content": clean_text,
#                 }
#             )

#             # 这里只返回草案，不写数据库
#             yield _sse(
#                 {
#                     "type": "agent_created",
#                     "agent_id": agent["id"],
#                     "name": agent["name"],
#                     "system_prompt": agent[
#                         "system_prompt"
#                     ],
#                     "role": agent["role"],
#                     "description": agent[
#                         "description"
#                     ],
#                 }
#             )

#         except (
#             json.JSONDecodeError,
#             KeyError,
#             TypeError,
#         ):
#             return


# @router.post("/chat/builder")
# def builder_chat(
#     request: BuilderChatRequest,
#     agentdemo_session: str | None = Cookie(
#         default=None,
#     ),
# ) -> StreamingResponse:
#     require_current_user(agentdemo_session)

#     messages = prepare_messages(
#         request.messages,
#     )

#     openai_stream = create_openai_stream(
#         messages,
#     )

#     return StreamingResponse(
#         stream_events(openai_stream),
#         media_type=(
#             "text/event-stream; charset=utf-8"
#         ),
#     )

import json
import re
from collections.abc import Iterator

from fastapi import APIRouter, Cookie, HTTPException
from fastapi.responses import StreamingResponse

from ..config import (
    BUILDER_HISTORY_MESSAGE_LIMIT,
    OPENAI_MODEL,
    OPENAI_TIMEOUT_SECONDS,
)
from ..deps import require_current_user
from ..prompts import BUILDER_SYSTEM_PROMPT
from ..schemas import BuilderChatMessage, BuilderChatRequest


_BUILDER_CREATE_NOW_INSTRUCTIONS = """
The user has explicitly clicked Create Workflow.

This is a final creation request, not a request for more discussion.

Mandatory behavior:
- Do not ask any follow-up questions.
- Do not continue explaining the plan.
- Do not return conversational text before or after the configuration.
- Generate the complete Workflow immediately from the available conversation.
- Make reasonable assumptions when details are missing.
- Return exactly one WORKFLOW_CONFIG sentinel.
- Do not return an AGENT_CONFIG sentinel.

Required output format:
<!--WORKFLOW_CONFIG:{
  "workflow_name": "Workflow name",
  "agents": [
    {
      "name": "Agent name",
      "role": "Agent role",
      "description": "What the Agent does",
      "system_prompt": "Complete system prompt"
    }
  ],
  "input_capabilities": {
    "allow_text": true,
    "file_upload": {
      "enabled": false,
      "accepted_formats": [],
      "multiple": false,
      "max_files": 1
    }
  },
  "output_capabilities": {
    "download_formats": []
  }
}-->

Supported upload formats: docx, pdf.
Supported download formats: docx, pdf, bpmn.
""".strip()


router = APIRouter(prefix="/api", tags=["chat"])

_AGENT_CONFIG_RE = re.compile(
    r"<!--AGENT_CONFIG:(\{.*?\})-->",
    re.DOTALL,
)

_WORKFLOW_CONFIG_RE = re.compile(
    r"<!--WORKFLOW_CONFIG:(\{.*?\})-->",
    re.DOTALL,
)

_SENTINEL_STARTS = (
    "<!--AGENT_CONFIG:",
    "<!--WORKFLOW_CONFIG:",
)


def prepare_messages(
    messages: list[BuilderChatMessage],
) -> list[dict[str, str]]:
    if not messages:
        raise HTTPException(
            status_code=400,
            detail="Please send at least one message.",
        )

    prepared_messages = [
        {
            "role": message.role,
            "content": message.content.strip(),
        }
        for message in messages
    ]

    if any(
        not message["content"]
        for message in prepared_messages
    ):
        raise HTTPException(
            status_code=400,
            detail="Message content cannot be empty.",
        )

    if prepared_messages[-1]["role"] != "user":
        raise HTTPException(
            status_code=400,
            detail="The latest message must be from the user.",
        )

    return prepared_messages[
        -BUILDER_HISTORY_MESSAGE_LIMIT:
    ]


def create_openai_stream(
    messages: list[dict[str, str]],
    *,
    create_now: bool = False,
) -> Iterator[object]:
    try:
        from openai import (
            APITimeoutError,
            OpenAI,
            OpenAIError,
        )
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="OpenAI SDK is not installed.",
        ) from exc

    try:
        client = OpenAI(
            timeout=OPENAI_TIMEOUT_SECONDS,
        )

        instructions = BUILDER_SYSTEM_PROMPT

        if create_now:
            instructions = (
                f"{BUILDER_SYSTEM_PROMPT}\n\n"
                f"{_BUILDER_CREATE_NOW_INSTRUCTIONS}"
            )

        return client.responses.create(
            model=OPENAI_MODEL,
            instructions=instructions,
            input=messages,
            stream=True,
        )

    except APITimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail="Builder Agent response timed out.",
        ) from exc

    except OpenAIError as exc:
        raise HTTPException(
            status_code=502,
            detail="Builder Agent is unavailable.",
        ) from exc


def _sse(payload: dict) -> str:
    return (
        f"data: "
        f"{json.dumps(payload, ensure_ascii=False)}"
        f"\n\n"
    )


def _safe_yield_length(text: str) -> int:
    """
    Return how many leading characters are safe to stream.

    This prevents AGENT_CONFIG or WORKFLOW_CONFIG sentinel
    content from leaking into the visible assistant reply.
    """

    earliest_position: int | None = None

    for sentinel_start in _SENTINEL_STARTS:
        position = text.find(sentinel_start)

        if position != -1:
            if (
                earliest_position is None
                or position < earliest_position
            ):
                earliest_position = position

    if earliest_position is not None:
        return earliest_position

    safe_length = len(text)

    for sentinel_start in _SENTINEL_STARTS:
        for length in range(
            len(sentinel_start),
            0,
            -1,
        ):
            if text.endswith(
                sentinel_start[:length],
            ):
                safe_length = min(
                    safe_length,
                    len(text) - length,
                )
                break

    return safe_length


def _normalize_workflow_config(
    config: dict,
) -> dict:
    workflow_name = str(
        config.get("workflow_name")
        or config.get("name")
        or "Generated Workflow"
    ).strip()

    raw_agents = config.get("agents")

    if not isinstance(raw_agents, list):
        raise KeyError("agents")

    agents: list[dict] = []

    for index, raw_agent in enumerate(raw_agents):
        if not isinstance(raw_agent, dict):
            continue

        name = str(
            raw_agent.get("name")
            or f"Agent {index + 1}"
        ).strip()

        system_prompt = str(
            raw_agent.get("system_prompt")
            or raw_agent.get("systemPrompt")
            or ""
        ).strip()

        role = str(
            raw_agent.get("role")
            or ""
        ).strip()

        description = str(
            raw_agent.get("description")
            or ""
        ).strip()

        agents.append(
            {
                "id": f"draft-{index + 1}",
                "name": name,
                "system_prompt": system_prompt,
                "role": role,
                "description": description,
            }
        )

    raw_input = config.get("input_capabilities")
    if not isinstance(raw_input, dict):
        raw_input = {}

    raw_upload = raw_input.get("file_upload")
    if not isinstance(raw_upload, dict):
        raw_upload = {}

    accepted_formats = [
        value
        for value in dict.fromkeys(
            str(item).lower()
            for item in raw_upload.get("accepted_formats", [])
        )
        if value in {"docx", "pdf"}
    ]

    upload_enabled = bool(raw_upload.get("enabled")) and bool(accepted_formats)
    multiple = bool(raw_upload.get("multiple"))
    max_files = int(raw_upload.get("max_files") or (5 if multiple else 1))
    max_files = min(10, max(1, max_files))

    raw_output = config.get("output_capabilities")
    if not isinstance(raw_output, dict):
        raw_output = {}

    download_formats = [
        value
        for value in dict.fromkeys(
            str(item).lower()
            for item in raw_output.get("download_formats", [])
        )
        if value in {"docx", "pdf", "bpmn"}
    ]

    raw_routing = config.get("routing")
    if not isinstance(raw_routing, dict):
        raw_routing = {}
    routing_mode = str(raw_routing.get("mode") or "sequential").strip().lower()
    if routing_mode not in {"sequential", "conditional"}:
        routing_mode = "sequential"
    routing_rules: list[dict] = []
    raw_rules = raw_routing.get("rules", [])
    if isinstance(raw_rules, list):
        for raw_rule in raw_rules:
            if not isinstance(raw_rule, dict):
                continue
            raw_condition = raw_rule.get("condition")
            if not isinstance(raw_condition, dict):
                continue
            try:
                from_order = int(raw_rule.get("from_agent_order"))
                to_order = int(raw_rule.get("to_agent_order"))
                priority = int(raw_rule.get("priority") or 100)
            except (TypeError, ValueError):
                continue
            field = str(raw_condition.get("field") or "").strip()
            operator = str(raw_condition.get("operator") or "equals").strip().lower()
            if not field or operator not in {
                "equals", "not_equals", "contains", "not_contains",
                "greater_than", "greater_or_equal", "less_than",
                "less_or_equal", "truthy", "falsy",
            }:
                continue
            routing_rules.append({
                "from_agent_order": from_order,
                "to_agent_order": to_order,
                "condition": {
                    "field": field,
                    "operator": operator,
                    "value": raw_condition.get("value"),
                },
                "label": str(raw_rule.get("label") or "").strip(),
                "priority": priority,
            })
    if not routing_rules:
        routing_mode = "sequential"

    return {
        "workflow_name": workflow_name,
        "agents": agents,
        "input_capabilities": {
            "allow_text": bool(raw_input.get("allow_text", True)),
            "file_upload": {
                "enabled": upload_enabled,
                "accepted_formats": accepted_formats,
                "multiple": multiple,
                "max_files": max_files,
            },
        },
        "output_capabilities": {
            "download_formats": download_formats,
        },
        "routing": {
            "mode": routing_mode,
            "rules": routing_rules,
        },
    }


def _normalize_agent_config(
    config: dict,
) -> dict:
    name = str(
        config.get("name")
        or "Generated Agent"
    ).strip()

    system_prompt = str(
        config.get("system_prompt")
        or config.get("systemPrompt")
        or ""
    ).strip()

    role = str(
        config.get("role")
        or ""
    ).strip()

    description = str(
        config.get("description")
        or ""
    ).strip()

    return {
        "id": "draft-1",
        "name": name,
        "system_prompt": system_prompt,
        "role": role,
        "description": description,
    }


def stream_events(
    openai_stream: Iterator[object],
    *,
    require_workflow_config: bool = False,
) -> Iterator[str]:
    full_text = ""
    yielded_length = 0

    for event in openai_stream:
        if (
            getattr(event, "type", "")
            == "response.output_text.delta"
        ):
            delta = getattr(event, "delta", "")

            if not delta:
                continue

            full_text += delta

            safe_length = _safe_yield_length(
                full_text,
            )

            if safe_length > yielded_length:
                if not require_workflow_config:
                    yield _sse(
                        {
                            "type": "text_delta",
                            "content": full_text[
                                yielded_length:safe_length
                            ],
                        }
                    )

                yielded_length = safe_length

    workflow_match = _WORKFLOW_CONFIG_RE.search(
        full_text,
    )

    if workflow_match:
        try:
            raw_config = json.loads(
                workflow_match.group(1),
            )

            config = _normalize_workflow_config(
                raw_config,
            )

            clean_text = (
                ""
                if require_workflow_config
                else _WORKFLOW_CONFIG_RE.sub(
                    "",
                    full_text,
                ).rstrip()
            )

            yield _sse(
                {
                    "type": "set_content",
                    "content": clean_text,
                }
            )

            # 这里只返回草案，不写数据库
            yield _sse(
                {
                    "type": "workflow_created",
                    "workflow_name": config[
                        "workflow_name"
                    ],
                    "agents": config["agents"],
                    "input_capabilities": config["input_capabilities"],
                    "output_capabilities": config["output_capabilities"],
                    "routing": config["routing"],
                }
            )

        except (
            json.JSONDecodeError,
            KeyError,
            TypeError,
        ):
            return

        return

    agent_match = _AGENT_CONFIG_RE.search(
        full_text,
    )

    if agent_match and not require_workflow_config:
        try:
            raw_config = json.loads(
                agent_match.group(1),
            )

            agent = _normalize_agent_config(
                raw_config,
            )

            clean_text = _AGENT_CONFIG_RE.sub(
                "",
                full_text,
            ).rstrip()

            yield _sse(
                {
                    "type": "set_content",
                    "content": clean_text,
                }
            )

            # 这里只返回草案，不写数据库
            yield _sse(
                {
                    "type": "agent_created",
                    "agent_id": agent["id"],
                    "name": agent["name"],
                    "system_prompt": agent[
                        "system_prompt"
                    ],
                    "role": agent["role"],
                    "description": agent[
                        "description"
                    ],
                }
            )

        except (
            json.JSONDecodeError,
            KeyError,
            TypeError,
        ):
            return

    if require_workflow_config:
        yield _sse(
            {
                "type": "builder_error",
                "content": (
                    "The Workflow could not be generated. "
                    "Please click Create Workflow again."
                ),
            }
        )


@router.post("/chat/builder")
def builder_chat(
    request: BuilderChatRequest,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> StreamingResponse:
    require_current_user(agentdemo_session)

    messages = prepare_messages(
        request.messages,
    )

    openai_stream = create_openai_stream(
        messages,
    )

    return StreamingResponse(
        stream_events(openai_stream),
        media_type=(
            "text/event-stream; charset=utf-8"
        ),
    )

@router.post("/chat/builder/create")
def builder_create(
    request: BuilderChatRequest,
    agentdemo_session: str | None = Cookie(
        default=None,
    ),
) -> StreamingResponse:
    """
    Generate the final Workflow immediately when Create Workflow is clicked.

    This route does not continue the conversation. It only accepts a complete
    WORKFLOW_CONFIG response and returns the generated Workflow draft.
    """

    require_current_user(agentdemo_session)

    messages = prepare_messages(
        request.messages,
    )

    openai_stream = create_openai_stream(
        messages,
        create_now=True,
    )

    return StreamingResponse(
        stream_events(
            openai_stream,
            require_workflow_config=True,
        ),
        media_type=(
            "text/event-stream; charset=utf-8"
        ),
    )
