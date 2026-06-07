-- Migration: Add new fields for marketplace flow improvements
USE agridirect_db;

-- Extend users table with role-specific profile fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS village VARCHAR(100) AFTER location,
  ADD COLUMN IF NOT EXISTS district VARCHAR(100) AFTER village,
  ADD COLUMN IF NOT EXISTS state VARCHAR(100) AFTER district,
  ADD COLUMN IF NOT EXISTS farming_experience INT AFTER state,
  ADD COLUMN IF NOT EXISTS company_name VARCHAR(150) AFTER farming_experience,
  ADD COLUMN IF NOT EXISTS business_type ENUM('hotel', 'hostel', 'restaurant', 'caterer', 'vegetable_shop', 'individual', 'other') AFTER company_name;

-- Extend products table with availability status and fresh_until
ALTER TABLE products
  MODIFY COLUMN status ENUM('active', 'low_stock', 'out_of_stock', 'inactive', 'pending') DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS fresh_until DATE AFTER shelf_life;

-- Extend orders table with new statuses
ALTER TABLE orders
  MODIFY COLUMN status ENUM('pending', 'accepted', 'packed', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending';

-- Extend notifications: add link/reference
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS reference_id INT AFTER type;
