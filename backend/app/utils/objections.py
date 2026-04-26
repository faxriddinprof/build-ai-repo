from collections import Counter
from typing import Optional


def top_objection_label(state: dict) -> Optional[str]:
    """Return the most-frequently matched objection label for a call state dict."""
    hits = state.get("objection_hits", [])
    if not hits:
        return None
    return Counter(hits).most_common(1)[0][0]
