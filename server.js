const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// JWT Authentication Middleware
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Make authenticateToken available to routes
app.locals.authenticateToken = authenticateToken;

// Test Route
app.get('/', (req, res) => {
    res.json({ 
        message: 'Welcome to Qareeb API 🚀',
        version: '2.0.0',
        status: 'Production-Ready',
        endpoints: {
            auth: '/api/auth',
            orders: '/api/orders',
            craftsmen: '/api/craftsmen'
        }
    });
});

// Health Check Route (لـ Render)
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Routes
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const craftsmanRoutes = require('./routes/craftsmanRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/craftsmen', craftsmanRoutes);

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ==========================================
// Cron Job: تنظيف العروض المنتهية
// ==========================================
const cleanupExpiredOffers = async () => {
    try {
        const pool = require('./config/database');
        const result = await pool.query(
            `UPDATE request_offers 
             SET status = 'expired' 
             WHERE status = 'pending' 
             AND expires_at < NOW()`
        );
        if (result.rowCount > 0) {
            console.log(`🧹 Cleaned up ${result.rowCount} expired offers`);
        }
    } catch (error) {
        console.error('Error cleaning up expired offers:', error.message);
    }
};

// تشغيل كل دقيقة
setInterval(cleanupExpiredOffers, 60000);

// ==========================================
// بدء السيرفر
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Qareeb server running on port ${PORT}`);
    console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 API URL: http://localhost:${PORT}/api`);
    
    // تنظيف أولي عند بدء التشغيل
    cleanupExpiredOffers();
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    process.exit(0);
});