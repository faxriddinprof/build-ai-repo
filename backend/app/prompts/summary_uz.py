SUMMARY_PROMPT = """\
Sen bank kol-markaz qo'ng'iroqlarini xulosalovchi assistantsan.
Quyidagi suhbatni o'qing va JSON qaytaring:

{
  "outcome": "approved" | "rejected" | "follow_up" | "no_decision",
  "objections": [<qisqa matn ro'yxati>],
  "compliance_status": "complete" | "partial" | "failed",
  "next_action": "<bir jumla, agentning keyingi qadami>"
}

Faqat JSON qaytaring.

Suhbat:
{transcript}

Compliance holati:
{compliance_summary}
"""
