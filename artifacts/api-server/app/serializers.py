import re
from datetime import datetime
from typing import Any

from .models import Agent, ChatMessage, ChatSession, GeneratedAsset, McpConnection, User

VARIABLE_RE = re.compile(r"\{\{\s*([^{}\s][^{}]*?)\s*\}\}")


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def sid(value: Any) -> str | None:
    return str(value) if value is not None else None


def detect_variables(text: str) -> list[str]:
    seen: list[str] = []
    for match in VARIABLE_RE.finditer(text or ""):
        name = match.group(1).strip()
        if name and name not in seen:
            seen.append(name)
    return seen


MAX_EXAMPLES = 5
MAX_OPTIONS = 20


def _clean_list(value: Any, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        s = str(item).strip() if item is not None else ""
        if s and s not in out:
            out.append(s)
    return out[:limit]


def _text(value: Any) -> str | None:
    s = str(value).strip() if value is not None else ""
    return s or None


def normalize_variable(name: str, base: dict[str, Any]) -> dict[str, Any]:
    """Canonical shape stored in prompts.variables_schema. Missing `required` means required (legacy behaviour)."""
    required = base.get("required")
    return {
        "name": name,
        "label": _text(base.get("label")),
        "defaultValue": base.get("defaultValue") if isinstance(base.get("defaultValue"), str) else None,
        "description": _text(base.get("description")),
        "helpText": _text(base.get("helpText")),
        "examples": _clean_list(base.get("examples"), MAX_EXAMPLES),
        "options": _clean_list(base.get("options"), MAX_OPTIONS),
        "required": True if required is None else bool(required),
    }


def merge_variables(text: str, provided: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Variables actually present in the text, keeping user-provided documentation."""
    by_name = {v.get("name"): v for v in (provided or []) if v.get("name")}
    return [normalize_variable(name, by_name.get(name, {})) for name in detect_variables(text)]


def variables_out(schema: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [normalize_variable(v["name"], v) for v in (schema or []) if v.get("name")]


def user_out(user: User, drive_linked: bool) -> dict[str, Any]:
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "avatarUrl": user.avatar_url,
        "language": user.language,
        "theme": user.theme,
        "activeStorageProvider": user.active_storage_provider,
        "isDemo": user.is_demo,
        "googleDriveLinked": drive_linked,
        "createdAt": iso(user.created_at),
    }


def agent_out(agent: Agent, category_name: str | None = None) -> dict[str, Any]:
    return {
        "id": str(agent.id),
        "name": agent.name,
        "description": agent.description,
        "agentRole": agent.agent_role,
        "systemPrompt": agent.system_prompt,
        "categoryId": sid(agent.category_id),
        "categoryName": category_name,
        "preferredMcpId": sid(agent.preferred_mcp_id),
        "temperature": agent.temperature,
        "isSystemDefault": agent.is_system_default,
        "isPublished": agent.is_published,
        "isActive": agent.is_active,
        "createdAt": iso(agent.created_at),
    }


def session_out(session: ChatSession, message_count: int) -> dict[str, Any]:
    return {
        "id": str(session.id),
        "workspaceType": session.workspace_type,
        "title": session.title,
        "lockedAgentId": sid(session.locked_agent_id),
        "lockedAgentName": session.locked_agent_name,
        "isLocked": session.locked_agent_id is not None or session.locked_agent_name is not None,
        "messageCount": message_count,
        "publishedPromptId": sid(session.published_prompt_id),
        "publishedAgentId": sid(session.published_agent_id),
        "createdAt": iso(session.created_at),
    }


def message_out(msg: ChatMessage) -> dict[str, Any]:
    return {"id": str(msg.id), "role": msg.role, "content": msg.content, "createdAt": iso(msg.created_at)}


def asset_urls(asset_id: Any) -> tuple[str, str]:
    base = f"/api/delivery/assets/{asset_id}/file"
    return base, f"{base}?download=1"


def asset_out(asset: GeneratedAsset) -> dict[str, Any]:
    preview, download = asset_urls(asset.id)
    return {
        "id": str(asset.id),
        "promptId": sid(asset.prompt_id),
        "promptTitle": asset.prompt_title,
        "modality": asset.modality,
        "finalPrompt": asset.final_prompt,
        "textContent": asset.text_content,
        "mimeType": asset.mime_type,
        "fileSizeBytes": asset.file_size_bytes,
        "filename": asset.filename,
        "previewUrl": preview,
        "downloadUrl": download,
        "aspectRatio": asset.aspect_ratio,
        "durationSeconds": asset.duration_seconds,
        "engineLabel": asset.engine_label,
        "storageProviderUsed": asset.storage_provider_used,
        "storageStatus": asset.storage_status,
        "storageMessage": asset.storage_message,
        "remoteFileIdOrKey": asset.remote_file_id_or_key,
        "remoteViewUrl": asset.remote_view_url,
        "createdAt": iso(asset.created_at),
    }


def _chosen_models(conn: McpConnection) -> dict[str, str]:
    """Models the user picked per modality (legacy single-model connections are mapped to the modality it belongs to)."""
    from .ai import MCP_SUPPORT, _model_kind  # local import keeps serializers free of the SDK clients at import time

    chosen = {k: v for k, v in (conn.models or {}).items() if v}
    if conn.default_model and conn.provider_type in ("openai_chatgpt", "google_nano_banana", "runway"):
        kind = _model_kind(conn.provider_type, conn.default_model)
        if kind and kind in MCP_SUPPORT.get(conn.provider_type, set()):
            chosen.setdefault(kind, conn.default_model)
    return chosen


def mcp_out(conn: McpConnection) -> dict[str, Any]:
    return {
        "id": str(conn.id),
        "providerType": conn.provider_type,
        "name": conn.name,
        "connectionType": conn.connection_type,
        "endpointUrl": conn.endpoint_url,
        "defaultModel": conn.default_model,
        "models": _chosen_models(conn),
        "hasCredentials": bool(conn.encrypted_credentials),
        "maskedKey": conn.masked_key,
        "headerNames": conn.header_names or [],
        "isActive": conn.is_active,
        "createdAt": iso(conn.created_at),
    }
