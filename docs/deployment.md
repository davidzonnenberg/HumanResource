# Deploying Human Resource on Ubuntu + Tailscale

One Docker container serves the built game and the Save_API. It listens only on localhost; Tailscale exposes it to your devices over HTTPS (which the PWA service worker requires).

## Build and run

```bash
git clone https://github.com/davidzonnenberg/HumanResource.git
cd HumanResource
docker compose up -d --build
```

The container now serves on `127.0.0.1:3003`. Check it:

```bash
curl http://127.0.0.1:3003/api/health      # {"ok":true}
```

Saves live in the named volume `hr-data` and survive rebuilds.

## Expose over Tailscale (HTTPS)

Enable MagicDNS and HTTPS certificates once in the Tailscale admin console, then on the host:

```bash
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3003
```

Open `https://<host>.<your-tailnet>.ts.net:8443` on your phone or PC (both on the tailnet) and install it from the browser menu ("Add to Home Screen" / "Install app"). A separate HTTPS port (8443) avoids clashing with anything already on 443; if you already run a Tailscale-only reverse proxy, point it at `127.0.0.1:3003` instead.

HTTPS is required: service workers (offline play, install) only work on a secure context. Plain `http://<ip>:3003` works for quick testing but will not install as a PWA.

## Updating

```bash
git pull
docker compose up -d --build
```

The app shows an "update ready" prompt; it saves before applying.

## Forgotten PIN

PINs are a convenience only. To clear one:

```bash
docker compose exec human-resource node dist/cli.js remove-pin "<display name>"
```

## Security note

Access control is Tailscale membership only. The Profile picker and optional PIN are for keeping playthroughs apart (you and your girlfriend), not real authentication. Do not expose the container to the public internet. Hardening (real accounts, rate limiting, encryption at rest) is deferred; the Save_API is structured so auth can be added in `apps/server/src/app.ts` (the `onRequest` hook) without changing the save format.
