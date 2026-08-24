import { Router } from 'express';
import * as controller from '../controllers/paymentController';

const router = Router();

// Create + list
router.post('/', controller.createPayment);
router.get('/', controller.listPayments);

// Retrieve by id
router.get('/:id', controller.getPayment);

// Update status (PUT accepted as an alias for PATCH)
router.patch('/:id/status', controller.updateStatus);
router.put('/:id/status', controller.updateStatus);

export default router;
