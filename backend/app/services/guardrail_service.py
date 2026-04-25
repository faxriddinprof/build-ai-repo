import re

BANK_TOPICS: set[str] = {
    # Uzbek
    "kredit", "karta", "omonat", "lizing", "sug'urta", "sugurta",
    "foiz", "stavka", "to'lov", "tolov", "muddat", "limit",
    "overdraft", "ipoteka", "depozit", "valyuta",
    "hisobvaraq", "o'tkazma", "otkazma", "balans", "qarz",
    # English (commonly used in UZ banking)
    "loan", "credit", "deposit", "payment", "card",
    # Russian
    "кредит", "карта", "депозит", "платёж", "платеж",
    "ставка", "вклад", "лизинг", "ипотека", "овердрафт",
    "баланс", "перевод", "валюта",
}

_TOKEN_RE = re.compile(r"[^\w']+", re.UNICODE)


def _tokenize(text: str) -> list[str]:
    """Split on non-word chars, preserve apostrophes (so `to'lov` stays one token)."""
    return [t for t in _TOKEN_RE.split(text.lower()) if t]


def is_bank_related(text: str) -> bool:
    tokens = set(_tokenize(text))
    return bool(tokens & BANK_TOPICS)
