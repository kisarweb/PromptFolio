import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = uuid_pk()
    google_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    encrypted_google_access_token: Mapped[Optional[str]] = mapped_column(Text)
    encrypted_google_refresh_token: Mapped[Optional[str]] = mapped_column(Text)
    google_token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    language: Mapped[str] = mapped_column(String(8), default="pt-BR")
    theme: Mapped[str] = mapped_column(String(8), default="dark")
    active_storage_provider: Mapped[str] = mapped_column(String(32), default="google_drive_mcp")
    # Auto-delete brand reference images unused for N days (None = off). Added via ALTER in db migrations.
    reference_autoclean_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StorageConfig(Base):
    __tablename__ = "storage_configs"
    __table_args__ = (UniqueConstraint("user_id", "provider", name="uq_storage_user_provider"),)
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    drive_root_folder_id: Mapped[Optional[str]] = mapped_column(String(255))
    drive_folder_cache: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    custom_mcp_endpoint: Mapped[Optional[str]] = mapped_column(Text)
    endpoint_url: Mapped[Optional[str]] = mapped_column(Text)
    bucket_name: Mapped[Optional[str]] = mapped_column(String(255))
    region: Mapped[Optional[str]] = mapped_column(String(64))
    public_url_prefix: Mapped[Optional[str]] = mapped_column(Text)
    encrypted_access_key: Mapped[Optional[str]] = mapped_column(Text)
    encrypted_secret_key: Mapped[Optional[str]] = mapped_column(Text)
    is_configured: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class McpConnection(Base):
    __tablename__ = "mcp_connections"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider_type: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(255))
    connection_type: Mapped[str] = mapped_column(String(16))
    endpoint_url: Mapped[Optional[str]] = mapped_column(Text)
    encrypted_credentials: Mapped[Optional[str]] = mapped_column(Text)
    masked_key: Mapped[Optional[str]] = mapped_column(String(64))
    header_names: Mapped[list[str]] = mapped_column(JSONB, default=list)
    default_model: Mapped[Optional[str]] = mapped_column(String(128))
    # Per-modality model for providers that serve several ({"image": "...", "video": "..."}). Added via ALTER.
    models: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    slug: Mapped[str] = mapped_column(String(140))
    color: Mapped[str] = mapped_column(String(16), default="#7c5cff")
    modality_scope: Mapped[str] = mapped_column(String(8), default="all")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=True)
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    seed_key: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[Optional[str]] = mapped_column(Text)
    agent_role: Mapped[str] = mapped_column(String(32))
    system_prompt: Mapped[str] = mapped_column(Text)
    preferred_mcp_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("mcp_connections.id", ondelete="SET NULL"), nullable=True)
    temperature: Mapped[float] = mapped_column(Float, default=0.7)
    is_system_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Prompt(Base):
    __tablename__ = "prompts"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text)
    prompt_template: Mapped[str] = mapped_column(Text)
    variables_schema: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    folder: Mapped[Optional[str]] = mapped_column(String(160))
    target_modality: Mapped[str] = mapped_column(String(8))
    preferred_mcp_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("mcp_connections.id", ondelete="SET NULL"), nullable=True)
    source_agent_name: Mapped[Optional[str]] = mapped_column(String(160))
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    workspace_type: Mapped[str] = mapped_column(String(16))
    locked_agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    locked_agent_name: Mapped[Optional[str]] = mapped_column(String(160))
    prompt_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("prompts.id", ondelete="SET NULL"), nullable=True)
    delivery_modality: Mapped[Optional[str]] = mapped_column(String(8))
    published_prompt_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("prompts.id", ondelete="SET NULL"), nullable=True)
    published_agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[uuid.UUID] = uuid_pk()
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    attachment_asset_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GeneratedAsset(Base):
    __tablename__ = "generated_assets"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True)
    prompt_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("prompts.id", ondelete="SET NULL"), nullable=True, index=True)
    prompt_title: Mapped[Optional[str]] = mapped_column(String(255))
    category_name: Mapped[Optional[str]] = mapped_column(String(120))
    modality: Mapped[str] = mapped_column(String(8))
    final_prompt: Mapped[str] = mapped_column(Text)
    text_content: Mapped[Optional[str]] = mapped_column(Text)
    filename: Mapped[str] = mapped_column(String(255))
    local_path: Mapped[Optional[str]] = mapped_column(Text)
    aspect_ratio: Mapped[Optional[str]] = mapped_column(String(8))
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    engine_label: Mapped[str] = mapped_column(String(160))
    storage_provider_used: Mapped[str] = mapped_column(String(32))
    storage_status: Mapped[str] = mapped_column(String(16))
    storage_message: Mapped[Optional[str]] = mapped_column(Text)
    remote_file_id_or_key: Mapped[Optional[str]] = mapped_column(Text)
    remote_view_url: Mapped[Optional[str]] = mapped_column(Text)
    mime_type: Mapped[str] = mapped_column(String(80))
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReferenceImage(Base):
    """Brand reference images (referencia_marca_anexa) stored inside the app database.

    Bytes live in Postgres so they survive redeploys and are removed for real on delete.
    """

    __tablename__ = "reference_images"
    __table_args__ = (
        UniqueConstraint("user_id", "code", name="uq_reference_user_code"),
        UniqueConstraint("user_id", "content_hash", name="uq_reference_user_hash"),
    )
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(40))
    original_name: Mapped[Optional[str]] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(16), default="upload")  # upload | paste
    content_hash: Mapped[str] = mapped_column(String(64))
    mime_type: Mapped[str] = mapped_column(String(40))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    data: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    thumb: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
