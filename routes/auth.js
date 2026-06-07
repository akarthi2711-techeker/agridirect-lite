const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
require('dotenv').config();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, mobile, location } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Name, email, password, and role are required.' });
    }
    if (!['farmer', 'buyer'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be farmer or buyer.' });
    }
    const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO users (name, email, password, role, mobile, location) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role, mobile || null, location || null]
    );
    await db.execute('INSERT INTO settings (user_id) VALUES (?)', [result.insertId]);
    const token = jwt.sign(
      { id: result.insertId, email, role, name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    res.status(201).json({ success: true, message: 'Registration successful.', token, user: { id: result.insertId, name, email, role, mobile, location } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }
    const [rows] = await db.execute(
      'SELECT id, name, email, password, role, mobile, location, profile_picture, language_preference, theme_preference FROM users WHERE email = ? AND is_active = TRUE',
      [email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, message: 'Login successful.', token, user: userWithoutPassword });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both fields are required.' });
    }
    const [rows] = await db.execute('SELECT password FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    const isMatch = await bcrypt.compare(currentPassword, rows[0].password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, name, email, role, mobile, location, profile_picture, language_preference, theme_preference, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });
    const [rows] = await db.execute('SELECT id, name FROM users WHERE email = ? AND is_active = TRUE', [email]);
    if (rows.length === 0) {
      // Don't reveal whether email exists
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }
    const user = rows[0];
    const resetToken = jwt.sign(
      { id: user.id, purpose: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    // In production: send via AWS SES. Demo returns token directly.
    console.log(`Password reset token for ${email}: ${resetToken}`);
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.', resetToken });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token.' });
    }
    if (decoded.purpose !== 'password_reset') {
      return res.status(400).json({ success: false, message: 'Invalid token purpose.' });
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, decoded.id]);
    res.json({ success: true, message: 'Password reset successfully. You can now login.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ← module.exports must be LAST
module.exports = router;
