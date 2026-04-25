"""
Convert Kotib/uzbek_stt_v1 (PyTorch/HF Whisper) → CTranslate2 format
required by faster-whisper.

Run once inside the api container:
    docker compose exec api python scripts/convert_stt_model.py

Output is written to /app/models/uzbek_stt_v1_ct2/ and persists via
the uploads volume. Set in .env:
    WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2
"""
import subprocess
import sys
from pathlib import Path


HF_MODEL = "Kotib/uzbek_stt_v1"
OUTPUT_DIR = Path("/app/models/uzbek_stt_v1_ct2")


def main():
    if OUTPUT_DIR.exists() and (OUTPUT_DIR / "model.bin").exists():
        print(f"Already converted: {OUTPUT_DIR}")
        return

    OUTPUT_DIR.parent.mkdir(parents=True, exist_ok=True)

    print(f"Converting {HF_MODEL} → {OUTPUT_DIR} ...")
    result = subprocess.run(
        [
            sys.executable, "-m", "ctranslate2.converters.whisper",
            "--model", HF_MODEL,
            "--output_dir", str(OUTPUT_DIR),
            "--quantization", "int8",
            "--force",
        ],
        check=False,
    )

    if result.returncode != 0:
        # Try the CLI tool directly
        result = subprocess.run(
            ["ct2-whisper-converter",
             "--model", HF_MODEL,
             "--output_dir", str(OUTPUT_DIR),
             "--quantization", "int8",
             "--force"],
            check=False,
        )

    if result.returncode == 0:
        print(f"Conversion complete: {OUTPUT_DIR}")
        print(f"Set in .env: WHISPER_MODEL={OUTPUT_DIR}")
    else:
        print("Conversion failed. Check that ctranslate2 is installed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
