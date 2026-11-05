-- ============================================================
-- PANDAS Retail & Point of Sale (POS) Database Schema
-- Database: pandas
-- Engine: PostgreSQL 12+
-- ============================================================

-- 1. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS category (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- Seed Initial Product Categories
INSERT INTO category (name) VALUES
    ('Chocolates'),
    ('Nuts'),
    ('Dates'),
    ('Dry Fruits'),
    ('Drinks'),
    ('Mill Products')
ON CONFLICT (name) DO NOTHING;

-- 2. PRODUCTS MASTER TABLE
CREATE TABLE IF NOT EXISTS products (
    item_code VARCHAR(50) PRIMARY KEY,
    item_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    stock NUMERIC(10, 2) DEFAULT 0.00,
    price NUMERIC(10, 2) DEFAULT 0.00,
    cost_price NUMERIC(10, 2) DEFAULT 0.00,
    sales_tax NUMERIC(5, 2) DEFAULT 0.00,
    invoicing_policy VARCHAR(100),
    purchase_tax NUMERIC(5, 2) DEFAULT 0.00,
    purchase_unit VARCHAR(50),
    income_account VARCHAR(100),
    expense_account VARCHAR(100),
    description TEXT,
    company VARCHAR(150),
    is_sale BOOLEAN DEFAULT TRUE,
    is_purchase BOOLEAN DEFAULT TRUE,
    is_manufactured BOOLEAN DEFAULT FALSE,
    product_image BYTEA,
    product_image_mime VARCHAR(100)
);

-- 3. HELD BILLS (PARKED TRANSACTIONS)
CREATE TABLE IF NOT EXISTS held_bills (
    id SERIAL PRIMARY KEY,
    cart JSONB NOT NULL,
    customer_name VARCHAR(200),
    customer_phone VARCHAR(50),
    total NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. SALES BILLS (INVOICES)
CREATE TABLE IF NOT EXISTS bills (
    invoice_no VARCHAR(50) PRIMARY KEY,
    total NUMERIC(10, 2) NOT NULL,
    customer_name VARCHAR(200),
    customer_phone VARCHAR(50),
    payment_mode VARCHAR(50),
    status VARCHAR(20) DEFAULT 'PAID',
    pdf_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. BILL LINE ITEMS
CREATE TABLE IF NOT EXISTS bill_items (
    id SERIAL PRIMARY KEY,
    invoice_no VARCHAR(50) REFERENCES bills(invoice_no) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL,
    total NUMERIC(10, 2) NOT NULL
);

-- 6. PURCHASES (STOCK INFLOW)
CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    supplier_name VARCHAR(200) NOT NULL,
    total NUMERIC(10, 2) NOT NULL,
    bill_status VARCHAR(50),
    purchase_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. PURCHASE LINE ITEMS
CREATE TABLE IF NOT EXISTS purchase_items (
    id SERIAL PRIMARY KEY,
    purchase_id INT REFERENCES purchases(id) ON DELETE CASCADE,
    item_code VARCHAR(50),
    product_name VARCHAR(255) NOT NULL,
    cost_price NUMERIC(10, 2) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL,
    total NUMERIC(10, 2) NOT NULL
);

-- 8. DAILY Z-REPORTS (END-OF-DAY SETTLEMENT AUDIT)
CREATE TABLE IF NOT EXISTS z_reports (
    id SERIAL PRIMARY KEY,
    report_date DATE UNIQUE NOT NULL,
    total_bills INT NOT NULL,
    gross_sales NUMERIC(10, 2) NOT NULL,
    cash_sales NUMERIC(10, 2) NOT NULL,
    upi_sales NUMERIC(10, 2) NOT NULL,
    card_sales NUMERIC(10, 2) NOT NULL,
    cancelled_sales NUMERIC(10, 2) DEFAULT 0.00,
    net_sales NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

