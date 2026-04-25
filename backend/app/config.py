from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "ai-sales-assistant"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql+asyncpg://sales:sales@localhost:5432/sales"
    DB_POOL_SIZE: int = 10

    JWT_SECRET: str = "change_me_in_production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_TTL_HOURS: int = 8
    REFRESH_TOKEN_TTL_DAYS: int = 30

    LITELLM_BASE_URL: str = "http://litellm:4000"
    LITELLM_API_KEY: str = "sk-bank-internal-key"
    LLM_MODEL: str = "ollama/qwen3:8b-q4_K_M"
    EMBEDDING_MODEL: str = "ollama/bge-m3"
    LLM_MAX_TOKENS_SUGGESTION: int = 100
    LLM_MAX_TOKENS_EXTRACTION: int = 200
    LLM_MAX_TOKENS_SUMMARY: int = 400
    LLM_TIMEOUT_SECONDS: int = 5

    WHISPER_MODEL: str = "Kotib/uzbek_stt_v1"
    WHISPER_DEVICE: str = "cuda"
    WHISPER_COMPUTE_TYPE: str = "float16"
    WHISPER_BATCH_SIZE_REALTIME: int = 1   # used during live audio_ws streaming
    WHISPER_BATCH_SIZE_BATCH: int = 16     # used for offline/demo processing

    UPLOAD_DIR: str = "/app/uploads"
    MAX_PDF_SIZE_MB: int = 50

    CHUNK_SIZE_TOKENS: int = 500
    CHUNK_OVERLAP_TOKENS: int = 50

    # RAG retrieval
    RAG_FINAL_TOP_K: int = 5        # chunks passed to LLM prompt
    RAG_DENSE_TOP_K: int = 20       # dense (pgvector) candidates
    RAG_SPARSE_TOP_K: int = 20      # BM25 candidates
    BM25_K: int = 10                # BM25 retrieval k parameter
    RRF_K: int = 60                 # Reciprocal Rank Fusion constant
    EMBEDDING_DIM: int = 1024

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_BURST: int = 10

    EXTRACTION_WINDOW_SECONDS: int = 60
    EXTRACTION_CONFIDENCE_THRESHOLD: float = 0.8

    COMPLIANCE_PHRASES_PATH: str = "/app/app/data/compliance_phrases.json"
    COMPLIANCE_FUZZY_THRESHOLD: float = 85.0

    SENTIMENT_LLM_COOLDOWN_SECONDS: float = 5.0
    SENTIMENT_TURNS_WINDOW: int = 3
    SENTIMENT_SCORE_THRESHOLD: int = 2

    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ]

    ADMIN_EMAIL: str = "admin@bank.uz"
    ADMIN_PASSWORD: str = "changeme"

    class Config:
        env_file = ".env"


settings = Settings()
