const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

// GET /api/dashboard
router.get('/', authenticate, async (req, res) => {
  try {
    const { id, role } = req.user;

    if (role === 'farmer') {
      const [[{ totalProducts }]] = await db.execute(
        'SELECT COUNT(*) AS totalProducts FROM products WHERE farmer_id = ?', [id]
      );
      const [[{ activeListings }]] = await db.execute(
        'SELECT COUNT(*) AS activeListings FROM products WHERE farmer_id = ? AND status = "active"', [id]
      );
      const [[{ totalOrders }]] = await db.execute(
        'SELECT COUNT(*) AS totalOrders FROM orders WHERE farmer_id = ?', [id]
      );
      const [[{ revenue }]] = await db.execute(
        'SELECT COALESCE(SUM(total_price), 0) AS revenue FROM orders WHERE farmer_id = ? AND status IN ("delivered", "accepted", "packed", "shipped")', [id]
      );
      const [recentOrders] = await db.execute(
        `SELECT o.*, p.name AS product_name, u.name AS buyer_name
         FROM orders o JOIN products p ON o.product_id = p.id JOIN users u ON o.buyer_id = u.id
         WHERE o.farmer_id = ? ORDER BY o.created_at DESC LIMIT 5`, [id]
      );

      return res.json({
        success: true,
        role: 'farmer',
        stats: { totalProducts, activeListings, totalOrders, revenue },
        recentOrders,
      });
    }

    if (role === 'buyer') {
      const [[{ ordersPlaced }]] = await db.execute(
        'SELECT COUNT(*) AS ordersPlaced FROM orders WHERE buyer_id = ?', [id]
      );
      const [[{ favorites }]] = await db.execute(
        'SELECT COUNT(*) AS favorites FROM favorites WHERE buyer_id = ?', [id]
      );
      const [[{ recentPurchases }]] = await db.execute(
        'SELECT COUNT(*) AS recentPurchases FROM orders WHERE buyer_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)', [id]
      );
      const [recentOrders] = await db.execute(
        `SELECT o.*, p.name AS product_name, p.image_url, u.name AS farmer_name
         FROM orders o JOIN products p ON o.product_id = p.id JOIN users u ON o.farmer_id = u.id
         WHERE o.buyer_id = ? ORDER BY o.created_at DESC LIMIT 5`, [id]
      );

      return res.json({
        success: true,
        role: 'buyer',
        stats: { ordersPlaced, favorites, recentPurchases },
        recentOrders,
      });
    }

    if (role === 'admin') {
      const [[{ totalUsers }]] = await db.execute('SELECT COUNT(*) AS totalUsers FROM users');
      const [[{ totalFarmers }]] = await db.execute('SELECT COUNT(*) AS totalFarmers FROM users WHERE role = "farmer"');
      const [[{ totalBuyers }]] = await db.execute('SELECT COUNT(*) AS totalBuyers FROM users WHERE role = "buyer"');
      const [[{ totalProducts }]] = await db.execute('SELECT COUNT(*) AS totalProducts FROM products');
      const [[{ totalOrders }]] = await db.execute('SELECT COUNT(*) AS totalOrders FROM orders');
      const [[{ totalRevenue }]] = await db.execute('SELECT COALESCE(SUM(total_price), 0) AS totalRevenue FROM orders WHERE status = "delivered"');

      return res.json({
        success: true,
        role: 'admin',
        stats: { totalUsers, totalFarmers, totalBuyers, totalProducts, totalOrders, totalRevenue },
      });
    }

    res.status(400).json({ success: false, message: 'Invalid role.' });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
