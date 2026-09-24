# Changelog

All notable changes to **bluebyrd** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Pre-request and post-request test assertion scripting.
- Git-backed environment and collection synchronization (`.bluebyrd/` workspace configs).
- GraphQL query builder and schema introspection.
- WebSocket and Server-Sent Events (SSE) streaming viewer.

---

## [0.1.0] - 2026-09-24

### Initial Release (Public Beta)

Welcome to the initial public beta release of **bluebyrd**, the lightweight, native, and local-first API client for Visual Studio Code!

#### Added
- **Hierarchical Variable & Header Inheritance Engine**:
  - Multi-tier inheritance chain: `Profile` → `Parent Environment` → `Active Environment` → `Collection` → `Folder` → `Request`.
  - Nested environments with `inheritsFrom` parent environment configuration and cycle-safe dependency resolution.
  - Automatic collection-level and folder-level header cascading into child requests.
  - Case-insensitive header deduplication with request-level override priority.
- **Live Visual Inheritance Inspector**:
  - Interactive tabs in the Request Panel for both **Variables** and **Headers**.
  - Distinct source origin badges (`[Profile]`, `[Parent Env]`, `[Env]`, `[Collection]`, `[Folder]`, `[Dynamic]`).
  - Visual strikethrough indicator for overridden values.
  - One-click `+ Override` action that instantly copies inherited variables and headers into the local request editor.
- **Built-in Dynamic Variable Generators**:
  - `{{$uuid}}`: Generates RFC 4122 v4 unique identifiers.
  - `{{$timestamp}}`: Current Unix epoch timestamp in milliseconds.
  - `{{$isoDate}}`: Current UTC timestamp in ISO-8601 format.
  - `{{$randomInt:N}}`: Generates cryptographically pseudorandom N-digit integers.
  - `{{$date:format}}`: Formats current date and time tokens (`yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`).
- **Smart JSON Type Coercion**:
  - Automatically coerces quoted string tokens (such as `"{{FLAG}}"`) to native JSON booleans (`true`/`false`) or `null` primitives upon substitution, preventing malformed payload errors.
- **Unified Authentication Framework**:
  - OAuth 2.0 engine supporting Authorization Code, Client Credentials, Password Credentials, and Implicit flows.
  - Automatic token acquisition and caching with custom headers and scope support.
  - Bearer Token, API Key (Header or Query parameter), and HTTP Basic Authentication.
  - Consistent authentication configuration across Profiles, Environments, Collections, and individual Requests.
- **Rich Request Body Modes**:
  - JSON editor with syntax formatting and validation.
  - Multipart form-data with native VS Code file browsing dialogs for binary uploads.
  - `x-www-form-urlencoded` key-value pairs with bulk editing support.
  - Raw text, XML, and binary modes.
- **Universal JSON Import & Export**:
  - **Postman Collections (v2 / v2.1)**: Imports folders, requests, url query parameters, headers, authentication settings, and payloads.
  - **Postman Environments**: Auto-detects and imports variable key-value pairs and base URLs.
  - **OpenAPI 3.0 / Swagger 2.0**: Auto-generates collections from OpenAPI specifications with endpoint tag folders, path parameter conversion, and sample schema JSON payloads.
  - **Multi-Resource & Full Workspace Backups**: Export and import complete workspaces or individual collections/environments with automatic normalization.
  - Contextual sidebar tree buttons and Command Palette shortcuts for all import and export actions.
- **Automated GitHub Releases Update Notifier**:
  - Background daily checks against the official GitHub Releases API (`byrdchermit/blue-byrd-api`).
  - Interactive update notification prompt with direct download and changelog view.
  - On-demand update check command (`bluebyrd: Check for Updates`) in the VS Code Command Palette.
- **VS Code Native UI & History**:
  - Dedicated Activity Bar icon and customizable Sidebar explorer.
  - Full request history recording status codes, response sizes, latency (ms), and payload details.
  - Single-click request restoration and re-execution from the history view.
- **Automated Verification Suite**:
  - 31 automated test suites covering inheritance resolution, import/export normalizers, type coercion, dynamic variables, and update verification.
