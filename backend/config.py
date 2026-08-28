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
# Controls whether seed_db() runs on application startup (backend/seed.py).
# Defaults to true so existing dev/staging/local behavior is unaffected;
# disable explicitly in environments (e.g. production) where seed data
# has already been created and may have since been modified (e.g. task
# ownership reassigned), so re-seeding could be harmful.
RUN_SEED_ON_STARTUP = os.getenv("RUN_SEED_ON_STARTUP", "true").lower() == "true"

# CORS — comma-separated list of allowed origins (no wildcards)
_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:8000")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in _raw.split(",") if o.strip()]

# Cookies — set to true in production (requires HTTPS)
COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "false").lower() == "true"

# Optional Haka/SAML service-provider login.
SAML_ENABLED = os.getenv("SAML_ENABLED", "false").lower() == "true"
SAML_TEST_PAGE_ENABLED = os.getenv("SAML_TEST_PAGE_ENABLED", "false").lower() == "true"
SAML_SP_ENTITY_ID = os.getenv("SAML_SP_ENTITY_ID", "")
SAML_SP_ACS_URL = os.getenv("SAML_SP_ACS_URL", "")
SAML_SP_SLS_URL = os.getenv("SAML_SP_SLS_URL", "")
SAML_IDP_ENTITY_ID = os.getenv("SAML_IDP_ENTITY_ID", "")
SAML_IDP_SSO_URL = os.getenv("SAML_IDP_SSO_URL", "")
SAML_IDP_X509_CERT_PATH = os.getenv("SAML_IDP_X509_CERT_PATH", "")
SAML_SP_CERT_PATH = os.getenv("SAML_SP_CERT_PATH", "")
SAML_SP_PRIVATE_KEY_PATH = os.getenv("SAML_SP_PRIVATE_KEY_PATH", "")
SAML_SIGN_AUTHN_REQUESTS = os.getenv("SAML_SIGN_AUTHN_REQUESTS", "true").lower() == "true"
SAML_EMAIL_ATTRIBUTE = os.getenv("SAML_EMAIL_ATTRIBUTE", "urn:oid:0.9.2342.19200300.100.1.3")
SAML_USERNAME_ATTRIBUTE = os.getenv("SAML_USERNAME_ATTRIBUTE", "uid")
