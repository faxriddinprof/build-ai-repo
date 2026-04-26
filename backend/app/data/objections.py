from typing import Optional

# keyword (lowercase) → display label shown in FE trigger quote and supervisor top_objection
OBJECTION_KEYWORDS: dict[str, str] = {
    # Price objections
    "qimmat": "Yuqori foiz",
    "дорого": "Yuqori foiz",
    "baha": "Yuqori foiz",
    "narx": "Yuqori foiz",
    "foiz": "Yuqori foiz",
    "процент": "Yuqori foiz",
    "stavka": "Yuqori foiz",
    # Hesitation
    "o'ylab": "Shubha / Qaror kechiktirildi",
    "ойлаб": "Shubha / Qaror kechiktirildi",
    "подумать": "Shubha / Qaror kechiktirildi",
    "keyinroq": "Shubha / Qaror kechiktirildi",
    "later": "Shubha / Qaror kechiktirildi",
    "keyin": "Shubha / Qaror kechiktirildi",
    "qaror": "Shubha / Qaror kechiktirildi",
    # Commission/fee
    "komissiya": "Komissiya",
    "комиссия": "Komissiya",
    "to'lov": "Komissiya",
    "haq": "Komissiya",
    "оплата": "Komissiya",
    # Documents/application
    "hujjat": "Hujjatlar",
    "документ": "Hujjatlar",
    "ariza": "Ariza muddati",
    "muddati": "Ariza muddati",
    # Credit limit
    "limit": "Kredit limiti",
    "сумма": "Kredit limiti",
    "miqdor": "Kredit limiti",
    # Cashback
    "cashback": "Cashback shartlari",
    "кэшбэк": "Cashback shartlari",
    "bonus": "Cashback shartlari",
    # Competition
    "boshqa bank": "Raqobat",
    "другой банк": "Raqobat",
    "boshqalar": "Raqobat",
}


def match_objection(text: str) -> Optional[tuple[str, str]]:
    """Return (keyword, label) for the first matching objection keyword, else None."""
    lower = text.lower()
    for kw, label in OBJECTION_KEYWORDS.items():
        if kw in lower:
            return kw, label
    return None
