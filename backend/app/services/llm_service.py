import re
from typing import AsyncIterator, Union

import structlog
from litellm import acompletion

from app.config import settings
from app.prompts.system_uz import SYSTEM_PROMPT, SUGGESTION_TEMPLATE

log = structlog.get_logger()

_UZ_CHARS = re.compile(r"[a-zA-ZʻʼO'o'g'G'qQXx]")  # Uzbek latin uses these


def _looks_uzbek(text: str) -> bool:
    """Heuristic: text contains Uzbek-specific chars or common Uzbek words."""
    uz_words = {"va", "bu", "bir", "emas", "bilan", "uchun", "ham", "lekin", "yoki"}
    words = set(text.lower().split())
    if words & uz_words:
        return True
    # Fallback: not purely Cyrillic (Russian) or English
    cyrillic = sum(1 for c in text if "Ѐ" <= c <= "ӿ")
    latin = sum(1 for c in text if c.isascii() and c.isalpha())
    return cyrillic == 0 or (latin > cyrillic)


async def chat(
    *,
    messages: list[dict],
    max_tokens: int,
    temperature: float = 0.3,
    timeout: float | None = None,
    stream: bool = False,
) -> Union[str, AsyncIterator[str]]:
    timeout = timeout or float(settings.LLM_TIMEOUT_SECONDS)
    resp = await acompletion(
        model=settings.LLM_MODEL,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        stream=stream,
        api_base=settings.LITELLM_BASE_URL,
        timeout=timeout,
    )
    if stream:
        return resp  # caller iterates
    return resp.choices[0].message.content or ""


async def get_suggestion(
    customer_text: str,
    rag_context: str = "",
) -> AsyncIterator[str]:
    """Stream suggestion tokens. Returns empty if language assertion fails twice."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": SUGGESTION_TEMPLATE.format(
            customer_text=customer_text,
            rag_context=rag_context or "Mavjud emas.",
        )},
    ]

    for attempt in range(2):
        collected: list[str] = []
        stream = await acompletion(
            model=settings.LLM_MODEL,
            messages=messages,
            max_tokens=settings.LLM_MAX_TOKENS_SUGGESTION,
            temperature=0.3,
            stream=True,
            api_base=settings.LITELLM_BASE_URL,
            timeout=float(settings.LLM_TIMEOUT_SECONDS),
        )
        async for chunk in stream:
            token = chunk.choices[0].delta.content or ""
            if token:
                collected.append(token)
                yield token

        full = "".join(collected)
        if _looks_uzbek(full):
            return

        # Non-Uzbek output — retry with explicit reminder
        log.warning("llm.non_uzbek_output", attempt=attempt, text=full[:80])
        if attempt == 0:
            messages.append({"role": "assistant", "content": full})
            messages.append({"role": "user", "content": "FAQAT O'ZBEK TILIDA javob ber."})
        else:
            log.error("llm.language_enforcement_failed")
            return


async def warmup() -> None:
    import time
    t0 = time.monotonic()
    try:
        await chat(
            messages=[{"role": "user", "content": "salom"}],
            max_tokens=1,
            timeout=30.0,
        )
        log.info("llm.warmup_done", latency_ms=int((time.monotonic() - t0) * 1000))
    except Exception as e:
        log.warning("llm.warmup_failed", error=str(e))
