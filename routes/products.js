const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { uploadToS3, deleteFromS3 } = require('../config/s3');
const { getSuggestedPrice } = require('../utils/pricing');

// Calculate fresh_until from harvest_date + shelf_life days
const calcFreshUntil = (harvestDate, shelfLifeDays) => {
  if (!harvestDate || !shelfLifeDays) return null;
  const d = new Date(harvestDate);
  d.setDate(d.getDate() + parseInt(shelfLifeDays));
  return d.toISOString().split('T')[0];
};

// GET /api/products - Public listing with search, filter, price range, location, availability
router.get('/', async (req, res) => {
  try {
    const { search, category, sort = 'latest', page = 1, limit = 12,
            min_price, max_price, location, availability } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT p.*, u.name AS farmer_name, u.location AS farmer_location,
             u.village AS farmer_village, u.district AS farmer_district,
             u.mobile AS farmer_mobile
      FROM products p
      JOIN users u ON p.farmer_id = u.id
      WHERE p.status NOT IN ('inactive', 'pending')
    `;
    const params = [];

    if (search) {
      query += ' AND (p.name LIKE ? OR p.description LIKE ? OR u.name LIKE ? OR p.location LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (category && category !== 'all') {
      query += ' AND p.category = ?';
      params.push(category);
    }
    if (min_price) { query += ' AND p.price >= ?'; params.push(parseFloat(min_price)); }
    if (max_price) { query += ' AND p.price <= ?'; params.push(parseFloat(max_price)); }
    if (location) { query += ' AND (p.location LIKE ? OR u.location LIKE ? OR u.district LIKE ?)'; params.push(`%${location}%`, `%${location}%`, `%${location}%`); }
    if (availability && availability !== 'all') { query += ' AND p.status = ?'; params.push(availability); }

    const sortMap = { latest: 'p.created_at DESC', price_asc: 'p.price ASC', price_desc: 'p.price DESC' };
    query += ` ORDER BY ${sortMap[sort] || 'p.created_at DESC'} LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [products] = await db.execute(query, params);

    // Count total for pagination
    let countQuery = `SELECT COUNT(*) AS total FROM products p JOIN users u ON p.farmer_id = u.id WHERE p.status NOT IN ('inactive','pending')`;
    const countParams = [];
    if (search) { countQuery += ' AND (p.name LIKE ? OR p.description LIKE ? OR u.name LIKE ? OR p.location LIKE ?)'; const s = `%${search}%`; countParams.push(s,s,s,s); }
    if (category && category !== 'all') { countQuery += ' AND p.category = ?'; countParams.push(category); }
    if (min_price) { countQuery += ' AND p.price >= ?'; countParams.push(parseFloat(min_price)); }
    if (max_price) { countQuery += ' AND p.price <= ?'; countParams.push(parseFloat(max_price)); }
    if (location) { countQuery += ' AND (p.location LIKE ? OR u.location LIKE ? OR u.district LIKE ?)'; countParams.push(`%${location}%`, `%${location}%`, `%${location}%`); }
    if (availability && availability !== 'all') { countQuery += ' AND p.status = ?'; countParams.push(availability); }

    const [[{ total }]] = await db.execute(countQuery, countParams);

    res.json({ success: true, products, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/products/farmer/my — MUST be before /:id
router.get('/farmer/my', authenticate, authorize('farmer', 'admin'), async (req, res) => {
  try {
    const [products] = await db.execute(
      'SELECT * FROM products WHERE farmer_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/products/:id - with full farmer profile
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT p.*,
              u.name AS farmer_name, u.mobile AS farmer_mobile, u.email AS farmer_email,
              u.location AS farmer_location, u.village AS farmer_village,
              u.district AS farmer_district, u.state AS farmer_state,
              u.farming_experience, u.profile_picture AS farmer_photo,
              (SELECT COUNT(*) FROM products WHERE farmer_id = u.id AND status = 'active') AS farmer_total_products
       FROM products p
       JOIN users u ON p.farmer_id = u.id
       WHERE p.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
    res.json({ success: true, product: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/products
router.post('/', authenticate, authorize('farmer', 'admin'), upload.single('image'), async (req, res) => {
  try {
    const { name, category, quantity, price, location, description, harvest_date, shelf_life, status } = req.body;
    if (!name || !category || !quantity || !price) {
      return res.status(400).json({ success: false, message: 'Name, category, quantity, and price are required.' });
    }

    let imageUrl = null;
    if (req.file) imageUrl = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype);

    const suggestedPrice = getSuggestedPrice(quantity, parseFloat(price));
    const freshUntil = calcFreshUntil(harvest_date, shelf_life);
    const productStatus = status || 'active';

    const [result] = await db.execute(
      `INSERT INTO products (farmer_id, name, category, quantity, price, suggested_price, location,
       description, harvest_date, shelf_life, fresh_until, image_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, name, category, quantity, price, suggestedPrice, location || null,
       description || null, harvest_date || null, shelf_life || null, freshUntil, imageUrl, productStatus]
    );

    res.status(201).json({ success: true, message: 'Product added successfully.', productId: result.insertId, suggestedPrice, freshUntil });
  } catch (err) {
    console.error('Add product error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// PUT /api/products/:id
router.put('/:id', authenticate, authorize('farmer', 'admin'), upload.single('image'), async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });

    const product = rows[0];
    if (product.farmer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    const { name, category, quantity, price, location, description, harvest_date, shelf_life, status } = req.body;
    let imageUrl = product.image_url;
    if (req.file) {
      if (product.image_url) await deleteFromS3(product.image_url);
      imageUrl = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype);
    }

    const newQty = quantity || product.quantity;
    const newPrice = price || product.price;
    const newHarvest = harvest_date || product.harvest_date;
    const newShelfLife = shelf_life || product.shelf_life;
    const suggestedPrice = getSuggestedPrice(newQty, parseFloat(newPrice));
    const freshUntil = calcFreshUntil(newHarvest, newShelfLife);

    await db.execute(
      `UPDATE products SET name=?, category=?, quantity=?, price=?, suggested_price=?, location=?,
       description=?, harvest_date=?, shelf_life=?, fresh_until=?, image_url=?, status=? WHERE id=?`,
      [name || product.name, category || product.category, newQty, newPrice, suggestedPrice,
       location || product.location, description || product.description, newHarvest, newShelfLife,
       freshUntil, imageUrl, status || product.status, req.params.id]
    );

    res.json({ success: true, message: 'Product updated successfully.', freshUntil });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authenticate, authorize('farmer', 'admin'), async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Product not found.' });
    const product = rows[0];
    if (product.farmer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }
    if (product.image_url) await deleteFromS3(product.image_url);
    await db.execute('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Product deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
