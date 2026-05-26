import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from project root .env
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Feature flags
TEST_MODE = os.getenv("TEST_MODE", "false").lower() == "true"
DEVELOPMENT_MODE = os.getenv("DEVELOPMENT_MODE", "false").lower() == "true"
AUTO_INIT_DB = os.getenv("AUTO_INIT_DB", "false").lower() == "true"

# CORS — comma-separated list of allowed origins (no wildcards)
_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw.split(",") if o.strip()]
