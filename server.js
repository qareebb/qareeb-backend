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
    res.json({ message: 'Welcome to Qareeb API 🚀' });
});

// Routes
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const craftsmanRoutes = require('./routes/craftsmanRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/craftsmen', craftsmanRoutes);

// Temporary setup route
app.get('/api/setup-craftsman', async (req, res) => {
    try {
        const pool = require('./config/database');
        
        await pool.query('INSERT INTO craftsman_services (craftsman_id, service_id) VALUES (1, 1) ON CONFLICT DO NOTHING');
        await pool.query('INSERT INTO craftsman_services (craftsman_id, service_id) VALUES (1, 2) ON CONFLICT DO NOTHING');
        await pool.query('UPDATE craftsmen SET is_verified = true WHERE id = 1');
        await pool.query('UPDATE craftsmen SET lat = 34.7400, lng = 10.7600, radius_km = 5 WHERE id = 1');
        
        res.json({ message: '✅ Qareeb craftsman setup completed!' });
    } catch (error) {
        res.json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Qareeb server running on port ${PORT}`);
});