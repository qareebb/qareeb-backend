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

// Calculate craftsman score and badge
async function calculateCraftsmanScore(craftsmanId) {
    try {
        const ratingResult = await pool.query(
            `SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews 
             FROM reviews WHERE craftsman_id = $1`,
            [craftsmanId]
        );
        
        const avgRating = parseFloat(ratingResult.rows[0].avg_rating) || 0;
        const totalReviews = parseInt(ratingResult.rows[0].total_reviews) || 0;
        
        const statsResult = await pool.query(
            `SELECT total_requests, accepted_requests, response_time_minutes 
             FROM craftsmen WHERE id = $1`,
            [craftsmanId]
        );
        
        const stats = statsResult.rows[0];
        const acceptanceRate = stats.total_requests > 0 
            ? (stats.accepted_requests / stats.total_requests) * 100 
            : 0;
        
        const responseMinutes = stats.response_time_minutes || 60;
        const responseScore = Math.max(0, 5 - (responseMinutes / 30));
        
        const ratingScore = Math.min(avgRating * 20, 100);
        const reviewsScore = Math.min(totalReviews * 2, 20);
        const acceptanceScore = Math.min((acceptanceRate / 100) * 10, 10);
        const responseFinalScore = Math.min(responseScore, 5);
        
        let totalScore = Math.floor(
            ratingScore + reviewsScore + acceptanceScore + responseFinalScore
        );
        totalScore = Math.min(totalScore, 100);
        
        let badge = 'عادي';
        if (totalScore >= 90) badge = '💎 خبير';
        else if (totalScore >= 70) badge = '👑 محترف';
        else if (totalScore >= 40) badge = '⭐ موثوق';
        
        await pool.query(
            `UPDATE craftsmen 
             SET score = $1, badge = $2, acceptance_rate = $3 
             WHERE id = $4`,
            [totalScore, badge, acceptanceRate, craftsmanId]
        );
        
        return { score: totalScore, badge, acceptanceRate };
        
    } catch (error) {
        console.error('Error calculating craftsman score:', error);
        return { score: 0, badge: 'عادي', acceptanceRate: 0 };
    }
}

// Calculate customer score and badge
async function calculateCustomerScore(userId) {
    try {
        const ratingResult = await pool.query(
            `SELECT AVG(rating) as avg_rating, COUNT(*) as total_reviews 
             FROM customer_reviews WHERE user_id = $1`,
            [userId]
        );
        
        const avgRating = parseFloat(ratingResult.rows[0].avg_rating) || 0;
        const totalReviews = parseInt(ratingResult.rows[0].total_reviews) || 0;
        
        const ratingScore = Math.min(avgRating * 20, 100);
        const reviewsScore = Math.min(totalReviews * 2, 20);
        
        let totalScore = Math.floor(ratingScore + reviewsScore);
        totalScore = Math.min(totalScore, 100);
        
        let badge = 'عادي';
        if (totalScore >= 90) badge = '💎 عميل ممتاز';
        else if (totalScore >= 70) badge = '👑 عميل محترم';
        else if (totalScore >= 40) badge = '⭐ عميل جيد';
        
        await pool.query(
            `UPDATE users 
             SET customer_score = $1, customer_badge = $2, 
                 customer_rating = $3, total_customer_ratings = $4 
             WHERE id = $5`,
            [totalScore, badge, avgRating, totalReviews, userId]
        );
        
        return { score: totalScore, badge };
        
    } catch (error) {
        console.error('Error calculating customer score:', error);
        return { score: 0, badge: 'عادي' };
    }
}

