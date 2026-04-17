const express = require('express');
const router = express.Router();
const { 
    createOrder, 
    getOrders, 
    addReview, 
    getCraftsmanReviews,
    updateOrderStatus,
    getCraftsmanOrders
} = require('../controllers/orderController');
const authMiddleware = require('../middleware/auth');

// Order routes
router.post('/', createOrder);
router.get('/user/:userId', getOrders);

// Craftsman order routes
router.get('/craftsman', authMiddleware, getCraftsmanOrders);
router.put('/:orderId/status', authMiddleware, updateOrderStatus);

// Review routes
router.post('/review', authMiddleware, addReview);
router.get('/reviews/craftsman/:craftsmanId', getCraftsmanReviews);

module.exports = router;