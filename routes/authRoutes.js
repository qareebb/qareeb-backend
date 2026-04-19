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
    resetPassword,
    setPassword
} = require('../controllers/authController');

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/set-password', setPassword);  // ← هذا السطر

// Protected routes (need JWT token)
router.get('/profile', (req, res, next) => {
    req.app.locals.authenticateToken(req, res, next);
}, getProfile);

// ... باقي الـ routes

module.exports = router;