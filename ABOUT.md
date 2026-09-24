# About bluebyrd

**bluebyrd** is an open-source, local-first API client built natively for Visual Studio Code.

Designed for developers who want a fast, focused, and intuitive API workbench without leaving their code editor, bluebyrd combines the power of tools like Postman with the simplicity, speed, and privacy of VS Code.

---

## The Story Behind bluebyrd

Over the years, API clients have evolved from simple HTTP request tools into heavyweight desktop platforms. While feature-rich, many modern tools have introduced:

- High memory usage and sluggish UI startup times.
- Mandatory cloud account creation and login walls.
- Cloud syncing of sensitive API keys, tokens, and corporate payloads.
- Constant context switching between the IDE and standalone desktop applications.

**bluebyrd** was created by Byrd Chermit ([@byrdchermit](https://github.com/byrdchermit)) to solve this problem. The vision is simple: **bring a professional-grade, privacy-respecting, and lightning-fast API client directly into the developer's primary workspace.**

---

## Core Principles & Philosophy

### 1. 🔒 Local-First & Zero Telemetry
Your API keys, environment credentials, authorization tokens, and request histories are sensitive. bluebyrd stores all data strictly within your local VS Code workspace and global extension storage. There are no proprietary cloud backends, no user tracking, and no external telemetry.

### 2. ⚡ Lightweight & Fast
Built natively using the VS Code Extension API and webviews, bluebyrd launches instantly alongside your editor, uses negligible background memory, and does not require a standalone browser engine.

### 3. 🧬 Hierarchical Precision (Inheritance Done Right)
Managing variables and authentication across complex multi-service projects shouldn't require copy-pasting headers across dozens of requests. bluebyrd implements an end-to-end inheritance architecture:
> **Profile** → **Parent Environment** → **Active Environment** → **Collection** → **Folder** → **Request**

With the built-in **Visual Inheritance Inspector**, you can see the exact origin of every variable and header (`[Profile]`, `[Env]`, `[Collection]`), inspect overridden values, and override anything with a single click.

### 4. 🔄 Universal Interoperability (No Vendor Lock-In)
Your collections and environments belong to you. bluebyrd features native, universal JSON import and export for:
- **Postman Collections (v2 / v2.1)**
- **Postman Environments**
- **OpenAPI 3.0 & Swagger 2.0 Specifications**
- **Full Workspace Backups**

You can migrate your existing workflows into bluebyrd in seconds, or export your work at any time.

### 5. 🌐 Open Source & Community Driven
bluebyrd is published under the permissive **MIT License** and developed openly on GitHub at [byrdchermit/blue-byrd-api](https://github.com/byrdchermit/blue-byrd-api). 

---

## Architecture Overview

```
                      ┌───────────────────────────┐
                      │    VS Code Workbench      │
                      │  (Activity Bar & Panels)  │
                      └─────────────┬─────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌───────────────────────┐                         ┌───────────────────────┐
│  Sidebar Explorer     │                         │  Request & Settings   │
│  - Collections Tree   │                         │  - Webview Panels     │
│  - Environments Tree  │                         │  - Inheritance Views  │
│  - History View       │                         │  - Response Inspector │
└──────────┬────────────┘                         └───────────┬───────────┘
           │                                                  │
           └────────────────────────┬─────────────────────────┘
                                    ▼
                      ┌───────────────────────────┐
                      │  Inheritance Engine &     │
                      │  Variable Resolver        │
                      └─────────────┬─────────────┘
                                    │
                                    ▼
                      ┌───────────────────────────┐
                      │  HTTP Execution Client    │
                      │  (Axios, OAuth2, Streams) │
                      └─────────────┬─────────────┘
                                    │
                                    ▼
                      ┌───────────────────────────┐
                      │  Local Storage Provider   │
                      │  (VS Code Memento / JSON) │
                      └───────────────────────────┘
```

---

## Connect & Contribute

- **Repository**: [https://github.com/byrdchermit/blue-byrd-api](https://github.com/byrdchermit/blue-byrd-api)
- **Issues & Feature Requests**: [GitHub Issues](https://github.com/byrdchermit/blue-byrd-api/issues)
- **Releases**: [GitHub Releases](https://github.com/byrdchermit/blue-byrd-api/releases)
- **Author**: Byrd Chermit ([@byrdchermit](https://github.com/byrdchermit))
- **License**: [MIT](https://github.com/byrdchermit/blue-byrd-api/blob/main/LICENSE)
