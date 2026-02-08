# infiniteDEV API Reference

The health monitor provides a REST API for monitoring and controlling infiniteDEV.

**Base URL**: `http://localhost:3030`

## Endpoints

### Health Check

**GET** `/health`

Basic health check.

**Response (200 OK)**:
```json
{
  "status": "ok",
  "timestamp": 1706928000000
}
```

---

### System Status

**GET** `/status`

Get comprehensive system status including daemon, Mayor, agents, and tasks.

**Response (200 OK)**:
```json
{
  "timestamp": 1706928000000,
  "system": {
    "daemon": "running",
    "health": "running",
    "mayor": "running"
  },
  "tasks": {
    "total": 25,
    "ready": 3,
    "byStatus": {
      "open": 5,
      "inProgress": 10,
      "closed": 8,
      "blocked": 2
    }
  },
  "agents": [
    {
      "name": "infinitedev-daemon",
      "status": "online",
      "memory": "45.23MB",
      "uptime": 3600000
    }
  ],
  "readyTasks": [
    {
      "id": "bd-a1b2c",
      "title": "Implement JWT service",
      "type": "implementation",
      "priority": 1
    }
  ]
}
```

---

### Metrics

**GET** `/metrics`

Get performance metrics and usage statistics.

**Response (200 OK)**:
```json
{
  "timestamp": 1706928000000,
  "uptime": 3600,
  "memory": {
    "rss": "125.45MB",
    "heapUsed": "67.23MB",
    "heapTotal": "128.00MB"
  },
  "tasks": {
    "total": 25,
    "completed": 8,
    "active": 10
  }
}
```

---

### Task List

**GET** `/tasks?status=open&limit=50`

List tasks with optional filtering.

**Query Parameters**:
- `status` (optional): Filter by status (open, in_progress, closed, blocked)
- `limit` (optional): Max tasks to return (default: 50)

**Response (200 OK)**:
```json
{
  "count": 5,
  "tasks": [
    {
      "id": "bd-a1b2c",
      "title": "Design auth schema",
      "status": "open",
      "type": "architecture",
      "priority": 1,
      "created": 1706928000
    }
  ]
}
```

---

### View Logs

**GET** `/logs/:service?lines=50`

Get recent logs from a service.

**Path Parameters**:
- `service`: Service name (daemon, health, mayor, architect, builder, tester)

**Query Parameters**:
- `lines` (optional): Number of lines (default: 50)

**Response (200 OK)**:
```json
{
  "service": "daemon",
  "count": 50,
  "logs": [
    "[2025-02-04 10:30:15] [Daemon] Rate limit daemon started successfully",
    "[2025-02-04 10:30:16] [Daemon] Checking limits..."
  ]
}
```

**Response (400 Bad Request)**:
```json
{
  "error": "Invalid service",
  "allowed": ["daemon", "health", "mayor", "architect", "builder", "tester"]
}
```

---

### Pause System

**POST** `/pause`

Manually pause all operations (daemon and Mayor).

**Request**:
```bash
curl -X POST http://localhost:3030/pause
```

**Response (200 OK)**:
```json
{
  "status": "paused",
  "timestamp": 1706928000000,
  "message": "System paused successfully"
}
```

**Response (400 Bad Request)**:
```json
{
  "error": "Cannot pause - daemon or mayor not running"
}
```

---

### Resume System

**POST** `/resume`

Resume operations after a pause.

**Request**:
```bash
curl -X POST http://localhost:3030/resume
```

**Response (200 OK)**:
```json
{
  "status": "resumed",
  "timestamp": 1706928000000,
  "message": "System resumed successfully"
}
```

---

## Error Responses

All endpoints return appropriate HTTP status codes:

- **200 OK**: Request successful
- **400 Bad Request**: Invalid parameters or system state
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Server error

**Error Response Format**:
```json
{
  "error": "Error description",
  "message": "Detailed error message"
}
```

---

## Usage Examples

### Check System Health

```bash
curl http://localhost:3030/health
```

### Get Full Status

```bash
curl http://localhost:3030/status | jq
```

### List Open Tasks

```bash
curl "http://localhost:3030/tasks?status=open"
```

### View Daemon Logs

```bash
curl "http://localhost:3030/logs/daemon?lines=100"
```

### Pause System

```bash
curl -X POST http://localhost:3030/pause
```

### Monitor Metrics

```bash
watch -n 5 'curl http://localhost:3030/metrics | jq .tasks'
```

---

## Rate Limiting

The API has NO built-in rate limits for local use. Use responsibly.

---

## Polling Recommendations

For monitoring, we recommend:
- Status: Poll every 30 seconds
- Metrics: Poll every 5 minutes
- Logs: Poll on demand only (not continuously)

Example polling script:

```bash
while true; do
  clear
  curl http://localhost:3030/status | jq '.tasks'
  sleep 30
done
```

---

## Programmatic Usage

### Python Example

```python
import requests
import json

API_URL = "http://localhost:3030"

# Get status
response = requests.get(f"{API_URL}/status")
status = response.json()
print(f"Tasks ready: {status['tasks']['ready']}")

# Pause system
response = requests.post(f"{API_URL}/pause")
print(response.json()['message'])

# Resume system
response = requests.post(f"{API_URL}/resume")
print(response.json()['message'])
```

### Node.js Example

```javascript
const axios = require('axios');

const API_URL = 'http://localhost:3030';

// Get status
axios.get(`${API_URL}/status`).then(res => {
  console.log(`Tasks ready: ${res.data.tasks.ready}`);
});

// Pause system
axios.post(`${API_URL}/pause`).then(res => {
  console.log(res.data.message);
});
```

---

## Availability

The health monitor listens on `localhost:3030` by default.

To change the port:

```bash
PORT=8080 npm start src/health/index.js
```

Or in ecosystem.config.js, modify the `env.PORT` setting.