// Create Order
const createOrder = async (req, res) => {
    try {
        const { user_id, service_id, craftsman_id, lat, lng, address_text } = req.body;

        const newOrder = await pool.query(
            `INSERT INTO orders (user_id, service_id, craftsman_id, lat, lng, address_text, status) 
             VALUES ($1, $2, $3, $4, $5, $6, 'pending') 
             RETURNING *`,
            [user_id, service_id, craftsman_id || null, lat, lng, address_text]
        );

        const orderId = newOrder.rows[0].id;

        if (craftsman_id) {
            await pool.query(
                `UPDATE craftsmen 
                 SET total_requests = total_requests + 1 
                 WHERE id = $1`,
                [craftsman_id]
            );
        }

        if (!craftsman_id) {
            const craftsmen = await pool.query(
                `SELECT 
                    c.id,
                    c.user_id,
                    c.lat,
                    c.lng,
                    c.rating,
                    c.score,
                    c.badge,
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
                ORDER BY c.score DESC, distance ASC, c.rating DESC
                LIMIT 3`,
                [lat, lng, service_id]
            );

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
        } else {
            res.status(201).json({
                message: 'Order created successfully',
                order: newOrder.rows[0]
            });
        }

    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
};

// Get User Orders
const getOrders = async (req, res) => {
    try {
        const { userId } = req.params;

        const orders = await pool.query(
            `SELECT o.*, s.name as service_name, u.name as craftsman_name, u.phone as craftsman_phone,
                    CASE WHEN r.id IS NOT NULL THEN true ELSE false END as has_review,
                    CASE WHEN cr.id IS NOT NULL THEN true ELSE false END as has_customer_review
             FROM orders o
             JOIN services s ON o.service_id = s.id
             LEFT JOIN craftsmen c ON o.craftsman_id = c.id
             LEFT JOIN users u ON c.user_id = u.id
             LEFT JOIN reviews r ON r.order_id = o.id
             LEFT JOIN customer_reviews cr ON cr.order_id = o.id
             WHERE o.user_id = $1
             ORDER BY o.created_at DESC`,
            [userId]
        );

        res.json(orders.rows);

    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
};

// Add Review (Customer reviews Craftsman)
const addReview = async (req, res) => {
    try {
        const { order_id, rating, comment } = req.body;
        const user_id = req.user.id;

        const order = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND user_id = $2 AND status = $3',
            [order_id, user_id, 'done']
        );

        if (order.rows.length === 0) {
            return res.status(400).json({ error: 'لا يمكن التقييم إلا بعد إتمام الخدمة' });
        }

        const craftsman_id = order.rows[0].craftsman_id;

        if (!craftsman_id) {
            return res.status(400).json({ error: 'لم يتم تعيين حرفي لهذا الطلب' });
        }

        const existingReview = await pool.query(
            'SELECT * FROM reviews WHERE order_id = $1',
            [order_id]
        );

        if (existingReview.rows.length > 0) {
            return res.status(400).json({ error: 'لقد قمت بتقييم هذا الحرفي مسبقاً' });
        }

        const review = await pool.query(
            `INSERT INTO reviews (order_id, user_id, craftsman_id, rating, comment) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [order_id, user_id, craftsman_id, rating, comment || null]
        );

        const avgRating = await pool.query(
            'SELECT AVG(rating)::DECIMAL(3,2) as avg_rating, COUNT(*) as total FROM reviews WHERE craftsman_id = $1',
            [craftsman_id]
        );

        await pool.query(
            'UPDATE craftsmen SET rating = $1, total_ratings = $2 WHERE id = $3',
            [avgRating.rows[0].avg_rating || 0, avgRating.rows[0].total || 0, craftsman_id]
        );

        const scoreResult = await calculateCraftsmanScore(craftsman_id);

        res.status(201).json({ 
            message: 'تم إضافة التقييم بنجاح', 
            review: review.rows[0],
            new_rating: avgRating.rows[0].avg_rating,
            score: scoreResult.score,
            badge: scoreResult.badge
        });

    } catch (error) {
        console.error('Add review error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
};

// Add Customer Review (Craftsman reviews Customer)
const addCustomerReview = async (req, res) => {
    try {
        const { order_id, rating, comment } = req.body;
        const craftsman_user_id = req.user.id;

        const craftsman = await pool.query(
            'SELECT id FROM craftsmen WHERE user_id = $1',
            [craftsman_user_id]
        );

        if (craftsman.rows.length === 0) {
            return res.status(403).json({ error: 'غير مصرح - حرفي فقط' });
        }

        const craftsman_id = craftsman.rows[0].id;

        const order = await pool.query(
            'SELECT * FROM orders WHERE id = $1 AND craftsman_id = $2 AND status = $3',
            [order_id, craftsman_id, 'done']
        );

        if (order.rows.length === 0) {
            return res.status(400).json({ error: 'لا يمكن التقييم إلا بعد إتمام الخدمة' });
        }

        const user_id = order.rows[0].user_id;

        const existingReview = await pool.query(
            'SELECT * FROM customer_reviews WHERE order_id = $1',
            [order_id]
        );

        if (existingReview.rows.length > 0) {
            return res.status(400).json({ error: 'لقد قمت بتقييم هذا العميل مسبقاً' });
        }

        const review = await pool.query(
            `INSERT INTO customer_reviews (order_id, craftsman_id, user_id, rating, comment) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [order_id, craftsman_id, user_id, rating, comment || null]
        );

        const scoreResult = await calculateCustomerScore(user_id);

        res.status(201).json({ 
            message: 'تم تقييم العميل بنجاح', 
            review: review.rows[0],
            customer_score: scoreResult.score,
            customer_badge: scoreResult.badge
        });

    } catch (error) {
        console.error('Add customer review error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
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
        console.error('Get reviews error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
};

// Get Customer Reviews
const getCustomerReviews = async (req, res) => {
    try {
        const { userId } = req.params;

        const reviews = await pool.query(
            `SELECT cr.*, c.user_id as craftsman_user_id, u.name as craftsman_name 
             FROM customer_reviews cr 
             JOIN craftsmen c ON cr.craftsman_id = c.id
             JOIN users u ON c.user_id = u.id
             WHERE cr.user_id = $1 
             ORDER BY cr.created_at DESC
             LIMIT 50`,
            [userId]
        );

        res.json(reviews.rows);

    } catch (error) {
        console.error('Get customer reviews error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
};

// Update Order Status (for craftsman)
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status } = req.body;
        const user_id = req.user.id;

        const craftsman = await pool.query(
            'SELECT id FROM craftsmen WHERE user_id = $1',
            [user_id]
        );

        if (craftsman.rows.length === 0) {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        const craftsmanInternalId = craftsman.rows[0].id;

        const order = await pool.query(
            `UPDATE orders SET status = $1 
             WHERE id = $2 AND craftsman_id = $3 
             RETURNING *`,
            [status, orderId, craftsmanInternalId]
        );

        if (order.rows.length === 0) {
            return res.status(404).json({ error: 'الطلب غير موجود أو غير موكل لك' });
        }

        if (status === 'accepted') {
            await pool.query(
                `UPDATE craftsmen 
                 SET total_requests = total_requests + 1,
                     accepted_requests = accepted_requests + 1 
                 WHERE id = $1`,
                [craftsmanInternalId]
            );
            
            const orderResult = await pool.query(
                'SELECT EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes FROM orders WHERE id = $1',
                [orderId]
            );
            const responseMinutes = Math.floor(orderResult.rows[0].minutes) || 10;
            
            await pool.query(
                `UPDATE craftsmen 
                 SET response_time_minutes = (COALESCE(response_time_minutes, 60) + $1) / 2 
                 WHERE id = $2`,
                [responseMinutes, craftsmanInternalId]
            );
        }

        await calculateCraftsmanScore(craftsmanInternalId);

        res.json({ 
            message: 'تم تحديث حالة الطلب', 
            order: order.rows[0] 
        });

    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
};

// Get Craftsman Orders
const getCraftsmanOrders = async (req, res) => {
    try {
        const user_id = req.user.id;

        const craftsman = await pool.query(
            'SELECT id FROM craftsmen WHERE user_id = $1',
            [user_id]
        );

        if (craftsman.rows.length === 0) {
            return res.status(403).json({ error: 'غير مصرح' });
        }

        const craftsmanInternalId = craftsman.rows[0].id;

        const orders = await pool.query(
            `SELECT o.*, s.name as service_name, u.name as user_name, u.phone as user_phone,
                    CASE WHEN r.id IS NOT NULL THEN true ELSE false END as has_review,
                    CASE WHEN cr.id IS NOT NULL THEN true ELSE false END as has_customer_review
             FROM orders o
             JOIN services s ON o.service_id = s.id
             JOIN users u ON o.user_id = u.id
             LEFT JOIN reviews r ON r.order_id = o.id
             LEFT JOIN customer_reviews cr ON cr.order_id = o.id
             WHERE o.craftsman_id = $1
             ORDER BY o.created_at DESC`,
            [craftsmanInternalId]
        );

        res.json(orders.rows);

    } catch (error) {
        console.error('Get craftsman orders error:', error);
        res.status(500).json({ error: 'Server error: ' + error.message });
    }
};

// Get Top Craftsmen
const getTopCraftsmen = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const topCraftsmen = await pool.query(
            `SELECT DISTINCT ON (c.id) c.*, u.name, u.phone,
                    s.name as service_name
             FROM craftsmen c
             JOIN users u ON c.user_id = u.id
             LEFT JOIN craftsman_services cs ON c.id = cs.craftsman_id
             LEFT JOIN services s ON cs.service_id = s.id
             WHERE c.is_verified = true 
             ORDER BY c.id, c.score DESC, c.rating DESC
             LIMIT $1`,
            [limit]
        );
        
        res.json(topCraftsmen.rows);
    } catch (error) {
        console.error('Get top craftsmen error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { 
    createOrder, 
    getOrders, 
    addReview,
    addCustomerReview,
    getCraftsmanReviews,
    getCustomerReviews,
    updateOrderStatus,
    getCraftsmanOrders,
    getTopCraftsmen
};