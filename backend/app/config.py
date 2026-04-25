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
    LLM_MODEL: str = "ollama/qwen3:8b-q4_K_M"
    EMBEDDING_MODEL: str = "ollama/bge-m3"
    LLM_MAX_TOKENS_SUGGESTION: int = 100
    LLM_MAX_TOKENS_EXTRACTION: int = 200
    LLM_MAX_TOKENS_SUMMARY: int = 400
    LLM_TIMEOUT_SECONDS: int = 5

    WHISPER_MODEL: str = "large-v3"
    WHISPER_DEVICE: str = "cuda"
    WHISPER_COMPUTE_TYPE: str = "float16"
    WHISPER_BATCH_SIZE: int = 16

    UPLOAD_DIR: str = "/app/uploads"
    MAX_PDF_SIZE_MB: int = 50

    CHUNK_SIZE_TOKENS: int = 500
    CHUNK_OVERLAP_TOKENS: int = 50
    RAG_TOP_K: int = 5
    RAG_DENSE_CANDIDATES: int = 20
    RAG_SPARSE_CANDIDATES: int = 20
    RRF_K: int = 60
    EMBEDDING_DIM: int = 1024

    EXTRACTION_WINDOW_SECONDS: int = 60
    EXTRACTION_CONFIDENCE_THRESHOLD: float = 0.8

    COMPLIANCE_PHRASES_PATH: str = "/app/app/data/compliance_phrases.json"

    class Config:
        env_file = ".env"


settings = Settings()
