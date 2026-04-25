import pytest
from app.services.guardrail_service import is_bank_related


@pytest.mark.parametrize("text,expected", [
    # Bank phrases — must pass
    ("kredit foizi qancha?", True),
    ("karta limiti qanday oshiriladi?", True),
    ("omonat muddati necha oy?", True),
    ("foiz stavkangiz qimmat", True),
    ("Men depozit ochmoqchiman", True),
    ("to'lov muddati qachon?", True),          # apostrophe preserved
    ("кредит оформить хочу", True),            # Russian
    ("платёж не прошёл", True),
    ("loan application status", True),
    # Non-bank — must drop
    ("ob-havo qanday?", False),
    ("menga she'r yoz", False),
    ("Python nima?", False),
    ("salom, qalaysiz?", False),
    ("Bugun bozorga boraman", False),
    # Mixed — bank keyword present → pass
    ("salom, kredit haqida so'ramoqchiman", True),
])
def test_guardrail(text, expected):
    assert is_bank_related(text) == expected
