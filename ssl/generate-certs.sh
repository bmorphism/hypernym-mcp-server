#!/bin/bash

# Generate a self-signed certificate for local development
openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.crt -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName = DNS:localhost"

echo "Self-signed certificates created in ssl directory"
echo "server.key - Private key"
echo "server.crt - Certificate"