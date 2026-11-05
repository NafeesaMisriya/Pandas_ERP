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

-- 9. CUSTOMERS MASTER TABLE
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    customer_code VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(200),
    address TEXT,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    registration_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. SUPPLIERS MASTER TABLE
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    supplier_code VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(200),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(200),
    address TEXT,
    gstin VARCHAR(50),
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. EXPENSES TRACKING TABLE
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    payment_mode VARCHAR(50) NOT NULL DEFAULT 'Cash',
    reference_no VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. EMPLOYEES DIRECTORY TABLE
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    role VARCHAR(100) NOT NULL DEFAULT 'Staff',
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(200),
    salary NUMERIC(10, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    joining_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


