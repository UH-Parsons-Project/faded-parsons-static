# HY SAML login

SAML needs two certificate roles:

- **SP certificate and private key:** this application signs AuthnRequests. Register only the public certificate with the HY/SP registry. Keep the private key in an OpenShift Secret.
- **IdP certificate:** HY provides this public certificate. The application uses it to verify signed SAML responses.

The SP certificate is separate from the HTTPS certificate on the web route.

## Generate an SP certificate

Run locally in a private directory. Do not commit the directory or private key:

```bash
mkdir -p saml-private
openssl req -new -x509 -newkey rsa:3072 -nodes \
  -keyout saml-private/sp.key \
  -out saml-private/sp.crt \
  -days 1095 \
  -subj '/CN=Parsons Code Lab SAML SP'
chmod 600 saml-private/sp.key
```

Give `saml-private/sp.crt` to the SP registry. Never give out `sp.key`.

## Register the SP

Production:

```text
Entity ID: https://parsonscodelab.web.helsinki.fi/sp
ACS:       https://parsonscodelab.web.helsinki.fi/auth/saml/acs
Metadata:  https://parsonscodelab.web.helsinki.fi/auth/saml/metadata
```

Staging:

```text
Entity ID: https://faded-parsons-staging-timed-parsons.apps.ocp-test-0.k8s.it.helsinki.fi/sp
ACS:       https://faded-parsons-staging-timed-parsons.apps.ocp-test-0.k8s.it.helsinki.fi/auth/saml/acs
Metadata:  https://faded-parsons-staging-timed-parsons.apps.ocp-test-0.k8s.it.helsinki.fi/auth/saml/metadata
```

Ask HY/Haka administration for the IdP `entityID`, SSO URL, signing certificate,
and exact email and username attribute names.

For the supplied HY metadata, the IdP values are:

```text
SAML_IDP_ENTITY_ID=https://login.helsinki.fi/shibboleth
SAML_IDP_SSO_URL=https://login.helsinki.fi/idp/profile/SAML2/Redirect/SSO
```

The signed metadata document is:

```text
https://login.helsinki.fi/metadata/sign-hy-metadata-v2.xml
```

The certificate at
`https://login.helsinki.fi/metadata/sc/sign-login.helsinki.fi-v2.pem`
verifies the signature on that metadata document. It is **not** the IdP
assertion-signing certificate and it is **not** the SP certificate. For
`idp.crt`, use the certificate under the metadata's `KeyDescriptor
use="signing"` element, or ask HY/Haka administration for the current IdP
assertion-signing certificate.

## Store credentials in OpenShift

The deployment mounts the existing `cert-and-private-key` Secret at `/etc/saml`.
Its `shib.crt` and `shib.key` keys become `sp.crt` and `sp.key`. The HY IdP
certificate is mounted separately at `/etc/saml/idp`.

```bash
oc -n timed-parsons create secret generic saml-idp-certificate-staging \
  --from-file=idp.crt=PATH_TO_HY_IDP_ASSERTION_SIGNING_CERTIFICATE

oc -n timed-parsons create secret generic saml-config-staging \
  --from-literal=SAML_ENABLED=true \
  --from-literal=SAML_TEST_PAGE_ENABLED=true \
  --from-literal=SAML_SIGN_AUTHN_REQUESTS=true \
  --from-literal=SAML_SP_ENTITY_ID='https://faded-parsons-staging-timed-parsons.apps.ocp-test-0.k8s.it.helsinki.fi/sp' \
  --from-literal=SAML_SP_ACS_URL='https://faded-parsons-staging-timed-parsons.apps.ocp-test-0.k8s.it.helsinki.fi/auth/saml/acs' \
  --from-literal=SAML_IDP_ENTITY_ID='REPLACE_WITH_HY_IDP_ENTITY_ID' \
  --from-literal=SAML_IDP_SSO_URL='REPLACE_WITH_HY_SSO_URL' \
  --from-literal=SAML_IDP_X509_CERT_PATH=/etc/saml/idp/idp.crt \
  --from-literal=SAML_SP_CERT_PATH=/etc/saml/sp.crt \
  --from-literal=SAML_SP_PRIVATE_KEY_PATH=/etc/saml/sp.key
```

Create equivalent production Secrets with production URLs and names. Restart
the deployment after creating or changing a Secret:

```bash
oc -n timed-parsons rollout restart deployment/faded-parsons-staging
```

## Test

The unlinked test page is available only when both `SAML_ENABLED=true` and
`SAML_TEST_PAGE_ENABLED=true`:

```text
/internal/saml-test
```

It is not linked from the normal navigation and has `noindex` metadata. Open
the page, start HY login, and verify the redirect to `/teacher-dashboard`.
Before that, open `/auth/saml/metadata` and verify that the XML contains the
registered SP certificate.

The SAML implementation is disabled unless `SAML_ENABLED=true`.
