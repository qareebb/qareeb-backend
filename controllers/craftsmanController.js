const pool = require('../config/database');
// Get Nearby Craftsmen
const getCraftsmen = async (req, res) => {
    try {
        const { lat, lng, service_id, radius = 5 } = req.query;

        const craftsmen = await pool.query(
    `SELECT 
        c.id,
        c.user_id,
        c.lat,
        c.lng,
        c.rating,
        c.score,
        c.badge,
        c.total_ratings,
        c.is_verified,
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
        )) <= $4
    ORDER BY c.score DESC, distance ASC, c.rating DESC
    LIMIT 20`,
    [lat, lng, service_id, radius]
);

        res.json(craftsmen.rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Update Craftsman Location
const updateLocation = async (req, res) => {
    try {
        const { craftsmanId } = req.params;
        const { lat, lng } = req.body;

        await pool.query(
            'UPDATE craftsmen SET lat = $1, lng = $2 WHERE id = $3',
            [lat, lng, craftsmanId]
        );

        res.json({ message: 'Location updated successfully' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Accept Offer
const acceptOffer = async (req, res) => {
    try {
        const { offerId } = req.params;

        // Get offer details
        const offer = await pool.query(
            'SELECT * FROM request_offers WHERE id = $1 AND status = $2',
            [offerId, 'pending']
        );

        if (offer.rows.length === 0) {
            return res.status(400).json({ error: 'Offer not available' });
        }

        const { order_id, craftsman_id } = offer.rows[0];

        // Start transaction
        await pool.query('BEGIN');

        // Update offer status
        await pool.query(
            'UPDATE request_offers SET status = $1 WHERE id = $2',
            ['accepted', offerId]
        );

        // Expire other offers for this order
        await pool.query(
            'UPDATE request_offers SET status = $1 WHERE order_id = $2 AND id != $3',
            ['expired', order_id, offerId]
        );

        // Update order with craftsman
        await pool.query(
            'UPDATE orders SET craftsman_id = $1, status = $2 WHERE id = $3',
            [craftsman_id, 'accepted', order_id]
        );

        await pool.query('COMMIT');

        res.json({ message: 'Offer accepted successfully' });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
// Get All Craftsmen (for map view)
const getAllCraftsmen = async (req, res) => {
    try {
        const craftsmen = await pool.query(
            `SELECT 
                c.id,
                c.user_id,
                c.lat,
                c.lng,
                c.rating,
                c.is_verified,
                c.is_active,
                u.name,
                u.phone,
                array_agg(DISTINCT s.name) as services
            FROM craftsmen c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN craftsman_services cs ON c.id = cs.craftsman_id
            LEFT JOIN services s ON cs.service_id = s.id
            WHERE c.is_verified = true AND c.is_active = true
            GROUP BY c.id, u.id
            ORDER BY c.rating DESC`
        );

        res.json(craftsmen.rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get Craftsman by ID
const getCraftsmanById = async (req, res) => {
    try {
        const { id } = req.params;

        const craftsman = await pool.query(
            `SELECT 
                c.*,
                u.name,
                u.phone,
                array_agg(DISTINCT jsonb_build_object('id', s.id, 'name', s.name)) as services,
                (SELECT json_agg(json_build_object(
                    'id', r.id,
                    'rating', r.rating,
                    'comment', r.comment,
                    'user_name', ru.name,
                    'created_at', r.created_at
                ) ORDER BY r.created_at DESC LIMIT 5)
                 FROM reviews r
                 JOIN users ru ON r.user_id = ru.id
                 WHERE r.craftsman_id = c.id) as recent_reviews
            FROM craftsmen c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN craftsman_services cs ON c.id = cs.craftsman_id
            LEFT JOIN services s ON cs.service_id = s.id
            WHERE c.id = $1
            GROUP BY c.id, u.id`,
            [id]
        );

        if (craftsman.rows.length === 0) {
            return res.status(404).json({ error: 'Craftsman not found' });
        }

        res.json(craftsman.rows[0]);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get Craftsman Offers (Pending Requests)
const getCraftsmanOffers = async (req, res) => {
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

        const craftsmanId = craftsman.rows[0].id;

        const offers = await pool.query(
            `SELECT 
                ro.id as offer_id,
                ro.status as offer_status,
                ro.expires_at,
                o.*,
                s.name as service_name,
                u.name as user_name,
                u.phone as user_phone,
                (6371 * acos(
                    cos(radians(c.lat)) * cos(radians(o.lat)) * 
                    cos(radians(o.lng) - radians(c.lng)) + 
                    sin(radians(c.lat)) * sin(radians(o.lat))
                )) AS distance
            FROM request_offers ro
            JOIN orders o ON ro.order_id = o.id
            JOIN services s ON o.service_id = s.id
            JOIN users u ON o.user_id = u.id
            JOIN craftsmen c ON c.id = $1
            WHERE ro.craftsman_id = $1 
            AND ro.status = 'pending'
            AND ro.expires_at > NOW()
            ORDER BY ro.created_at DESC`,
            [craftsmanId]
        );

        res.json(offers.rows);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Respond to Offer (Accept/Reject)
const respondToOffer = async (req, res) => {
    try {
        const { offerId } = req.params;
        const { action } = req.body; // 'accept' or 'reject'
        const user_id = req.user.id;

        // Get craftsman internal ID
        const craftsman = await pool.query(
            'SELECT id FROM craftsmen WHERE user_id = $1',
            [user_id]
        );

        if (craftsman.rows.length === 0) {
            return res.status(403).json({ error: 'Not a craftsman' });
        }

        const craftsmanId = craftsman.rows[0].id;

        // Check if offer belongs to this craftsman
        const offer = await pool.query(
            'SELECT * FROM request_offers WHERE id = $1 AND craftsman_id = $2 AND status = $3',
            [offerId, craftsmanId, 'pending']
        );

        if (offer.rows.length === 0) {
            return res.status(404).json({ error: 'Offer not found or already processed' });
        }

        const { order_id } = offer.rows[0];

        if (action === 'accept') {
            await pool.query('BEGIN');

            // Accept this offer
            await pool.query(
                'UPDATE request_offers SET status = $1 WHERE id = $2',
                ['accepted', offerId]
            );

            // Expire other offers for this order
            await pool.query(
                'UPDATE request_offers SET status = $1 WHERE order_id = $2 AND id != $3',
                ['expired', order_id, offerId]
            );

            // Assign craftsman to order
            await pool.query(
                'UPDATE orders SET craftsman_id = $1, status = $2 WHERE id = $3',
                [craftsmanId, 'accepted', order_id]
            );

            await pool.query('COMMIT');

            res.json({ message: 'Offer accepted successfully' });

        } else if (action === 'reject') {
            await pool.query(
                'UPDATE request_offers SET status = $1 WHERE id = $2',
                ['rejected', offerId]
            );

            res.json({ message: 'Offer rejected' });

        } else {
            res.status(400).json({ error: 'Invalid action. Use "accept" or "reject"' });
        }

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
module.exports = { 
    getCraftsmen, 
    updateLocation, 
    acceptOffer,
    getAllCraftsmen,
    getCraftsmanById,
    getCraftsmanOffers,
    respondToOffer
};