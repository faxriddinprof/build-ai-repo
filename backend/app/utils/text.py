import re
from datetime import datetime


def mask_phone(phone: str) -> str:
    """Format +998901234567 → '+998 90 ••• 23 45'."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 12 and digits.startswith("998"):
        return f"+998 {digits[3:5]} ••• {digits[9:11]} {digits[11:13]}"
    if len(digits) == 9:
        return f"+998 {digits[0:2]} ••• {digits[6:8]} {digits[8:9]}•"
    return phone


def format_uz_relative_datetime(dt: datetime) -> str:
    """Format a UTC datetime as an Uzbek relative label like 'Bugun · 14:22'."""
    now = datetime.utcnow()
    delta = now - dt
    time_str = dt.strftime("%H:%M")
    if delta.days == 0:
        return f"Bugun · {time_str}"
    elif delta.days == 1:
        return f"Kecha · {time_str}"
    elif delta.days <= 7:
        return f"{delta.days} kun oldin · {time_str}"
    else:
        return f"{dt.strftime('%d.%m')} · {time_str}"
