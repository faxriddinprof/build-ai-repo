"""
Convert Kotib/uzbek_stt_v1 (HF Whisper) → CTranslate2 format for faster-whisper.

Run once inside the api container after `transformers` and `torch` are installed:
    docker compose exec api pip install --no-cache-dir \
        --extra-index-url https://download.pytorch.org/whl/cpu torch transformers
    docker compose exec api python scripts/convert_stt_model.py

Output is written to /app/models/uzbek_stt_v1_ct2/ and persists via the
whisper_models named volume. Set in backend/.env:
    WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
"""
import subprocess
import sys
from pathlib import Path


HF_MODEL = "Kotib/uzbek_stt_v1"
OUTPUT_DIR = Path("/app/models/uzbek_stt_v1_ct2")
COPY_FILES = [
    "preprocessor_config.json",
    "tokenizer_config.json",
    "vocab.json",
    "merges.txt",
    "special_tokens_map.json",
    "normalizer.json",
    "added_tokens.json",
]


def main():
    if OUTPUT_DIR.exists() and (OUTPUT_DIR / "model.bin").exists():
        print(f"Already converted: {OUTPUT_DIR}")
        return

    OUTPUT_DIR.parent.mkdir(parents=True, exist_ok=True)

    print(f"Converting {HF_MODEL} → {OUTPUT_DIR} ...")
    cmd = [
        "ct2-transformers-converter",
        "--model", HF_MODEL,
        "--output_dir", str(OUTPUT_DIR),
        "--quantization", "int8",
        "--copy_files", *COPY_FILES,
        "--force",
    ]
    result = subprocess.run(cmd, check=False)

    if result.returncode == 0:
        print(f"Conversion complete: {OUTPUT_DIR}")
        print(f"Set in .env: WHISPER_MODEL={OUTPUT_DIR}")
    else:
        print("Conversion failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
