import re


def mask_phone(phone: str) -> str:
    """Format +998901234567 → '+998 90 ••• 23 45'."""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 12 and digits.startswith("998"):
        return f"+998 {digits[3:5]} ••• {digits[9:11]} {digits[11:13]}"
    if len(digits) == 9:
        return f"+998 {digits[0:2]} ••• {digits[6:8]} {digits[8:9]}•"
    return phone
