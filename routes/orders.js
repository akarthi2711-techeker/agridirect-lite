const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');

// POST /api/orders — buyer places order
router.post('/', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'buyer' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only buyers can place orders.' });
    }

    const { product_id, quantity, delivery_address, notes } = req.body;
    if (!product_id || !quantity) {
      return res.status(400).json({ success: false, message: 'Product ID and quantity are required.' });
    }

    const [products] = await db.execute(
      `SELECT p.*, u.name AS farmer_name
       FROM products p JOIN users u ON p.farmer_id = u.id
       WHERE p.id = ? AND p.status IN ('active','low_stock')`,
      [product_id]
    );
    if (products.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found or unavailable.' });
    }

    const product = products[0];
    if (parseFloat(quantity) > parseFloat(product.quantity)) {
      return res.status(400).json({ success: false, message: `Only ${product.quantity} ${product.unit} available.` });
    }

    const totalPrice = (parseFloat(quantity) * parseFloat(product.price)).toFixed(2);

    const [result] = await db.execute(
      `INSERT INTO orders (buyer_id, farmer_id, product_id, quantity, unit_price, total_price, delivery_address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, product.farmer_id, product_id, quantity, product.price, totalPrice,
       delivery_address || null, notes || null]
    );

    const orderId = result.insertId;
    const [buyers] = await db.execute('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const buyerName = buyers[0]?.name || 'A buyer';

    await createNotification(
      product.farmer_id,
      '🛒 New Order Received',
      `${buyerName} ordered ${quantity} ${product.unit} of ${product.name}. Order #${orderId}`,
      'order', orderId
    );
    await createNotification(
      req.user.id,
      '✅ Order Placed',
      `Your order for ${product.name} (${quantity} ${product.unit}) from ${product.farmer_name} is placed. Order #${orderId}`,
      'order', orderId
    );

    res.status(201).json({ success: true, message: 'Order placed successfully.', orderId, totalPrice });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/orders — role-based with full contact details
router.get('/', authenticate, async (req, res) => {
  try {
    let query, params;

    if (req.user.role === 'buyer') {
      query = `
        SELECT o.*,
          p.name AS product_name, p.image_url, p.unit,
          u.name AS farmer_name, u.mobile AS farmer_mobile,
          u.location AS farmer_location, u.village AS farmer_village,
          u.district AS farmer_district
        FROM orders o
        JOIN products p ON o.product_id = p.id
        JOIN users u ON o.farmer_id = u.id
        WHERE o.buyer_id = ?
        ORDER BY o.created_at DESC
      `;
      params = [req.user.id];

    } else if (req.user.role === 'farmer') {
      query = `
        SELECT o.*,
          p.name AS product_name, p.image_url, p.unit,
          u.name AS buyer_name, u.mobile AS buyer_mobile,
          u.location AS buyer_location,
          u.company_name AS buyer_company,
          u.business_type AS buyer_type
        FROM orders o
        JOIN products p ON o.product_id = p.id
        JOIN users u ON o.buyer_id = u.id
        WHERE o.farmer_id = ?
        ORDER BY o.created_at DESC
      `;
      params = [req.user.id];

    } else {
      // admin — sees all
      query = `
        SELECT o.*,
          p.name AS product_name, p.unit,
          b.name AS buyer_name, b.mobile AS buyer_mobile,
          f.name AS farmer_name, f.mobile AS farmer_mobile
        FROM orders o
        JOIN products p ON o.product_id = p.id
        JOIN users b ON o.buyer_id = b.id
        JOIN users f ON o.farmer_id = f.id
        ORDER BY o.created_at DESC
      `;
      params = [];
    }

    const [orders] = await db.execute(query, params);
    res.json({ success: true, orders });
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/orders/:id/status — farmer updates, buyer cancels only
router.put('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['accepted', 'packed', 'shipped', 'delivered', 'cancelled'];

    if (!status || !validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const normalizedStatus = status.toLowerCase();

    const [rows] = await db.execute(
      `SELECT o.*,
              p.name AS product_name,
              b.name AS buyer_name,
              f.name AS farmer_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN users b ON o.buyer_id = b.id
       JOIN users f ON o.farmer_id = f.id
       WHERE o.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    const order = rows[0];

    // FIX: allow farmers to update AND buyers to cancel
    const isFarmer = req.user.role === 'farmer' && order.farmer_id === req.user.id;
    const isBuyerCancelling = req.user.role === 'buyer' && order.buyer_id === req.user.id && normalizedStatus === 'cancelled';
    const isAdmin = req.user.role === 'admin';

    if (!isFarmer && !isBuyerCancelling && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this order.' });
    }

    // Prevent modifying a delivered order
    if (order.status === 'delivered') {
      return res.status(400).json({ success: false, message: 'Cannot modify a delivered order.' });
    }

    // Prevent modifying a cancelled order
    if (order.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Order is already cancelled.' });
    }

    await db.execute('UPDATE orders SET status = ? WHERE id = ?', [normalizedStatus, req.params.id]);

    // Notify buyer
    const buyerMessages = {
      accepted:  `✅ Your order for ${order.product_name} has been accepted by ${order.farmer_name}.`,
      packed:    `📦 Your order for ${order.product_name} is packed and ready to ship.`,
      shipped:   `🚚 Your order for ${order.product_name} has been shipped.`,
      delivered: `🎉 Your order for ${order.product_name} has been delivered!`,
      cancelled: `❌ Your order for ${order.product_name} has been cancelled.`,
    };

    await createNotification(order.buyer_id, `Order ${normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1)}`, buyerMessages[normalizedStatus], 'order', order.id);

    // Notify farmer on delivery or buyer-cancellation
    if (normalizedStatus === 'delivered') {
      await createNotification(order.farmer_id, '✅ Order Delivered', `Order #${order.id} for ${order.product_name} has been delivered to ${order.buyer_name}.`, 'order', order.id);
    }
    if (normalizedStatus === 'cancelled' && isBuyerCancelling) {
      await createNotification(order.farmer_id, '❌ Order Cancelled', `${order.buyer_name} cancelled order #${order.id} for ${order.product_name}.`, 'order', order.id);
    }

    res.json({ success: true, message: `Order status updated to ${normalizedStatus}.` });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
