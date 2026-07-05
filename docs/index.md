---
layout: home

hero:
  name: Team Hub
  text: Your team's self-hosted HarborClient hub
  tagline: Ship API work faster — one server for shared collections, curated plugins and themes, and team AI. Teammates connect with a URL and token; you keep the keys and the data.
  image:
    src: /images/logo.png
    alt: Team Hub
  actions:
    - theme: brand
      text: Get started
      link: /setup
    - theme: alt
      text: Deploy with Docker
      link: /deploy
    - theme: alt
      text: Team Hub API
      link: https://harborclient.github.io/team-hub-api/
    - theme: alt
      text: NPM
      link: https://www.npmjs.com/package/@harborclient/team-hub
    - theme: alt
      text: What is HarborClient?
      link: https://harborclient.com

features:
  - title: Shared collections
    details: Centralize requests, folders, and defaults so everyone works from the same API catalog instead of emailing exports or juggling shared database credentials.
  - title: Curated plugins & themes
    details: Publish approved marketplace and trusted plugin sources once in server.yaml. Every connected HarborClient sees them in Settings → Plugins — including appearance themes.
  - title: Team AI, your keys
    details: Proxy OpenAI, Claude, and Gemini from the hub with per-user model access, monthly token limits, and audit logging. Desktop clients never receive provider API keys.
  - title: Self-hosted control
    details: Run on your VPS, Cloud Run, or a local Docker smoke test. Manage users, tokens, and access lists from the CLI or REST admin API.
---

## Why teams choose Team Hub

HarborClient desktop clients are powerful on their own, but every teammate configuring the same remote database connection does not scale. Team Hub gives your company a single, token-gated HTTP API for shared collection data — plus optional plugin catalogs and LLM proxying — without handing out storage credentials or AI keys.

Deploy the all-in-one Docker image (Nginx, API, Postgres, and Redis) or run the CLI on your own infrastructure. Issue each person a `hbk_` bearer token with scoped collection access, and they are ready to sync.

> [!TIP]
> Team Hub is the server side of [HarborClient](https://github.com/harborclient/harborclient) team hubs. For how desktop clients connect, sync collections, and use hub-provided AI and plugins, see the [HarborClient team hubs guide](https://harborclient.com/team-hubs).

## Next steps

1. [Prerequisites](./prerequisites.md) — Node.js 24 and pnpm for development; Docker for production deploys.
2. [Setup](./setup.md) — Install, configure `server.yaml`, migrate, and start the server.
3. [Deploy](./deploy.md) — Ship to Google Cloud Run, a VPS, or run a local smoke test.
