import re
from typing import AsyncIterator, Optional, Union

import structlog
from app.config import settings
from app.prompts.system_uz import SUGGESTION_TEMPLATE, SYSTEM_PROMPT
from litellm import acompletion

log = structlog.get_logger()

_UZ_WORDS = {
    "va",
    "bu",
    "bir",
    "emas",
    "bilan",
    "uchun",
    "ham",
    "lekin",
    "yoki",
    "foiz",
    "kredit",
    "karta",
    "omonat",
    "stavka",
    "muddat",
    "balans",
    "yillik",
    "oylik",
    "qarz",
    "tolov",
    "bank",
    "mijoz",
    "agent",
    "hisobvaraq",
    "valyuta",
    "depozit",
    "ipoteka",
    "overdraft",
    "taklif",
    "javob",
    "qiymat",
    "narx",
    "chegirma",
    "ruxsat",
}
_UZ_SPECIFIC_CHARS = re.compile(r"[ʻʼO'o'g'G'ʻʼ]|sh|ch|ng", re.IGNORECASE)


def _looks_uzbek(text: str) -> bool:
    """Heuristic: text contains known Uzbek words or Uzbek-specific char patterns."""
    words = set(text.lower().split())
    if words & _UZ_WORDS:
        return True
    if _UZ_SPECIFIC_CHARS.search(text):
        return True
    # Check for Cyrillic (Russian) — if present and no Uzbek markers, not Uzbek
    cyrillic_count = sum(1 for c in text if "Ѐ" <= c <= "ӿ")
    if cyrillic_count > 5:
        return False
    # Short or numeric-only outputs are ambiguous — treat as non-Uzbek
    alpha_words = [w for w in words if w.isalpha()]
    return False  # no Uzbek markers found


async def chat(
    *,
    messages: list[dict],
    max_tokens: int,
    temperature: float = 0.3,
    timeout: Optional[float] = None,
    stream: bool = False,
) -> Union[str, AsyncIterator[str]]:
    timeout = timeout or float(settings.LLM_TIMEOUT_SECONDS)
    resp = await acompletion(
        model=settings.LLM_MODEL,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        stream=stream,
        api_base=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
        timeout=timeout,
    )
    if stream:
        return resp  # caller iterates
    return resp.choices[0].message.content or ""


async def get_suggestion(
    customer_text: str,
    rag_context: str = "",
    client_facts: str = "",
) -> AsyncIterator[str]:
    """Stream suggestion tokens. Returns empty if language assertion fails twice."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": SUGGESTION_TEMPLATE.format(
                client_facts=client_facts,
                customer_text=customer_text,
                rag_context=rag_context or "Mavjud emas.",
            ),
        },
    ]

    for attempt in range(2):
        collected: list[str] = []
        stream = await acompletion(
            model=settings.LLM_MODEL,
            messages=messages,
            max_tokens=settings.LLM_MAX_TOKENS_SUGGESTION,
            temperature=0.3,
            stream=True,
            api_base=settings.LLM_BASE_URL,
            api_key=settings.LLM_API_KEY,
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
            messages.append(
                {"role": "user", "content": "FAQAT O'ZBEK TILIDA javob ber."}
            )
        else:
            log.error("llm.language_enforcement_failed")
            return


async def get_agent_answer(
    customer_text: str,
    rag_context: str,
    client_facts: str,
) -> AsyncIterator[str]:
    """Return a full Uzbek agent answer as a single yielded string (non-streaming to avoid
    litellm+Ollama thinking-token bug with qwen3 streaming mode)."""
    from app.prompts.system_uz import AGENT_ANSWER_PROMPT

    prompt = AGENT_ANSWER_PROMPT.format(
        client_facts=client_facts or "Mavjud emas.",
        rag_context=rag_context or "Mavjud emas.",
        customer_text=customer_text,
    )

    for attempt in range(2):
        try:
            full = await chat(
                messages=[
                    {"role": "system", "content": "/no_think"},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=300,
                temperature=0.4,
                timeout=float(settings.LLM_TIMEOUT_SECONDS),
            )
        except Exception as e:
            log.error("agent_answer.llm_error", error=str(e), attempt=attempt)
            if attempt == 0:
                continue
            return

        full = str(full).strip()
        if full and (_looks_uzbek(full) or attempt == 1):
            yield full
            return
        log.warning("agent_answer.not_uzbek_retry", attempt=attempt, text=full[:80])


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
