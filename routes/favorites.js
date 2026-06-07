const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/favorites
router.get('/', authenticate, authorize('buyer', 'admin'), async (req, res) => {
  try {
    const [favorites] = await db.execute(
      `SELECT f.id, f.created_at, p.*, u.name AS farmer_name, u.location AS farmer_location
       FROM favorites f
       JOIN products p ON f.product_id = p.id
       JOIN users u ON p.farmer_id = u.id
       WHERE f.buyer_id = ? ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, favorites });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/favorites/:productId
router.post('/:productId', authenticate, authorize('buyer', 'admin'), async (req, res) => {
  try {
    await db.execute(
      'INSERT IGNORE INTO favorites (buyer_id, product_id) VALUES (?, ?)',
      [req.user.id, req.params.productId]
    );
    res.json({ success: true, message: 'Added to favorites.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/favorites/:productId
router.delete('/:productId', authenticate, authorize('buyer', 'admin'), async (req, res) => {
  try {
    await db.execute(
      'DELETE FROM favorites WHERE buyer_id = ? AND product_id = ?',
      [req.user.id, req.params.productId]
    );
    res.json({ success: true, message: 'Removed from favorites.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
