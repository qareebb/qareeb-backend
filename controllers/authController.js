const pool = require('../config/database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Register
const register = async (req, res) => {
    try {
        const { name, phone, password, role, service_id } = req.body;

        // Check if user exists
        const userExists = await pool.query(
            'SELECT * FROM users WHERE phone = $1',
            [phone]
        );

        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newUser = await pool.query(
            'INSERT INTO users (name, phone, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, phone, role',
            [name, phone, hashedPassword, role]
        );

        // If craftsman, create craftsman record
if (role === 'craftsman') {
    // استخدام الإحداثيات المرسلة أو الافتراضية
    let lat = req.body.lat || 34.7400;
    let lng = req.body.lng || 10.7600;
    
    const craftsmanResult = await pool.query(
        'INSERT INTO craftsmen (user_id, lat, lng, is_verified, is_active, score, badge) VALUES ($1, $2, $3, true, true, 50, $4) RETURNING id',
        [newUser.rows[0].id, lat, lng, '⭐ موثوق']
    );
            
            // If service_id provided, add craftsman service
            if (service_id) {
                await pool.query(
                    'INSERT INTO craftsman_services (craftsman_id, service_id) VALUES ($1, $2)',
                    [craftsmanResult.rows[0].id, service_id]
                );
            }
        }

        // Generate token
        const token = jwt.sign(
            { id: newUser.rows[0].id, role: newUser.rows[0].role },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            user: newUser.rows[0],
            token
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Login
const login = async (req, res) => {
    try {
        const { phone, password } = req.body;

        // Find user
        const user = await pool.query(
            'SELECT * FROM users WHERE phone = $1',
            [phone]
        );

        if (user.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.rows[0].password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token
        const token = jwt.sign(
            { id: user.rows[0].id, role: user.rows[0].role },
            process.env.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            message: 'Login successful',
            user: {
                id: user.rows[0].id,
                name: user.rows[0].name,
                phone: user.rows[0].phone,
                role: user.rows[0].role
            },
            token
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get User Profile
const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await pool.query(
            'SELECT id, name, phone, role, created_at FROM users WHERE id = $1',
            [userId]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const profile = user.rows[0];

        // If craftsman, get additional info
        if (profile.role === 'craftsman') {
            const craftsman = await pool.query(
                `SELECT c.*, 
                    (SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
                     FROM craftsman_services cs 
                     JOIN services s ON cs.service_id = s.id 
                     WHERE cs.craftsman_id = c.id) as services
                 FROM craftsmen c 
                 WHERE c.user_id = $1`,
                [userId]
            );

            if (craftsman.rows.length > 0) {
                profile.craftsman = craftsman.rows[0];
            }
        }

        res.json(profile);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Update Profile
const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, phone } = req.body;

        // Check if phone already taken
        if (phone) {
            const existing = await pool.query(
                'SELECT id FROM users WHERE phone = $1 AND id != $2',
                [phone, userId]
            );

            if (existing.rows.length > 0) {
                return res.status(400).json({ error: 'Phone number already in use' });
            }
        }

        const updates = [];
        const values = [];
        let counter = 1;

        if (name) {
            updates.push(`name = $${counter}`);
            values.push(name);
            counter++;
        }

        if (phone) {
            updates.push(`phone = $${counter}`);
            values.push(phone);
            counter++;
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(userId);

        const updated = await pool.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${counter} RETURNING id, name, phone, role`,
            values
        );

        res.json({
            message: 'Profile updated successfully',
            user: updated.rows[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Update Craftsman Location
const updateCraftsmanProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { lat, lng, radius_km, services } = req.body;

        // Check if user is craftsman
        const craftsman = await pool.query(
            'SELECT id FROM craftsmen WHERE user_id = $1',
            [userId]
        );

        if (craftsman.rows.length === 0) {
            return res.status(403).json({ error: 'Not a craftsman' });
        }

        const craftsmanId = craftsman.rows[0].id;

        // Update location
        if (lat !== undefined && lng !== undefined) {
            await pool.query(
                'UPDATE craftsmen SET lat = $1, lng = $2 WHERE id = $3',
                [lat, lng, craftsmanId]
            );
        }

        if (radius_km !== undefined) {
            await pool.query(
                'UPDATE craftsmen SET radius_km = $1 WHERE id = $2',
                [radius_km, craftsmanId]
            );
        }

        // Update services
        if (services && Array.isArray(services)) {
            // Remove old services
            await pool.query('DELETE FROM craftsman_services WHERE craftsman_id = $1', [craftsmanId]);
            
            // Add new services
            for (const serviceId of services) {
                await pool.query(
                    'INSERT INTO craftsman_services (craftsman_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [craftsmanId, serviceId]
                );
            }
        }

        // Get updated craftsman info
        const updated = await pool.query(
            `SELECT c.*, 
                (SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
                 FROM craftsman_services cs 
                 JOIN services s ON cs.service_id = s.id 
                 WHERE cs.craftsman_id = c.id) as services
             FROM craftsmen c 
             WHERE c.id = $1`,
            [craftsmanId]
        );

        res.json({
            message: 'Craftsman profile updated',
            craftsman: updated.rows[0]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
// Forgot Password - Send verification code
const forgotPassword = async (req, res) => {
    try {
        const { phone } = req.body;

        // Check if user exists
        const user = await pool.query(
            'SELECT id, name FROM users WHERE phone = $1',
            [phone]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'رقم الهاتف غير مسجل' });
        }

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save code to database (expires in 10 minutes)
        await pool.query(
            `INSERT INTO password_resets (phone, code, expires_at) 
             VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
             ON CONFLICT (phone) DO UPDATE 
             SET code = $2, expires_at = NOW() + INTERVAL '10 minutes'`,
            [phone, code]
        );

        console.log(`Verification code for ${phone}: ${code}`);

        res.json({ 
            message: 'تم إرسال رمز التحقق',
            debug_code: code // احذف هذا في الإنتاج
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Reset Password - Verify code and update password
const resetPassword = async (req, res) => {
    try {
        const { phone, code, newPassword } = req.body;

        // Verify code
        const reset = await pool.query(
            `SELECT * FROM password_resets 
             WHERE phone = $1 AND code = $2 AND expires_at > NOW()`,
            [phone, code]
        );

        if (reset.rows.length === 0) {
            return res.status(400).json({ error: 'رمز التحقق غير صحيح أو منتهي الصلاحية' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await pool.query(
            'UPDATE users SET password = $1 WHERE phone = $2',
            [hashedPassword, phone]
        );

        // Delete used code
        await pool.query('DELETE FROM password_resets WHERE phone = $1', [phone]);

        res.json({ message: 'تم تغيير كلمة المرور بنجاح' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
// Change Password
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        const user = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const validPassword = await bcrypt.compare(currentPassword, user.rows[0].password);
        if (!validPassword) {
            return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await pool.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [hashedPassword, userId]
        );

        res.json({ message: 'تم تغيير كلمة المرور بنجاح' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
// Set Password (للحرفيين الجدد - أول مرة)
const setPassword = async (req, res) => {
    try {
        const { phone, password } = req.body;
        
        // البحث عن المستخدم
        const user = await pool.query(
            'SELECT * FROM users WHERE phone = $1',
            [phone]
        );
        
        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'رقم الهاتف غير موجود' });
        }
        
        // تشفير كلمة المرور الجديدة
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // تحديث كلمة المرور
        await pool.query(
            'UPDATE users SET password = $1 WHERE phone = $2',
            [hashedPassword, phone]
        );
        
        res.json({ message: 'تم تعيين كلمة المرور بنجاح' });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
};
module.exports = { 
    register, 
    login, 
    getProfile, 
    updateProfile,
    updateCraftsmanProfile,
    changePassword,
    forgotPassword,
    resetPassword,
    setPassword      // ← أضف هذا
};