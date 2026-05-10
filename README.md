# ProxyMaze-Node

A lightweight, production-ready **proxy pool monitoring service** built with Node.js and Express. ProxyMaze continuously health-checks a pool of proxy URLs, fires configurable alerts when the failure rate crosses a threshold, and delivers real-time notifications to webhooks, Slack, and Discord.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Server](#running-the-server)
- [Configuration](#configuration)
- [API Reference](#api-reference)
  - [Health](#health)
  - [Config](#config)
  - [Proxies](#proxies)
  - [Alerts](#alerts)
  - [Webhooks](#webhooks)
  - [Integrations](#integrations)
  - [Metrics](#metrics)
- [Alert System](#alert-system)
- [Webhook & Integration Payloads](#webhook--integration-payloads)
- [Project Structure](#project-structure)
- [License](#license)

---

## Features

- 🔍 **Automated health monitoring** — periodically GETs every proxy URL and records `up`/`down` status
- ⚡ **Immediate checks** — new proxies are checked instantly on registration
- 📊 **Per-proxy statistics** — uptime percentage, consecutive failures, and full check history
- 🚨 **Threshold-based alerting** — fires an alert when ≥ 20 % of the pool is `down`; auto-resolves when the rate recovers
- 🔔 **Webhook notifications** — delivers `alert.fired` / `alert.resolved` payloads to any HTTP endpoint
- 💬 **Slack & Discord integrations** — rich-formatted messages via incoming webhooks
- 📈 **Metrics endpoint** — pool size, total checks, active alerts, and webhook delivery count

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later (uses the built-in `fetch` API)
- npm

---

## Installation

```bash
git clone https://github.com/amilasuranjith-dev/proxyMaze-Node.git
cd proxyMaze-Node
npm install
```

---

## Running the Server

```bash
# Default port 3000
npm start

# Custom port
PORT=8080 npm start
```

The server binds to `0.0.0.0` and begins the monitoring loop automatically on startup.

---

## Configuration

Runtime configuration is managed via the `/config` endpoint (see below). Default values:

| Parameter | Default | Description |
|---|---|---|
| `check_interval_seconds` | `15` | Seconds between monitoring sweeps |
| `request_timeout_ms` | `3000` | Per-request HTTP timeout in milliseconds |

All configuration is held in memory and resets when the server restarts.

---

## API Reference

### Health

#### `GET /health`

Returns server health status.

**Response `200`**
```json
{ "status": "ok" }
```

---

### Config

#### `GET /config`

Returns the current monitoring configuration.

**Response `200`**
```json
{
  "check_interval_seconds": 15,
  "request_timeout_ms": 3000
}
```

#### `POST /config`

Updates one or both configuration values. Changes take effect on the next monitoring cycle.

**Request Body**
```json
{
  "check_interval_seconds": 30,
  "request_timeout_ms": 5000
}
```

**Response `200`** — returns the updated configuration object.

---

### Proxies

#### `POST /proxies`

Registers one or more proxy URLs for monitoring. An immediate health check is triggered.

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `proxies` | `string[]` | ✅ | Array of proxy URLs to monitor |
| `replace` | `boolean` | ❌ | If `true`, clears the existing pool before adding |

```json
{
  "proxies": [
    "http://proxy1.example.com/p/abc123",
    "http://proxy2.example.com/p/def456"
  ],
  "replace": false
}
```

**Response `201`**
```json
{
  "accepted": 2,
  "proxies": [
    { "id": "abc123", "url": "http://proxy1.example.com/p/abc123", "status": "pending" },
    { "id": "def456", "url": "http://proxy2.example.com/p/def456", "status": "pending" }
  ]
}
```

> **Note:** The proxy `id` is derived from the last path segment of the URL.

---

#### `GET /proxies`

Returns a summary of the entire proxy pool.

**Response `200`**
```json
{
  "total": 2,
  "up": 1,
  "down": 1,
  "failure_rate": 0.5,
  "proxies": [
    {
      "id": "abc123",
      "url": "http://proxy1.example.com/p/abc123",
      "status": "up",
      "last_checked_at": "2024-01-15T10:30:00.000Z",
      "consecutive_failures": 0
    }
  ]
}
```

---

#### `GET /proxies/:id`

Returns detailed statistics for a single proxy.

**Response `200`**
```json
{
  "id": "abc123",
  "url": "http://proxy1.example.com/p/abc123",
  "status": "up",
  "last_checked_at": "2024-01-15T10:30:00.000Z",
  "consecutive_failures": 0,
  "total_checks": 42,
  "uptime_percentage": 97.6,
  "history": [
    { "checked_at": "2024-01-15T10:30:00.000Z", "status": "up", "failureReason": null }
  ]
}
```

**Response `404`** — proxy not found.

---

#### `GET /proxies/:id/history`

Returns the full check history array for a single proxy.

**Response `200`** — array of history entries (same structure as the `history` field above).

---

#### `DELETE /proxies`

Removes all proxies from the pool and resolves any active alert.

**Response `204`** — no content.

---

### Alerts

#### `GET /alerts`

Returns the complete history of all alerts (active and resolved).

**Response `200`**
```json
[
  {
    "alert_id": "alert-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "status": "resolved",
    "failure_rate": 0.5,
    "total_proxies": 4,
    "failed_proxies": 2,
    "failed_proxy_ids": ["def456", "ghi789"],
    "threshold": 0.20,
    "fired_at": "2024-01-15T10:00:00.000Z",
    "resolved_at": "2024-01-15T10:05:00.000Z",
    "message": "Proxy pool failure rate exceeded threshold"
  }
]
```

---

### Webhooks

#### `POST /webhooks`

Registers a webhook URL to receive `alert.fired` and `alert.resolved` events.

**Request Body**
```json
{ "url": "https://your-server.example.com/hooks/proxymaze" }
```

**Response `201`**
```json
{
  "webhook_id": "wh-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "url": "https://your-server.example.com/hooks/proxymaze"
}
```

---

### Integrations

#### `POST /integrations`

Registers a Slack or Discord incoming webhook integration with formatted alert messages.

**Request Body**

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | ✅ | `"slack"` or `"discord"` |
| `webhook_url` | `string` | ✅ | Incoming webhook URL from Slack/Discord |
| `username` | `string` | ❌ | Display name for the bot (default: `"ProxyWatch"`) |
| `events` | `string[]` | ❌ | Events to subscribe to (default: `["alert.fired", "alert.resolved"]`) |

```json
{
  "type": "slack",
  "webhook_url": "https://hooks.slack.com/services/T00000/B00000/XXXXXXXX",
  "username": "ProxyMaze Bot",
  "events": ["alert.fired", "alert.resolved"]
}
```

**Response `201`** — the registered integration object.  
**Response `400`** — invalid integration type.

---

### Metrics

#### `GET /metrics`

Returns aggregate runtime metrics.

**Response `200`**
```json
{
  "total_checks": 1024,
  "current_pool_size": 10,
  "active_alerts": 0,
  "total_alerts": 3,
  "webhook_deliveries": 6
}
```

---

## Alert System

An alert is **fired** when the failure rate of the proxy pool reaches or exceeds **20%**:

```
failure_rate = down_proxies / total_proxies >= 0.20
```

- Only one alert is active at a time.
- While an alert is active and the failure rate stays above threshold, the alert's stats are updated in place (no duplicate alerts).
- The alert is **resolved** automatically when the failure rate drops below 20% or the proxy pool is cleared.

---

## Webhook & Integration Payloads

### Standard Webhook — `alert.fired`
```json
{
  "event": "alert.fired",
  "alert_id": "alert-xxxxxxxx-...",
  "fired_at": "2024-01-15T10:00:00.000Z",
  "failure_rate": 0.5,
  "total_proxies": 4,
  "failed_proxies": 2,
  "failed_proxy_ids": ["def456", "ghi789"],
  "threshold": 0.20,
  "message": "Proxy pool failure rate exceeded threshold"
}
```

### Standard Webhook — `alert.resolved`
```json
{
  "event": "alert.resolved",
  "alert_id": "alert-xxxxxxxx-...",
  "resolved_at": "2024-01-15T10:05:00.000Z"
}
```

Webhook delivery uses automatic retries with a **45-second deadline** per alert event. Retryable HTTP status codes: `5xx`, `408`, `429`.

---

## Project Structure

```
proxyMaze-Node/
├── index.js                  # Entry point — starts Express and monitoring loop
├── package.json
└── src/
    ├── app.js                # Express app setup and route mounting
    ├── state.js              # In-memory application state
    ├── utils.js              # Shared utility functions
    ├── routes/
    │   ├── health.js         # GET /health
    │   ├── config.js         # GET|POST /config
    │   ├── proxies.js        # CRUD /proxies
    │   ├── alerts.js         # GET /alerts
    │   ├── webhooks.js       # POST /webhooks
    │   ├── integrations.js   # POST /integrations
    │   └── metrics.js        # GET /metrics
    └── services/
        ├── monitoring.js     # Monitoring loop and health-check logic
        ├── alerts.js         # Alert fire/resolve/evaluate logic
        └── webhooks.js       # Webhook delivery and Slack/Discord formatters
```

---

## License

ISC
