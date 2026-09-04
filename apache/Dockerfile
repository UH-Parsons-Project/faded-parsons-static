FROM debian:bookworm-slim

ENV APACHE_CONFDIR=/etc/apache2

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        apache2 \
        libapache2-mod-shib \
        ca-certificates \
        curl && \
    rm -rf /var/lib/apt/lists/*

RUN a2enmod headers proxy proxy_http shib ssl && \
    a2dissite 000-default.conf && \
    sed -i 's/^Listen 80$/Listen 8080/' /etc/apache2/ports.conf

COPY shibboleth-proxy.conf /etc/apache2/sites-available/shibboleth-proxy.conf
COPY shibboleth/shibboleth2.xml /etc/shibboleth/shibboleth2.xml
COPY shibboleth/attribute-map.xml /etc/shibboleth/attribute-map.xml

RUN a2ensite shibboleth-proxy.conf && \
    printf 'ServerName localhost\n' > /etc/apache2/conf-available/servername.conf && \
    a2enconf servername && \
    mkdir -p /var/cache/shibboleth /var/log/shibboleth /var/run/shibboleth && \
    chmod -R a+rwX /var/cache/shibboleth /var/log/shibboleth /var/run/shibboleth /var/log/apache2

COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]