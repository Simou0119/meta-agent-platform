from collections.abc import Callable, Iterator
from operator import add
from typing import Annotated, Any, TypedDict

from langgraph.graph import (
    END,
    START,
    StateGraph,
)

from .workflow_routing import select_route_target


class WorkflowAgent(TypedDict):
    id: int
    name: str
    system_prompt: str
    role: str
    description: str
    order: int


class AgentExecutionResult(TypedDict):
    agent_id: int
    agent_name: str
    agent_order: int
    input: str
    output: str
    status: str
    error: str

    started_at: str
    completed_at: str
    duration_ms: int

    input_tokens: int
    output_tokens: int
    total_tokens: int

    model_name: str
    retry_count: int
    response_id: str


class WorkflowGraphState(TypedDict):
    workflow_id: int
    run_id: int
    original_request: str
    current_output: str
    completed_steps: int
    failed: bool
    error: str

    results: Annotated[
        list[AgentExecutionResult],
        add,
    ]


class WorkflowGraphEvent(TypedDict):
    type: str
    node_name: str
    result: AgentExecutionResult
    state_update: dict[str, Any]


AgentExecutor = Callable[
    [
        WorkflowAgent,
        str,
        str | None,
        int,
        int,
    ],
    AgentExecutionResult,
]


AgentSkipPredicate = Callable[
    [
        WorkflowAgent,
        WorkflowGraphState,
    ],
    bool,
]


def _create_node_name(
    agent: WorkflowAgent,
    index: int,
) -> str:
    safe_name = "".join(
        character
        if character.isalnum()
        else "_"
        for character in agent["name"]
    ).strip("_")

    if not safe_name:
        safe_name = "agent"

    return (
        f"agent_{index + 1}_"
        f"{safe_name.lower()}"
    )


def _create_agent_node(
    *,
    agent: WorkflowAgent,
    index: int,
    total_agents: int,
    execute_agent: AgentExecutor,
) -> Callable[
    [WorkflowGraphState],
    dict[str, Any],
]:
    def agent_node(
        state: WorkflowGraphState,
    ) -> dict[str, Any]:
        previous_output = (
            state["current_output"]
            if state["current_output"]
            else None
        )

        result = execute_agent(
            agent,
            state["original_request"],
            previous_output,
            index + 1,
            total_agents,
        )

        if result["status"] != "completed":
            return {
                "failed": True,
                "error": result["error"],
                "results": [result],
            }

        return {
            "current_output": result["output"],
            "completed_steps": (
                state["completed_steps"] + 1
            ),
            "results": [result],
        }

    return agent_node


def build_workflow_graph(
    *,
    agents: list[WorkflowAgent],
    execute_agent: AgentExecutor,
    routing: dict[str, Any] | None = None,
    should_skip_agent: AgentSkipPredicate | None = None,
):
    if not agents:
        raise ValueError(
            "Cannot build a workflow graph "
            "without agents."
        )

    ordered_agents = sorted(
        agents,
        key=lambda agent: (
            agent["order"],
            agent["id"],
        ),
    )

    builder = StateGraph(
        WorkflowGraphState,
    )

    node_names: list[str] = []

    for index, agent in enumerate(
        ordered_agents
    ):
        node_name = _create_node_name(
            agent,
            index,
        )

        node_names.append(node_name)

        builder.add_node(
            node_name,
            _create_agent_node(
                agent=agent,
                index=index,
                total_agents=len(
                    ordered_agents
                ),
                execute_agent=execute_agent,
            ),
        )

    node_name_by_order = {
        int(agent["order"]): node_names[index]
        for index, agent in enumerate(ordered_agents)
    }

    builder.add_edge(
        START,
        node_names[0],
    )

    for index in range(
        len(node_names) - 1
    ):
        current_node = node_names[index]

        def select_next_node(
            state: WorkflowGraphState,
            *,
            current_index: int = index,
        ) -> str:
            if state["failed"]:
                return "stop"

            current_agent = ordered_agents[current_index]
            target_order, _matched_rule = select_route_target(
                current_agent_order=int(current_agent["order"]),
                current_output=str(state.get("current_output") or ""),
                routing=routing,
            )
            if target_order is not None:
                target_node = node_name_by_order.get(target_order)
                if target_node is not None:
                    return target_node

            for candidate_index in range(
                current_index + 1,
                len(ordered_agents),
            ):
                candidate_agent = ordered_agents[
                    candidate_index
                ]

                if (
                    should_skip_agent is not None
                    and should_skip_agent(
                        candidate_agent,
                        state,
                    )
                ):
                    continue

                return node_names[
                    candidate_index
                ]

            return "stop"

        path_map = {
            node_names[candidate_index]: (
                node_names[candidate_index]
            )
            for candidate_index in range(
                index + 1,
                len(node_names),
            )
        }
        path_map["stop"] = END

        builder.add_conditional_edges(
            current_node,
            select_next_node,
            path_map,
        )

    builder.add_edge(
        node_names[-1],
        END,
    )

    return builder.compile(
        name="dynamic-workflow-graph",
    )


def create_initial_state(
    *,
    workflow_id: int,
    run_id: int,
    original_request: str,
) -> WorkflowGraphState:
    return {
        "workflow_id": workflow_id,
        "run_id": run_id,
        "original_request": (
            original_request
        ),
        "current_output": "",
        "completed_steps": 0,
        "failed": False,
        "error": "",
        "results": [],
    }


def stream_workflow_graph(
    *,
    graph,
    initial_state: WorkflowGraphState,
) -> Iterator[WorkflowGraphEvent]:
    for update in graph.stream(
        initial_state,
        stream_mode="updates",
    ):
        for node_name, state_update in (
            update.items()
        ):
            if not isinstance(
                state_update,
                dict,
            ):
                continue

            results = state_update.get(
                "results",
                [],
            )

            if not results:
                continue

            result = results[-1]

            yield {
                "type": (
                    "agent_completed"
                    if result["status"]
                    == "completed"
                    else "agent_failed"
                ),
                "node_name": node_name,
                "result": result,
                "state_update": (
                    state_update
                ),
            }


def invoke_workflow_graph(
    *,
    graph,
    initial_state: WorkflowGraphState,
) -> WorkflowGraphState:
    final_state = graph.invoke(
        initial_state,
    )

    return WorkflowGraphState(
        workflow_id=final_state[
            "workflow_id"
        ],
        run_id=final_state["run_id"],
        original_request=final_state[
            "original_request"
        ],
        current_output=final_state[
            "current_output"
        ],
        completed_steps=final_state[
            "completed_steps"
        ],
        failed=final_state["failed"],
        error=final_state["error"],
        results=final_state["results"],
    )