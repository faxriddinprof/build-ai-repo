EXTRACTION_PROMPT = """\
Sen bank operatorining suhbatidan mijoz ma'lumotlarini ajratuvchi assistantsan.
Quyidagi suhbatdan FAQAT JSON formatda javob qaytar:

{{
  "customer_name": "<to'liq ism, agar aniqlanmagan bo'lsa null>",
  "customer_passport": "<passport raqami formatda AA1234567, agar aniqlanmagan null>",
  "customer_region": "<viloyat yoki shahar nomi, agar aniqlanmagan null>",
  "confidence": <0.0-1.0>
}}

Boshqa hech narsa yozma. Faqat JSON.

Suhbat:
{transcript}
"""
