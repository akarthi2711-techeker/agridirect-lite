const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// All admin routes require admin role
router.use(authenticate, authorize('admin'));

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = 'SELECT id, name, email, role, mobile, location, is_active, created_at FROM users WHERE 1=1';
    const params = [];
    if (role) { query += ' AND role = ?'; params.push(role); }
    if (search) { query += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    const [users] = await db.execute(query, params);
    const [[{ total }]] = await db.execute('SELECT COUNT(*) AS total FROM users');
    res.json({ success: true, users, total });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/admin/users/:id/toggle - Activate/deactivate user
router.put('/users/:id/toggle', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT is_active FROM users WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    const newStatus = !rows[0].is_active;
    await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [newStatus, req.params.id]);
    res.json({ success: true, message: `User ${newStatus ? 'activated' : 'deactivated'}.`, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
    }
    await db.execute('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'User deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/products - All products with moderation
router.get('/products', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = `SELECT p.*, u.name AS farmer_name, u.email AS farmer_email FROM products p JOIN users u ON p.farmer_id = u.id WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND p.status = ?'; params.push(status); }
    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);
    const [products] = await db.execute(query, params);
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/admin/products/:id/status
router.put('/products/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['active', 'inactive', 'pending', 'sold_out'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
    await db.execute('UPDATE products SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true, message: `Product status set to ${status}.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/orders - All orders
router.get('/orders', async (req, res) => {
  try {
    const [orders] = await db.execute(`
      SELECT o.*, p.name AS product_name, b.name AS buyer_name, f.name AS farmer_name
      FROM orders o
      JOIN products p ON o.product_id = p.id
      JOIN users b ON o.buyer_id = b.id
      JOIN users f ON o.farmer_id = f.id
      ORDER BY o.created_at DESC LIMIT 100
    `);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/admin/stats - Platform statistics
router.get('/stats', async (req, res) => {
  try {
    const [[{ totalUsers }]] = await db.execute('SELECT COUNT(*) AS totalUsers FROM users');
    const [[{ totalFarmers }]] = await db.execute('SELECT COUNT(*) AS totalFarmers FROM users WHERE role = "farmer"');
    const [[{ totalBuyers }]] = await db.execute('SELECT COUNT(*) AS totalBuyers FROM users WHERE role = "buyer"');
    const [[{ totalProducts }]] = await db.execute('SELECT COUNT(*) AS totalProducts FROM products');
    const [[{ activeProducts }]] = await db.execute('SELECT COUNT(*) AS activeProducts FROM products WHERE status = "active"');
    const [[{ totalOrders }]] = await db.execute('SELECT COUNT(*) AS totalOrders FROM orders');
    const [[{ totalRevenue }]] = await db.execute('SELECT COALESCE(SUM(total_price), 0) AS totalRevenue FROM orders WHERE status = "delivered"');
    const [[{ pendingOrders }]] = await db.execute('SELECT COUNT(*) AS pendingOrders FROM orders WHERE status = "pending"');
    res.json({ success: true, stats: { totalUsers, totalFarmers, totalBuyers, totalProducts, activeProducts, totalOrders, totalRevenue, pendingOrders } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
