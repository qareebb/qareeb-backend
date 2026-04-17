const express = require('express');
const router = express.Router();
const { 
    createOrder, 
    getOrders, 
    addReview,
    addCustomerReview,
    getCraftsmanReviews,
    getCustomerReviews,
    updateOrderStatus,
    getCraftsmanOrders,
    getTopCraftsmen
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
router.post('/customer-review', authMiddleware, addCustomerReview);
router.get('/reviews/craftsman/:craftsmanId', getCraftsmanReviews);
router.get('/reviews/customer/:userId', getCustomerReviews);
router.get('/top-craftsmen', getTopCraftsmen);

module.exports = router;