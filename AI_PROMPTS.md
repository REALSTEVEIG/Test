# AI Prompts Used

> Build a production-ready Node.js and Express microservice using strict TypeScript to simulate payment processing.
>
> **Architecture & Setup:**
>
> - Use a clean build structure with separated `src/` (TypeScript) and `dist/` (compiled output) directories.
> - Implement in-memory persistence with an interface that can easily be swapped for a database.
>
> **API Endpoints:**
>
> - `POST /payments`: Create a payment.
> - `GET /payments/:id`: Retrieve payment by ID.
> - `PATCH /payments/:id/status`: Update payment status, enforcing a strict state machine (e.g., preventing illegal transitions like `REFUNDED` to `PENDING`).
>
> **Core Logic:**
>
> - Simulate asynchronous processing: when created, a payment is `PENDING`, moves to `PROCESSING`, and resolves to `COMPLETED` or `FAILED` via a randomized asynchronous background timer to mimic a real gateway.
>
> **Quality & Tooling:**
>
> - Implement centralized error handling with consistent JSON error responses and strict input validation.
> - Add structured JSON logging (and a request logger middleware).
> - Write a comprehensive Jest + Supertest test suite covering unit tests for validation/state machine and integration tests for the API.
> - Provide Swagger/OpenAPI documentation and a detailed README with setup and testing instructions.

---

## Follow-up prompt — production hardening review

After an initial version, the work was reviewed for production readiness. The
following prompt drove a second pass:

> Review this service critically as if it were going to production and fix the gaps. Specifically:
>
> - **Security:** add Helmet security headers, CORS, and per-IP rate limiting; disable `x-powered-by`; run Docker as a non-root user.
> - **Config:** centralize all environment variables into one validated module that fails fast on invalid values; load `.env` via dotenv.
> - **Concurrency & correctness:** prevent lost updates between the background processing task and a manual status change (per-payment async mutex); guard terminal states; fix any check-then-act race in the file store; make file writes atomic (temp file + rename).
> - **Resilience:** handle `uncaughtException` in addition to `unhandledRejection`; keep graceful shutdown.
> - **Observability:** add a correlation ID per request (honor inbound `X-Request-Id`, echo it back, include it in logs and error bodies).
> - **API:** paginate the list endpoint; validate the payment method against an allowlist and cap field lengths.
> - **Tooling/Ops:** add ESLint + Prettier, a multi-stage Dockerfile with a healthcheck, a GitHub Actions CI matrix, and enforced Jest coverage thresholds.
> - **Verification:** run typecheck, lint, format check, the full test suite, build the Docker image, run the container, and exercise every endpoint and edge case end-to-end with curl. Report pass/fail for each.

Both prompts were followed by manual review of the generated code, live curl
testing, and a Docker build/run to confirm the container is healthy before
submission.
