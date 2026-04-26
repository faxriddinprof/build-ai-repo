SUMMARY_PROMPT = """\
You are an assistant that summarizes bank call center conversations in Uzbek.
Read the conversation and compliance data below. Return ONLY valid JSON — no extra text.
You are an assistant that summarizes bank call center conversations.
Read the conversation below and return ONLY valid JSON. No extra text. /no_think

{{
  "natija": "<one short Uzbek sentence: what was the call outcome for the customer>",
  "etirozlar": ["<brief UZ description of objection 1>", ...],
  "etirozlarBartaraf": "<one Uzbek sentence: how the agent resolved the objections, or 'E'tirozlar bartaraf etilmadi'>",
  "keyingiQadam": "<one Uzbek sentence: agent's next concrete step>",
  "outcome": "won" | "lost" | "callback",
  "complianceHolati": {{
    "passed": <integer: how many compliance items were completed>,
    "total": <integer: total compliance items expected (use {total_compliance})>
  }}
}}

Rules:
- outcome "won" = customer agreed / will proceed, "lost" = declined, "callback" = needs follow-up
- Write natija, etirozlarBartaraf, keyingiQadam in Uzbek (Latin script)
- If there are no objections write etirozlar as []

Conversation:
{transcript}

Compliance status ({total_compliance} items expected):
{compliance_summary}
"""
