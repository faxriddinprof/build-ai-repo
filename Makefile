.PHONY: help up down infra api logs ps \
        migrate seed \
        models-pull \
        test test-v test-file \
        health login \
        lint \
        clean reset

# ── defaults ──────────────────────────────────────────────────────────────────
COMPOSE        := docker compose
API_SVC        := api
BACKEND        := backend
ENV_FILE       := backend/.env
TEST_DB_URL    := postgresql+asyncpg://sales:sales@localhost:5432/sales_test
JWT_TEST       := test_secret

help:           ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── infrastructure ────────────────────────────────────────────────────────────
infra:          ## Start postgres + ollama + litellm (background)
	$(COMPOSE) up postgres ollama litellm -d

api:            ## Start only the API container (foreground)
	$(COMPOSE) up $(API_SVC)

build:          ## Build/rebuild all containers
	$(COMPOSE) build

up:             ## Start full stack — all services (background, CPU mode)
	$(COMPOSE) up --remove-orphans

up-gpu:         ## Start full stack with NVIDIA GPU (Windows RTX server)
	$(COMPOSE) -f docker-compose.yml -f docker-compose.gpu.yml up -d

down:           ## Stop and remove all containers
	$(COMPOSE) down

logs:           ## Tail API logs
	$(COMPOSE) logs -f $(API_SVC)

ps:             ## Show container status and health
	$(COMPOSE) ps

# ── first-time setup ──────────────────────────────────────────────────────────
env:            ## Copy .env.example → .env (skip if exists)
	@test -f $(ENV_FILE) && echo ".env already exists, skipping" || cp backend/.env.example $(ENV_FILE)

models-pull:    ## Pull Ollama models (LLM + embeddings) into ollama container
	$(COMPOSE) exec ollama ollama pull qwen3:8b-q4_K_M
	$(COMPOSE) exec ollama ollama pull bge-m3

models-whisper: ## Pre-download whisper tiny model into api container cache
	$(COMPOSE) exec $(API_SVC) python scripts/download_models.py whisper

convert-stt:    ## Convert Kotib/uzbek_stt_v1 → CTranslate2 format for faster-whisper
	$(COMPOSE) exec $(API_SVC) python scripts/convert_stt_model.py

migrate:        ## Run Alembic migrations (postgres must be healthy)
	$(COMPOSE) exec $(API_SVC) alembic upgrade head

seed:           ## Create the initial admin user
	$(COMPOSE) exec $(API_SVC) python scripts/seed_admin.py

setup: infra    ## Full first-time setup: infra → wait → migrate → seed
	@echo "Waiting for services to be healthy..."
	@sleep 15
	$(MAKE) migrate
	$(MAKE) seed
	@echo "Done. Run 'make api' to start the API."

# ── development ───────────────────────────────────────────────────────────────
test:           ## Run all tests (postgres must be running on :5432)
	cd $(BACKEND) && \
	  DATABASE_URL=$(TEST_DB_URL) JWT_SECRET=$(JWT_TEST) \
	  pytest -q

test-v:         ## Run tests with verbose output
	cd $(BACKEND) && \
	  DATABASE_URL=$(TEST_DB_URL) JWT_SECRET=$(JWT_TEST) \
	  pytest -v

test-file:      ## Run a single test file — usage: make test-file F=tests/test_auth.py
	cd $(BACKEND) && \
	  DATABASE_URL=$(TEST_DB_URL) JWT_SECRET=$(JWT_TEST) \
	  pytest $(F) -v

lint:           ## Type-check with mypy (install mypy separately if needed)
	cd $(BACKEND) && python -m mypy app --ignore-missing-imports

shell:          ## Open a Python shell inside the API container
	$(COMPOSE) exec $(API_SVC) python

bash:           ## Open a bash shell inside the API container
	$(COMPOSE) exec $(API_SVC) bash

# ── quick verification ────────────────────────────────────────────────────────
health:         ## Hit /healthz and pretty-print the response
	@curl -s http://localhost:8000/healthz | python3 -m json.tool

login:          ## Login with admin credentials and print the access token
	@curl -s -X POST http://localhost:8000/api/auth/login \
	  -H 'Content-Type: application/json' \
	  -d '{"email":"admin@bank.uz","password":"changeme"}' \
	  | python3 -m json.tool

litellm-health: ## Check LiteLLM proxy health
	@curl -s http://localhost:4000/health | python3 -m json.tool

litellm-models: ## List models registered with LiteLLM
	@curl -s http://localhost:4000/v1/models \
	  -H "Authorization: Bearer sk-litellm-local" | python3 -m json.tool

ollama-models:  ## List models pulled into Ollama
	@curl -s http://localhost:11434/api/tags | python3 -m json.tool

# ── maintenance ───────────────────────────────────────────────────────────────
clean:          ## Remove __pycache__ and .pyc files from backend
	find $(BACKEND) -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find $(BACKEND) -name "*.pyc" -delete 2>/dev/null || true

reset:          ## ⚠ Destroy all containers AND volumes (wipes DB + model cache)
	@echo "WARNING: This will delete all data including the postgres database and ollama model cache."
	@read -p "Type 'yes' to confirm: " confirm && [ "$$confirm" = "yes" ] || exit 1
	$(COMPOSE) down -v
