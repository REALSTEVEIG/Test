# AI Prompts Used

The following prompt was used to generate and refine this payment processing microservice.

---

**Prompt:**

> Build a production-ready Node.js and Express microservice using strict TypeScript to simulate payment processing. 
> 
> **Architecture & Setup:**
> - Use a clean build structure with separated `src/` (TypeScript) and `dist/` (compiled output) directories.
> - Implement in-memory persistence with an interface that can easily be swapped for a database.
> 
> **API Endpoints:**
> - `POST /payments`: Create a payment.
> - `GET /payments/:id`: Retrieve payment by ID.
> - `PATCH /payments/:id/status`: Update payment status, enforcing a strict state machine (e.g., preventing illegal transitions like `REFUNDED` to `PENDING`).
> 
> **Core Logic:**
> - Simulate asynchronous processing: when created, a payment is `PENDING`, moves to `PROCESSING`, and resolves to `COMPLETED` or `FAILED` via a randomized asynchronous background timer to mimic a real gateway.
> 
> **Quality & Tooling:**
> - Implement centralized error handling with consistent JSON error responses and strict input validation.
> - Add structured JSON logging (and a request logger middleware).
> - Write a comprehensive Jest + Supertest test suite covering unit tests for validation/state machine and integration tests for the API.
> - Provide Swagger/OpenAPI documentation and a detailed README with setup and testing instructions.
