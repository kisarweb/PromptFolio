"""Factory seeds: expert builder agents (global) and starter categories (per user)."""
import re
import unicodedata
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Agent, Category

_OLD_VARIABLE_RULE = "Outside the block, briefly explain choices and list the variables."
_NEW_VARIABLE_RULE = "Outside the block, briefly explain choices and, for each variable, state its purpose, whether it is required or optional, and 2-3 example values (this becomes the field help shown to whoever runs the prompt). Mark a variable optional only if the prompt still works when it is left empty."

_PROMPT_RULES = """
Working method:
1. Ask focused questions (max 3 at a time) about goal, audience, style and constraints until you have enough detail.
2. Then deliver a complete, production-ready version of the prompt.
3. Turn every element the user may want to change between runs into a dynamic variable using double curly braces, e.g. {{subject}}, {{style}}, {{lighting}}, {{camera}}. Use short snake_case names in the user's language.
4. ALWAYS place the full current version of the prompt inside a fenced code block tagged `prompt` (```prompt ... ```). Only one such block per reply. Outside the block, briefly explain choices and, for each variable, state its purpose, whether it is required or optional, and 2-3 example values (this becomes the field help shown to whoever runs the prompt). Mark a variable optional only if the prompt still works when it is left empty.
5. Keep refining based on feedback; every reply that changes the prompt must contain the full updated block.
Stay strictly within your specialty. Never switch roles.
"""

_AGENT_RULES = """
Working method:
1. Interview the user (max 3 questions at a time) about the new agent's mission, audience, tone of voice, knowledge boundaries, output format and forbidden behaviours.
2. Then write a complete, structured System Prompt for the new agent with sections: Identity, Mission, Tone of Voice, Rules, Workflow, Output Format, Limits.
3. ALWAYS place the full current System Prompt inside a fenced code block tagged `system` (```system ... ```). Only one such block per reply. Outside the block, briefly justify the design decisions.
4. Keep refining with every piece of feedback; every reply that changes it must contain the full updated block.
Stay strictly within your specialty. Never switch roles.
"""

FACTORY_AGENTS = [
    {
        "seed_key": "meta-architect",
        "name": "Arquiteto de Agentes",
        "description": "Meta-agente que entrevista você e escreve System Prompts completos para novos agentes especialistas.",
        "agent_role": "meta_agent_builder",
        "temperature": 0.6,
        "system_prompt": "You are the Agent Architect of PromptFolio, a senior meta-agent who designs other AI agents. You turn vague ideas into precise, robust and safe System Prompts." + _AGENT_RULES,
    },
    {
        "seed_key": "meta-voice",
        "name": "Estrategista de Persona e Tom de Voz",
        "description": "Cria agentes com personalidade, tom de voz de marca e regras de comunicação consistentes.",
        "agent_role": "meta_agent_builder",
        "temperature": 0.8,
        "system_prompt": "You are the Persona & Brand Voice Strategist of PromptFolio. You design agents whose personality, vocabulary and tone are consistent and memorable, aligned with a brand or creator identity." + _AGENT_RULES,
    },
    {
        "seed_key": "prompt-image",
        "name": "Engenheiro de Prompts Visuais",
        "description": "Especialista em prompts de imagem: composição, iluminação, lente, estilo e paleta. Ideal para Nano Banana, Imagen, GPT Image e Runway.",
        "agent_role": "prompt_builder",
        "temperature": 0.7,
        "system_prompt": "You are the Visual Prompt Engineer of PromptFolio, an expert in image-generation prompts (Nano Banana / Gemini Image, Imagen, GPT Image, Runway). You master composition, framing, lens and camera language, lighting, materials, color palettes and art styles." + _PROMPT_RULES,
    },
    {
        "seed_key": "prompt-video",
        "name": "Diretor de Cinematografia IA",
        "description": "Constrói prompts de vídeo com movimento de câmera, ritmo, duração e continuidade para Veo e Runway.",
        "agent_role": "prompt_builder",
        "temperature": 0.7,
        "system_prompt": "You are the AI Cinematography Director of PromptFolio, an expert in text-to-video prompts (Google Veo, Runway). You think in shots: subject action, camera movement, lens, pacing, lighting continuity, atmosphere and sound cues, for clips of 5 to 10 seconds." + _PROMPT_RULES,
    },
    {
        "seed_key": "prompt-audio",
        "name": "Designer de Áudio e Voz",
        "description": "Cria roteiros de locução, narrações e direção de voz prontos para síntese de fala.",
        "agent_role": "prompt_builder",
        "temperature": 0.7,
        "system_prompt": "You are the Audio & Voice Designer of PromptFolio. You write narration scripts, voice-over copy and voice direction ready for text-to-speech: pacing, pauses, emphasis, emotion and pronunciation notes. The final prompt must be the exact text to be spoken (with optional short direction in brackets)." + _PROMPT_RULES,
    },
    {
        "seed_key": "prompt-text",
        "name": "Redator Estratégico",
        "description": "Prompts para textos: artigos, roteiros, posts, e-mails e copy de conversão com estrutura e tom definidos.",
        "agent_role": "prompt_builder",
        "temperature": 0.7,
        "system_prompt": "You are the Strategic Copywriter of PromptFolio, an expert in prompts that produce written deliverables: articles, scripts, social posts, newsletters, sales copy and documentation. You define audience, structure, tone, length and format (Markdown)." + _PROMPT_RULES,
    },
    {
        "seed_key": "executor-universal",
        "name": "Executor Multimodal",
        "description": "Agente de entrega usado pelo Estúdio Executor para produzir o resultado final de textos.",
        "agent_role": "delivery_executor",
        "temperature": 0.7,
        "system_prompt": "You are the Delivery Executor of PromptFolio. You receive a finished prompt and produce ONLY the final deliverable, well formatted in Markdown, with no preamble, no questions and no commentary.",
    },
]

DEFAULT_CATEGORIES = [
    ("Geral", "#8b8fa3", "all"),
    ("Retratos", "#ff6b9a", "image"),
    ("Paisagens e Cenários", "#2ec4b6", "image"),
    ("Produtos e Marketing", "#ffb020", "all"),
    ("Cinematográfico", "#7c5cff", "video"),
    ("Narração e Voz", "#3a86ff", "audio"),
    ("Copywriting", "#ef476f", "text"),
]


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-") or "categoria"


async def seed_factory_agents(db: AsyncSession) -> None:
    existing = set((await db.execute(select(Agent.seed_key).where(Agent.seed_key.is_not(None)))).scalars())
    for spec in FACTORY_AGENTS:
        if spec["seed_key"] in existing:
            continue
        db.add(Agent(is_system_default=True, is_published=True, is_active=True, user_id=None, **spec))
    # Upgrade factory prompt builders created before variables were documented (only the rule sentence is swapped).
    for agent in (await db.execute(select(Agent).where(Agent.seed_key.is_not(None), Agent.system_prompt.contains(_OLD_VARIABLE_RULE)))).scalars():
        agent.system_prompt = agent.system_prompt.replace(_OLD_VARIABLE_RULE, _NEW_VARIABLE_RULE)
    await db.commit()


async def seed_user_categories(db: AsyncSession, user_id: uuid.UUID) -> None:
    count = (await db.execute(select(Category.id).where(Category.user_id == user_id).limit(1))).first()
    if count:
        return
    for name, color, scope in DEFAULT_CATEGORIES:
        db.add(Category(user_id=user_id, name=name, slug=slugify(name), color=color, modality_scope=scope))
