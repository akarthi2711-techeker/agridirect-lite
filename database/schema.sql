-- AgriDirect Lite Database Schema v2
CREATE DATABASE IF NOT EXISTS agridirect_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE agridirect_db;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  mobile VARCHAR(15),
  role ENUM('farmer', 'buyer', 'admin') NOT NULL DEFAULT 'buyer',
  location VARCHAR(200),
  village VARCHAR(100),
  district VARCHAR(100),
  state VARCHAR(100) DEFAULT 'Tamil Nadu',
  -- Farmer-specific
  farming_experience INT,
  -- Buyer-specific
  company_name VARCHAR(150),
  business_type ENUM('hotel', 'hostel', 'restaurant', 'caterer', 'vegetable_shop', 'individual', 'other'),
  profile_picture VARCHAR(500),
  language_preference VARCHAR(10) DEFAULT 'en',
  theme_preference ENUM('light', 'dark') DEFAULT 'light',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Products Table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  farmer_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  category ENUM('vegetables', 'fruits', 'grains', 'organic', 'other') NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(20) DEFAULT 'kg',
  price DECIMAL(10,2) NOT NULL,
  suggested_price DECIMAL(10,2),
  location VARCHAR(200),
  description TEXT,
  harvest_date DATE,
  shelf_life INT COMMENT 'shelf life in days',
  fresh_until DATE COMMENT 'auto-calculated: harvest_date + shelf_life',
  image_url VARCHAR(500),
  status ENUM('active', 'low_stock', 'out_of_stock', 'inactive', 'pending') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NOT NULL,
  farmer_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  status ENUM('pending', 'accepted', 'packed', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
  delivery_address TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (farmer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('order', 'product', 'system') DEFAULT 'system',
  reference_id INT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Favorites Table
CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  buyer_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_favorite (buyer_id, product_id),
  FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Settings Table
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE NOT NULL,
  language VARCHAR(10) DEFAULT 'en',
  theme ENUM('light', 'dark') DEFAULT 'light',
  email_notifications BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Seed admin user (password: Admin@123)
INSERT IGNORE INTO users (name, email, password, role, is_active)
VALUES ('Admin', 'admin@agridirect.in', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', TRUE);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_farmer ON products(farmer_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_farmer ON orders(farmer_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
