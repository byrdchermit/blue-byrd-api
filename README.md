# bluebyrd (Beta)

> **Public Beta (v0.1.0)**: bluebyrd is currently in early public beta. We welcome testing, feedback, and issue reports on [GitHub](https://github.com/byrdchermit/blue-byrd-api/issues)!

bluebyrd is an open-source, local-first API client built natively for VS Code. The goal is to bring a Postman-like workflow directly into the editor with a fast request builder, environment-aware variables, saved collections, and clean response inspection.

## Key Features

- **Hierarchical Variable & Header Inheritance**:
  - Full inheritance chain: Profile → Parent Environment → Active Environment → Collection → Folder → Request.
  - Nested environments (`inheritsFrom` parent environment) with cycle-safe resolution.
  - Collection and Folder-level headers inherited automatically by child requests.
  - Request-level overrides with case-insensitive header deduplication.
- **Visual Inheritance Inspector**:
  - Live inspection tables in the Request Panel for both Variables and Headers.
  - Source origin badges (`[Profile]`, `[Parent Env]`, `[Env]`, `[Collection]`, `[Folder]`, `[Dynamic]`).
  - Strikethrough indicator (`[Overridden]`) and one-click **+ Override** button to bring any inherited variable or header into the request editor.
- **Built-in Dynamic Variables**:
  - `{{$uuid}}`: RFC 4122 v4 UUID generator.
  - `{{$timestamp}}`: Current Unix epoch timestamp in milliseconds.
  - `{{$isoDate}}`: Current ISO-8601 UTC timestamp.
  - `{{$randomInt:N}}`: Random N-digit numeric string.
  - `{{$date:format}}`: Formatted date tokens (`yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`).
- **Smart JSON Type Coercion**:
  - Quoted tokens (`"{{FLAG}}"`) automatically coerce to real JSON boolean (`true`/`false`) or `null` primitives when resolved.
- **Unified Authentication**:
  - OAuth 2.0 (Authorization Code, Client Credentials, Password, Implicit), Bearer Token, API Key (Header or Query), and Basic Auth shared consistently across Requests and Settings.
- **Rich Request Body Modes**:
  - JSON (with beautification), multipart form-data (with native VS Code file browsing), x-www-form-urlencoded (with key-value and bulk mode), raw, text, and XML.
- **Response Viewer & History**:
  - Full request history tracking with single-click restore and rerun.
- **Profiles & Environments Management**:
  - Direct sidebar creation: Hover over the **Profiles** or **Environments** headers in the explorer sidebar to reveal the `+` creation button.
  - Command palette integration: Run `bluebyrd: New Profile` or `bluebyrd: New Environment` anytime from `Ctrl+Shift+P` / `Cmd+Shift+P`.
  - Automatic configuration panel: Immediately opens the dedicated settings editor upon creation to configure Auth, variables, headers, and parent environments.
- **Universal JSON Import & Export**:
  - **Postman Collections (v2 / v2.1)**: Import folders, requests, url query parameters, headers, auth (Bearer, Basic, API Key, OAuth2), and bodies (raw JSON, urlencoded, form-data).
  - **Postman Environments**: Import variable sets and baseUrl presets directly into bluebyrd environments.
  - **OpenAPI 3.0 / Swagger 2.0**: Auto-convert OpenAPI specifications into collections, tag groups into folders, path parameters into `{{param}}`, and schemas into JSON sample bodies.
  - **Native Workspace Backup & Share**: Export/import individual collections or environments, or create whole-workspace backup files with one click.
  - **Interactive Tree & Command Integration**: Inline import/export buttons in the explorer sidebar and Command Palette shortcuts (`bluebyrd: Import JSON`, `bluebyrd: Export Collection as JSON`, `bluebyrd: Export Full Workspace Backup as JSON`).
- **Automated Update Notifier**:
  - Automatically checks GitHub Releases for newer versions once per day in the background.
  - Displays a clean update notification with one-click download and changelog view.
  - Manual check on demand anytime via `bluebyrd: Check for Updates` in the Command Palette.

## Documentation

- [User Guide & How-To (`HOWTO.md`)](HOWTO.md) — Comprehensive guide to requests, inheritance, auth, import/export, and more.
- [Changelog (`CHANGELOG.md`)](CHANGELOG.md) — Release notes and version history.
- [About bluebyrd (`ABOUT.md`)](ABOUT.md) — Mission, architecture, and open-source principles.
- [About the Author (`ABOUTME.md`)](ABOUTME.md) — Background and story behind the project.

## License

MIT

