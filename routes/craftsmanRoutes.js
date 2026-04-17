const express = require('express');
const router = express.Router();
const { 
    getCraftsmen, 
    updateLocation, 
    acceptOffer,
    getTopCraftsmen
} = require('../controllers/craftsmanController');
const { getTopCraftsmen: getTopFromOrders } = require('../controllers/orderController');

// Qareeb Craftsman Routes
router.get('/nearby', getCraftsmen);
router.put('/location/:craftsmanId', updateLocation);
router.post('/accept-offer/:offerId', acceptOffer);
router.get('/top', getTopFromOrders); // أفضل الحرفيين حسب Score

module.exports = router;