from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from .. import ai
from ..auth import current_user
from ..crypto import decrypt_data, decrypt_str, encrypt_data, encrypt_str, mask
from ..db import get_db
from ..engines import engine_from_connection, user_connections
from ..models import Agent, McpConnection, Prompt, StorageConfig, User
from ..schemas import ActiveStorageInput, McpConnectionInput, McpConnectionUpdate, StorageConfigInput
from ..serializers import iso, mcp_out
from ..storage import MODALITY_FOLDERS, ROOT_FOLDER, get_config, test_provider
from .catalog import parse_uuid

router = APIRouter(prefix="/api/settings", tags=["settings"])

PROVIDERS = ("google_drive_mcp", "cloudflare_r2", "aws_s3")


# ------------------------------------------------------------------ MCP connectors
async def get_owned_conn(db: AsyncSession, user: User, conn_id: str) -> McpConnection:
    conn = await db.get(McpConnection, parse_uuid(conn_id))
    if not conn or conn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connection not found")
    return conn


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


@router.get("/mcp")
async def list_mcp(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return [mcp_out(c) for c in await user_connections(db, user)]


@router.post("/mcp", status_code=201)
async def create_mcp(body: McpConnectionInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    api_key = _clean(body.apiKey)
    if body.providerType != "custom_mcp" and not api_key:
        raise HTTPException(status_code=400, detail="API key is required for this provider")
    if body.providerType == "custom_mcp" and not _clean(body.endpointUrl):
        raise HTTPException(status_code=400, detail="Endpoint URL is required for a custom MCP server")
    headers = {k.strip(): v for k, v in (body.headers or {}).items() if k.strip()}
    conn = McpConnection(
        user_id=user.id,
        provider_type=body.providerType,
        name=body.name.strip(),
        connection_type=body.connectionType,
        endpoint_url=_clean(body.endpointUrl),
        encrypted_credentials=encrypt_data({"apiKey": api_key, "headers": headers}) if (api_key or headers) else None,
        masked_key=mask(api_key),
        header_names=list(headers.keys()),
        default_model=_clean(body.defaultModel),
        is_active=body.isActive if body.isActive is not None else True,
    )
    db.add(conn)
    await db.commit()
    return mcp_out(conn)


@router.patch("/mcp/{id}")
async def update_mcp(id: str, body: McpConnectionUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    conn = await get_owned_conn(db, user, id)
    fields = body.model_fields_set
    if "name" in fields and body.name:
        conn.name = body.name.strip()
    if "endpointUrl" in fields:
        conn.endpoint_url = _clean(body.endpointUrl)
    if "defaultModel" in fields:
        conn.default_model = _clean(body.defaultModel)
    if "isActive" in fields and body.isActive is not None:
        conn.is_active = body.isActive
    if ("apiKey" in fields and _clean(body.apiKey)) or "headers" in fields:
        creds = decrypt_data(conn.encrypted_credentials)
        if "apiKey" in fields and _clean(body.apiKey):
            creds["apiKey"] = _clean(body.apiKey)
            conn.masked_key = mask(creds["apiKey"])
        if "headers" in fields:
            creds["headers"] = {k.strip(): v for k, v in (body.headers or {}).items() if k.strip()}
            conn.header_names = list(creds["headers"].keys())
        conn.encrypted_credentials = encrypt_data(creds)
    await db.commit()
    return mcp_out(conn)


@router.delete("/mcp/{id}")
async def delete_mcp(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    conn = await get_owned_conn(db, user, id)
    await db.execute(update(Prompt).where(Prompt.preferred_mcp_id == conn.id).values(preferred_mcp_id=None))
    await db.execute(update(Agent).where(Agent.preferred_mcp_id == conn.id).values(preferred_mcp_id=None))
    await db.delete(conn)
    await db.commit()
    return {"ok": True}


@router.post("/mcp/{id}/test")
async def test_mcp(id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    conn = await get_owned_conn(db, user, id)
    if conn.provider_type != "custom_mcp" and not conn.encrypted_credentials:
        return {"ok": False, "message": "No API key saved", "detail": None, "remoteViewUrl": None}
    ok, message, detail = await ai.test_engine(engine_from_connection(conn))
    return {"ok": ok, "message": message, "detail": detail, "remoteViewUrl": None}


# ------------------------------------------------------------------ storage
def _s3_out(cfg: StorageConfig | None) -> dict:
    if cfg is None:
        return {"isConfigured": False, "hasAccessKey": False, "hasSecretKey": False}
    return {
        "isConfigured": cfg.is_configured,
        "endpointUrl": cfg.endpoint_url,
        "bucketName": cfg.bucket_name,
        "region": cfg.region,
        "publicUrlPrefix": cfg.public_url_prefix,
        "hasAccessKey": bool(cfg.encrypted_access_key),
        "hasSecretKey": bool(cfg.encrypted_secret_key),
        "maskedAccessKey": mask(decrypt_str(cfg.encrypted_access_key)),
        "updatedAt": iso(cfg.updated_at),
    }


async def storage_overview(db: AsyncSession, user: User) -> dict:
    drive = await get_config(db, user, "google_drive_mcp")
    linked = bool(user.encrypted_google_access_token)
    root_id = drive.drive_root_folder_id if drive else None
    return {
        "activeProvider": user.active_storage_provider,
        "googleDrive": {
            "isConfigured": True,
            "linkedViaLogin": linked,
            "accountEmail": user.email if linked else None,
            "rootFolderPath": f"/{ROOT_FOLDER}",
            "rootFolderId": root_id,
            "rootFolderUrl": f"https://drive.google.com/drive/folders/{root_id}" if root_id else None,
            "folderStructure": [f"/{ROOT_FOLDER}/{f}" for f in [*MODALITY_FOLDERS.values(), "Backups"]],
            "customMcpEndpoint": drive.custom_mcp_endpoint if drive else None,
            "isDemoSimulated": user.is_demo and not linked,
            "updatedAt": iso(drive.updated_at) if drive else None,
        },
        "cloudflareR2": _s3_out(await get_config(db, user, "cloudflare_r2")),
        "awsS3": _s3_out(await get_config(db, user, "aws_s3")),
    }


@router.get("/storage")
async def get_storage(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    return await storage_overview(db, user)


@router.put("/storage/active")
async def set_active_storage(body: ActiveStorageInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if body.provider != "google_drive_mcp":
        cfg = await get_config(db, user, body.provider)
        if cfg is None or not cfg.is_configured:
            raise HTTPException(status_code=400, detail="Configure and test this provider before activating it")
    user.active_storage_provider = body.provider
    await db.commit()
    return await storage_overview(db, user)


@router.put("/storage/{provider}")
async def save_storage(provider: str, body: StorageConfigInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail="Unknown provider")
    cfg = await get_config(db, user, provider)
    if cfg is None:
        cfg = StorageConfig(user_id=user.id, provider=provider, is_default=False, drive_folder_cache={})
        db.add(cfg)
    fields = body.model_fields_set
    if provider == "google_drive_mcp":
        if "customMcpEndpoint" in fields:
            cfg.custom_mcp_endpoint = _clean(body.customMcpEndpoint)
        await db.commit()
        return await storage_overview(db, user)
    if "endpointUrl" in fields:
        cfg.endpoint_url = _clean(body.endpointUrl)
    if "bucketName" in fields:
        cfg.bucket_name = _clean(body.bucketName)
    if "region" in fields:
        cfg.region = _clean(body.region)
    if "publicUrlPrefix" in fields:
        cfg.public_url_prefix = _clean(body.publicUrlPrefix)
    if _clean(body.accessKeyId):
        cfg.encrypted_access_key = encrypt_str(_clean(body.accessKeyId))
    if _clean(body.secretAccessKey):
        cfg.encrypted_secret_key = encrypt_str(_clean(body.secretAccessKey))
    # Credentials only count as configured after a successful write test (see test_provider).
    cfg.is_configured = False
    await db.commit()
    return await storage_overview(db, user)


@router.post("/storage/{provider}/test")
async def test_storage(provider: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=400, detail="Unknown provider")
    return await test_provider(db, user, provider)
