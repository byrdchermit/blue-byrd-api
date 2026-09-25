# byrdsnest api client User Guide (HOWTO)

Welcome to the **byrdsnest api client** user guide! This document provides an end-to-end walkthrough on how to use byrdsnest api client for building, testing, and managing APIs directly inside Visual Studio Code.

---

## Table of Contents

1. [Installation & Setup](#1-installation--setup)
2. [Interface Overview](#2-interface-overview)
3. [Profiles & Environments](#3-profiles--environments)
4. [Building & Sending Requests](#4-building--sending-requests)
5. [Variable & Header Inheritance](#5-variable--header-inheritance)
6. [Dynamic Variables & Smart Coercion](#6-dynamic-variables--smart-coercion)
7. [Authentication (OAuth 2.0, Bearer, API Key, Basic)](#7-authentication)
8. [Collections & Folders](#8-collections--folders)
9. [Universal JSON Import & Export](#9-universal-json-import--export)
10. [Response Viewer & History](#10-response-viewer--history)
11. [Checking for Updates](#11-checking-for-updates)

---

## 1. Installation & Setup

### Installing the `.vsix` Package

You can install byrdsnest api client directly from the packaged `.vsix` bundle:

#### Option A: Inside VS Code
1. Open Visual Studio Code.
2. Open the Extensions view (`Ctrl+Shift+X` on Windows/Linux, `Cmd+Shift+X` on macOS).
3. Click the **`...`** (Views and More Actions) menu in the top-right corner of the Extensions pane.
4. Select **Install from VSIX...**.
5. Select the `byrdsnest-api-client-0.1.0.vsix` file.

#### Option B: From the Terminal
Run the following command in your terminal:
```bash
code --install-extension byrdsnest-api-client-0.1.0.vsix
```

### Downloading Releases
New versions and pre-packaged VSIX files are published on the GitHub Releases page:
👉 [https://github.com/byrdchermit/byrdsnest-api-client/releases](https://github.com/byrdchermit/byrdsnest-api-client/releases)

---

## 2. Interface Overview

Once installed, byrdsnest api client adds an icon to your VS Code **Activity Bar** (left sidebar):

1. **Collections Tree**: View, create, and organize your API requests inside nested folders and collections.
2. **Environments Tree**: View and activate environments (e.g. `Development`, `Staging`, `Production`) and profiles.
3. **Request History**: Browse your recent API executions, complete with status codes, latency, and single-click restoration.
4. **Editor Tabs**: When you click a request or environment, byrdsnest api client opens a native tab in your editor where you can edit and execute.

---

## 3. Profiles & Environments

byrdsnest api client features an advanced multi-tier configuration system: **Profiles**, **Hierarchical Environments**, and **Profile Scopes**.

### Profiles
A **Profile** represents global context that can own or scope environments and collections (such as specific customer tenants, microservice domains, or organizational accounts).

- **Active Profile Scope**: Click the top item in the sidebar (`Scope: <Profile>` or `Scope: All Profiles (Global)`) or the status bar indicator at the bottom to filter your sidebar to display only items relevant to that profile.
- **Shared / Global Resources**: Items marked as `Global / Shared` remain visible across all profiles, allowing you to reuse common collections or global base environments everywhere.

### Environments & Visual Parent → Child Nesting
An **Environment** represents a specific deployment target (such as `Base`, `Dev`, `Staging`, or `Production`).

- **Hierarchical Visual Nesting**: When an environment sets a **Parent Environment** (`inheritsFrom`), byrdsnest api client automatically nests the child environment directly beneath the parent in the sidebar explorer tree with collapsible expansion chevrons, parent badges (`Parent (N)`), and child badges (`inherits: <parent>`).
- **Multi-Level Inheritance**: Inheritance works recursively (e.g. `Base` → `Staging` → `Staging-Feature`). Child environments inherit all parent variables and headers while selectively overriding specific keys or base URLs.
- **Active Environment Indicator**: The active environment displays a `✔ Active` badge in the sidebar. You can set any environment as active via its inline checkmark button or right-click context menu.

### Creating & Scoping Profiles and Environments
1. **From the Sidebar**: Hover over the **Profiles** or **Environments** header in the sidebar and click the **`+`** icon.
2. **From the Command Palette**: Press `Ctrl+Shift+P` (or `Cmd+Shift+P`), type `byrdsnest api client: New Profile` or `byrdsnest api client: New Environment`, and press Enter.
3. The editor tab opens automatically, allowing you to define:
   - Key-value variable pairs.
   - Default headers.
   - Authentication settings.
   - **Parent Environment**: Select any environment to inherit from.
   - **Profile Scope**: Associate the environment with a specific profile or mark it as `Global / Shared (All Profiles)`.

---

## 4. Building & Sending Requests

### Creating a Request
- Click the **`+`** icon on any Collection or Folder in the sidebar.
- Enter a name (e.g., `Get User Profile`) and select an HTTP method.

### Request Configuration Tabs

| Tab | Purpose |
| :--- | :--- |
| **Params** | Define URL query parameters in a key-value grid. Parameter changes dynamically update the URL bar. |
| **Headers** | Specify custom request headers. Inherited collection/environment headers are displayed here. |
| **Auth** | Configure authentication or select **Inherit from parent**. |
| **Body** | Provide payload data (`JSON`, `Form-Data`, `x-www-form-urlencoded`, `Raw`, `XML`). |
| **Variables** | Inspect resolved variables and their source tiers. |

### Request Body Modes
- **JSON**: Built-in syntax highlighting with a **Format** button to beautify unformatted JSON.
- **Multipart Form-Data**: Supports key-value fields. Click the file selector button next to any key to choose local binary files using the native VS Code file dialog.
- **x-www-form-urlencoded**: Standard URL-encoded key-value pairs with instant bulk editing.
- **Raw / Text / XML**: Plain text editors for non-standard payloads.

### Executing a Request
- Click the blue **Send** button, or press `Ctrl+Enter` (`Cmd+Enter` on macOS).

---

## 5. Variable & Header Inheritance

byrdsnest api client uses a 6-tier inheritance engine that resolves variables and headers in the following cascading order:

> **Profile** → **Parent Environment** → **Active Environment** → **Collection** → **Folder** → **Request**

### The Live Inheritance Inspector
In any open request, switch to the **Variables** or **Headers** tab to view the live inheritance table:
- **Source Origin Badges**: Badges like `[Profile]`, `[Parent Env]`, `[Env]`, `[Collection]`, and `[Folder]` show you exactly where each value originates.
- **Overridden Indicators**: When a lower tier overrides a higher tier, the overridden value is displayed with a strikethrough (`[Overridden]`).
- **One-Click Override**: Click the **`+ Override`** button on any inherited item to copy that variable or header directly into your local request editor for immediate customization.

---

## 6. Dynamic Variables & Smart Coercion

### Built-in Dynamic Tokens
You can use dynamic tokens anywhere in your URLs, headers, or body payloads:

| Token | Description | Output Example |
| :--- | :--- | :--- |
| `{{$uuid}}` | Generates a standard RFC 4122 v4 UUID | `c73a24e2-658b-4a0e-a9ec-281b37f4460d` |
| `{{$timestamp}}` | Current Unix epoch time in milliseconds | `1727217600000` |
| `{{$isoDate}}` | Current ISO-8601 UTC timestamp | `2026-09-24T22:40:00.000Z` |
| `{{$randomInt:N}}` | Random N-digit numeric string | `{{$randomInt:6}}` → `482910` |
| `{{$date:format}}` | Date formatted with tokens (`yyyy`, `MM`, `dd`, `HH`, `mm`, `ss`) | `{{$date:yyyy-MM-dd}}` → `2026-09-24` |

### Smart JSON Type Coercion
When writing JSON payloads, wrapping variables in quotes often causes string/boolean mismatch issues. byrdsnest api client automatically detects when a quoted variable resolves to a boolean or null value and coerces it:
```json
// Input template:
{
  "active": "{{IS_PROD}}",
  "meta": "{{EXTRA_DATA}}"
}

// If IS_PROD = "true" and EXTRA_DATA = "null", byrdsnest api client sends:
{
  "active": true,
  "meta": null
}
```

---

## 7. Authentication

byrdsnest api client provides a unified authentication engine across Requests, Collections, Profiles, and Environments:

### Supported Auth Types

1. **Inherit from parent**: Automatically uses the auth credentials defined at the folder, collection, or environment level.
2. **OAuth 2.0**:
   - **Grant Types**: Authorization Code, Client Credentials, Password Credentials, Implicit.
   - Supports Token URL, Authorization URL, Client ID, Client Secret, Scope, and custom headers.
   - Built-in token retrieval and caching.
3. **Bearer Token**: Transmits an authorization token via the `Authorization: Bearer <token>` header.
4. **API Key**: Transmits a key via a custom Header (e.g. `X-API-Key`) or as a URL Query Parameter.
5. **Basic Auth**: Standard HTTP Basic Authentication (`username` & `password` encoded as Base64).

---

## 8. Collections & Folders

Organize your endpoints logically into nested structures:
- **Create Collection**: Click the **`+`** icon on the Collections header or run `byrdsnest api client: New Collection`.
- **Add Folder**: Hover over any collection and click **New Folder**. Folders can be nested indefinitely.
- **Collection/Folder Defaults**: Open any collection or folder to set default headers and authentication that automatically cascade to every request inside.

---

## 9. Universal JSON Import & Export

byrdsnest api client makes it easy to migrate from other tools or share your workspaces with team members:

### Supported Formats
- **Postman Collections (v2 / v2.1)**: Imports requests, folders, headers, query parameters, auth settings, and bodies.
- **Postman Environments**: Imports variable sets and environment configurations.
- **OpenAPI 3.0 & Swagger 2.0 (JSON & YAML)**: Auto-generates collections, tag folders, path variables (`{{param}}`), and schema-driven JSON sample request bodies.
- **Full Workspace Backups**: Exports and imports complete profiles, environments, collections, and history.

### How to Import
1. In the sidebar, click the **Import** icon on the Collections or Environments header.
2. Or open the Command Palette (`Ctrl+Shift+P`) and run:
   ```
   byrdsnest api client: Import JSON
   ```
3. Select your `.json` or `.yaml` file. byrdsnest api client automatically identifies the format and normalizes the contents.

### How to Export
1. Right-click any collection or hover over it to click the **Export** icon.
2. Or use the Command Palette:
   - `byrdsnest api client: Export Collection as JSON`
   - `byrdsnest api client: Export Full Workspace Backup as JSON`
3. Save the exported JSON file to your desired location.

---

## 10. Response Viewer & History

### Response Inspection
When a request finishes executing, the bottom pane displays:
- **Status & Metrics**: HTTP Status code (e.g., `200 OK`, `404 Not Found`), Latency in milliseconds, and Payload size.
- **Body Viewer**: Formatted JSON, XML, or raw response with syntax highlighting, search, and a one-click copy button.
- **Response Headers**: Full table of HTTP response headers returned by the server.

### Request History
Every executed request is automatically recorded in the **History** view in the sidebar:
- Displays timestamp, HTTP method, URL, and status code.
- Click any history item to instantly load that request and its exact parameters back into the editor.

---

## 11. Checking for Updates

byrdsnest api client includes an automated update checking system:

### Automatic Checks
Once per day upon starting VS Code, byrdsnest api client checks the official GitHub repository for new releases. If a newer version is found, an interactive notification appears:
- **Download Update**: Opens the GitHub release download page directly.
- **View Changelog**: Opens the release notes and changelog.

### Manual Check
You can check for updates on demand at any time:
1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Search for:
   ```
   byrdsnest api client: Check for Updates
   ```
3. Press Enter. byrdsnest api client will notify you if your installation is up to date or if a new version is available.
