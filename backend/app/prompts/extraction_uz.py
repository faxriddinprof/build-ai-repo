EXTRACTION_PROMPT = """\
You are an assistant that extracts customer information from a bank operator conversation.
Return ONLY valid JSON in the format below. No extra text, no explanation.

{{
  "customer_name": "<full name, or null if not found>",
  "customer_passport": "<passport number in format AA1234567, or null if not found>",
  "customer_region": "<province or city name, or null if not found>",
  "confidence": <float 0.0-1.0>
}}

Conversation:
{transcript}
"""
