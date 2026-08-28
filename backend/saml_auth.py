"""SAML service-provider helpers for optional HY teacher login."""

from pathlib import Path

from fastapi import HTTPException, Request, status
from onelogin.saml2.auth import OneLogin_Saml2_Auth

from . import config


def _read_required(path: str, setting: str) -> str:
    if not path:
        raise RuntimeError(f"{setting} is not configured")
    try:
        return Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        raise RuntimeError(f"Could not read {setting}: {path}") from exc


def _settings() -> dict:
    if not all((config.SAML_SP_ENTITY_ID, config.SAML_SP_ACS_URL,
                config.SAML_IDP_ENTITY_ID, config.SAML_IDP_SSO_URL,
                config.SAML_IDP_X509_CERT_PATH)):
        raise RuntimeError("SAML settings are incomplete")

    sp = {
        "entityId": config.SAML_SP_ENTITY_ID,
        "assertionConsumerService": {"url": config.SAML_SP_ACS_URL},
        "x509cert": _read_required(config.SAML_SP_CERT_PATH, "SAML_SP_CERT_PATH")
        if config.SAML_SP_CERT_PATH else "",
        "privateKey": _read_required(config.SAML_SP_PRIVATE_KEY_PATH, "SAML_SP_PRIVATE_KEY_PATH")
        if config.SAML_SP_PRIVATE_KEY_PATH else "",
    }
    if config.SAML_SIGN_AUTHN_REQUESTS and not all((config.SAML_SP_CERT_PATH,
                                                    config.SAML_SP_PRIVATE_KEY_PATH)):
        raise RuntimeError("SP certificate and private key are required for signed SAML requests")
    if config.SAML_SP_SLS_URL:
        sp["singleLogoutService"] = {"url": config.SAML_SP_SLS_URL}

    settings = {
        "strict": True,
        "debug": False,
        "sp": sp,
        "idp": {
            "entityId": config.SAML_IDP_ENTITY_ID,
            "singleSignOnService": {"url": config.SAML_IDP_SSO_URL},
            "x509cert": _read_required(config.SAML_IDP_X509_CERT_PATH, "SAML_IDP_X509_CERT_PATH"),
        },
        "security": {
            "authnRequestsSigned": config.SAML_SIGN_AUTHN_REQUESTS,
            "wantAssertionsSigned": True,
            "wantMessagesSigned": False,
        },
    }
    return settings


async def saml_request(request: Request) -> OneLogin_Saml2_Auth:
    form = await request.form()
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.url.netloc)
    data = {
        "https": "on" if scheme == "https" else "off",
        "http_host": host,
        "server_port": "443" if scheme == "https" else "80",
        "script_name": request.url.path,
        "get_data": dict(request.query_params),
        "post_data": dict(form),
    }
    return OneLogin_Saml2_Auth(data, old_settings=_settings())


def require_saml() -> None:
    if not config.SAML_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)