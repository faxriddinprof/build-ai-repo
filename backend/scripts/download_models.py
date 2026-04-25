"""
Download all ML models required by the stack.

Usage (from project root):
    # Pull Ollama models (LLM + embeddings)
    docker compose exec ollama python /dev/stdin < backend/scripts/download_models.py

    Or use the Makefile shortcut:
    make models-pull

Models downloaded:
  ollama:
    - qwen3:8b-q4_K_M   LLM inference          ~5 GB
    - bge-m3             Dense embeddings 1024d ~1.2 GB

  faster-whisper (HuggingFace, cached inside api container):
    - tiny               Dev/CI testing          ~75 MB
    - Kotib/uzbek_stt_v1 Production Uzbek STT  ~1.5 GB (needs CTranslate2 conversion)

  To convert Kotib/uzbek_stt_v1 for faster-whisper:
    docker compose exec api python scripts/convert_stt_model.py
    Then set WHISPER_MODEL=/app/models/uzbek_stt_v1_ct2 in .env
"""
import subprocess
import sys


OLLAMA_MODELS = [
    "qwen3:8b-q4_K_M",
    "bge-m3",
]

WHISPER_MODELS = [
    "tiny",                  # dev/testing
    # "Kotib/uzbek_stt_v1",  # production — needs conversion, see convert_stt_model.py
]


def pull_ollama_models():
    print("=== Pulling Ollama models ===")
    for model in OLLAMA_MODELS:
        print(f"\nPulling {model} ...")
        result = subprocess.run(["ollama", "pull", model], check=False)
        if result.returncode != 0:
            print(f"  WARNING: failed to pull {model}")
        else:
            print(f"  OK: {model}")


def download_whisper_models():
    print("\n=== Pre-downloading Whisper models ===")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper not installed, skipping whisper model download")
        return

    for model_id in WHISPER_MODELS:
        print(f"\nDownloading {model_id} ...")
        try:
            WhisperModel(model_id, device="cpu", compute_type="int8")
            print(f"  OK: {model_id} cached")
        except Exception as e:
            print(f"  WARNING: {e}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "all"

    if mode in ("all", "ollama"):
        pull_ollama_models()

    if mode in ("all", "whisper"):
        download_whisper_models()

    print("\nDone. Run 'make models-pull' to pull Ollama models via Docker Compose.")
