"""Request bodies (camelCase to match the OpenAPI contract)."""
from typing import Literal, Optional

from pydantic import BaseModel, Field

Modality = Literal["image", "video", "audio", "text"]
StorageProvider = Literal["google_drive_mcp", "cloudflare_r2", "aws_s3"]
AgentRole = Literal["meta_agent_builder", "prompt_builder", "delivery_executor"]
Workspace = Literal["builder_agent", "builder_prompt"]
McpProviderType = Literal[
    "google_nano_banana", "openai_chatgpt", "runway",
    "openrouter_text", "openrouter_image", "openrouter_audio", "openrouter_video",
    "custom_mcp",
]


class ModelsByModality(BaseModel):
    text: Optional[str] = None
    image: Optional[str] = None
    audio: Optional[str] = None
    video: Optional[str] = None
Scope = Literal["all", "image", "video", "audio", "text"]


class PreferencesUpdate(BaseModel):
    language: Optional[Literal["pt-BR", "en-US"]] = None
    theme: Optional[Literal["light", "dark"]] = None


class CategoryInput(BaseModel):
    name: str = Field(min_length=1)
    color: Optional[str] = None
    modalityScope: Optional[Scope] = None


class PromptVariable(BaseModel):
    name: str
    label: Optional[str] = None
    defaultValue: Optional[str] = None
    description: Optional[str] = None
    helpText: Optional[str] = None
    examples: Optional[list[str]] = None
    options: Optional[list[str]] = None
    required: Optional[bool] = None


class SuggestVariablesInput(BaseModel):
    promptTemplate: str = Field(min_length=1)
    variables: Optional[list[PromptVariable]] = None


class PromptUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    promptTemplate: Optional[str] = Field(default=None, min_length=1)
    variables: Optional[list[PromptVariable]] = None
    tags: Optional[list[str]] = None
    folder: Optional[str] = None
    categoryId: Optional[str] = None
    targetModality: Optional[Modality] = None
    preferredMcpId: Optional[str] = None
    isPublished: Optional[bool] = None


class ImportInput(BaseModel):
    content: str


class AgentInput(BaseModel):
    name: str = Field(min_length=1)
    description: Optional[str] = None
    agentRole: AgentRole
    systemPrompt: str = Field(min_length=1)
    categoryId: Optional[str] = None
    preferredMcpId: Optional[str] = None
    temperature: Optional[float] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    systemPrompt: Optional[str] = Field(default=None, min_length=1)
    categoryId: Optional[str] = None
    preferredMcpId: Optional[str] = None
    temperature: Optional[float] = None
    isActive: Optional[bool] = None
    isPublished: Optional[bool] = None


class ChatSessionInput(BaseModel):
    workspaceType: Workspace
    title: Optional[str] = None


class ChatMessageInput(BaseModel):
    content: str = Field(min_length=1)
    agentId: Optional[str] = None


class PublishInput(BaseModel):
    kind: Literal["prompt", "agent"]
    title: str = Field(min_length=1)
    description: Optional[str] = None
    content: str = Field(min_length=1)
    categoryId: Optional[str] = None
    folder: Optional[str] = None
    tags: Optional[list[str]] = None
    variables: Optional[list[PromptVariable]] = None
    targetModality: Optional[Modality] = None
    preferredMcpId: Optional[str] = None
    agentRole: Optional[AgentRole] = None


class BrandReferenceInput(BaseModel):
    kind: Literal["url", "library"]
    url: Optional[str] = None
    referenceId: Optional[str] = None


class ReferenceUploadInput(BaseModel):
    data: str = Field(min_length=8, description="Base64 or data URL")
    filename: Optional[str] = None
    code: Optional[str] = None
    source: Literal["upload", "paste"] = "upload"


class ReferenceUpdateInput(BaseModel):
    code: str = Field(min_length=2, max_length=41)


class ReferenceBulkDeleteInput(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)


class ReferenceCleanupInput(BaseModel):
    unusedForDays: int = Field(ge=0, le=3650)
    onlyNeverUsed: bool = False
    dryRun: bool = True


class ReferenceSettingsInput(BaseModel):
    autoCleanupDays: Optional[int] = Field(default=None, ge=7, le=3650)


class ExecuteInput(BaseModel):
    promptId: str
    modality: Modality
    variables: Optional[dict[str, str]] = None
    engineId: Optional[str] = None
    aspectRatio: Optional[Literal["1:1", "16:9", "9:16"]] = None
    durationSeconds: Optional[int] = None
    voice: Optional[str] = None
    extraInstructions: Optional[str] = None
    brandReferences: Optional[list[BrandReferenceInput]] = None


class McpConnectionInput(BaseModel):
    providerType: McpProviderType
    name: str = Field(min_length=1)
    connectionType: Literal["api_key", "mcp_sse"]
    endpointUrl: Optional[str] = None
    apiKey: Optional[str] = None
    headers: Optional[dict[str, str]] = None
    defaultModel: Optional[str] = None
    models: Optional[ModelsByModality] = None
    isActive: Optional[bool] = None


class McpConnectionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    endpointUrl: Optional[str] = None
    apiKey: Optional[str] = None
    headers: Optional[dict[str, str]] = None
    defaultModel: Optional[str] = None
    models: Optional[ModelsByModality] = None
    isActive: Optional[bool] = None


class ActiveStorageInput(BaseModel):
    provider: StorageProvider


class StorageConfigInput(BaseModel):
    endpointUrl: Optional[str] = None
    bucketName: Optional[str] = None
    region: Optional[str] = None
    publicUrlPrefix: Optional[str] = None
    accessKeyId: Optional[str] = None
    secretAccessKey: Optional[str] = None
    customMcpEndpoint: Optional[str] = None
