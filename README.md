# Build an Event-Driven User Activity Tracking Service with RabbitMQ

## Overview

This project is a scalable **Event-Driven User Activity Tracking System** built using Node.js, RabbitMQ, and MySQL.

Instead of processing user activity directly within the API, events are published to **RabbitMQ**, and a separate consumer service processes them independently and persists them to a **MySQL** database. This ensures better scalability, loose coupling, and improved reliability.

### Architecture

```
Client → POST /api/v1/events/track → [Producer API] → RabbitMQ → [Consumer Service] → MySQL
```

- **Producer API**: Validates incoming events via Joi, publishes to the `user_activity_events` queue, and immediately returns `202 Accepted`.
- **Consumer Service**: Subscribes to the queue, deserializes each message, and inserts a row into the `user_activities` table.
- **Decoupling**: The producer never touches the database; the consumer never handles HTTP requests. They communicate exclusively through RabbitMQ.

---

## Project Structure

```
Build an Event-Driven User Activity Tracking Service with RabbitMQ/
├── api/
│   ├── controllers/
│   │   └── activityController.js
│   ├── routes/
│   │   └── activityRoutes.js
│   ├── services/
│   │   └── rabbitmq.js
│   ├── tests/
│   │   └── activity.test.js
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
│
├── consumer/
│   ├── services/
│   │   └── activityProcessor.js
│   ├── tests/
│   │   └── activityProcessor.test.js
│   ├── worker.js
│   ├── db.js
│   ├── package.json
│   └── Dockerfile
│
├── db/
│   └── init.sql
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Tech Stack

- **Runtime**: Node.js 18, Express.js
- **Message Broker**: RabbitMQ 3 (amqplib)
- **Database**: MySQL 8.0 (mysql2)
- **Validation**: Joi
- **Testing**: Jest, Supertest
- **Containerization**: Docker & Docker Compose

---

## Running the Project

### One-Command Setup

```bash
docker-compose up --build
```

This brings up four services:

| Service       | Port  | Description                                    |
|---------------|-------|------------------------------------------------|
| `api`         | 3000  | Producer REST API                              |
| `consumer`    | 3001  | Worker that processes messages (health check)  |
| `rabbitmq`    | 5672 / 15672 | Message broker (management UI)          |
| `mysql`       | 3306  | Database                                       |

All services include Docker health checks and `depends_on: service_healthy` conditions, ensuring correct startup order.

### Run Tests

```bash
# Producer tests
docker-compose exec api npx jest --no-cache

# Consumer tests
docker-compose exec consumer npx jest --no-cache
```

---

## API Endpoint

### `POST /api/v1/events/track`

Receives user activity events and publishes them to RabbitMQ.

**Request Body** (`Content-Type: application/json`):

```json
{
  "user_id": 123,
  "event_type": "page_view",
  "timestamp": "2023-10-27T10:00:00Z",
  "metadata": {
    "page_url": "/products/item-xyz",
    "session_id": "abc123"
  }
}
```

| Field        | Type    | Required | Description                         |
|--------------|---------|----------|-------------------------------------|
| `user_id`    | integer | ✓        | The user's numeric identifier       |
| `event_type` | string  | ✓        | Activity type (max 50 chars)        |
| `timestamp`  | string  | ✓        | ISO 8601 date-time                  |
| `metadata`   | object  | ✓        | Arbitrary JSON payload              |

**Responses**:

| Status | Meaning         | When                                      |
|--------|-----------------|-------------------------------------------|
| `202`  | Accepted        | Event validated and published to RabbitMQ  |
| `400`  | Bad Request     | Validation failed (missing/invalid fields) |
| `500`  | Internal Error  | RabbitMQ publish failed                    |

### `GET /health`

Available on both services:
- **Producer**: `http://localhost:3000/health` — verifies RabbitMQ connectivity
- **Consumer**: `http://localhost:3001/health` — verifies both RabbitMQ and MySQL connectivity

Returns `200 OK` when all dependencies are healthy, `503` otherwise.

---

## Database Schema

The `user_activities` table is auto-created on MySQL startup via `db/init.sql`:

```sql
CREATE TABLE IF NOT EXISTS user_activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    timestamp DATETIME NOT NULL,
    metadata JSON
);
```

---

## RabbitMQ Dashboard

Access at: http://localhost:15672

Default credentials: `guest` / `guest`

Queue name: `user_activity_events` (durable, direct exchange)

---

## Error Handling & Resilience

- **Producer**: Returns `400` with a descriptive Joi error message for invalid payloads. Returns `500` if RabbitMQ is unreachable.
- **Consumer**: Malformed messages (e.g. invalid JSON) are NACK'd without requeue to prevent poison-pill infinite loops. Database errors are logged and the message is also NACK'd.
- **Graceful Shutdown**: Both services listen for `SIGTERM` and `SIGINT`, cleanly closing HTTP servers, RabbitMQ channels/connections, and MySQL pools before exiting.
- **Retry on startup**: The consumer's RabbitMQ connection uses Docker `depends_on: service_healthy` to wait for broker readiness.

---

## Key Concepts Demonstrated

- Event-Driven Architecture
- Producer–Consumer Pattern
- Asynchronous Message Processing
- Input Validation (Joi)
- MySQL Persistence (mysql2)
- Docker Health Checks & `depends_on` conditions
- Graceful Shutdown (SIGTERM / SIGINT)
- Microservice-Style Design
- Environment Variable Management

---
