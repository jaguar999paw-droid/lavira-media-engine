# Lavira Media Engine

> AI-powered safari content engine — turns a destination name into a fully branded, ready-to-publish social post, orchestrated end-to-end through Claude via MCP.

[![Release](https://img.shields.io/github/v/release/jaguar999paw-droid/lavira-media-engine)](https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What it does

Lavira takes a destination and produces a complete, branded social media post — stock photo or video, logo overlay, AI-written caption, hashtags — ready to publish to Instagram, Facebook, TikTok, or WhatsApp Status. Every capability is exposed as an MCP tool, so the entire content pipeline (search, edit, brand, caption, schedule, publish) is driven conversationally from Claude Desktop rather than a bespoke UI.

---

## Architecture: federated MCP servers

Lavira originally shipped as a single monolithic MCP server exposing all tools at once. It has since been split into six focused, independently deployable MCP sub-servers, each owning one slice of the pipeline. This keeps blast radius small when one area changes, lets each server be tested and containerized on its own, and makes the tool surface easier to reason about from the Claude side.

| Server | Responsibility | Status |
|---|---|---|
| **media** | Sourcing and processing images/video — stock search, cropping, watermarking, encoding, format export per platform | Core logic stable; containerized build still being verified end-to-end |
| **publish** | Posting finished content to Instagram, Facebook, TikTok, and WhatsApp | Stable, containerized |
| **brand** | Brand identity, overlay templates, theming, card generation | Stable, containerized |
| **design** | Promo packages, captions, hashtag generation, marketing payloads | Stable, containerized |
| **ops** | Admin settings, cache management, health checks, cleanup jobs | Stable, containerized |
| **search** | Ranking and selecting external media for a given content brief | Stable, containerized |

**Recent hardening work** across the sub-servers included closing a command-injection vector in shell-invoking tool paths, fixing a bug where a shared SQLite connection could be torn down out from under a concurrent request, and replacing a shallow object merge in settings updates with a proper deep merge (previously a partial settings patch could silently wipe unrelated nested config).

**Containerization:** each server builds from a distroless base image to minimize its runtime attack surface. Most module-level smoke tests pass against the containerized builds; the `media` server's containerized path is the one piece still pending full verification, and wiring the containerized servers into Claude Desktop's MCP config (in place of the old locally-spawned processes) is the next milestone.

---

## Installation

Full setup instructions — Windows one-click installer, Linux/macOS manual setup, Claude Desktop MCP wiring, environment variables, and troubleshooting — now live in dedicated docs rather than this README:

- **[Latest Release](https://github.com/jaguar999paw-droid/lavira-media-engine/releases/latest)** — packaged Windows installer (`lavira-media-engine-windows-setup.zip`)
- **[docs/INSTALLATION.md](docs/INSTALLATION.md)** — full install guide for all platforms, environment variables reference, and troubleshooting table

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

---

*Built for [Lavira Safaris](https://lavirasafaris.com) · Node.js · Docker · FFmpeg · Sharp · Anthropic Claude · Pexels*
