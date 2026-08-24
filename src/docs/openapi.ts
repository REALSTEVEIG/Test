import { PAYMENT_STATUS, SUPPORTED_CURRENCIES } from '../models/payment';

/**
 * Static OpenAPI 3.0 document served via swagger-ui-express at /api-docs.
 */
const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Payment Processing Service',
    version: '1.0.0',
    description:
      'A microservice that simulates payment processing. Payments are created as PENDING and asynchronously transition to COMPLETED or FAILED.',
  },
  servers: [{ url: '/', description: 'Current host' }],
  tags: [{ name: 'Payments' }, { name: 'Health' }],
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['Health'],
        responses: { 200: { description: 'Service is healthy' } },
      },
    },
    '/payments': {
      post: {
        summary: 'Create a payment',
        tags: ['Payments'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreatePaymentRequest' },
              example: {
                amount: 49.99,
                currency: 'USD',
                method: 'card',
                description: 'Order #1234',
                metadata: { orderId: '1234' },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Payment created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/PaymentEnvelope' } },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
        },
      },
      get: {
        summary: 'List all payments',
        tags: ['Payments'],
        responses: {
          200: {
            description: 'A list of payments',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Payment' } },
                    count: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/payments/{id}': {
      get: {
        summary: 'Retrieve a payment by ID',
        tags: ['Payments'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'The payment',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/PaymentEnvelope' } },
            },
          },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/payments/{id}/status': {
      patch: {
        summary: "Update a payment's status",
        tags: ['Payments'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateStatusRequest' },
              example: { status: 'COMPLETED' },
            },
          },
        },
        responses: {
          200: {
            description: 'Updated payment',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/PaymentEnvelope' } },
            },
          },
          400: { $ref: '#/components/responses/ValidationError' },
          404: { $ref: '#/components/responses/NotFound' },
          409: { $ref: '#/components/responses/Conflict' },
        },
      },
    },
  },
  components: {
    schemas: {
      CreatePaymentRequest: {
        type: 'object',
        required: ['amount', 'currency', 'method'],
        properties: {
          amount: { type: 'number', example: 49.99, description: 'Positive, max 2 decimals' },
          currency: { type: 'string', enum: [...SUPPORTED_CURRENCIES], example: 'USD' },
          method: { type: 'string', example: 'card' },
          description: { type: 'string', nullable: true },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      UpdateStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: Object.values(PAYMENT_STATUS) } },
      },
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          method: { type: 'string' },
          description: { type: 'string', nullable: true },
          metadata: { type: 'object', additionalProperties: true },
          status: { type: 'string', enum: Object.values(PAYMENT_STATUS) },
          failureReason: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          processedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      PaymentEnvelope: {
        type: 'object',
        properties: { data: { $ref: '#/components/schemas/Payment' } },
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: {},
            },
          },
        },
      },
    },
    responses: {
      ValidationError: {
        description: 'Validation error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      Conflict: {
        description: 'Illegal state transition',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
  },
} as const;

export default openapiSpec;
