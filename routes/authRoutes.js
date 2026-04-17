const express = require('express');
const router = express.Router();
const { 
    register, 
    login, 
    getProfile, 
    updateProfile,
    updateCraftsmanProfile,
    changePassword,
    forgotPassword,
    resetPassword
} = require('../controllers/authController');

// Qareeb Auth Routes

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes (need JWT token)
router.get('/profile', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, getProfile);

router.put('/profile', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, updateProfile);

router.put('/craftsman/profile', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, updateCraftsmanProfile);

router.put('/change-password', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, changePassword);

module.exports = router;