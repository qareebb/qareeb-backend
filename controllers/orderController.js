const pool = require('../config/database');

// دالة حساب المسافة بين نقطتين (Haversine Formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
}

// Create Order
const createOrder = async (req, res) => {
    try {
        const { user_id, service_id, lat, lng, address_text } = req.body;

        // 1. إنشاء الطلب
        const newOrder = await pool.query(
            `INSERT INTO orders (user_id, service_id, lat, lng, address_text, status) 
             VALUES ($1, $2, $3, $4, $5, 'pending') 
             RETURNING *`,
            [user_id, service_id, lat, lng, address_text]
        );

        const orderId = newOrder.rows[0].id;

        // 2. البحث عن أقرب حرفيين يقدمون هذه الخدمة
        const craftsmen = await pool.query(
            `SELECT 
                c.id,
                c.user_id,
                c.lat,
                c.lng,
                c.rating,
                u.name,
                u.phone,
                (6371 * acos(
                    cos(radians($1)) * cos(radians(c.lat)) * 
                    cos(radians(c.lng) - radians($2)) + 
                    sin(radians($1)) * sin(radians(c.lat))
                )) AS distance
            FROM craftsmen c
            JOIN users u ON c.user_id = u.id
            JOIN craftsman_services cs ON c.id = cs.craftsman_id
            WHERE 
                cs.service_id = $3
                AND c.is_verified = true
                AND c.is_active = true
                AND (6371 * acos(
                    cos(radians($1)) * cos(radians(c.lat)) * 
                    cos(radians(c.lng) - radians($2)) + 
                    sin(radians($1)) * sin(radians(c.lat))
                )) <= c.radius_km
            ORDER BY distance ASC, c.rating DESC
            LIMIT 3`,
            [lat, lng, service_id]
        );

        // 3. إنشاء عروض للحرفيين الموجودين
        if (craftsmen.rows.length > 0) {
            for (const craftsman of craftsmen.rows) {
                await pool.query(
                    `INSERT INTO request_offers (order_id, craftsman_id) 
                     VALUES ($1, $2)`,
                    [orderId, craftsman.id]
                );
            }
        }

        res.status(201).json({
            message: 'Order created successfully',
            order: newOrder.rows[0],
            matched_craftsmen: craftsmen.rows.length,
            nearby_craftsmen: craftsmen.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get User Orders
const getOrders = async (req, res) => {
    try {
        const { userId } = req.params;

        const orders = await pool.query(
            `SELECT o.*, s.name as service_name, u.name as craftsman_name
             FROM orders o
             JOIN services s ON o.service_id = s.id
             LEFT JOIN craftsmen c ON o.craftsman_id = c.id
             LEFT JOIN users u ON c.user_id = u.id
             WHERE o.user_id = $1
             ORDER BY o.created_at DESC`,
            [userId]
        );

        res.json(orders.rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
// Add Review
const addReview = async (req, res) => {
    try {
        const { order_id, rating, comment } = req.body;
        const user_id = req.user.id; // من JWT Token

        // Check if order exists and is done
        const order = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND status = $3',
            [order_id, user_id, 'done']
        );

        if (order.rows.length === 0) {
            return res.status(400).json({ error: 'Order not found or not completed' });
        }

        const craftsman_id = order.rows[0].craftsman_id;

        // Check if review already exists
        const existingReview = await pool.query(
            'SELECT * FROM reviews WHERE order_id = $1',
            [order_id]
        );

        if (existingReview.rows.length > 0) {
            return res.status(400).json({ error: 'Review already exists for this order' });
        }

        // Add review
        const review = await pool.query(
            `INSERT INTO reviews (order_id, user_id, craftsman_id, rating, comment) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [order_id, user_id, craftsman_id, rating, comment]
        );

        // Update craftsman rating (automatically via trigger, but we can also do it here)
        const avgRating = await pool.query(
            'SELECT AVG(rating)::DECIMAL(3,2) as avg_rating, COUNT(*) as total FROM reviews WHERE craftsman_id = $1',
            [craftsman_id]
        );

        await pool.query(
            'UPDATE craftsmen SET rating = $1, total_ratings = $2 WHERE id = $3',
            [avgRating.rows[0].avg_rating, avgRating.rows[0].total, craftsman_id]
        );

        res.status(201).json({ 
            message: 'Review added successfully', 
            review: review.rows[0],
            new_rating: avgRating.rows[0].avg_rating
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get Craftsman Reviews
const getCraftsmanReviews = async (req, res) => {
    try {
        const { craftsmanId } = req.params;

        const reviews = await pool.query(
            `SELECT r.*, u.name as user_name 
             FROM reviews r 
             JOIN users u ON r.user_id = u.id 
             WHERE r.craftsman_id = $1 
             ORDER BY r.created_at DESC
             LIMIT 50`,
            [craftsmanId]
        );

        res.json(reviews.rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Update Order Status (for craftsman)
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const craftsman_id = req.user.id; // من JWT Token

        // Get craftsman internal ID
        const craftsman = await pool.query(
            'SELECT id FROM craftsmen WHERE user_id = $1',
            [craftsman_id]
        );

        if (craftsman.rows.length === 0) {
            return res.status(403).json({ error: 'Not a craftsman' });
        }

        const craftsmanInternalId = craftsman.rows[0].id;

        // Update order
        const order = await pool.query(
            `UPDATE orders SET status = $1 
             WHERE id = $2 AND craftsman_id = $3 
             RETURNING *`,
            [status, orderId, craftsmanInternalId]
        );

        if (order.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found or not assigned to you' });
        }

        res.json({ message: 'Order status updated', order: order.rows[0] });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get Craftsman Orders
const getCraftsmanOrders = async (req, res) => {
    try {
        const user_id = req.user.id;

        // Get craftsman internal ID
        const craftsman = await pool.query(
            'SELECT id FROM craftsmen WHERE user_id = $1',
            [user_id]
        );

        if (craftsman.rows.length === 0) {
            return res.status(403).json({ error: 'Not a craftsman' });
        }

        const craftsmanInternalId = craftsman.rows[0].id;

        const orders = await pool.query(
            `SELECT o.*, s.name as service_name, u.name as user_name, u.phone as user_phone
             FROM orders o
             JOIN services s ON o.service_id = s.id
             JOIN users u ON o.user_id = u.id
             WHERE o.craftsman_id = $1
             ORDER BY o.created_at DESC`,
            [craftsmanInternalId]
        );

        res.json(orders.rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
module.exports = { 
    createOrder, 
    getOrders, 
    addReview, 
    getCraftsmanReviews,
    updateOrderStatus,
    getCraftsmanOrders
};