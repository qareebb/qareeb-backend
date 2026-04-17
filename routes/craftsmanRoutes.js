const express = require('express');
const router = express.Router();
const { 
    getCraftsmen, 
    updateLocation, 
    acceptOffer,
    getAllCraftsmen,
    getCraftsmanById,
    getCraftsmanOffers,
    respondToOffer
} = require('../controllers/craftsmanController');

// ============================================
// Public Routes (لا تحتاج تسجيل دخول)
// ============================================

// Get nearby craftsmen by service
router.get('/nearby', getCraftsmen);

// Get all craftsmen (for map view)
router.get('/all', getAllCraftsmen);

// Get single craftsman details
router.get('/:id', getCraftsmanById);

// ============================================
// Protected Routes (تحتاج تسجيل دخول)
// ============================================

// Update craftsman location
router.put('/location/:craftsmanId', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, updateLocation);

// Accept offer (legacy - still works)
router.post('/accept-offer/:offerId', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, acceptOffer);

// Get pending offers for logged in craftsman
router.get('/offers/pending', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, getCraftsmanOffers);

// Respond to offer (accept/reject)
router.post('/offers/:offerId/respond', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, respondToOffer);

module.exports = router;