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

// Qareeb Order Routes

// Create new order
router.post('/', createOrder);

// Get user orders
router.get('/user/:userId', getOrders);

// Add review (needs authentication)
router.post('/review', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, addReview);

// Get craftsman reviews (public)
router.get('/reviews/:craftsmanId', getCraftsmanReviews);

// Get craftsman orders (needs authentication)
router.get('/craftsman', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, getCraftsmanOrders);

// Update order status (needs authentication, craftsman only)
router.put('/:orderId/status', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, updateOrderStatus);

module.exports = router;