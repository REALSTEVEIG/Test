# Payment Processing Service (TypeScript)

A **TypeScript** + Express microservice that **simulates** payment processing. It
exposes a RESTful API to create payments, retrieve them by ID, and update their
status. Payment "processing" is performed **asynchronously** in the background:
a newly created payment starts as `PENDING`, transitions to `PROCESSING`, and
then settles to `COMPLETED` or `FAILED` after a short, randomized delay
(mimicking a call to an external payment gateway).

The project is written entirely in TypeScript with **full strict mode**. Source
lives in `src/` (`.ts`), and the compiled JavaScript is emitted to `dist/`.

Highlights:

- Clean, layered architecture (routes → controllers → service → store)
- Strong typing across the payment domain (status enum, transition map, DTOs)
- Robust **error handling** with a consistent JSON error shape
- Structured **logging** (single-line JSON)
- Realistic **asynchronous** programming (Promises, timers, background tasks)
- **Unit + integration tests** with Jest + ts-jest + Supertest
- **API documentation** via Swagger UI (OpenAPI 3)

---

## Table of contents

- [Requirements](#requirements)
- [Setup & running locally](#setup--running-locally)
- [Scripts](#scripts)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Payment lifecycle & state machine](#payment-lifecycle--state-machine)
- [Error format](#error-format)
- [Testing](#testing)
- [Project structure](#project-structure)

---

## Requirements

- **Node.js 18+** (uses the built-in `crypto.randomUUID`; developed on Node 22)
- npm

---

## Setup & running locally

```bash
# 1. Install dependencies
npm install

# 2. (optional) copy env template and adjust
cp .env.example .env

# 3a. Development: run the TypeScript directly with auto-reload
npm run dev

# 3b. Production: compile to dist/ then run the compiled output
npm run build
npm start
```

By default the service listens on **http://localhost:3000**.

Quick check:

```bash
curl http://localhost:3000/health
# {"status":"ok","uptime":1.23}
```

Interactive API docs (Swagger UI): **http://localhost:3000/api-docs**
Raw OpenAPI JSON: **http://localhost:3000/openapi.json**

---

## Scripts

| Script                  | Description                                             |
| ----------------------- | ------------------------------------------------------ |
| `npm run dev`           | Run `src/server.ts` via ts-node with reload (nodemon)  |
| `npm run build`         | Type-check + compile `src/` → `dist/`                  |
| `npm start`             | Run the compiled server (`dist/server.js`)             |
| `npm run typecheck`     | `tsc --noEmit` over `src/` and `tests/`               |
| `npm test`              | Run the Jest suite (via ts-jest)                       |
| `npm run test:coverage` | Run tests with a coverage report                       |
| `npm run clean`         | Remove `dist/`                                          |

---

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable               | Default  | Description                                                   |
| ---------------------- | -------- | ------------------------------------------------------------ |
| `PORT`                 | `3000`   | Port to listen on                                            |
| `LOG_LEVEL`            | `info`   | `error` \| `warn` \| `info` \| `debug` (silent during tests) |
| `PERSISTENCE`          | `memory` | `memory` (default) or `file` for JSON-file persistence       |
| `DATA_DIR`             | `./data` | Directory for the JSON file when `PERSISTENCE=file`          |
| `PROCESSING_DELAY_MS`  | `800`    | Simulated gateway processing time (ms)                       |
| `PAYMENT_FAILURE_RATE` | `0.15`   | Probability `[0..1]` a payment fails during processing       |

---

## API reference

Base URL: `http://localhost:3000`. All bodies are JSON; successful resource
responses are wrapped in a `data` envelope.

### Health

```
GET /health  →  200 { "status": "ok", "uptime": <seconds> }
```

### Create a payment

```
POST /payments
Content-Type: application/json
```

| Field         | Type   | Required | Notes                                                  |
| ------------- | ------ | -------- | ------------------------------------------------------ |
| `amount`      | number | yes      | > 0, max 2 decimal places                              |
| `currency`    | string | yes      | One of: USD, EUR, GBP, JPY, NGN, CAD, AUD (uppercased) |
| `method`      | string | yes      | e.g. `card`, `bank_transfer`                           |
| `description` | string | no       |                                                        |
| `metadata`    | object | no       | Arbitrary key/value data                               |

```bash
curl -X POST http://localhost:3000/payments \
  -H 'Content-Type: application/json' \
  -d '{"amount":49.99,"currency":"USD","method":"card","description":"Order #1234"}'
```

`201 Created`:

```json
{
  "data": {
    "id": "e7a80934-6fd9-4d94-9d14-9dc50cffac34",
    "amount": 49.99,
    "currency": "USD",
    "method": "card",
    "description": "Order #1234",
    "metadata": {},
    "status": "PENDING",
    "failureReason": null,
    "createdAt": "2026-08-24T17:44:39.577Z",
    "updatedAt": "2026-08-24T17:44:39.577Z",
    "processedAt": null
  }
}
```

The payment is returned immediately as `PENDING`; processing continues in the
background. Poll `GET /payments/:id` to observe it settle.

### Retrieve a payment

```bash
curl http://localhost:3000/payments/<id>
```

`200 OK` with the payment, or `404 Not Found`.

### List payments

```bash
curl http://localhost:3000/payments
# { "data": [ ...payments ], "count": 2 }
```

### Update payment status

```
PATCH /payments/<id>/status      (PUT is also accepted as an alias)
Content-Type: application/json
{ "status": "REFUNDED" }
```

```bash
curl -X PATCH http://localhost:3000/payments/<id>/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"REFUNDED"}'
```

- `200 OK` with the updated payment
- `400` invalid status value
- `404` payment not found
- `409` illegal status transition (see state machine below)

---

## Payment lifecycle & state machine

Valid statuses: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `REFUNDED`,
`CANCELLED`.

Allowed transitions (enforced by the service; violations return `409`):

| From         | Allowed to                                       |
| ------------ | ------------------------------------------------ |
| `PENDING`    | `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `PROCESSING` | `COMPLETED`, `FAILED`                            |
| `COMPLETED`  | `REFUNDED`                                       |
| `FAILED`     | `PENDING` (retry)                                |
| `REFUNDED`   | — (terminal)                                     |
| `CANCELLED`  | — (terminal)                                     |

Automatic background flow on creation:
`PENDING → PROCESSING → COMPLETED` (or `FAILED`, based on `PAYMENT_FAILURE_RATE`).

---

## Error format

All errors share a consistent shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid payment payload",
    "details": [{ "field": "amount", "message": "amount is required" }]
  }
}
```

| HTTP | `code`             | When                       |
| ---- | ------------------ | -------------------------- |
| 400  | `VALIDATION_ERROR` | Invalid request body       |
| 400  | `INVALID_JSON`     | Malformed JSON body        |
| 404  | `NOT_FOUND`        | Unknown payment or route   |
| 409  | `CONFLICT`         | Illegal status transition  |
| 500  | `INTERNAL_ERROR`   | Unexpected server error    |

---

## Testing

Tests are written in TypeScript and run through **ts-jest** with **Supertest**
for HTTP integration. Processing delay and failure rate are overridden in tests
to be fast and deterministic.

```bash
npm test              # run the full suite
npm run test:coverage # with coverage
npm run test:watch    # watch mode
```

Test suites (in `tests/`):

- `model.test.ts` — input validation & the status state machine
- `paymentService.test.ts` — service layer: async success flow, transitions, not-found
- `paymentFailure.test.ts` — forced-failure gateway path (`FAILED` + `failureReason`)
- `api.test.ts` — end-to-end HTTP tests for every endpoint, incl. 400/404/409 cases

---

## Project structure

```
payment-service/
├── src/                        # TypeScript sources
│   ├── app.ts                  # Express app factory (used by server & tests)
│   ├── server.ts               # HTTP bootstrap + graceful shutdown
│   ├── types.ts                # Shared domain types
│   ├── controllers/
│   │   └── paymentController.ts
│   ├── routes/
│   │   └── paymentRoutes.ts
│   ├── services/
│   │   └── paymentService.ts   # async processing simulation + business rules
│   ├── store/
│   │   └── paymentStore.ts     # in-memory / JSON-file persistence
│   ├── models/
│   │   └── payment.ts          # validation + status transitions
│   ├── middleware/
│   │   ├── asyncHandler.ts
│   │   ├── errorHandler.ts
│   │   └── requestLogger.ts
│   ├── errors/
│   │   └── AppError.ts         # typed operational errors
│   ├── docs/
│   │   └── openapi.ts          # OpenAPI 3 spec (served at /api-docs)
│   └── utils/
│       └── logger.ts
├── tests/                      # TypeScript tests (ts-jest)
│   ├── model.test.ts
│   ├── paymentService.test.ts
│   ├── paymentFailure.test.ts
│   └── api.test.ts
├── dist/                       # compiled JS output (generated by `npm run build`)
├── tsconfig.json               # base + test type-checking config
├── tsconfig.build.json         # production build config (src → dist)
├── .env.example
├── .gitignore
└── package.json
```

---

## Notes

- Uses **Express 4** for smooth first-class TypeScript typings with
  `swagger-ui-express`.
- Persistence defaults to in-memory; set `PERSISTENCE=file` to persist to
  `data/payments.json`. Swapping in a real database only requires reimplementing
  `src/store/paymentStore.ts` against the same async interface.
- The async simulation deliberately introduces randomized success/failure so the
  service behaves like it talks to a real, unreliable gateway.
