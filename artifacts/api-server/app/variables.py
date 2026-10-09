"""Prompt variable documentation (purpose, examples, required/optional, allowed options) and run-time validation."""
import json
import logging
from typing import Any

from fastapi import HTTPException

from . import ai
from .serializers import VARIABLE_RE, detect_variables, normalize_variable

log = logging.getLogger(__name__)

def is_required(v: dict[str, Any]) -> bool:
    return v.get("required") is not False


async def suggest_docs(engine: "ai.Engine", template: str, language: str, existing: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """Ask the fast model to document every {{variable}} of a prompt. Existing non-empty fields win."""
    names = detect_variables(template)
    by_name = {v.get("name"): v for v in (existing or []) if v.get("name")}
    if not names:
        return []
    lang = ai.LANGUAGE_NAMES.get(language, "English")
    system = (
        "You document the input fields of a reusable AI prompt template for the people who will fill them in. "
        "Answer ONLY with a JSON object {\"variables\": [...]} containing one entry per variable name given, in the same order, each with keys: "
        "\"name\" (exactly as given), "
        "\"label\" (short human field label, max 40 chars), "
        "\"helpText\" (2-4 sentences: what the field is for, how it affects the result, what makes a good value and what to avoid), "
        "\"examples\" (2-3 realistic, concrete example values that could be pasted as-is), "
        "\"required\" (true if the result is broken or meaningless without it; false if the prompt works with it empty or the template states a default for it), "
        "\"options\" (array of allowed values ONLY when any other value would break the prompt, e.g. an aspect ratio used in a --ar parameter; if the template merely lists examples, use []), "
        "\"defaultValue\" (a default value ONLY if the template explicitly states one for that field; otherwise null). "
        "If the template itself labels fields as mandatory/optional (e.g. 'CAMPOS OBRIGATÓRIOS' / 'CAMPOS OPCIONAIS'), follow it exactly. "
        f"Write label, helpText and examples in {lang}."
    )
    user = f"Variable names: {json.dumps(names, ensure_ascii=False)}\n\nPrompt template:\n{template[:12000]}"
    suggested: dict[str, dict[str, Any]] = {}
    try:
        data = json.loads(await ai.json_complete(engine, system, user))
        for item in data.get("variables") or []:
            if isinstance(item, dict) and item.get("name") in names:
                suggested[item["name"]] = item
    except ai.EngineError as exc:
        raise HTTPException(status_code=exc.status if exc.code else 502, detail=exc.localized(language) if exc.code else f"AI engine error: {exc.message}")
    except Exception as exc:
        log.exception("variable documentation suggestion failed")
        raise HTTPException(status_code=502, detail=f"Could not generate field documentation right now: {str(exc)[:200]}")

    result = []
    for name in names:
        cur = by_name.get(name, {})
        sug = suggested.get(name, {})
        merged: dict[str, Any] = {}
        for key in ("label", "helpText", "description", "defaultValue"):
            keep = cur.get(key)
            # A label equal to the raw variable name is the old placeholder: replace it.
            if key == "label" and keep == name:
                keep = None
            merged[key] = keep if (isinstance(keep, str) and keep.strip()) else sug.get(key)
        merged["examples"] = cur.get("examples") or sug.get("examples")
        merged["options"] = cur.get("options") or sug.get("options")
        # Documented fields keep the author's choice; undocumented (legacy) ones take the suggestion.
        merged["required"] = cur.get("required") if cur.get("helpText") else sug.get("required")
        result.append(normalize_variable(name, merged))
    return result


def validate_and_fill(template: str, variables: list[dict], values: dict[str, str], forced: dict[str, str] | None = None) -> str:
    """Substitute {{vars}}; required fields must be filled and option fields must hold an allowed value.

    `forced` values (the brand reference text) always win and are validated by the caller."""
    schema = {v["name"]: v for v in variables if v.get("name")}
    forced = forced or {}
    missing: list[str] = []
    invalid: list[str] = []
    resolved: dict[str, str] = {}

    for name in detect_variables(template):
        if name in forced:
            resolved[name] = forced[name]
            continue
        v = schema.get(name, {"name": name})
        value = (values.get(name) or "").strip() or (v.get("defaultValue") or "").strip()
        label = v.get("label") or name
        if not value:
            if is_required(v):
                missing.append(label)
            resolved[name] = ""
            continue
        options = v.get("options") or []
        if options and value not in options:
            invalid.append(f"{label} ({' / '.join(options)})")
        resolved[name] = value

    errors = []
    if missing:
        errors.append("Fill in the required fields: " + ", ".join(missing))
    if invalid:
        errors.append("Choose an allowed value for: " + "; ".join(invalid))
    if errors:
        raise HTTPException(status_code=400, detail=". ".join(errors))
    return VARIABLE_RE.sub(lambda m: resolved.get(m.group(1).strip(), ""), template)
