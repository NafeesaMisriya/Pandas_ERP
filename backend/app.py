from flask import (Flask, render_template, request, session, redirect, url_for, send_file, jsonify, Response)
from db import get_db_connection
from decimal import Decimal
from xhtml2pdf import pisa
from datetime import datetime, date, timedelta
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
import io
import os
import json
import csv
import math
import time
from billing import calculate_item_total, calculate_bill_total
from reports import daily_sales

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "pandas-secret-key")

# CORS and Session Cookie Configuration
app.config.update(
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=False,
    SESSION_COOKIE_HTTPONLY=True,
)

@app.after_request
def after_request_cors(response):
    origin = request.headers.get("Origin")
    if origin in ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5000", "http://127.0.0.1:5000"]:
        response.headers["Access-Control-Allow-Origin"] = origin
    else:
        response.headers["Access-Control-Allow-Origin"] = "http://localhost:5173"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization,X-Requested-With"
    response.headers["Access-Control-Allow-Methods"] = "GET,PUT,POST,DELETE,OPTIONS,PATCH"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

@app.route("/api/<path:dummy>", methods=["OPTIONS"])
@app.route("/<path:dummy>", methods=["OPTIONS"])
def preflight_handler(dummy=None):
    return "", 200

CATEGORY_PREFIX = {
    "Chocolates": "C",
    "Nuts": "N",
    "Dates": "D",
    "Dry Fruits": "F",
    "Drinks": "W",
    "Mill Products": "M"
}

# ============================================================
# ACCESS CONTROL: CASHIER MODE & SECURE ADMIN ACCESS
# ============================================================
ADMIN_SESSION_TIMEOUT_MINUTES = int(os.environ.get("ADMIN_SESSION_TIMEOUT_MINUTES", 30))
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 300  # 5 minutes lockout

# In-memory rate limiting for login attempts
_login_attempts = {}

def is_admin_authenticated():
    """Checks whether the current session has an active, non-expired Admin Mode authorization."""
    if not session.get("is_admin"):
        return False
    auth_time = session.get("admin_auth_time")
    if not auth_time:
        return False
    # Check inactivity timeout
    now = time.time()
    if now - auth_time > (ADMIN_SESSION_TIMEOUT_MINUTES * 60):
        # Session expired
        session.pop("is_admin", None)
        session.pop("admin_auth_time", None)
        return False
    # Slide inactivity window on authenticated activity
    session["admin_auth_time"] = now
    return True

def admin_required(f):
    """
    Decorator for server-side protection of admin-only Flask API endpoints.
    Rejects unauthorized access with HTTP 403 Forbidden.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_admin_authenticated():
            return jsonify({
                "error": "Admin access required. Please unlock Admin Mode to perform this action.",
                "code": "ADMIN_REQUIRED"
            }), 403
        return f(*args, **kwargs)
    return decorated_function

def ensure_admin_schema(conn):
    """Ensures app_settings and admin audit tables exist and configures initial password hash securely."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key VARCHAR(100) PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS admin_audit_log (
                    id SERIAL PRIMARY KEY,
                    action VARCHAR(50) NOT NULL,
                    ip_address VARCHAR(50),
                    details TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Check if admin_password_hash is configured
            cur.execute("SELECT value FROM app_settings WHERE key = 'admin_password_hash'")
            row = cur.fetchone()
            if not row:
                # Set initial password from environment variable if provided, else default 'admin123'
                initial_pwd = os.environ.get("PANDAS_ADMIN_PASSWORD", "admin123")
                hashed = generate_password_hash(initial_pwd)
                cur.execute(
                    "INSERT INTO app_settings (key, value) VALUES ('admin_password_hash', %s) ON CONFLICT DO NOTHING",
                    (hashed,)
                )
            conn.commit()
    except Exception:
        conn.rollback()

def ensure_billing_discount_schema(conn):
    """Ensures subtotal, discount_type, discount_value, and discount_amount columns exist in bills and held_bills."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                ALTER TABLE bills ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0.00;
                ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT NULL;
                ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,4) DEFAULT 0.00;
                ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0.00;

                ALTER TABLE held_bills ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT NULL;
                ALTER TABLE held_bills ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10,4) DEFAULT 0.00;
                ALTER TABLE held_bills ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0.00;

                UPDATE bills SET subtotal = total WHERE subtotal IS NULL OR subtotal = 0.00;
            """)
            conn.commit()
    except Exception:
        conn.rollback()

def calculate_cart_totals(cart, bill_discount=None):
    """
    Computes subtotal, discount_amount, and final_payable from cart items and discount settings.
    Authoritative server-side calculation logic.
    """
    subtotal = sum(Decimal(str(item.get("total", 0))) for item in cart)
    subtotal = subtotal.quantize(Decimal("0.01"))

    if not bill_discount or not isinstance(bill_discount, dict):
        bill_discount = {"type": None, "value": 0.0, "amount": 0.0}

    d_type = bill_discount.get("type")
    try:
        d_val = Decimal(str(bill_discount.get("value", 0)))
    except Exception:
        d_val = Decimal("0")

    if d_type == "percentage":
        if d_val < Decimal("0"):
            d_val = Decimal("0")
        elif d_val > Decimal("100"):
            d_val = Decimal("100")
        discount_amount = (subtotal * d_val / Decimal("100")).quantize(Decimal("0.01"))
    elif d_type == "fixed":
        if d_val < Decimal("0"):
            d_val = Decimal("0")
        elif d_val > subtotal:
            d_val = subtotal
        discount_amount = d_val.quantize(Decimal("0.01"))
    else:
        d_type = None
        d_val = Decimal("0")
        discount_amount = Decimal("0.00")

    final_payable = max(Decimal("0.00"), subtotal - discount_amount)

    updated_discount = {
        "type": d_type,
        "value": float(d_val),
        "amount": float(discount_amount)
    }

    return float(subtotal), updated_discount, float(final_payable)

def record_admin_audit(cur, action, ip_address=None, details=None):
    """Logs admin authentication events for compliance."""
    try:
        cur.execute(
            "INSERT INTO admin_audit_log (action, ip_address, details) VALUES (%s, %s, %s)",
            (action, ip_address or request.remote_addr, details)
        )
    except Exception:
        pass

# ============================================================
# UNIT-BASED QUANTITY VALIDATION (STRICT BUSINESS RULES)
# ============================================================
INTEGER_UNITS = {
    'pc', 'pcs', 'piece', 'pieces',
    'packet', 'packets', 'pkt', 'pkts',
    'box', 'boxes',
    'bottle', 'bottles',
    'can', 'cans',
    'unit', 'units',
    'nos', 'no'
}

DECIMAL_UNITS = {
    'kg', 'kilogram', 'kilograms',
    'g', 'gm', 'gms', 'gram', 'grams',
    'l', 'ltr', 'litre', 'litres', 'liter', 'liters',
    'ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'
}

def is_integer_unit(unit: str) -> bool:
    if not unit:
        return False
    return str(unit).strip().lower() in INTEGER_UNITS

def validate_unit_quantity(quantity, unit: str):
    """
    Validates whether a given quantity adheres to the product's unit rules.
    - Whole-number units (pcs, packets, boxes, units, bottles, cans) reject any fractional/decimal values.
    - Weight/volume units (kg, g, l, ml) permit decimal precision.
    Returns (is_valid: bool, error_message: str | None).
    Never silently rounds or truncates invalid numbers.
    """
    if quantity is None or str(quantity).strip() == "":
        return False, "Quantity is required and cannot be empty."
    try:
        val = float(quantity)
    except (TypeError, ValueError):
        return False, f"Quantity '{quantity}' is not a valid numeric value."

    if val < 0:
        return False, "Quantity cannot be negative."

    if is_integer_unit(unit):
        # Must be a whole number (e.g., 15 is valid, 15.5 or 15.25 is rejected)
        if not val.is_integer():
            return False, (
                f"Product unit '{unit}' only accepts whole numbers. "
                f"Value '{quantity}' is invalid because decimals/fractions are not allowed for this unit."
            )
    return True, None

def ensure_customer_supplier_schema(conn):
    """Safe migration: create customers and suppliers tables if they don't exist.
    Also adds customer_id FK to bills and supplier_id FK to purchases (nullable,
    so existing records are never touched).
    """
    try:
        with conn.cursor() as cur:
            # customers table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS customers (
                    id SERIAL PRIMARY KEY,
                    customer_id VARCHAR(20) UNIQUE NOT NULL,
                    name VARCHAR(200) NOT NULL,
                    phone VARCHAR(50),
                    email VARCHAR(200),
                    address TEXT,
                    status VARCHAR(20) DEFAULT 'Active',
                    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(50);
                ALTER TABLE customers ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                UPDATE customers SET customer_id = COALESCE(customer_id, customer_code, 'CUST-' || id::text) WHERE customer_id IS NULL;
            """)
            # suppliers table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS suppliers (
                    id SERIAL PRIMARY KEY,
                    supplier_id VARCHAR(50),
                    supplier_code VARCHAR(50),
                    name VARCHAR(200) NOT NULL,
                    contact_person VARCHAR(200),
                    phone VARCHAR(50),
                    email VARCHAR(200),
                    address TEXT,
                    tax_number VARCHAR(100),
                    gstin VARCHAR(100),
                    opening_balance NUMERIC(12, 2) DEFAULT 0.00,
                    status VARCHAR(20) DEFAULT 'Active',
                    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_id VARCHAR(50);
                ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_number VARCHAR(100);
                ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(12, 2) DEFAULT 0.00;
                ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
            """)
            # Nullable FK on bills -> customers
            cur.execute("""
                ALTER TABLE bills
                    ADD COLUMN IF NOT EXISTS customer_id VARCHAR(20)
                    REFERENCES customers(customer_id) ON DELETE SET NULL;
            """)
            # Nullable FK on purchases -> suppliers
            cur.execute("""
                ALTER TABLE purchases
                    ADD COLUMN IF NOT EXISTS supplier_id VARCHAR(20)
                    REFERENCES suppliers(supplier_id) ON DELETE SET NULL;
            """)
            conn.commit()
    except Exception:
        conn.rollback()


def ensure_inventory_schema(conn):
    """Auto-migrate products table to support min_stock/target_stock and create stock_movements table."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock NUMERIC(10, 2) DEFAULT 5.00;
                ALTER TABLE products ADD COLUMN IF NOT EXISTS target_stock NUMERIC(10, 2) DEFAULT 20.00;
                ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS item_code VARCHAR(50);

                CREATE TABLE IF NOT EXISTS stock_movements (
                    id SERIAL PRIMARY KEY,
                    item_code VARCHAR(50) NOT NULL REFERENCES products(item_code) ON DELETE CASCADE,
                    movement_type VARCHAR(50) NOT NULL,
                    quantity NUMERIC(10, 2) NOT NULL,
                    previous_stock NUMERIC(10, 2) NOT NULL,
                    updated_stock NUMERIC(10, 2) NOT NULL,
                    reference_id VARCHAR(100),
                    reason TEXT,
                    performed_by VARCHAR(100) DEFAULT 'System',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_code);
                CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC);
            """)
            conn.commit()
    except Exception:
        conn.rollback()


def record_stock_movement(cur, item_code, movement_type, quantity, previous_stock, updated_stock, reference_id=None, reason=None, performed_by="System"):
    """Inserts an immutable stock movement audit ledger record."""
    try:
        cur.execute("""
            INSERT INTO stock_movements
            (item_code, movement_type, quantity, previous_stock, updated_stock, reference_id, reason, performed_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            item_code, movement_type, quantity, previous_stock, updated_stock,
            str(reference_id) if reference_id else None, reason, performed_by
        ))
    except Exception:
        pass


def generate_customer_id(cur):
    """Generate next sequential CUS-XXXXX customer ID."""
    cur.execute("SELECT customer_id FROM customers ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    if row:
        try:
            num = int(row[0].split('-')[1]) + 1
        except Exception:
            num = 1
    else:
        num = 1
    return f"CUS-{num:05d}"


def generate_supplier_id(cur):
    """Generate next sequential SUP-XXXXX supplier ID."""
    cur.execute("SELECT supplier_id FROM suppliers ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    if row:
        try:
            num = int(row[0].split('-')[1]) + 1
        except Exception:
            num = 1
    else:
        num = 1
    return f"SUP-{num:05d}"


def ensure_purchase_schema(conn):
    """Auto-migrate purchases table schema to support separate goods receipt, payment statuses, and accounts payable ledger."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                ALTER TABLE purchases ADD COLUMN IF NOT EXISTS receipt_status VARCHAR(50) DEFAULT 'Received';
                ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'Paid';
                ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'Cash';
                ALTER TABLE purchases ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2) DEFAULT 0.00;
                ALTER TABLE purchases ADD COLUMN IF NOT EXISTS receipt_date DATE;
                ALTER TABLE purchases ADD COLUMN IF NOT EXISTS verified_date DATE;
                ALTER TABLE purchases ADD COLUMN IF NOT EXISTS stock_updated BOOLEAN DEFAULT TRUE;
                ALTER TABLE purchases ADD COLUMN IF NOT EXISTS due_date DATE;

                -- Accounts Payable payments ledger
                CREATE TABLE IF NOT EXISTS purchase_payments (
                    id SERIAL PRIMARY KEY,
                    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
                    payment_date DATE NOT NULL,
                    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
                    payment_method VARCHAR(50) NOT NULL,
                    reference_no VARCHAR(100),
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase ON purchase_payments(purchase_id);
                CREATE INDEX IF NOT EXISTS idx_purchase_payments_date ON purchase_payments(payment_date);
            """)
            conn.commit()
    except Exception as e:
        conn.rollback()
        pass

def json_serialize_value(val):
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    return val

def link_callback(uri, rel):
    if uri.startswith("/static/"):
        path = os.path.join(BASE_DIR, uri.lstrip("/"))
        if os.path.exists(path):
            return path
    elif uri.startswith("static/"):
        path = os.path.join(BASE_DIR, uri)
        if os.path.exists(path):
            return path
    return uri

# ----------------- HEALTH & SYSTEM API -----------------
@app.route("/api/health")
def api_health():
    # Run schema migrations on first request
    try:
        _conn = get_db_connection()
        ensure_customer_supplier_schema(_conn)
        ensure_inventory_schema(_conn)
        ensure_expense_schema(_conn)
        ensure_profit_schema(_conn)
        ensure_admin_schema(_conn)
        _conn.close()
    except Exception:
        pass
    return jsonify({
        "status": "ok",
        "app": "PANDAS ERP",
        "is_admin": is_admin_authenticated(),
        "time": datetime.now().isoformat()
    })

# ----------------- AUTHENTICATION & ACCESS CONTROL API -----------------
@app.route("/api/auth/status", methods=["GET"])
def api_auth_status():
    """Returns current application mode: 'admin' or 'cashier'."""
    is_admin = is_admin_authenticated()
    return jsonify({
        "mode": "admin" if is_admin else "cashier",
        "is_admin": is_admin,
        "timeout_minutes": ADMIN_SESSION_TIMEOUT_MINUTES
    })

@app.route("/api/auth/unlock-admin", methods=["POST"])
def api_auth_unlock_admin():
    """
    Verifies admin password/PIN securely and enables Admin Mode in session.
    Protects against brute force with rate-limiting and temporary lockout.
    """
    client_ip = request.remote_addr or "127.0.0.1"
    now = time.time()

    # Rate limiting / lockout check
    attempt_info = _login_attempts.get(client_ip, {"count": 0, "locked_until": 0})
    if attempt_info["locked_until"] > now:
        remaining_secs = int(attempt_info["locked_until"] - now)
        return jsonify({
            "error": f"Too many failed attempts. Temporary lockout active. Please wait {remaining_secs} seconds.",
            "locked": True,
            "retry_after": remaining_secs
        }), 429

    data = request.get_json(silent=True) or request.form
    password = (data.get("password") or data.get("pin") or "").strip()

    if not password:
        return jsonify({"error": "Admin password/PIN is required"}), 400

    conn = get_db_connection()
    ensure_admin_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("SELECT value FROM app_settings WHERE key = 'admin_password_hash'")
        row = cur.fetchone()
        if not row:
            # Fallback check against environment or default
            expected_pwd = os.environ.get("PANDAS_ADMIN_PASSWORD", "admin123")
            valid = (password == expected_pwd)
        else:
            valid = check_password_hash(row[0], password)

        if not valid:
            # Increment failed attempt count
            attempt_info["count"] += 1
            if attempt_info["count"] >= MAX_FAILED_LOGIN_ATTEMPTS:
                attempt_info["locked_until"] = now + LOCKOUT_DURATION_SECONDS
                attempt_info["count"] = 0
                _login_attempts[client_ip] = attempt_info
                record_admin_audit(cur, "ADMIN_LOCKOUT_TRIGGERED", client_ip, "Max failed password attempts reached")
                conn.commit()
                return jsonify({
                    "error": f"Too many failed attempts. Account locked for 5 minutes.",
                    "locked": True,
                    "retry_after": LOCKOUT_DURATION_SECONDS
                }), 429

            _login_attempts[client_ip] = attempt_info
            remaining = MAX_FAILED_LOGIN_ATTEMPTS - attempt_info["count"]
            record_admin_audit(cur, "ADMIN_UNLOCK_FAILED", client_ip, f"Invalid password attempt ({remaining} tries remaining)")
            conn.commit()
            return jsonify({
                "error": "Invalid password or PIN. Please try again.",
                "remaining_attempts": remaining
            }), 401

        # Successful authentication: Reset failed counter & activate Admin Mode in session
        _login_attempts.pop(client_ip, None)
        session["is_admin"] = True
        session["admin_auth_time"] = now

        record_admin_audit(cur, "ADMIN_UNLOCKED", client_ip, "Admin Mode enabled successfully")
        conn.commit()

        return jsonify({
            "success": True,
            "mode": "admin",
            "is_admin": True,
            "message": "Admin Mode unlocked successfully",
            "timeout_minutes": ADMIN_SESSION_TIMEOUT_MINUTES
        })

    except Exception as e:
        conn.rollback()
        return jsonify({"error": "Authentication error occurred"}), 500
    finally:
        cur.close()
        conn.close()

@app.route("/api/auth/lock-admin", methods=["POST"])
def api_auth_lock_admin():
    """
    Revokes Admin Mode authorization and returns session to default Cashier Mode.
    POS cart and customer session data are preserved untouched.
    """
    session.pop("is_admin", None)
    session.pop("admin_auth_time", None)

    try:
        conn = get_db_connection()
        cur = conn.cursor()
        record_admin_audit(cur, "ADMIN_LOCKED", request.remote_addr, "Admin Mode locked - Returned to Cashier Mode")
        conn.commit()
        cur.close()
        conn.close()
    except Exception:
        pass

    return jsonify({
        "success": True,
        "mode": "cashier",
        "is_admin": False,
        "message": "Admin Mode locked. System is in Cashier Mode."
    })

# ----------------- DASHBOARD API -----------------
@app.route("/api/dashboard/stats")
def api_dashboard_stats():
    conn = get_db_connection()
    cur = conn.cursor()

    # Today's metrics
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at) = CURRENT_DATE
        AND status = 'PAID'
    """)
    today_bills, today_sales = cur.fetchone()

    # Total lifetime metrics
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(total), 0)
        FROM bills
        WHERE status = 'PAID'
    """)
    total_bills, total_sales = cur.fetchone()

    # Purchase metrics
    cur.execute("SELECT COUNT(*), COALESCE(SUM(total), 0) FROM purchases")
    total_purchases_count, total_purchases_sum = cur.fetchone()

    # Product counts
    cur.execute("SELECT COUNT(*) FROM products")
    total_products = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM products WHERE stock <= 0")
    out_of_stock_count = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM products WHERE stock > 0 AND stock <= COALESCE(min_stock, 5.00)")
    low_stock_count = cur.fetchone()[0]

    # Attention needed products (out of stock and low stock, up to 6 items)
    cur.execute("""
        SELECT item_code, item_name, category, stock, unit, COALESCE(min_stock, 5.00), COALESCE(target_stock, 20.00)
        FROM products
        WHERE stock <= COALESCE(min_stock, 5.00)
        ORDER BY stock ASC, item_name ASC
        LIMIT 6
    """)
    critical_products = []
    for r in cur.fetchall():
        critical_products.append({
            "item_code": r[0],
            "item_name": r[1],
            "category": r[2],
            "stock": float(r[3]),
            "unit": r[4] or "pc",
            "min_stock": float(r[5]),
            "target_stock": float(r[6]),
        })

    # Recent bills (last 5)
    cur.execute("""
        SELECT invoice_no, customer_name, total, payment_mode, status, created_at, pdf_path
        FROM bills
        ORDER BY created_at DESC
        LIMIT 5
    """)
    recent_bills = []
    for r in cur.fetchall():
        recent_bills.append({
            "invoice_no": r[0],
            "customer_name": r[1] or "Walk-in Customer",
            "total": float(r[2]),
            "payment_mode": r[3] or "Cash",
            "status": r[4],
            "created_at": r[5].isoformat() if r[5] else None,
            "pdf_path": r[6]
        })

    # Recent purchases (last 5)
    cur.execute("""
        SELECT id, supplier_name, total, bill_status, purchase_date, created_at
        FROM purchases
        ORDER BY purchase_date DESC, id DESC
        LIMIT 5
    """)
    recent_purchases = []
    for r in cur.fetchall():
        recent_purchases.append({
            "id": r[0],
            "supplier_name": r[1],
            "total": float(r[2]),
            "bill_status": r[3] or "Received",
            "purchase_date": r[4].isoformat() if r[4] else None,
            "created_at": r[5].isoformat() if r[5] else None
        })

    # Category breakdown (today or all time if today is zero)
    cur.execute("""
        SELECT p.category, COALESCE(SUM(bi.total), 0)
        FROM bill_items bi
        JOIN bills b ON bi.invoice_no = b.invoice_no
        JOIN products p ON bi.product_name = p.item_name
        WHERE DATE(b.created_at) = CURRENT_DATE AND b.status = 'PAID'
        GROUP BY p.category
        ORDER BY SUM(bi.total) DESC
    """)
    cat_rows = cur.fetchall()
    if not cat_rows:
        # Fallback to all-time category distribution
        cur.execute("""
            SELECT p.category, COALESCE(SUM(bi.total), 0)
            FROM bill_items bi
            JOIN bills b ON bi.invoice_no = b.invoice_no
            JOIN products p ON bi.product_name = p.item_name
            WHERE b.status = 'PAID'
            GROUP BY p.category
            ORDER BY SUM(bi.total) DESC
        """)
        cat_rows = cur.fetchall()

    category_sales = [{"category": r[0], "total": float(r[1])} for r in cat_rows]

    cur.close()
    conn.close()

    return jsonify({
        "today_sales": float(today_sales),
        "today_bills": today_bills,
        "total_sales": float(total_sales),
        "total_bills": total_bills,
        "total_purchases_count": total_purchases_count,
        "total_purchases_sum": float(total_purchases_sum),
        "total_products": total_products,
        "low_stock_count": low_stock_count,
        "out_of_stock_count": out_of_stock_count,
        "critical_products": critical_products,
        "recent_bills": recent_bills,
        "recent_purchases": recent_purchases,
        "category_sales": category_sales,
        "today_date": datetime.now().strftime("%Y-%m-%d")
    })

# ----------------- PRODUCTS API -----------------
@app.route("/api/products/categories")
def api_product_categories():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category")
    categories = [c[0] for c in cur.fetchall()]

    # Also include any categories from category table
    try:
        cur.execute("SELECT name FROM category ORDER BY name")
        for r in cur.fetchall():
            if r[0] not in categories:
                categories.append(r[0])
    except Exception:
        pass

    cur.close()
    conn.close()
    return jsonify(sorted(categories))

@app.route("/api/products/next-code")
def api_product_next_code():
    category = request.args.get("category", "").strip()
    if not category:
        return jsonify({"error": "Category parameter is required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        item_code = generate_item_code(category, cur)
        return jsonify({"item_code": item_code, "category": category})
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route("/api/products", methods=["GET"])
def api_get_products():
    search = request.args.get("search", "").strip()
    category = request.args.get("category", "").strip()

    conn = get_db_connection()
    cur = conn.cursor()

    query = """
        SELECT
            item_code, item_name, category, unit, price, cost_price,
            stock, sales_tax, invoicing_policy, purchase_tax,
            purchase_unit, income_account, expense_account, description,
            company, is_sale, is_purchase, is_manufactured,
            (product_image IS NOT NULL) AS has_image,
            COALESCE(min_stock, 5.00) AS min_stock,
            COALESCE(target_stock, 20.00) AS target_stock
        FROM products
        WHERE 1=1
    """
    params = []

    if category:
        query += " AND category = %s"
        params.append(category)

    if search:
        query += " AND (item_code ILIKE %s OR item_name ILIKE %s OR company ILIKE %s)"
        pattern = f"%{search}%"
        params.extend([pattern, pattern, pattern])

    query += " ORDER BY category, item_name"
    cur.execute(query, tuple(params))
    rows = cur.fetchall()

    products = []
    for r in rows:
        products.append({
            "item_code": r[0],
            "item_name": r[1],
            "category": r[2],
            "unit": r[3],
            "price": float(r[4] or 0),
            "cost_price": float(r[5] or 0),
            "stock": float(r[6] or 0),
            "sales_tax": float(r[7] or 0),
            "invoicing_policy": r[8],
            "purchase_tax": float(r[9] or 0),
            "purchase_unit": r[10],
            "income_account": r[11],
            "expense_account": r[12],
            "description": r[13],
            "company": r[14],
            "is_sale": bool(r[15]),
            "is_purchase": bool(r[16]),
            "is_manufactured": bool(r[17]),
            "has_image": bool(r[18]),
            "image_url": f"/product-image/{r[0]}" if r[18] else None,
            "min_stock": float(r[19] or 5.0),
            "target_stock": float(r[20] or 20.0)
        })

    cur.close()
    conn.close()
    return jsonify(products)

@app.route("/api/products/<item_code>", methods=["GET"])
def api_get_product_detail(item_code):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT
            item_code, item_name, category, unit, price, cost_price,
            stock, sales_tax, invoicing_policy, purchase_tax,
            purchase_unit, income_account, expense_account, description,
            company, is_sale, is_purchase, is_manufactured,
            (product_image IS NOT NULL) AS has_image,
            COALESCE(min_stock, 5.00) AS min_stock,
            COALESCE(target_stock, 20.00) AS target_stock
        FROM products
        WHERE item_code = %s
    """, (item_code,))
    r = cur.fetchone()
    cur.close()
    conn.close()

    if not r:
        return jsonify({"error": "Product not found"}), 404

    product = {
        "item_code": r[0],
        "item_name": r[1],
        "category": r[2],
        "unit": r[3],
        "price": float(r[4] or 0),
        "cost_price": float(r[5] or 0),
        "stock": float(r[6] or 0),
        "sales_tax": float(r[7] or 0),
        "invoicing_policy": r[8] or "Ordered quantities",
        "purchase_tax": float(r[9] or 0),
        "purchase_unit": r[10] or r[3],
        "income_account": r[11] or "Sales",
        "expense_account": r[12] or "Cost of Goods Sold",
        "description": r[13] or "",
        "company": r[14] or "",
        "is_sale": bool(r[15]),
        "is_purchase": bool(r[16]),
        "is_manufactured": bool(r[17]),
        "has_image": bool(r[18]),
        "image_url": f"/product-image/{r[0]}" if r[18] else None,
        "min_stock": float(r[19] or 5.0),
        "target_stock": float(r[20] or 20.0)
    }
    return jsonify(product)

@app.route("/api/products", methods=["POST"])
def api_create_product():
    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or request.values.to_dict() if hasattr(request, 'values') else {})
    image_file = request.files.get("product_image") if request.files else None

    item_name = data.get("item_name", "").strip()
    category = data.get("category", "").strip()
    unit = data.get("unit", "").strip()
    sale_price = data.get("price") or data.get("sale_price")
    cost_price = data.get("cost_price", 0)
    stock = data.get("stock", 0)

    # Validation
    errors = {}
    if not item_name:
        errors["item_name"] = "Product name is required"
    if not category:
        errors["category"] = "Category is required"
    if not unit:
        errors["unit"] = "Unit is required"
    if sale_price is None or str(sale_price).strip() == "":
        errors["sale_price"] = "Valid sales price is required"
    if unit and stock is not None:
        valid_qty, err_qty = validate_unit_quantity(stock, unit)
        if not valid_qty:
            errors["stock"] = err_qty

    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        item_code = data.get("item_code", "").strip()
        if not item_code:
            item_code = generate_item_code(category, cur)

        # Handle image
        image_bytes = None
        image_mime = None
        if image_file and image_file.filename:
            image_bytes = image_file.read()
            image_mime = image_file.mimetype

        is_sale = str(data.get("is_sale", "true")).lower() in ["true", "1", "yes"]
        is_purchase = str(data.get("is_purchase", "true")).lower() in ["true", "1", "yes"]
        is_manufactured = str(data.get("is_manufactured", "false")).lower() in ["true", "1", "yes"]
        min_stock = safe_float(data.get("min_stock", 5.0))
        target_stock = safe_float(data.get("target_stock", 20.0))

        cur.execute("""
            INSERT INTO products (
                item_code, item_name, category, unit, stock,
                price, cost_price, sales_tax,
                invoicing_policy, purchase_tax,
                purchase_unit, income_account,
                expense_account, description, company,
                is_sale, is_purchase, is_manufactured,
                product_image, product_image_mime,
                min_stock, target_stock
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            item_code,
            item_name,
            category,
            unit,
            safe_float(stock),
            safe_float(sale_price),
            safe_float(cost_price),
            safe_float(data.get("sales_tax")),
            data.get("invoicing_policy"),
            safe_float(data.get("purchase_tax")),
            data.get("purchase_unit") or unit,
            data.get("income_account"),
            data.get("expense_account"),
            data.get("description"),
            data.get("company"),
            is_sale,
            is_purchase,
            is_manufactured,
            image_bytes,
            image_mime,
            min_stock,
            target_stock
        ))

        init_qty = safe_float(stock)
        if init_qty > 0:
            record_stock_movement(
                cur,
                item_code=item_code,
                movement_type="Manual Stock Adjustment",
                quantity=init_qty,
                previous_stock=0.0,
                updated_stock=init_qty,
                reference_id=f"INIT-{item_code}",
                reason="Initial stock upon product creation"
            )

        conn.commit()
        return jsonify({"success": True, "item_code": item_code, "message": "Product created successfully"})

    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route("/api/products/<item_code>", methods=["PUT", "POST"])
def api_update_product(item_code):
    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or request.values.to_dict() if hasattr(request, 'values') else {})
    image_file = request.files.get("product_image") if request.files else None

    item_name = data.get("item_name", "").strip()
    category = data.get("category", "").strip()
    unit = data.get("unit", "").strip()
    sale_price = data.get("price") or data.get("sale_price")
    cost_price = data.get("cost_price", 0)
    stock = data.get("stock", 0)

    errors = {}
    if not item_name:
        errors["item_name"] = "Product name is required"
    if not category:
        errors["category"] = "Category is required"
    if not unit:
        errors["unit"] = "Unit is required"
    if sale_price is None or str(sale_price).strip() == "":
        errors["sale_price"] = "Valid sales price is required"
    if unit and stock is not None:
        valid_qty, err_qty = validate_unit_quantity(stock, unit)
        if not valid_qty:
            errors["stock"] = err_qty

    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    conn = get_db_connection()
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        cur.execute("SELECT stock, min_stock, target_stock FROM products WHERE item_code=%s", (item_code,))
        p_row = cur.fetchone()
        prev_stock = float(p_row[0]) if p_row and p_row[0] is not None else 0.0
        cur_min = float(p_row[1]) if p_row and p_row[1] is not None else 5.0
        cur_target = float(p_row[2]) if p_row and p_row[2] is not None else 20.0

        min_stock = safe_float(data.get("min_stock", cur_min))
        target_stock = safe_float(data.get("target_stock", cur_target))
        new_stock = safe_float(stock)

        is_sale = str(data.get("is_sale", "true")).lower() in ["true", "1", "yes"]
        is_purchase = str(data.get("is_purchase", "true")).lower() in ["true", "1", "yes"]
        is_manufactured = str(data.get("is_manufactured", "false")).lower() in ["true", "1", "yes"]

        image_bytes = None
        image_mime = None
        if image_file and image_file.filename:
            image_bytes = image_file.read()
            image_mime = image_file.mimetype

        if image_bytes:
            cur.execute("""
                UPDATE products
                SET
                    item_name=%s, category=%s, unit=%s, stock=%s,
                    price=%s, cost_price=%s, sales_tax=%s,
                    invoicing_policy=%s, purchase_tax=%s, purchase_unit=%s,
                    income_account=%s, expense_account=%s, description=%s,
                    company=%s, is_sale=%s, is_purchase=%s, is_manufactured=%s,
                    product_image=%s, product_image_mime=%s,
                    min_stock=%s, target_stock=%s
                WHERE item_code=%s
            """, (
                item_name, category, unit, new_stock,
                safe_float(sale_price), safe_float(cost_price), safe_float(data.get("sales_tax")),
                data.get("invoicing_policy"), safe_float(data.get("purchase_tax")),
                data.get("purchase_unit") or unit,
                data.get("income_account"), data.get("expense_account"),
                data.get("description"), data.get("company"),
                is_sale, is_purchase, is_manufactured,
                image_bytes, image_mime,
                min_stock, target_stock,
                item_code
            ))
        else:
            cur.execute("""
                UPDATE products
                SET
                    item_name=%s, category=%s, unit=%s, stock=%s,
                    price=%s, cost_price=%s, sales_tax=%s,
                    invoicing_policy=%s, purchase_tax=%s, purchase_unit=%s,
                    income_account=%s, expense_account=%s, description=%s,
                    company=%s, is_sale=%s, is_purchase=%s, is_manufactured=%s,
                    min_stock=%s, target_stock=%s
                WHERE item_code=%s
            """, (
                item_name, category, unit, new_stock,
                safe_float(sale_price), safe_float(cost_price), safe_float(data.get("sales_tax")),
                data.get("invoicing_policy"), safe_float(data.get("purchase_tax")),
                data.get("purchase_unit") or unit,
                data.get("income_account"), data.get("expense_account"),
                data.get("description"), data.get("company"),
                is_sale, is_purchase, is_manufactured,
                min_stock, target_stock,
                item_code
            ))

        if abs(new_stock - prev_stock) > 0.0001:
            delta = new_stock - prev_stock
            record_stock_movement(
                cur,
                item_code=item_code,
                movement_type="Manual Stock Adjustment",
                quantity=delta,
                previous_stock=prev_stock,
                updated_stock=new_stock,
                reference_id=f"UPD-{item_code}",
                reason=data.get("reason") or "Stock level updated in product form"
            )

        conn.commit()
        return jsonify({"success": True, "item_code": item_code, "message": "Product updated successfully"})

    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route("/api/products/<item_code>/quick-update", methods=["PATCH", "POST"])
def api_quick_update_product(item_code):
    data = request.get_json() or request.form
    price = data.get("price")
    stock = data.get("stock")

    conn = get_db_connection()
    ensure_inventory_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("SELECT unit, stock FROM products WHERE item_code=%s", (item_code,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": f"Product '{item_code}' not found"}), 404
        unit = row[0]
        prev_stock = float(row[1]) if row[1] is not None else 0.0

        if stock is not None:
            valid_qty, err_qty = validate_unit_quantity(stock, unit)
            if not valid_qty:
                return jsonify({"error": err_qty, "field": "stock"}), 422
            new_stock = float(stock)
            if abs(new_stock - prev_stock) > 0.0001:
                record_stock_movement(
                    cur,
                    item_code=item_code,
                    movement_type="Manual Stock Adjustment",
                    quantity=new_stock - prev_stock,
                    previous_stock=prev_stock,
                    updated_stock=new_stock,
                    reference_id=f"QUICK-{item_code}",
                    reason="Quick price/stock inline update"
                )

        cur.execute("""
            UPDATE products
            SET price = %s, stock = %s
            WHERE item_code = %s
        """, (Decimal(str(price)), Decimal(str(stock)), item_code))
        conn.commit()
        return jsonify({"success": True, "message": "Updated price & stock"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route("/api/products/<item_code>", methods=["DELETE"])
@admin_required
def api_delete_product(item_code):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM products WHERE item_code=%s", (item_code,))
        conn.commit()
        return jsonify({"success": True, "message": "Product deleted successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route("/api/products/import-csv", methods=["POST"])
@admin_required
def api_import_csv():
    csv_path = os.path.join(BASE_DIR, "products.csv")
    if not os.path.exists(csv_path):
        return jsonify({"error": "products.csv file not found on server"}), 404

    def get_cat(code):
        prefix = code[0].upper() if code else ""
        return {
            "N": "Nuts", "C": "Chocolates", "D": "Dates",
            "F": "Dry Fruits", "W": "Drinks", "M": "Mill Products"
        }.get(prefix, "Others")

    conn = get_db_connection()
    cur = conn.cursor()
    count = 0
    try:
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cat = row.get("category") or get_cat(row["item_code"])
                cur.execute("""
                    INSERT INTO products
                    (item_code, item_name, category, price, stock, unit)
                    VALUES (%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (item_code) DO NOTHING
                """, (
                    row["item_code"],
                    row["item_name"],
                    cat,
                    float(row["price"]),
                    float(row["stock"]),
                    row["unit"]
                ))
                count += 1
        conn.commit()
        return jsonify({"success": True, "imported_rows": count})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()

# ----------------- BILLING & POS API -----------------
@app.route("/api/billing/state")
def api_billing_state():
    if "cart" not in session:
        session["cart"] = []

    if "customer" not in session:
        session["customer"] = {
            "name": "",
            "phone": "",
            "payment_mode": "Cash"
        }

    conn = get_db_connection()
    ensure_billing_discount_schema(conn)
    cur = conn.cursor()

    cur.execute("""
        SELECT DISTINCT category
        FROM products
        WHERE category IS NOT NULL AND is_sale = TRUE
        ORDER BY category
    """)
    categories = [c[0] for c in cur.fetchall()]

    cur.execute("""
        SELECT id, customer_name, total, customer_phone, created_at
        FROM held_bills
        ORDER BY created_at DESC
    """)
    held_bills = []
    for r in cur.fetchall():
        held_bills.append({
            "id": r[0],
            "customer_name": r[1] or "Parked Bill",
            "total": float(r[2]),
            "customer_phone": r[3] or "",
            "created_at": r[4].isoformat() if r[4] else None
        })

    cur.close()
    conn.close()

    bill_discount = session.get("bill_discount", {"type": None, "value": 0.0, "amount": 0.0})
    subtotal, bill_discount, bill_total = calculate_cart_totals(session["cart"], bill_discount)
    session["bill_discount"] = bill_discount
    session.modified = True

    return jsonify({
        "cart": session["cart"],
        "customer": session["customer"],
        "subtotal": subtotal,
        "bill_discount": bill_discount,
        "bill_total": bill_total,
        "categories": categories,
        "held_bills": held_bills
    })

@app.route("/api/billing/discount", methods=["POST"])
def api_set_discount():
    data = request.get_json() or {}
    d_type = data.get("type")
    d_val = data.get("value", 0)

    cart = session.get("cart", [])
    subtotal = sum(Decimal(str(item.get("total", 0))) for item in cart).quantize(Decimal("0.01"))

    if d_type == "percentage":
        try:
            val = Decimal(str(d_val))
        except Exception:
            return jsonify({"error": "Invalid discount percentage"}), 400
        if val < Decimal("0") or val > Decimal("100"):
            return jsonify({"error": "Percentage discount must be between 0% and 100%"}), 400
        discount_amount = (subtotal * val / Decimal("100")).quantize(Decimal("0.01"))
        d_val = float(val)
    elif d_type == "fixed":
        try:
            val = Decimal(str(d_val))
        except Exception:
            return jsonify({"error": "Invalid fixed discount amount"}), 400
        if val < Decimal("0"):
            return jsonify({"error": "Discount amount cannot be negative"}), 400
        if val > subtotal:
            return jsonify({"error": f"Fixed discount cannot exceed the cart subtotal of ₹{float(subtotal):.2f}"}), 400
        discount_amount = val.quantize(Decimal("0.01"))
        d_val = float(val)
    else:
        d_type = None
        d_val = 0.0
        discount_amount = Decimal("0.00")

    final_payable = max(Decimal("0.00"), subtotal - discount_amount)

    session["bill_discount"] = {
        "type": d_type,
        "value": d_val,
        "amount": float(discount_amount)
    }
    session.modified = True

    return jsonify({
        "success": True,
        "subtotal": float(subtotal),
        "discount_type": d_type,
        "discount_value": d_val,
        "discount_amount": float(discount_amount),
        "bill_total": float(final_payable)
    })

@app.route("/api/billing/products")
def api_billing_products():
    category = request.args.get("category", "")
    conn = get_db_connection()
    cur = conn.cursor()

    if category:
        cur.execute("""
            SELECT item_code, item_name, price, unit, stock, (product_image IS NOT NULL) AS has_image
            FROM products
            WHERE category=%s
            AND is_sale = TRUE
            ORDER BY item_name
        """, (category,))
    else:
        cur.execute("""
            SELECT item_code, item_name, price, unit, stock, (product_image IS NOT NULL) AS has_image
            FROM products
            WHERE is_sale = TRUE
            ORDER BY item_name
        """)

    rows = cur.fetchall()
    cur.close()
    conn.close()

    items = []
    for r in rows:
        items.append({
            "item_code": r[0],
            "item_name": r[1],
            "price": float(r[2]),
            "unit": r[3],
            "stock": float(r[4] or 0),
            "has_image": bool(r[5]),
            "image_url": f"/product-image/{r[0]}" if r[5] else None
        })
    return jsonify(items)

@app.route("/api/billing/cart/add", methods=["POST"])
def api_cart_add():
    if "cart" not in session:
        session["cart"] = []

    data = request.get_json() or request.form
    code = data.get("item_code")
    quantity = data.get("quantity", 1)

    if not code:
        return jsonify({"error": "item_code is required"}), 400

    try:
        qty = Decimal(str(quantity))
    except Exception:
        return jsonify({"error": "Invalid quantity"}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT item_name, price, unit, stock
        FROM products
        WHERE item_code=%s
    """, (code,))
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row:
        return jsonify({"error": "Product not found"}), 404

    name, price, unit, stock = row
    price = Decimal(str(price))
    total = price * qty

    # Strict Unit-based Quantity Validation
    valid_qty, err_qty = validate_unit_quantity(quantity, unit)
    if not valid_qty:
        return jsonify({"error": err_qty}), 400

    # Check if item already in cart to increment or add new line
    found = False
    for item in session["cart"]:
        if item.get("code") == code:
            existing_qty = Decimal(str(item["qty"]))
            new_qty = existing_qty + qty
            valid_combined, err_comb = validate_unit_quantity(new_qty, unit)
            if not valid_combined:
                return jsonify({"error": err_comb}), 400
            item["qty"] = float(new_qty)
            item["total"] = float(Decimal(str(item["price"])) * new_qty)
            found = True
            break

    if not found:
        session["cart"].append({
            "code": code,
            "name": name,
            "price": float(price),
            "qty": float(qty),
            "unit": unit,
            "total": float(total)
        })

    session.modified = True
    subtotal, bill_discount, bill_total = calculate_cart_totals(session["cart"], session.get("bill_discount"))
    session["bill_discount"] = bill_discount

    return jsonify({
        "success": True,
        "cart": session["cart"],
        "subtotal": subtotal,
        "bill_discount": bill_discount,
        "bill_total": bill_total
    })

@app.route("/api/billing/cart/update-qty", methods=["POST"])
def api_cart_update_qty():
    data = request.get_json() or request.form
    index = int(data.get("index", -1))
    quantity = data.get("quantity")

    cart = session.get("cart", [])
    if 0 <= index < len(cart):
        item = cart[index]
        unit = item.get("unit")
        if not unit:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("SELECT unit FROM products WHERE item_code=%s", (item.get("code"),))
            r = cur.fetchone()
            unit = r[0] if r else "pc"
            cur.close()
            conn.close()

        valid_qty, err_qty = validate_unit_quantity(quantity, unit)
        if not valid_qty:
            return jsonify({"error": err_qty}), 400

        new_qty = Decimal(str(quantity))
        price = Decimal(str(cart[index]["price"]))
        cart[index]["qty"] = float(new_qty)
        cart[index]["total"] = float(price * new_qty)
        session.modified = True
        subtotal, bill_discount, bill_total = calculate_cart_totals(cart, session.get("bill_discount"))
        session["bill_discount"] = bill_discount
        return jsonify({
            "success": True,
            "cart": cart,
            "subtotal": subtotal,
            "bill_discount": bill_discount,
            "bill_total": bill_total
        })

    return jsonify({"error": "Invalid cart item index"}), 400

@app.route("/api/billing/cart/update-price", methods=["POST"])
def api_cart_update_price():
    data = request.get_json() or request.form
    index = int(data.get("index", -1))
    price = data.get("price")

    cart = session.get("cart", [])
    if 0 <= index < len(cart):
        new_price = Decimal(str(price))
        qty = Decimal(str(cart[index]["qty"]))
        cart[index]["price"] = float(new_price)
        cart[index]["total"] = float(new_price * qty)
        session.modified = True
        subtotal, bill_discount, bill_total = calculate_cart_totals(cart, session.get("bill_discount"))
        session["bill_discount"] = bill_discount
        return jsonify({
            "success": True,
            "cart": cart,
            "subtotal": subtotal,
            "bill_discount": bill_discount,
            "bill_total": bill_total
        })

    return jsonify({"error": "Invalid cart item index"}), 400

@app.route("/api/billing/cart/remove/<int:index>", methods=["DELETE", "POST"])
def api_cart_remove(index):
    cart = session.get("cart", [])
    if 0 <= index < len(cart):
        cart.pop(index)
        session.modified = True
        subtotal, bill_discount, bill_total = calculate_cart_totals(cart, session.get("bill_discount"))
        session["bill_discount"] = bill_discount
        return jsonify({
            "success": True,
            "cart": cart,
            "subtotal": subtotal,
            "bill_discount": bill_discount,
            "bill_total": bill_total
        })

    return jsonify({"error": "Invalid index"}), 400

@app.route("/api/billing/cart/clear", methods=["POST"])
def api_cart_clear():
    session["cart"] = []
    session["bill_discount"] = {"type": None, "value": 0.0, "amount": 0.0}
    session.modified = True
    return jsonify({
        "success": True,
        "cart": [],
        "subtotal": 0.0,
        "bill_discount": session["bill_discount"],
        "bill_total": 0.0
    })

@app.route("/api/billing/customer", methods=["POST"])
def api_set_customer():
    data = request.get_json() or request.form
    session["customer"] = {
        "name": data.get("name", "").strip(),
        "phone": data.get("phone", "").strip(),
        "payment_mode": data.get("payment_mode", "Cash")
    }
    session.modified = True
    return jsonify({"success": True, "customer": session["customer"]})

@app.route("/api/billing/hold", methods=["POST"])
def api_hold_bill():
    cart = session.get("cart", [])
    customer = session.get("customer", {})

    if not cart:
        return jsonify({"error": "Cart is empty, cannot park bill"}), 400

    conn = get_db_connection()
    ensure_billing_discount_schema(conn)
    cur = conn.cursor()

    subtotal, bill_discount, bill_total = calculate_cart_totals(cart, session.get("bill_discount"))

    cur.execute("""
        INSERT INTO held_bills (cart, customer_name, customer_phone, total, discount_type, discount_value, discount_amount)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        json.dumps(cart),
        customer.get("name"),
        customer.get("phone"),
        bill_total,
        bill_discount.get("type"),
        bill_discount.get("value", 0.0),
        bill_discount.get("amount", 0.0)
    ))
    hold_id = cur.fetchone()[0]
    conn.commit()

    cur.execute("""
        SELECT id, customer_name, total, customer_phone, created_at
        FROM held_bills
        ORDER BY created_at DESC
    """)
    held_bills = []
    for r in cur.fetchall():
        held_bills.append({
            "id": r[0],
            "customer_name": r[1] or "Parked Bill",
            "total": float(r[2]),
            "customer_phone": r[3] or "",
            "created_at": r[4].isoformat() if r[4] else None
        })

    cur.close()
    conn.close()

    session.pop("cart", None)
    session.pop("customer", None)
    session.pop("bill_discount", None)

    return jsonify({
        "success": True,
        "hold_id": hold_id,
        "held_bills": held_bills,
        "message": "Bill successfully parked"
    })

@app.route("/api/billing/resume/<int:hold_id>", methods=["POST"])
def api_resume_bill(hold_id):
    conn = get_db_connection()
    ensure_billing_discount_schema(conn)
    cur = conn.cursor()

    cur.execute("""
        SELECT cart, customer_name, customer_phone, discount_type, discount_value, discount_amount
        FROM held_bills
        WHERE id=%s
    """, (hold_id,))
    row = cur.fetchone()

    if not row:
        cur.close()
        conn.close()
        return jsonify({"error": "Held bill not found"}), 404

    cart_data = row[0]
    if isinstance(cart_data, str):
        cart_data = json.loads(cart_data)

    session["cart"] = cart_data
    session["customer"] = {
        "name": row[1] or "",
        "phone": row[2] or "",
        "payment_mode": "Cash"
    }
    session["bill_discount"] = {
        "type": row[3],
        "value": float(row[4] or 0.0),
        "amount": float(row[5] or 0.0)
    }

    subtotal, bill_discount, bill_total = calculate_cart_totals(session["cart"], session["bill_discount"])
    session["bill_discount"] = bill_discount

    cur.execute("DELETE FROM held_bills WHERE id=%s", (hold_id,))
    conn.commit()

    cur.execute("""
        SELECT id, customer_name, total, customer_phone, created_at
        FROM held_bills
        ORDER BY created_at DESC
    """)
    held_bills = []
    for r in cur.fetchall():
        held_bills.append({
            "id": r[0],
            "customer_name": r[1] or "Parked Bill",
            "total": float(r[2]),
            "customer_phone": r[3] or "",
            "created_at": r[4].isoformat() if r[4] else None
        })

    cur.close()
    conn.close()

    session.modified = True

    return jsonify({
        "success": True,
        "cart": session["cart"],
        "customer": session["customer"],
        "subtotal": subtotal,
        "bill_discount": bill_discount,
        "bill_total": round(bill_total, 2),
        "held_bills": held_bills
    })

@app.route("/api/billing/checkout", methods=["POST"])
def api_checkout():
    cart = session.get("cart", [])
    if not cart:
        return jsonify({"error": "Cart is empty"}), 400

    # Strict Unit-based Quantity Validation for all checkout items
    for item in cart:
        unit = item.get("unit")
        valid_qty, err_qty = validate_unit_quantity(item.get("qty"), unit)
        if not valid_qty:
            return jsonify({"error": f"Item '{item.get('name')}': {err_qty}"}), 400

    data = request.get_json(silent=True) or {}
    customer = session.get("customer", {})

    cust_name = data.get("customer_name") or customer.get("name") or "Walk-in Customer"
    cust_phone = data.get("customer_phone") or customer.get("phone") or ""
    pay_mode = data.get("payment_mode") or customer.get("payment_mode") or "Cash"
    cust_id = (data.get("customer_id") or customer.get("customer_id") or "").strip() or None

    conn = get_db_connection()
    ensure_billing_discount_schema(conn)
    ensure_customer_supplier_schema(conn)
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        invoice_no = generate_invoice_no(cur)
        subtotal, bill_discount, total = calculate_cart_totals(cart, session.get("bill_discount"))

        # 1. Insert Bill (preserving subtotal, discount, customer_id if associated)
        cur.execute("""
            INSERT INTO bills
            (invoice_no, total, subtotal, discount_type, discount_value, discount_amount,
             customer_name, customer_phone, payment_mode, status, customer_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'PAID',%s)
        """, (
            invoice_no, float(total), float(subtotal),
            bill_discount.get("type"), float(bill_discount.get("value", 0.0)),
            float(bill_discount.get("amount", 0.0)),
            cust_name, cust_phone, pay_mode, cust_id
        ))

        # 2. Insert Items & Decrement Stock
        for item in cart:
            code = item.get("code")
            qty_sold = float(item["qty"])

            cur.execute("""
                INSERT INTO bill_items
                (invoice_no, product_name, price, quantity, total, item_code)
                VALUES (%s,%s,%s,%s,%s,%s)
            """, (
                invoice_no,
                item["name"],
                item["price"],
                item["qty"],
                item["total"],
                code
            ))

            # Capture cost at time of sale (WAC) for P&L
            cur.execute("SELECT COALESCE(cost_price, 0) FROM products WHERE item_code = %s", (code,))
            cost_row = cur.fetchone()
            cost_at_sale = float(cost_row[0]) if cost_row else 0.0
            cur.execute("""
                UPDATE bill_items SET cost_at_sale = %s
                WHERE invoice_no = %s AND item_code = %s
            """, (cost_at_sale, invoice_no, code))

            cur.execute("SELECT stock FROM products WHERE item_code = %s", (code,))
            s_row = cur.fetchone()
            prev_stock = float(s_row[0]) if s_row and s_row[0] is not None else 0.0
            new_stock = prev_stock - qty_sold

            cur.execute("""
                UPDATE products
                SET stock = stock - %s
                WHERE item_code = %s
            """, (item["qty"], code))

            record_stock_movement(
                cur,
                item_code=code,
                movement_type="Sale",
                quantity=-qty_sold,
                previous_stock=prev_stock,
                updated_stock=new_stock,
                reference_id=invoice_no,
                reason=f"POS Sale Invoice #{invoice_no}"
            )

        conn.commit()

        # 3. Fetch Data for PDF
        cur.execute("SELECT total, created_at FROM bills WHERE invoice_no=%s", (invoice_no,))
        bill_row = cur.fetchone()

        cur.execute("""
            SELECT product_name, price, quantity, total
            FROM bill_items
            WHERE invoice_no=%s
        """, (invoice_no,))
        items_rows = cur.fetchall()

        # 4. Generate PDF via xhtml2pdf & save locally
        html = render_template(
            "bill.html",
            invoice_no=invoice_no,
            bill=bill_row,
            items=items_rows,
            subtotal=float(subtotal),
            discount_type=bill_discount.get("type"),
            discount_value=float(bill_discount.get("value", 0.0)),
            discount_amount=float(bill_discount.get("amount", 0.0)),
            final_total=float(total)
        )

        year = datetime.now().strftime("%Y")
        month = datetime.now().strftime("%m")
        folder_path = os.path.join(BASE_DIR, "static", "invoices", year, month)
        os.makedirs(folder_path, exist_ok=True)

        pdf_path = os.path.join(folder_path, f"{invoice_no}.pdf")
        rel_pdf_path = f"static/invoices/{year}/{month}/{invoice_no}.pdf"

        with open(pdf_path, "wb") as f:
            pisa.CreatePDF(html, dest=f, link_callback=link_callback)

        # 5. Save PDF Path
        cur.execute("""
            UPDATE bills
            SET pdf_path=%s
            WHERE invoice_no=%s
        """, (rel_pdf_path, invoice_no))
        conn.commit()

    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Checkout failed: {str(e)}"}), 500
    finally:
        cur.close()
        conn.close()

    # Clear active session cart & discount
    session.pop("cart", None)
    session.pop("customer", None)
    session.pop("bill_discount", None)

    return jsonify({
        "success": True,
        "invoice_no": invoice_no,
        "subtotal": float(subtotal),
        "discount_amount": float(bill_discount.get("amount", 0.0)),
        "total": float(total),
        "customer_name": cust_name,
        "payment_mode": pay_mode,
        "pdf_url": f"/{rel_pdf_path}",
        "view_url": f"/bill/{invoice_no}"
    })

# ----------------- BILLS & INVOICE HISTORY API -----------------
@app.route("/api/bills")
def api_bills_list():
    search = request.args.get("search", "").strip()
    date_val = request.args.get("date", "").strip()
    from_date = (request.args.get("from_date") or request.args.get("start_date") or "").strip()
    to_date = (request.args.get("to_date") or request.args.get("end_date") or "").strip()
    payment_mode = request.args.get("payment_mode", "").strip()
    status = request.args.get("status", "").strip()
    page_param = request.args.get("page")
    page_size_param = request.args.get("page_size")

    is_paged = (page_param is not None or page_size_param is not None or request.args.get("paginate") == "true")

    conn = get_db_connection()
    cur = conn.cursor()

    where_clauses = ["1=1"]
    params = []

    if search:
        where_clauses.append("(invoice_no ILIKE %s OR customer_name ILIKE %s OR COALESCE(customer_phone, '') ILIKE %s)")
        search_pattern = f"%{search}%"
        params.extend([search_pattern, search_pattern, search_pattern])

    if date_val:
        where_clauses.append("DATE(created_at) = %s")
        params.append(date_val)
    else:
        if from_date:
            where_clauses.append("DATE(created_at) >= %s")
            params.append(from_date)
        if to_date:
            where_clauses.append("DATE(created_at) <= %s")
            params.append(to_date)

    if payment_mode and payment_mode.upper() != "ALL":
        where_clauses.append("payment_mode = %s")
        params.append(payment_mode)

    if status and status.upper() != "ALL":
        where_clauses.append("status = %s")
        params.append(status)

    where_sql = " AND ".join(where_clauses)

    count_query = f"SELECT COUNT(*) FROM bills WHERE {where_sql}"
    cur.execute(count_query, tuple(params))
    total_count = cur.fetchone()[0]

    if is_paged:
        try:
            page = max(1, int(page_param or 1))
        except (ValueError, TypeError):
            page = 1
        try:
            page_size = max(1, min(100, int(page_size_param or 15)))
        except (ValueError, TypeError):
            page_size = 15

        offset = (page - 1) * page_size
        total_pages = max(1, math.ceil(total_count / page_size)) if total_count > 0 else 1

        data_query = f"""
            SELECT invoice_no, customer_name, total, created_at, pdf_path, status, payment_mode, customer_phone
            FROM bills
            WHERE {where_sql}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """
        cur.execute(data_query, tuple(params + [page_size, offset]))
    else:
        data_query = f"""
            SELECT invoice_no, customer_name, total, created_at, pdf_path, status, payment_mode, customer_phone
            FROM bills
            WHERE {where_sql}
            ORDER BY created_at DESC
        """
        cur.execute(data_query, tuple(params))

    bills = []
    for r in cur.fetchall():
        bills.append({
            "invoice_no": r[0],
            "customer_name": r[1] or "Walk-in Customer",
            "total": float(r[2]),
            "created_at": r[3].strftime("%d-%m-%Y %H:%M:%S") if r[3] else None,
            "created_date": r[3].strftime("%Y-%m-%d") if r[3] else None,
            "pdf_path": r[4],
            "pdf_url": f"/{r[4]}" if r[4] else f"/bill/{r[0]}/pdf",
            "status": r[5] or "PAID",
            "payment_mode": r[6] or "Cash",
            "customer_phone": r[7] or ""
        })

    cur.close()
    conn.close()

    if is_paged:
        return jsonify({
            "bills": bills,
            "total": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages
        })
    return jsonify(bills)

@app.route("/api/bills/<invoice_no>")
def api_bill_detail(invoice_no):
    conn = get_db_connection()
    ensure_billing_discount_schema(conn)
    cur = conn.cursor()

    cur.execute("""
        SELECT invoice_no, customer_name, customer_phone, payment_mode, total, created_at, pdf_path, status,
               COALESCE(subtotal, total), discount_type, COALESCE(discount_value, 0), COALESCE(discount_amount, 0)
        FROM bills
        WHERE invoice_no = %s
    """, (invoice_no,))
    bill_row = cur.fetchone()

    if not bill_row:
        cur.close()
        conn.close()
        return jsonify({"error": "Invoice not found"}), 404

    cur.execute("""
        SELECT product_name, price, quantity, total
        FROM bill_items
        WHERE invoice_no=%s
    """, (invoice_no,))
    items_rows = cur.fetchall()

    cur.close()
    conn.close()

    items = []
    for r in items_rows:
        items.append({
            "product_name": r[0],
            "price": float(r[1]),
            "quantity": float(r[2]),
            "total": float(r[3])
        })

    bill = {
        "invoice_no": bill_row[0],
        "customer_name": bill_row[1] or "Walk-in Customer",
        "customer_phone": bill_row[2] or "",
        "payment_mode": bill_row[3] or "Cash",
        "total": float(bill_row[4]),
        "created_at": bill_row[5].strftime("%d-%m-%Y %H:%M:%S") if bill_row[5] else None,
        "pdf_path": bill_row[6],
        "pdf_url": f"/{bill_row[6]}" if bill_row[6] else f"/bill/{bill_row[0]}/pdf",
        "status": bill_row[7],
        "subtotal": float(bill_row[8] if bill_row[8] is not None else bill_row[4]),
        "discount_type": bill_row[9],
        "discount_value": float(bill_row[10] or 0.0),
        "discount_amount": float(bill_row[11] or 0.0),
        "items": items
    }
    return jsonify(bill)

@app.route("/api/bills/<invoice_no>/cancel", methods=["POST"])
def api_cancel_bill(invoice_no):
    conn = get_db_connection()
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        cur.execute("SELECT status FROM bills WHERE invoice_no=%s", (invoice_no,))
        b_row = cur.fetchone()
        if not b_row:
            return jsonify({"error": f"Bill {invoice_no} not found"}), 404
        if b_row[0] == "CANCELLED":
            return jsonify({"error": f"Bill {invoice_no} is already cancelled"}), 400

        # Retrieve items to restore stock
        cur.execute("""
            SELECT product_name, quantity, item_code
            FROM bill_items
            WHERE invoice_no=%s
        """, (invoice_no,))
        items = cur.fetchall()

        for (p_name, qty_val, code) in items:
            qty = float(qty_val or 0)
            target_code = code
            if not target_code:
                cur.execute("SELECT item_code FROM products WHERE item_name=%s", (p_name,))
                pr = cur.fetchone()
                if pr:
                    target_code = pr[0]

            if target_code and qty > 0:
                cur.execute("SELECT stock FROM products WHERE item_code=%s", (target_code,))
                s_row = cur.fetchone()
                prev_stock = float(s_row[0]) if s_row and s_row[0] is not None else 0.0
                new_stock = prev_stock + qty

                cur.execute("UPDATE products SET stock = stock + %s WHERE item_code=%s", (Decimal(str(qty)), target_code))
                record_stock_movement(
                    cur,
                    item_code=target_code,
                    movement_type="Sales Return",
                    quantity=qty,
                    previous_stock=prev_stock,
                    updated_stock=new_stock,
                    reference_id=invoice_no,
                    reason=f"Restock from cancelled bill #{invoice_no}"
                )

        cur.execute("UPDATE bills SET status='CANCELLED' WHERE invoice_no=%s", (invoice_no,))
        conn.commit()
        return jsonify({"success": True, "message": f"Bill {invoice_no} cancelled successfully and stock restored"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()

# ----------------- PURCHASES API -----------------
@app.route("/api/purchases/categories")
def api_purchase_categories():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT DISTINCT category
        FROM products
        WHERE is_purchase = TRUE
        ORDER BY category
    """)
    categories = [c[0] for c in cur.fetchall()]
    cur.close()
    conn.close()
    return jsonify(categories)

@app.route("/api/purchases/items/<category>")
def api_purchase_items(category):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT item_code, item_name, cost_price, price, unit, stock
        FROM products
        WHERE category = %s
        AND is_purchase = TRUE
        ORDER BY item_name
    """, (category,))
    rows = cur.fetchall()
    cur.close()
    conn.close()

    items = []
    for r in rows:
        items.append({
            "item_code": r[0],
            "item_name": r[1],
            "cost_price": float(r[2] or 0),
            "price": float(r[3] or 0),
            "unit": r[4],
            "stock": float(r[5] or 0)
        })
    return jsonify(items)

@app.route("/api/purchases", methods=["POST"])
def api_save_purchase():
    data = request.get_json() or request.form
    supplier = data.get("supplier_name", "").strip()
    supplier_id = (data.get("supplier_id") or "").strip() or None
    purchase_date = data.get("purchase_date")
    due_date = (data.get("due_date") or "").strip() or None
    grand_total = Decimal(str(data.get("grand_total", 0)))
    items = data.get("items", [])

    # Separate Goods Receipt Status from Payment Status
    receipt_status = (data.get("receipt_status") or "").strip() or "Received"
    if receipt_status not in ["Pending Receipt", "Received", "Verified", "Partially Received"]:
        receipt_status = "Received"

    payment_method = (data.get("payment_method") or "").strip() or "Cash"

    # Automatically calculate Payment Status using grand_total and paid_amount
    raw_paid = data.get("paid_amount")
    if raw_paid is not None and str(raw_paid).strip() != "":
        paid_amount = Decimal(str(raw_paid))
    else:
        if data.get("payment_status") == "Unpaid":
            paid_amount = Decimal("0.00")
        else:
            paid_amount = grand_total

    if paid_amount >= grand_total:
        payment_status = "Paid"
    elif paid_amount > Decimal("0.00"):
        payment_status = "Partially Paid"
    else:
        payment_status = "Unpaid"

    if not supplier:
        return jsonify({"error": "Supplier name is required"}), 400
    if not purchase_date:
        return jsonify({"error": "Purchase date is required"}), 400
    if not items or len(items) == 0:
        return jsonify({"error": "At least one purchase item is required"}), 400

    conn = get_db_connection()
    ensure_purchase_schema(conn)
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        # Pre-validate all line items: Strict unit validation
        validated_items = []
        for item in items:
            code = item.get("item_code")
            cur.execute("SELECT item_name, unit FROM products WHERE item_code=%s", (code,))
            p_row = cur.fetchone()
            if not p_row:
                cur.close()
                conn.close()
                return jsonify({"error": f"Product with code '{code}' does not exist"}), 404

            p_name, p_unit = p_row
            raw_qty = item.get("quantity", 0)
            valid_qty, err_qty = validate_unit_quantity(raw_qty, p_unit)
            if not valid_qty:
                cur.close()
                conn.close()
                return jsonify({"error": f"Item '{p_name}' ({code}): {err_qty}"}), 400

            qty = Decimal(str(raw_qty))
            cost = Decimal(str(item.get("cost_price", 0)))
            tot = Decimal(str(item.get("total", cost * qty)))
            validated_items.append((code, p_name, cost, qty, tot))

        # Record receipt and verification dates
        receipt_date = purchase_date if receipt_status in ["Received", "Verified", "Partially Received"] else None
        verified_date = purchase_date if receipt_status == "Verified" else None

        # Stock update rule: Only increase stock if physically Received or Verified
        # Never increase inventory if status is 'Pending Receipt'
        should_update_stock = receipt_status in ["Received", "Verified", "Partially Received"]
        stock_updated = should_update_stock

        cur.execute("""
            INSERT INTO purchases
            (supplier_name, total, bill_status, purchase_date, receipt_status, payment_status, payment_method, paid_amount, receipt_date, verified_date, stock_updated, supplier_id, due_date)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            supplier, grand_total, payment_status, purchase_date,
            receipt_status, payment_status, payment_method, paid_amount,
            receipt_date, verified_date, stock_updated, supplier_id, due_date
        ))
        purchase_id = cur.fetchone()[0]

        # If an initial payment amount was recorded, register it in purchase_payments ledger
        if paid_amount > Decimal("0.00"):
            cur.execute("""
                INSERT INTO purchase_payments (purchase_id, payment_date, amount, payment_method, reference_no, notes)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (purchase_id, purchase_date, paid_amount, payment_method, "INITIAL", "Initial payment upon purchase entry"))

        for (code, p_name, cost, qty, tot) in validated_items:
            cur.execute("""
                INSERT INTO purchase_items
                (purchase_id, item_code, product_name, cost_price, quantity, total)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (purchase_id, code, p_name, cost, qty, tot))

            if should_update_stock:
                cur.execute("SELECT stock, cost_price FROM products WHERE item_code=%s", (code,))
                s_row = cur.fetchone()
                prev_stock = float(s_row[0]) if s_row and s_row[0] is not None else 0.0
                prev_cost = float(s_row[1]) if s_row and s_row[1] is not None else 0.0
                qty_added = float(qty)
                cost_added = float(cost)
                new_stock = prev_stock + qty_added

                # Weighted Average Cost calculation
                if cost_added > 0:
                    if prev_stock <= 0 or prev_cost <= 0:
                        new_cost = cost_added
                    else:
                        new_cost = round(((prev_stock * prev_cost) + (qty_added * cost_added)) / (prev_stock + qty_added), 4)
                    cur.execute("""
                        UPDATE products
                        SET stock = stock + %s, cost_price = %s
                        WHERE item_code = %s
                    """, (qty, new_cost, code))
                else:
                    cur.execute("""
                        UPDATE products
                        SET stock = stock + %s
                        WHERE item_code = %s
                    """, (qty, code))

                record_stock_movement(
                    cur,
                    item_code=code,
                    movement_type="Purchase Received",
                    quantity=qty_added,
                    previous_stock=prev_stock,
                    updated_stock=new_stock,
                    reference_id=f"PO#{purchase_id}",
                    reason=f"Purchase consignment from {supplier}"
                )

        conn.commit()
        return jsonify({
            "success": True,
            "purchase_id": purchase_id,
            "receipt_status": receipt_status,
            "payment_status": payment_status,
            "payment_method": payment_method,
            "stock_updated": stock_updated,
            "message": "Purchase recorded successfully" + (" and inventory updated" if should_update_stock else " (stock pending physical receipt)")
        })

    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Failed to save purchase: {str(e)}"}), 400
    finally:
        cur.close()
        conn.close()

@app.route("/api/purchases/<int:purchase_id>/receive", methods=["POST"])
def api_receive_purchase(purchase_id):
    """Marks a pending purchase as physically Received, incrementing inventory stock exactly once."""
    conn = get_db_connection()
    ensure_purchase_schema(conn)
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        cur.execute("SELECT stock_updated, receipt_status, supplier_name FROM purchases WHERE id=%s", (purchase_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Purchase record not found"}), 404

        stock_updated, current_status, supplier_name = row
        if not stock_updated:
            # Increment stock for items and update Weighted Average Cost
            cur.execute("SELECT item_code, quantity, cost_price FROM purchase_items WHERE purchase_id=%s", (purchase_id,))
            for (code, qty, cost_val) in cur.fetchall():
                cur.execute("SELECT stock, cost_price FROM products WHERE item_code=%s", (code,))
                s_row = cur.fetchone()
                prev_stock = float(s_row[0]) if s_row and s_row[0] is not None else 0.0
                prev_cost = float(s_row[1]) if s_row and s_row[1] is not None else 0.0
                qty_added = float(qty)
                cost_added = float(cost_val or 0.0)
                new_stock = prev_stock + qty_added

                if cost_added > 0:
                    if prev_stock <= 0 or prev_cost <= 0:
                        new_cost = cost_added
                    else:
                        new_cost = round(((prev_stock * prev_cost) + (qty_added * cost_added)) / (prev_stock + qty_added), 4)
                    cur.execute("UPDATE products SET stock = stock + %s, cost_price = %s WHERE item_code=%s", (qty, new_cost, code))
                else:
                    cur.execute("UPDATE products SET stock = stock + %s WHERE item_code=%s", (qty, code))

                record_stock_movement(
                    cur,
                    item_code=code,
                    movement_type="Purchase Received",
                    quantity=qty_added,
                    previous_stock=prev_stock,
                    updated_stock=new_stock,
                    reference_id=f"PO#{purchase_id}",
                    reason=f"Goods received confirmation PO#{purchase_id} from {supplier_name}"
                )

        cur.execute("""
            UPDATE purchases
            SET receipt_status = 'Received', receipt_date = CURRENT_DATE, stock_updated = TRUE
            WHERE id=%s
        """, (purchase_id,))
        conn.commit()
        return jsonify({"success": True, "message": f"Consignment #{purchase_id} marked as Received and inventory updated."})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route("/api/purchases/<int:purchase_id>/verify", methods=["POST"])
def api_verify_purchase(purchase_id):
    """Marks a purchase consignment as Verified."""
    conn = get_db_connection()
    ensure_purchase_schema(conn)
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        cur.execute("SELECT stock_updated, supplier_name FROM purchases WHERE id=%s", (purchase_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Purchase record not found"}), 404

        stock_updated, supplier_name = row
        if not stock_updated:
            cur.execute("SELECT item_code, quantity FROM purchase_items WHERE purchase_id=%s", (purchase_id,))
            for (code, qty) in cur.fetchall():
                cur.execute("SELECT stock FROM products WHERE item_code=%s", (code,))
                s_row = cur.fetchone()
                prev_stock = float(s_row[0]) if s_row and s_row[0] is not None else 0.0
                qty_added = float(qty)
                new_stock = prev_stock + qty_added

                cur.execute("UPDATE products SET stock = stock + %s WHERE item_code=%s", (qty, code))
                record_stock_movement(
                    cur,
                    item_code=code,
                    movement_type="Purchase Received",
                    quantity=qty_added,
                    previous_stock=prev_stock,
                    updated_stock=new_stock,
                    reference_id=f"PO#{purchase_id}",
                    reason=f"Goods verified consignment PO#{purchase_id} from {supplier_name}"
                )

        cur.execute("""
            UPDATE purchases
            SET receipt_status = 'Verified', verified_date = CURRENT_DATE, stock_updated = TRUE
            WHERE id=%s
        """, (purchase_id,))
        conn.commit()
        return jsonify({"success": True, "message": f"Consignment #{purchase_id} verified against purchase record."})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()

@app.route("/api/purchases/history")
def api_purchase_history():
    supplier = request.args.get("supplier", "").strip()
    purchase_date = request.args.get("purchase_date", "").strip()

    conn = get_db_connection()
    ensure_purchase_schema(conn)
    cur = conn.cursor()

    cur.execute("""
        SELECT DISTINCT supplier_name
        FROM purchases
        ORDER BY supplier_name
    """)
    suppliers = [s[0] for s in cur.fetchall()]

    dates = []
    if supplier:
        cur.execute("""
            SELECT DISTINCT purchase_date
            FROM purchases
            WHERE supplier_name=%s
            ORDER BY purchase_date DESC
        """, (supplier,))
        dates = [d[0].isoformat() if isinstance(d[0], date) else str(d[0]) for d in cur.fetchall()]

    # Flexible filtering: by supplier, by date, by both, or default recent 30
    query = """
        SELECT id, supplier_name, total, bill_status, purchase_date, created_at,
               COALESCE(receipt_status, 'Received'),
               COALESCE(payment_status, bill_status, 'Paid'),
               COALESCE(payment_method, 'Cash'),
               COALESCE(paid_amount, total),
               receipt_date, verified_date, COALESCE(stock_updated, TRUE),
               supplier_id, due_date
        FROM purchases
    """
    params = []
    where_clauses = []
    if supplier:
        where_clauses.append("supplier_name=%s")
        params.append(supplier)
    if purchase_date:
        where_clauses.append("purchase_date=%s")
        params.append(purchase_date)

    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)
    query += " ORDER BY purchase_date DESC, id DESC LIMIT 50"

    cur.execute(query, tuple(params))
    p_rows = cur.fetchall()

    purchases_list = []
    for p in p_rows:
        p_id = p[0]
        cur.execute("""
            SELECT product_name, cost_price, quantity, total, item_code
            FROM purchase_items
            WHERE purchase_id=%s
        """, (p_id,))
        item_rows = cur.fetchall()

        p_items = []
        for ir in item_rows:
            p_items.append({
                "product_name": ir[0],
                "cost_price": float(ir[1]),
                "quantity": float(ir[2]),
                "total": float(ir[3]),
                "item_code": ir[4]
            })

        purchases_list.append({
            "id": p[0],
            "supplier_name": p[1],
            "total": float(p[2]),
            "bill_status": p[3] or "Received",
            "purchase_date": p[4].isoformat() if isinstance(p[4], date) else str(p[4]),
            "created_at": p[5].isoformat() if p[5] else None,
            "receipt_status": p[6],
            "payment_status": p[7],
            "payment_method": p[8],
            "paid_amount": float(p[9] or 0),
            "receipt_date": p[10].isoformat() if p[10] else None,
            "verified_date": p[11].isoformat() if p[11] else None,
            "stock_updated": bool(p[12]),
            "supplier_id": p[13],
            "due_date": p[14].isoformat() if p[14] else None,
            "items": p_items
        })

    cur.close()
    conn.close()

    return jsonify({
        "suppliers": suppliers,
        "dates": dates,
        "selected_supplier": supplier,
        "selected_date": purchase_date,
        "purchases": purchases_list
    })

# ----------------- ADVANCED INVENTORY MANAGEMENT API -----------------

@app.route("/api/inventory/status")
def api_inventory_status():
    conn = get_db_connection()
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        cur.execute("""
            SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN stock > 0 THEN stock ELSE 0 END), 0),
                COUNT(CASE WHEN stock <= 0 THEN 1 END),
                COUNT(CASE WHEN stock > 0 AND stock <= COALESCE(min_stock, 5.00) THEN 1 END),
                COUNT(CASE WHEN stock > COALESCE(min_stock, 5.00) THEN 1 END),
                COALESCE(SUM(CASE WHEN stock > 0 THEN stock * cost_price ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN stock > 0 THEN stock * price ELSE 0 END), 0)
            FROM products
        """)
        r = cur.fetchone()

        total_items = r[0] or 0
        total_qty = float(r[1] or 0)
        out_of_stock_count = r[2] or 0
        low_stock_count = r[3] or 0
        healthy_stock_count = r[4] or 0
        total_cost_val = float(r[5] or 0)
        total_retail_val = float(r[6] or 0)
        potential_profit = total_retail_val - total_cost_val

        # Category stock summary
        cur.execute("""
            SELECT
                COALESCE(category, 'Others'),
                COUNT(*),
                COALESCE(SUM(stock), 0),
                COALESCE(SUM(CASE WHEN stock > 0 THEN stock * cost_price ELSE 0 END), 0),
                COUNT(CASE WHEN stock <= COALESCE(min_stock, 5.00) THEN 1 END)
            FROM products
            GROUP BY category
            ORDER BY COALESCE(SUM(CASE WHEN stock > 0 THEN stock * cost_price ELSE 0 END), 0) DESC
        """)
        categories = []
        for cat in cur.fetchall():
            categories.append({
                "category": cat[0] or "Others",
                "item_count": cat[1],
                "total_stock": float(cat[2]),
                "valuation": float(cat[3]),
                "alerts_count": cat[4]
            })

        return jsonify({
            "total_items": total_items,
            "total_quantity": total_qty,
            "out_of_stock_count": out_of_stock_count,
            "low_stock_count": low_stock_count,
            "healthy_stock_count": healthy_stock_count,
            "total_cost_valuation": round(total_cost_val, 2),
            "total_retail_valuation": round(total_retail_val, 2),
            "potential_profit": round(potential_profit, 2),
            "categories": categories
        })
    finally:
        cur.close()
        conn.close()


@app.route("/api/inventory/alerts")
def api_inventory_alerts():
    category = request.args.get("category", "").strip()
    status_filter = request.args.get("status", "all").strip().lower()
    search = request.args.get("search", "").strip()

    conn = get_db_connection()
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        where_clauses = ["stock <= COALESCE(min_stock, 5.00)"]
        params = []

        if status_filter == "out_of_stock":
            where_clauses.append("stock <= 0")
        elif status_filter == "low_stock":
            where_clauses.append("stock > 0 AND stock <= COALESCE(min_stock, 5.00)")

        if category and category != "All":
            where_clauses.append("category = %s")
            params.append(category)

        if search:
            where_clauses.append("(item_code ILIKE %s OR item_name ILIKE %s)")
            params.extend([f"%{search}%", f"%{search}%"])

        query = f"""
            SELECT
                item_code, item_name, category, unit, price, cost_price,
                stock, COALESCE(min_stock, 5.00), COALESCE(target_stock, 20.00),
                (product_image IS NOT NULL) AS has_image
            FROM products
            WHERE {' AND '.join(where_clauses)}
            ORDER BY stock ASC, item_name ASC
        """
        cur.execute(query, tuple(params))
        rows = cur.fetchall()

        alerts = []
        for r in rows:
            stk = float(r[6] or 0)
            min_stk = float(r[7] or 5.0)
            tgt_stk = float(r[8] or 20.0)
            cost_p = float(r[5] or 0)
            reorder_qty = max(0.0, tgt_stk - stk)
            unit = r[3] or "pc"
            if unit.lower() in ["pc", "pcs", "piece", "pieces", "box", "boxes", "packet", "packets", "pkt", "pkts", "bottle", "bottles", "btl", "tin", "can", "bag", "bags"]:
                reorder_qty = float(math.ceil(reorder_qty))

            alerts.append({
                "item_code": r[0],
                "item_name": r[1],
                "category": r[2],
                "unit": unit,
                "price": float(r[4] or 0),
                "cost_price": cost_p,
                "stock": stk,
                "min_stock": min_stk,
                "target_stock": tgt_stk,
                "suggested_reorder_qty": reorder_qty,
                "estimated_reorder_cost": round(reorder_qty * cost_p, 2),
                "status": "out_of_stock" if stk <= 0 else "low_stock",
                "has_image": bool(r[9]),
                "image_url": f"/product-image/{r[0]}" if r[9] else None
            })

        return jsonify(alerts)
    finally:
        cur.close()
        conn.close()


@app.route("/api/inventory/reorder-suggestions")
def api_inventory_reorder_suggestions():
    category = request.args.get("category", "").strip()
    search = request.args.get("search", "").strip()

    conn = get_db_connection()
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        where_clauses = ["stock <= COALESCE(min_stock, 5.00)"]
        params = []

        if category and category != "All":
            where_clauses.append("category = %s")
            params.append(category)

        if search:
            where_clauses.append("(item_code ILIKE %s OR item_name ILIKE %s)")
            params.extend([f"%{search}%", f"%{search}%"])

        query = f"""
            SELECT
                item_code, item_name, category, unit, cost_price, price,
                stock, COALESCE(min_stock, 5.00), COALESCE(target_stock, 20.00)
            FROM products
            WHERE {' AND '.join(where_clauses)}
            ORDER BY stock ASC, item_name ASC
        """
        cur.execute(query, tuple(params))
        rows = cur.fetchall()

        suggestions = []
        total_estimated_investment = 0.0
        total_items_to_reorder = 0
        total_reorder_units = 0.0

        for r in rows:
            stk = float(r[6] or 0)
            min_stk = float(r[7] or 5.0)
            tgt_stk = float(r[8] or 20.0)
            cost_p = float(r[4] or 0)
            unit = r[3] or "pc"

            suggested_qty = max(0.0, tgt_stk - stk)
            if unit.lower() in ["pc", "pcs", "piece", "pieces", "box", "boxes", "packet", "packets", "pkt", "pkts", "bottle", "bottles", "btl", "tin", "can", "bag", "bags"]:
                suggested_qty = float(math.ceil(suggested_qty))

            cost_est = round(suggested_qty * cost_p, 2)
            total_estimated_investment += cost_est
            total_items_to_reorder += 1
            total_reorder_units += suggested_qty

            suggestions.append({
                "item_code": r[0],
                "item_name": r[1],
                "category": r[2],
                "unit": unit,
                "cost_price": cost_p,
                "price": float(r[5] or 0),
                "stock": stk,
                "min_stock": min_stk,
                "target_stock": tgt_stk,
                "suggested_reorder_qty": suggested_qty,
                "estimated_cost": cost_est,
                "urgency": "CRITICAL" if stk <= 0 else "WARNING"
            })

        return jsonify({
            "suggestions": suggestions,
            "total_items": total_items_to_reorder,
            "total_units": round(total_reorder_units, 2),
            "total_estimated_investment": round(total_estimated_investment, 2)
        })
    finally:
        cur.close()
        conn.close()


@app.route("/api/inventory/movements")
def api_inventory_movements():
    item_code = request.args.get("item_code", "").strip()
    movement_type = request.args.get("movement_type", "").strip()
    from_date = request.args.get("from_date", "").strip()
    to_date = request.args.get("to_date", "").strip()
    search = request.args.get("search", "").strip()
    limit = int(request.args.get("limit", 150))
    offset = int(request.args.get("offset", 0))

    conn = get_db_connection()
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        where_clauses = ["1=1"]
        params = []

        if item_code:
            where_clauses.append("sm.item_code = %s")
            params.append(item_code)

        if movement_type and movement_type != "All":
            where_clauses.append("sm.movement_type = %s")
            params.append(movement_type)

        if from_date:
            where_clauses.append("DATE(sm.created_at) >= %s")
            params.append(from_date)

        if to_date:
            where_clauses.append("DATE(sm.created_at) <= %s")
            params.append(to_date)

        if search:
            where_clauses.append("(sm.item_code ILIKE %s OR p.item_name ILIKE %s OR sm.reference_id ILIKE %s OR sm.reason ILIKE %s)")
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])

        count_query = f"""
            SELECT COUNT(*)
            FROM stock_movements sm
            LEFT JOIN products p ON sm.item_code = p.item_code
            WHERE {' AND '.join(where_clauses)}
        """
        cur.execute(count_query, tuple(params))
        total_count = cur.fetchone()[0]

        query = f"""
            SELECT
                sm.id, sm.item_code, p.item_name, p.category, p.unit,
                sm.movement_type, sm.quantity, sm.previous_stock, sm.updated_stock,
                sm.reference_id, sm.reason, sm.performed_by, sm.created_at
            FROM stock_movements sm
            LEFT JOIN products p ON sm.item_code = p.item_code
            WHERE {' AND '.join(where_clauses)}
            ORDER BY sm.created_at DESC, sm.id DESC
            LIMIT %s OFFSET %s
        """
        cur.execute(query, tuple(params + [limit, offset]))
        rows = cur.fetchall()

        movements = []
        for r in rows:
            movements.append({
                "id": r[0],
                "item_code": r[1],
                "item_name": r[2] or r[1],
                "category": r[3] or "",
                "unit": r[4] or "pc",
                "movement_type": r[5],
                "quantity": float(r[6]),
                "previous_stock": float(r[7]),
                "updated_stock": float(r[8]),
                "reference_id": r[9] or "",
                "reason": r[10] or "",
                "performed_by": r[11] or "System",
                "created_at": r[12].strftime("%d-%m-%Y %H:%M:%S") if r[12] else None
            })

        return jsonify({
            "movements": movements,
            "total_count": total_count,
            "limit": limit,
            "offset": offset
        })
    finally:
        cur.close()
        conn.close()


@app.route("/api/inventory/adjust", methods=["POST"])
def api_inventory_adjust():
    data = request.get_json(silent=True) or {}
    item_code = (data.get("item_code") or "").strip()
    adjustment_type = (data.get("adjustment_type") or "set").strip().lower()
    quantity_input = data.get("quantity")
    reason = (data.get("reason") or "").strip()
    performed_by = (data.get("performed_by") or "Store Manager").strip()
    movement_category = (data.get("movement_category") or "").strip()

    if not item_code:
        return jsonify({"error": "Item code is required"}), 400

    if not reason:
        return jsonify({"error": "Adjustment reason is mandatory for stock audit compliance"}), 400

    if quantity_input is None:
        return jsonify({"error": "Quantity is required"}), 400

    try:
        qty_num = Decimal(str(quantity_input))
        if qty_num < 0:
            return jsonify({"error": "Quantity cannot be negative"}), 400
    except Exception:
        return jsonify({"error": "Invalid quantity number"}), 400

    conn = get_db_connection()
    ensure_inventory_schema(conn)
    cur = conn.cursor()

    try:
        cur.execute("SELECT item_name, unit, stock, min_stock, target_stock FROM products WHERE item_code=%s", (item_code,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": f"Product '{item_code}' not found"}), 404

        item_name, unit, current_stock_dec, min_s, tgt_s = row
        current_stock = float(current_stock_dec or 0)

        valid_qty, err_qty = validate_unit_quantity(quantity_input, unit)
        if not valid_qty:
            return jsonify({"error": err_qty}), 400

        qty_float = float(qty_num)

        if adjustment_type == "add":
            if qty_float <= 0:
                return jsonify({"error": "Quantity to add must be greater than zero"}), 400
            new_stock = current_stock + qty_float
            delta = qty_float
            m_type = "Manual Stock Adjustment"
        elif adjustment_type == "remove":
            if qty_float <= 0:
                return jsonify({"error": "Quantity to remove must be greater than zero"}), 400
            if current_stock - qty_float < -0.0001:
                return jsonify({"error": f"Cannot remove {qty_float} {unit}. Available stock is only {current_stock} {unit}."}), 400
            new_stock = max(0.0, current_stock - qty_float)
            delta = -qty_float
            if movement_category == "damage" or "damage" in reason.lower() or "expired" in reason.lower() or "waste" in reason.lower():
                m_type = "Damaged or Expired Stock Removal"
            else:
                m_type = "Manual Stock Adjustment"
        elif adjustment_type == "set":
            new_stock = qty_float
            delta = new_stock - current_stock
            if abs(delta) < 0.0001:
                return jsonify({"error": f"Stock is already {new_stock} {unit}. No change required."}), 400
            if movement_category == "damage" or "damage" in reason.lower() or "expired" in reason.lower():
                m_type = "Damaged or Expired Stock Removal"
            else:
                m_type = "Manual Stock Adjustment"
        else:
            return jsonify({"error": f"Invalid adjustment_type '{adjustment_type}'. Must be 'add', 'remove', or 'set'."}), 400

        cur.execute("UPDATE products SET stock=%s WHERE item_code=%s", (Decimal(str(new_stock)), item_code))

        record_stock_movement(
            cur,
            item_code=item_code,
            movement_type=m_type,
            quantity=delta,
            previous_stock=current_stock,
            updated_stock=new_stock,
            reference_id=f"ADJ-{datetime.now().strftime('%Y%m%d%H%M')}",
            reason=reason,
            performed_by=performed_by
        )

        conn.commit()

        return jsonify({
            "success": True,
            "message": f"Stock for {item_name} adjusted from {current_stock} to {new_stock} {unit}",
            "item_code": item_code,
            "item_name": item_name,
            "unit": unit,
            "previous_stock": current_stock,
            "updated_stock": new_stock,
            "delta": delta,
            "movement_type": m_type
        })
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()


# ----------------- REPORTS API -----------------
@app.route("/api/reports")
@admin_required
def api_reports():
    from_date = request.args.get("from_date", "").strip()
    to_date = request.args.get("to_date", "").strip()

    conn = get_db_connection()
    cur = conn.cursor()

    if not from_date or not to_date:
        date_filter = "DATE(b.created_at) = CURRENT_DATE"
        params = ()
    else:
        date_filter = "DATE(b.created_at) BETWEEN %s AND %s"
        params = (from_date, to_date)

    # Summary
    cur.execute(f"""
        SELECT COUNT(*), 
               COALESCE(SUM(b.total), 0) AS net_sales,
               COALESCE(SUM(COALESCE(b.subtotal, b.total)), 0) AS gross_sales,
               COALESCE(SUM(COALESCE(b.discount_amount, 0)), 0) AS total_discounts
        FROM bills b
        WHERE {date_filter} AND b.status = 'PAID'
    """, params)
    total_bills, total_sales, gross_sales, total_discounts = cur.fetchone()

    # Category Sales
    cur.execute(f"""
        SELECT p.category, COALESCE(SUM(bi.total), 0)
        FROM bill_items bi
        JOIN bills b ON bi.invoice_no = b.invoice_no
        JOIN products p ON bi.product_name = p.item_name
        WHERE {date_filter} AND b.status = 'PAID'
        GROUP BY p.category
        ORDER BY SUM(bi.total) DESC
    """, params)
    category_sales = [{"category": r[0], "total": float(r[1])} for r in cur.fetchall()]

    # Item Sales
    cur.execute(f"""
        SELECT bi.product_name,
               SUM(bi.quantity),
               SUM(bi.total)
        FROM bill_items bi
        JOIN bills b ON bi.invoice_no = b.invoice_no
        WHERE {date_filter} AND b.status = 'PAID'
        GROUP BY bi.product_name
        ORDER BY SUM(bi.total) DESC
    """, params)
    items = []
    for r in cur.fetchall():
        items.append({
            "product_name": r[0],
            "quantity": float(r[1]),
            "total": float(r[2])
        })

    cur.close()
    conn.close()

    return jsonify({
        "total_bills": total_bills,
        "total_sales": float(total_sales),
        "gross_sales": float(gross_sales),
        "total_discounts": float(total_discounts),
        "from_date": from_date or datetime.now().strftime("%Y-%m-%d"),
        "to_date": to_date or datetime.now().strftime("%Y-%m-%d"),
        "category_sales": category_sales,
        "items": items
    })

# ----------------- DAILY Z-REPORT API -----------------
@app.route("/api/z-report")
@admin_required
def api_get_z_report():
    selected_date = request.args.get("date", "").strip()
    if not selected_date:
        selected_date = datetime.now().strftime("%Y-%m-%d")

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, report_date, total_bills, gross_sales, cash_sales,
               upi_sales, card_sales, cancelled_sales, net_sales
        FROM z_reports
        WHERE report_date=%s
    """, (selected_date,))
    existing = cur.fetchone()

    if existing:
        cur.close()
        conn.close()
        return jsonify({
            "already_generated": True,
            "report_date": existing[1].isoformat() if isinstance(existing[1], date) else str(existing[1]),
            "total_bills": existing[2],
            "gross_sales": float(existing[3]),
            "cash_sales": float(existing[4]),
            "upi_sales": float(existing[5]),
            "card_sales": float(existing[6]),
            "cancelled_sales": float(existing[7]),
            "net_sales": float(existing[8])
        })

    # Not generated yet - compute current numbers for preview
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND status='PAID'
    """, (selected_date,))
    total_bills, gross_sales = cur.fetchone()

    cur.execute("""
        SELECT COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND payment_mode='Cash' AND status='PAID'
    """, (selected_date,))
    cash_sales = cur.fetchone()[0]

    cur.execute("""
        SELECT COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND payment_mode='UPI' AND status='PAID'
    """, (selected_date,))
    upi_sales = cur.fetchone()[0]

    cur.execute("""
        SELECT COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND payment_mode='Card' AND status='PAID'
    """, (selected_date,))
    card_sales = cur.fetchone()[0]

    cur.execute("""
        SELECT COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND status='CANCELLED'
    """, (selected_date,))
    cancelled_sales = cur.fetchone()[0]

    net_sales = gross_sales - cancelled_sales
    cur.close()
    conn.close()

    return jsonify({
        "already_generated": False,
        "report_date": selected_date,
        "total_bills": total_bills,
        "gross_sales": float(gross_sales),
        "cash_sales": float(cash_sales),
        "upi_sales": float(upi_sales),
        "card_sales": float(card_sales),
        "cancelled_sales": float(cancelled_sales),
        "net_sales": float(net_sales)
    })

@app.route("/api/z-report/generate", methods=["POST"])
@admin_required
def api_generate_z_report():
    data = request.get_json() or request.form
    selected_date = data.get("report_date", "").strip()
    if not selected_date:
        selected_date = datetime.now().strftime("%Y-%m-%d")

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT id FROM z_reports WHERE report_date=%s", (selected_date,))
    if cur.fetchone():
        cur.close()
        conn.close()
        return jsonify({"error": f"Z-Report for {selected_date} has already been generated and locked."}), 400

    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND status='PAID'
    """, (selected_date,))
    total_bills, gross_sales = cur.fetchone()

    cur.execute("""
        SELECT COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND payment_mode='Cash' AND status='PAID'
    """, (selected_date,))
    cash_sales = cur.fetchone()[0]

    cur.execute("""
        SELECT COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND payment_mode='UPI' AND status='PAID'
    """, (selected_date,))
    upi_sales = cur.fetchone()[0]

    cur.execute("""
        SELECT COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND payment_mode='Card' AND status='PAID'
    """, (selected_date,))
    card_sales = cur.fetchone()[0]

    cur.execute("""
        SELECT COALESCE(SUM(total), 0)
        FROM bills
        WHERE DATE(created_at)=%s AND status='CANCELLED'
    """, (selected_date,))
    cancelled_sales = cur.fetchone()[0]

    net_sales = gross_sales - cancelled_sales

    cur.execute("""
        INSERT INTO z_reports
        (report_date, total_bills, gross_sales, cash_sales, upi_sales, card_sales, cancelled_sales, net_sales)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        RETURNING id
    """, (
        selected_date, total_bills, gross_sales, cash_sales, upi_sales, card_sales, cancelled_sales, net_sales
    ))
    rep_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({
        "success": True,
        "message": "Z-Report generated and permanently locked.",
        "id": rep_id,
        "report_date": selected_date,
        "total_bills": total_bills,
        "gross_sales": float(gross_sales),
        "cash_sales": float(cash_sales),
        "upi_sales": float(upi_sales),
        "card_sales": float(card_sales),
        "cancelled_sales": float(cancelled_sales),
        "net_sales": float(net_sales)
    })

# ----------------- PROTECTED HELPER FUNCTIONS -----------------
def generate_invoice_no(cur):
    year = datetime.now().year
    cur.execute("""
        SELECT invoice_no
        FROM bills
        WHERE invoice_no LIKE %s
        ORDER BY invoice_no DESC
        LIMIT 1
    """, (f"INV-{year}-%",))
    row = cur.fetchone()
    if row:
        last_no = int(row[0].split("-")[-1])
        return f"INV-{year}-{last_no + 1:05d}"
    else:
        return f"INV-{year}-00001"

def generate_item_code(category, cur):
    prefix = CATEGORY_PREFIX.get(category)
    if not prefix:
        raise ValueError(f"Invalid category '{category}' for item code generation")

    cur.execute("""
        SELECT item_code
        FROM products
        WHERE item_code LIKE %s
        ORDER BY item_code DESC
        LIMIT 1
    """, (prefix + '%',))
    row = cur.fetchone()

    if row:
        last_code = row[0]
        # Extract numeric portion
        num_str = "".join([c for c in last_code[1:] if c.isdigit()])
        last_number = int(num_str) if num_str else 100
        return f"{prefix}{last_number + 1}"
    else:
        return f"{prefix}101"

# ----------------- ORIGINAL / LEGACY HTML ROUTES -----------------
@app.route("/")
def dashboard():
    return render_template("dashboard.html")

@app.route("/billing", methods=["GET", "POST"])
def billing():
    if "cart" not in session:
        session["cart"] = []

    if "customer" not in session:
        session["customer"] = {"name": "", "phone": "", "payment_mode": ""}

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT DISTINCT category
        FROM products
        WHERE category IS NOT NULL
        ORDER BY category
    """)
    categories = [c[0] for c in cur.fetchall()]

    selected_category = request.args.get("category")
    if not selected_category and categories:
        selected_category = categories[0]

    products = []
    if selected_category:
        cur.execute("""
            SELECT item_code, item_name, price, unit
            FROM products
            WHERE category=%s
            AND is_sale = TRUE
            ORDER BY item_name
        """, (selected_category,))
        products = cur.fetchall()

    if request.method == "POST":
        if "item_code" in request.form:
            code = request.form.get("item_code")
            quantity = request.form.get("quantity")
            if code and quantity:
                qty = Decimal(quantity)
                cur.execute("SELECT item_name, price, unit FROM products WHERE item_code=%s", (code,))
                row = cur.fetchone()
                if row:
                    name, price, unit = row
                    price = Decimal(price)
                    total = price * qty
                    session["cart"].append({
                        "code": code, "name": name, "price": float(price),
                        "qty": float(qty), "unit": unit, "total": float(total)
                    })
                    session.modified = True

    cur.execute("SELECT id, customer_name, total FROM held_bills ORDER BY created_at DESC")
    held_bills = cur.fetchall()
    cur.close()
    conn.close()

    bill_total = sum(i["total"] for i in session["cart"])
    return render_template(
        "billing.html",
        categories=categories,
        selected_category=selected_category,
        products=products,
        cart=session["cart"],
        bill_total=bill_total,
        held_bills=held_bills,
        customer=session["customer"]
    )

@app.route("/update-qty/<int:index>", methods=["POST"])
def update_qty(index):
    cart = session.get("cart", [])
    if 0 <= index < len(cart):
        new_qty = Decimal(request.form["quantity"])
        price = Decimal(cart[index]["price"])
        cart[index]["qty"] = float(new_qty)
        cart[index]["total"] = float(price * new_qty)
        session.modified = True
    return redirect(url_for("billing"))

@app.route("/update-price/<int:index>", methods=["POST"])
def update_price(index):
    cart = session.get("cart", [])
    if 0 <= index < len(cart):
        new_price = Decimal(request.form["price"])
        qty = Decimal(cart[index]["qty"])
        cart[index]["price"] = float(new_price)
        cart[index]["total"] = float(new_price * qty)
        session.modified = True
    return redirect(url_for("billing"))

@app.route("/remove-item/<int:index>")
def remove_item(index):
    if "cart" in session and 0 <= index < len(session["cart"]):
        session["cart"].pop(index)
        session.modified = True
    return redirect(url_for("billing"))

@app.route("/hold-bill")
def hold_bill():
    cart = session.get("cart", [])
    customer = session.get("customer", {})
    if not cart:
        return redirect(url_for("billing"))

    conn = get_db_connection()
    cur = conn.cursor()
    total = sum(i["total"] for i in cart)
    cur.execute("""
        INSERT INTO held_bills (cart, customer_name, customer_phone, total)
        VALUES (%s,%s,%s,%s)
    """, (json.dumps(cart), customer.get("name"), customer.get("phone"), total))
    conn.commit()
    cur.close()
    conn.close()

    session.pop("cart", None)
    session.pop("customer", None)
    return redirect(url_for("billing"))

@app.route("/resume-bill/<int:hold_id>")
def resume_bill(hold_id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT cart, customer_name, customer_phone FROM held_bills WHERE id=%s", (hold_id,))
    row = cur.fetchone()
    if row:
        session["cart"] = row[0] if isinstance(row[0], list) else json.loads(row[0])
        session["customer"] = {"name": row[1] or "", "phone": row[2] or "", "payment_mode": ""}
        cur.execute("DELETE FROM held_bills WHERE id=%s", (hold_id,))
        session.modified = True
    conn.commit()
    cur.close()
    conn.close()
    return redirect(url_for("billing"))

@app.route("/checkout")
def checkout():
    cart = session.get("cart", [])
    if not cart:
        return redirect(url_for("billing"))

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        invoice_no = generate_invoice_no(cur)
        total = sum(i["total"] for i in cart)
        customer = session.get("customer", {})

        cur.execute("""
            INSERT INTO bills (invoice_no, total, customer_name, customer_phone, payment_mode, status)
            VALUES (%s,%s,%s,%s,%s,'PAID')
        """, (invoice_no, total, customer.get("name"), customer.get("phone"), customer.get("payment_mode")))

        for item in cart:
            cur.execute("""
                INSERT INTO bill_items (invoice_no, product_name, price, quantity, total)
                VALUES (%s,%s,%s,%s,%s)
            """, (invoice_no, item["name"], item["price"], item["qty"], item["total"]))

            cur.execute("""
                UPDATE products SET stock = stock - %s WHERE item_code = %s
            """, (item["qty"], item["code"]))

        conn.commit()

        cur.execute("SELECT total, created_at FROM bills WHERE invoice_no=%s", (invoice_no,))
        bill = cur.fetchone()

        cur.execute("SELECT product_name, price, quantity, total FROM bill_items WHERE invoice_no=%s", (invoice_no,))
        items = cur.fetchall()

        html = render_template("bill.html", invoice_no=invoice_no, bill=bill, items=items)
        year = datetime.now().strftime("%Y")
        month = datetime.now().strftime("%m")
        folder_path = os.path.join(BASE_DIR, "static", "invoices", year, month)
        os.makedirs(folder_path, exist_ok=True)
        pdf_path = os.path.join(folder_path, f"{invoice_no}.pdf")

        with open(pdf_path, "wb") as f:
            pisa.CreatePDF(html, dest=f, link_callback=link_callback)

        cur.execute("UPDATE bills SET pdf_path=%s WHERE invoice_no=%s", (f"static/invoices/{year}/{month}/{invoice_no}.pdf", invoice_no))
        conn.commit()

    except Exception as e:
        conn.rollback()
        print("Checkout error:", e)
        return redirect(url_for("billing"))
    finally:
        cur.close()
        conn.close()

    session.pop("cart", None)
    session.pop("customer", None)
    return redirect(url_for("bill_view", invoice_no=invoice_no))

@app.route("/bill/<invoice_no>/pdf")
def bill_pdf(invoice_no):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT total, created_at FROM bills WHERE invoice_no=%s", (invoice_no,))
    bill = cur.fetchone()

    cur.execute("SELECT product_name, price, quantity, total FROM bill_items WHERE invoice_no=%s", (invoice_no,))
    items = cur.fetchall()
    cur.close()
    conn.close()

    html = render_template("bill.html", invoice_no=invoice_no, bill=bill, items=items, autoprint=False)
    pdf = io.BytesIO()
    pisa.CreatePDF(html, dest=pdf, link_callback=link_callback)
    pdf.seek(0)

    return send_file(pdf, mimetype="application/pdf", download_name=f"{invoice_no}.pdf", as_attachment=True)

@app.route("/bill/<invoice_no>/pdf/view")
@app.route("/api/bills/<invoice_no>/pdf/view")
def bill_pdf_view(invoice_no):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT total, created_at, customer_name, pdf_path FROM bills WHERE invoice_no=%s", (invoice_no,))
    bill = cur.fetchone()
    if not bill:
        cur.close()
        conn.close()
        return "Invoice not found", 404

    # If physical PDF already exists on disk, stream directly with inline preview
    if bill[3]:
        physical_path = os.path.join(BASE_DIR, str(bill[3]).replace("/", os.sep))
        if os.path.exists(physical_path):
            cur.close()
            conn.close()
            return send_file(physical_path, mimetype="application/pdf", as_attachment=False)

    cur.execute("SELECT product_name, price, quantity, total FROM bill_items WHERE invoice_no=%s", (invoice_no,))
    items = cur.fetchall()
    cur.close()
    conn.close()

    html = render_template("bill.html", invoice_no=invoice_no, bill=bill, items=items, autoprint=False)
    pdf = io.BytesIO()
    pisa.CreatePDF(html, dest=pdf, link_callback=link_callback)
    pdf.seek(0)

    return send_file(pdf, mimetype="application/pdf", as_attachment=False)

@app.route("/bill/<invoice_no>")
def bill_view(invoice_no):
    autoprint = request.args.get("autoprint", "false").lower() in ["true", "1", "yes"]
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT total, created_at, customer_name FROM bills WHERE invoice_no=%s", (invoice_no,))
    bill = cur.fetchone()

    cur.execute("SELECT product_name, price, quantity, total FROM bill_items WHERE invoice_no=%s", (invoice_no,))
    items = cur.fetchall()
    cur.close()
    conn.close()

    return render_template("bill.html", invoice_no=invoice_no, bill=bill, items=items, autoprint=autoprint)

@app.route("/verify-bill", methods=["POST"])
def verify_bill():
    if "cart" not in session or not session["cart"]:
        return redirect(url_for("billing"))

    session["customer"] = {
        "name": request.form.get("customer_name"),
        "phone": request.form.get("customer_phone"),
        "payment_mode": request.form.get("payment_mode")
    }
    session.modified = True
    return redirect(url_for("checkout"))

@app.route("/bills", methods=["GET", "POST"])
def bills_list():
    conn = get_db_connection()
    cur = conn.cursor()
    search = request.form.get("search")
    if search:
        cur.execute("""
            SELECT invoice_no, customer_name, total, created_at, pdf_path, status
            FROM bills
            WHERE invoice_no ILIKE %s OR customer_name ILIKE %s OR COALESCE(customer_phone, '') ILIKE %s
            ORDER BY created_at DESC
        """, (f"%{search}%", f"%{search}%", f"%{search}%"))
    else:
        cur.execute("""
            SELECT invoice_no, customer_name, total, created_at, pdf_path, status
            FROM bills
            ORDER BY created_at DESC
        """)
    bills = cur.fetchall()
    cur.close()
    conn.close()
    return render_template("bills_list.html", bills=bills)

@app.route("/purchase", methods=["GET"])
def purchase():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT category FROM products WHERE is_purchase = TRUE ORDER BY category")
    categories = [c[0] for c in cur.fetchall()]
    cur.close()
    conn.close()
    return render_template("purchase.html", categories=categories)

@app.route("/get-items/<category>")
def get_items(category):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT item_code, item_name FROM products WHERE category = %s AND is_purchase = TRUE ORDER BY item_name", (category,))
    items = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(items)

@app.route("/purchase/save", methods=["POST"])
def save_purchase():
    supplier = request.form["supplier_name"]
    purchase_date = request.form["purchase_date"]
    bill_status = request.form["bill_status"]
    grand_total = request.form["grand_total"]

    item_codes = request.form.getlist("item_code[]")
    quantities = request.form.getlist("quantity[]")
    costs = request.form.getlist("cost_price[]")
    totals = request.form.getlist("row_total[]")

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO purchases (supplier_name, total, bill_status, purchase_date)
        VALUES (%s,%s,%s,%s) RETURNING id
    """, (supplier, grand_total, bill_status, purchase_date))
    purchase_id = cur.fetchone()[0]

    for i in range(len(item_codes)):
        cur.execute("""
            INSERT INTO purchase_items (purchase_id, item_code, product_name, cost_price, quantity, total)
            VALUES (%s,%s, (SELECT item_name FROM products WHERE item_code=%s), %s, %s, %s)
        """, (purchase_id, item_codes[i], item_codes[i], costs[i], quantities[i], totals[i]))

        cur.execute("UPDATE products SET stock = stock + %s WHERE item_code = %s", (quantities[i], item_codes[i]))

    conn.commit()
    cur.close()
    conn.close()
    return redirect(url_for("dashboard"))

@app.route("/purchase/history")
def purchase_history():
    conn = get_db_connection()
    cur = conn.cursor()
    supplier = request.args.get("supplier")
    purchase_date = request.args.get("purchase_date")

    cur.execute("SELECT DISTINCT supplier_name FROM purchases ORDER BY supplier_name")
    suppliers = [s[0] for s in cur.fetchall()]

    dates = []
    if supplier:
        cur.execute("SELECT DISTINCT purchase_date FROM purchases WHERE supplier_name=%s ORDER BY purchase_date DESC", (supplier,))
        dates = [d[0] for d in cur.fetchall()]

    purchase = None
    items = []
    if supplier and purchase_date:
        cur.execute("SELECT id, total, bill_status, purchase_date FROM purchases WHERE supplier_name=%s AND purchase_date=%s", (supplier, purchase_date))
        purchase = cur.fetchone()
        if purchase:
            cur.execute("SELECT product_name, cost_price, quantity, total FROM purchase_items WHERE purchase_id=%s", (purchase[0],))
            items = cur.fetchall()

    cur.close()
    conn.close()
    return render_template(
        "purchase_history.html",
        suppliers=suppliers, dates=dates, selected_supplier=supplier,
        selected_date=purchase_date, purchase=purchase, items=items
    )

@app.route("/products", methods=["GET", "POST"])
def products():
    conn = get_db_connection()
    cur = conn.cursor()
    if request.method == "POST":
        cur.execute("""
            INSERT INTO products (item_code, item_name, category, price, stock, unit)
            VALUES (%s,%s,%s,%s,%s,%s)
        """, (
            request.form["item_code"], request.form["item_name"], request.form["category"],
            Decimal(request.form["price"]), Decimal(request.form["stock"]), request.form["unit"]
        ))
        conn.commit()

    cur.execute("SELECT item_code, item_name, category, price, stock, unit FROM products ORDER BY category, item_name")
    items = cur.fetchall()
    cur.close()
    conn.close()
    return render_template("products.html", items=items)

@app.route("/update-product/<item_code>", methods=["POST"])
def update_product(item_code):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("UPDATE products SET price=%s, stock=%s WHERE item_code=%s", (
        Decimal(request.form["price"]), Decimal(request.form["stock"]), item_code
    ))
    conn.commit()
    cur.close()
    conn.close()
    return redirect(url_for("products"))

@app.route("/delete-product/<item_code>")
def delete_product(item_code):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM products WHERE item_code=%s", (item_code,))
    conn.commit()
    cur.close()
    conn.close()
    return redirect(url_for("products"))

@app.route("/products/form", methods=["GET"])
def product_form():
    raw_value = request.args.get("product_name")
    product_name = raw_value.split(" – ")[0].strip() if raw_value else None

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT name FROM category ORDER BY name")
    category = [c[0] for c in cur.fetchall()]

    product = None
    if product_name:
        cur.execute("""
            SELECT item_code, item_name, category, unit, price, cost_price,
                   sales_tax, invoicing_policy, purchase_tax, purchase_unit,
                   income_account, expense_account, description, stock,
                   is_sale, is_purchase, is_manufactured, company
            FROM products WHERE item_name = %s
        """, (product_name,))
        product = cur.fetchone()

    cur.close()
    conn.close()
    return render_template("product_form.html", product=product, product_name=product_name, category=category)

@app.route("/products/update", methods=["POST"])
def product_update():
    errors = {}
    item_code = request.form.get("item_code", "").strip()
    item_name = request.form.get("item_name", "").strip()
    category = request.form.get("category", "").strip()
    unit = request.form.get("unit", "").strip()
    stock = request.form.get("stock", "").strip()
    sale_price = request.form.get("sale_price", "").strip()
    cost_price = request.form.get("cost_price", "").strip()
    is_sale = bool(request.form.get("is_sale"))
    is_purchase = bool(request.form.get("is_purchase"))
    is_manufactured = bool(request.form.get("is_manufactured"))
    image_file = request.files.get("product_image")
    image_bytes = image_file.read() if image_file and image_file.filename else None
    image_mime = image_file.mimetype if image_file and image_file.filename else None

    if not item_name: errors["item_name"] = "Product name is required"
    if not category: errors["category"] = "Category is required"
    if not unit: errors["unit"] = "Unit is required"

    if errors:
        return render_template("product_form.html", errors=errors, form=request.form, product=None)

    conn = get_db_connection()
    cur = conn.cursor()

    if not item_code:
        item_code = generate_item_code(category, cur)
        cur.execute("""
            INSERT INTO products (
                item_code, item_name, category, unit, stock, price, cost_price,
                sales_tax, invoicing_policy, purchase_tax, purchase_unit,
                income_account, expense_account, description, company,
                is_sale, is_purchase, is_manufactured, product_image, product_image_mime
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            item_code, item_name, category, unit, safe_float(stock), safe_float(sale_price),
            safe_float(cost_price), safe_float(request.form.get("sales_tax")),
            request.form.get("invoicing_policy"), safe_float(request.form.get("purchase_tax")),
            request.form.get("purchase_unit"), request.form.get("income_account"),
            request.form.get("expense_account"), request.form.get("description"),
            request.form.get("company"), is_sale, is_purchase, is_manufactured,
            image_bytes, image_mime
        ))
    else:
        cur.execute("""
            UPDATE products SET
                item_name=%s, category=%s, unit=%s, stock=%s, price=%s, cost_price=%s,
                sales_tax=%s, invoicing_policy=%s, purchase_tax=%s, purchase_unit=%s,
                income_account=%s, expense_account=%s, description=%s, company=%s,
                is_sale=%s, is_purchase=%s, is_manufactured=%s
            WHERE item_code=%s
        """, (
            item_name, category, unit, safe_float(stock), safe_float(sale_price),
            safe_float(cost_price), safe_float(request.form.get("sales_tax")),
            request.form.get("invoicing_policy"), safe_float(request.form.get("purchase_tax")),
            request.form.get("purchase_unit"), request.form.get("income_account"),
            request.form.get("expense_account"), request.form.get("description"),
            request.form.get("company"), is_sale, is_purchase, is_manufactured, item_code
        ))
        if image_bytes:
            cur.execute("UPDATE products SET product_image=%s, product_image_mime=%s WHERE item_code=%s", (image_bytes, image_mime, item_code))

    conn.commit()
    cur.close()
    conn.close()
    return redirect(url_for("products"))

@app.route("/product-image/<item_code>")
def product_image(item_code):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT product_image, product_image_mime FROM products WHERE item_code = %s", (item_code,))
    row = cur.fetchone()
    cur.close()
    conn.close()

    if not row or not row[0]:
        return "", 404

    image_data, mime = row
    return Response(image_data, mimetype=mime or "image/jpeg")

@app.route("/reports", methods=["GET", "POST"])
def reports():
    conn = get_db_connection()
    cur = conn.cursor()
    from_date = request.form.get("from_date")
    to_date = request.form.get("to_date")

    if not from_date or not to_date:
        date_filter = "DATE(b.created_at) = CURRENT_DATE"
        params = ()
    else:
        date_filter = "DATE(b.created_at) BETWEEN %s AND %s"
        params = (from_date, to_date)

    cur.execute(f"SELECT COUNT(*), COALESCE(SUM(b.total),0) FROM bills b WHERE {date_filter}", params)
    summary = cur.fetchone()

    cur.execute(f"""
        SELECT p.category, COALESCE(SUM(bi.total),0)
        FROM bill_items bi
        JOIN bills b ON bi.invoice_no = b.invoice_no
        JOIN products p ON bi.product_name = p.item_name
        WHERE {date_filter}
        GROUP BY p.category ORDER BY p.category
    """, params)
    category_sales = cur.fetchall()

    cur.execute(f"""
        SELECT bi.product_name, SUM(bi.quantity), SUM(bi.total)
        FROM bill_items bi
        JOIN bills b ON bi.invoice_no = b.invoice_no
        WHERE {date_filter}
        GROUP BY bi.product_name ORDER BY bi.product_name
    """, params)
    items = cur.fetchall()

    cur.close()
    conn.close()
    return render_template(
        "reports.html", summary=summary, category_sales=category_sales,
        items=items, from_date=from_date, to_date=to_date
    )

@app.route("/z-report", methods=["GET", "POST"])
def z_report():
    conn = get_db_connection()
    cur = conn.cursor()
    selected_date = request.form.get("report_date") or datetime.now().date()

    cur.execute("SELECT * FROM z_reports WHERE report_date=%s", (selected_date,))
    existing = cur.fetchone()

    if existing:
        cur.close()
        conn.close()
        return render_template(
            "z_report.html", date=existing[1], total_bills=existing[2],
            gross_sales=existing[3], cash_sales=existing[4], upi_sales=existing[5],
            card_sales=existing[6], cancelled_sales=existing[7], net_sales=existing[8],
            already_generated=True
        )

    cur.execute("SELECT COUNT(*), COALESCE(SUM(total),0) FROM bills WHERE DATE(created_at)=%s AND status='PAID'", (selected_date,))
    total_bills, gross_sales = cur.fetchone()

    cur.execute("SELECT COALESCE(SUM(total),0) FROM bills WHERE DATE(created_at)=%s AND payment_mode='Cash' AND status='PAID'", (selected_date,))
    cash_sales = cur.fetchone()[0]

    cur.execute("SELECT COALESCE(SUM(total),0) FROM bills WHERE DATE(created_at)=%s AND payment_mode='UPI' AND status='PAID'", (selected_date,))
    upi_sales = cur.fetchone()[0]

    cur.execute("SELECT COALESCE(SUM(total),0) FROM bills WHERE DATE(created_at)=%s AND payment_mode='Card' AND status='PAID'", (selected_date,))
    card_sales = cur.fetchone()[0]

    cur.execute("SELECT COALESCE(SUM(total),0) FROM bills WHERE DATE(created_at)=%s AND status='CANCELLED'", (selected_date,))
    cancelled_sales = cur.fetchone()[0]

    net_sales = gross_sales - cancelled_sales

    cur.execute("""
        INSERT INTO z_reports
        (report_date, total_bills, gross_sales, cash_sales, upi_sales, card_sales, cancelled_sales, net_sales)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
    """, (selected_date, total_bills, gross_sales, cash_sales, upi_sales, card_sales, cancelled_sales, net_sales))

    conn.commit()
    cur.close()
    conn.close()

    return render_template(
        "z_report.html", date=selected_date, total_bills=total_bills,
        gross_sales=gross_sales, cash_sales=cash_sales, upi_sales=upi_sales,
        card_sales=card_sales, cancelled_sales=cancelled_sales, net_sales=net_sales
    )

# =============================================================
# CUSTOMER MANAGEMENT API
# =============================================================

@app.route("/api/customers", methods=["GET"])
def api_customers_list():
    search = request.args.get("search", "").strip()
    status_filter = request.args.get("status", "").strip()
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        query = """
            SELECT c.id, c.customer_id, c.name, c.phone, c.email, c.address,
                   c.status, c.registered_at,
                   COUNT(b.invoice_no) AS transaction_count,
                   COALESCE(SUM(b.total), 0) AS total_purchase_value,
                   MAX(b.created_at) AS last_purchase_at
            FROM customers c
            LEFT JOIN bills b ON b.customer_id::text = c.customer_id::text AND b.status = 'PAID'
        """
        conditions = []
        params = []
        if search:
            conditions.append("(c.name ILIKE %s OR c.phone ILIKE %s OR c.customer_id ILIKE %s OR c.email ILIKE %s)")
            params += [f"%{search}%"] * 4
        if status_filter:
            conditions.append("c.status = %s")
            params.append(status_filter)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += " GROUP BY c.id, c.customer_id, c.name, c.phone, c.email, c.address, c.status, c.registered_at"
        query += " ORDER BY c.registered_at DESC LIMIT 200"
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        customers = []
        for r in rows:
            customers.append({
                "id": r[0], "customer_id": r[1], "name": r[2],
                "phone": r[3] or "", "email": r[4] or "", "address": r[5] or "",
                "status": r[6], "registered_at": r[7].isoformat() if r[7] else None,
                "transaction_count": int(r[8]), "total_purchase_value": float(r[9]),
                "last_purchase_at": r[10].isoformat() if r[10] else None,
            })
        return jsonify(customers)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()


@app.route("/api/customers/search", methods=["GET"])
def api_customers_search():
    """Fast typeahead search for billing integration."""
    q = request.args.get("q", "").strip()
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT customer_id, name, phone, email, address
            FROM customers
            WHERE status = 'Active'
              AND (name ILIKE %s OR phone ILIKE %s OR customer_id ILIKE %s)
            ORDER BY name
            LIMIT 10
        """, (f"%{q}%", f"%{q}%", f"%{q}%"))
        results = [
            {"customer_id": r[0], "name": r[1], "phone": r[2] or "", "email": r[3] or "", "address": r[4] or ""}
            for r in cur.fetchall()
        ]
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()


@app.route("/api/customers", methods=["POST"])
def api_customers_create():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Customer name is required"}), 400
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        # Duplicate phone check
        phone = data.get("phone", "").strip()
        if phone:
            cur.execute("SELECT customer_id, name FROM customers WHERE phone = %s LIMIT 1", (phone,))
            existing = cur.fetchone()
            if existing:
                return jsonify({"error": f"Phone {phone} already registered to customer {existing[1]} ({existing[0]})"}), 409
        cid = generate_customer_id(cur)
        cur.execute("""
            INSERT INTO customers (customer_id, name, phone, email, address, status)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, customer_id, name, phone, email, address, status, registered_at
        """, (cid, name, phone or None, data.get("email", "").strip() or None,
               data.get("address", "").strip() or None, data.get("status", "Active")))
        row = cur.fetchone()
        conn.commit()
        return jsonify({
            "success": True, "customer_id": row[1], "name": row[2],
            "phone": row[3] or "", "email": row[4] or "", "address": row[5] or "",
            "status": row[6], "registered_at": row[7].isoformat() if row[7] else None,
            "message": f"Customer {cid} registered successfully"
        }), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()


@app.route("/api/customers/<customer_id>", methods=["GET"])
def api_customer_detail(customer_id):
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT c.id, c.customer_id, c.name, c.phone, c.email, c.address,
                   c.status, c.registered_at,
                   COUNT(b.invoice_no) AS transaction_count,
                   COALESCE(SUM(b.total), 0) AS total_purchase_value,
                   MAX(b.created_at) AS last_purchase_at
            FROM customers c
            LEFT JOIN bills b ON b.customer_id::text = c.customer_id::text AND b.status = 'PAID'
            WHERE c.customer_id = %s
            GROUP BY c.id, c.customer_id, c.name, c.phone, c.email, c.address, c.status, c.registered_at
        """, (customer_id,))
        r = cur.fetchone()
        if not r:
            return jsonify({"error": "Customer not found"}), 404

        # Recent bills
        cur.execute("""
            SELECT invoice_no, total, payment_mode, status, created_at
            FROM bills WHERE customer_id = %s
            ORDER BY created_at DESC LIMIT 20
        """, (customer_id,))
        bills = [
            {"invoice_no": b[0], "total": float(b[1]), "payment_mode": b[2],
             "status": b[3], "created_at": b[4].isoformat() if b[4] else None}
            for b in cur.fetchall()
        ]
        return jsonify({
            "id": r[0], "customer_id": r[1], "name": r[2],
            "phone": r[3] or "", "email": r[4] or "", "address": r[5] or "",
            "status": r[6], "registered_at": r[7].isoformat() if r[7] else None,
            "transaction_count": int(r[8]), "total_purchase_value": float(r[9]),
            "last_purchase_at": r[10].isoformat() if r[10] else None,
            "bills": bills
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()


@app.route("/api/customers/<customer_id>", methods=["PUT"])
def api_customer_update(customer_id):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Customer name is required"}), 400
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        phone = data.get("phone", "").strip()
        if phone:
            cur.execute("""
                SELECT customer_id FROM customers
                WHERE phone = %s AND customer_id != %s LIMIT 1
            """, (phone, customer_id))
            if cur.fetchone():
                return jsonify({"error": f"Phone {phone} is already registered to another customer"}), 409
        cur.execute("""
            UPDATE customers SET name=%s, phone=%s, email=%s, address=%s, status=%s
            WHERE customer_id=%s RETURNING customer_id
        """, (name, phone or None, data.get("email", "").strip() or None,
               data.get("address", "").strip() or None,
               data.get("status", "Active"), customer_id))
        if not cur.fetchone():
            return jsonify({"error": "Customer not found"}), 404
        conn.commit()
        return jsonify({"success": True, "message": f"Customer {customer_id} updated"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()


# =============================================================
# SUPPLIER MANAGEMENT API
# =============================================================

@app.route("/api/suppliers", methods=["GET"])
def api_suppliers_list():
    search = request.args.get("search", "").strip()
    status_filter = request.args.get("status", "").strip()
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        query = """
            SELECT s.id, s.supplier_id, s.name, s.contact_person, s.phone, s.email,
                   s.address, s.tax_number, s.opening_balance, s.status, s.registered_at,
                   COUNT(p.id) AS purchase_count,
                   COALESCE(SUM(p.total), 0) AS total_purchase_value,
                   COALESCE(SUM(CASE WHEN p.payment_status = 'Unpaid' THEN p.total
                                     WHEN p.payment_status = 'Partially Paid' THEN (p.total - COALESCE(p.paid_amount, 0))
                                     ELSE 0 END), 0) AS outstanding_payable,
                   MAX(p.purchase_date) AS last_purchase_date
            FROM suppliers s
            LEFT JOIN purchases p ON p.supplier_id::text = s.supplier_id::text
        """
        conditions = []
        params = []
        if search:
            conditions.append("(s.name ILIKE %s OR s.phone ILIKE %s OR s.supplier_id ILIKE %s OR s.contact_person ILIKE %s)")
            params += [f"%{search}%"] * 4
        if status_filter:
            conditions.append("s.status = %s")
            params.append(status_filter)
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        query += """ GROUP BY s.id, s.supplier_id, s.name, s.contact_person, s.phone, s.email,
                               s.address, s.tax_number, s.opening_balance, s.status, s.registered_at"""
        query += " ORDER BY s.registered_at DESC LIMIT 200"
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        suppliers = []
        for r in rows:
            suppliers.append({
                "id": r[0], "supplier_id": r[1], "name": r[2], "contact_person": r[3] or "",
                "phone": r[4] or "", "email": r[5] or "", "address": r[6] or "",
                "tax_number": r[7] or "", "opening_balance": float(r[8] or 0),
                "status": r[9], "registered_at": r[10].isoformat() if r[10] else None,
                "purchase_count": int(r[11]), "total_purchase_value": float(r[12]),
                "outstanding_payable": float(r[13]), "last_purchase_date": str(r[14]) if r[14] else None,
            })
        return jsonify(suppliers)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()


@app.route("/api/suppliers/search", methods=["GET"])
def api_suppliers_search():
    """Fast typeahead search for purchase entry integration."""
    q = request.args.get("q", "").strip()
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT supplier_id, name, contact_person, phone, email, address
            FROM suppliers
            WHERE status = 'Active'
              AND (name ILIKE %s OR phone ILIKE %s OR supplier_id ILIKE %s)
            ORDER BY name
            LIMIT 10
        """, (f"%{q}%", f"%{q}%", f"%{q}%"))
        results = [
            {"supplier_id": r[0], "name": r[1], "contact_person": r[2] or "",
             "phone": r[3] or "", "email": r[4] or "", "address": r[5] or ""}
            for r in cur.fetchall()
        ]
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()


@app.route("/api/suppliers", methods=["POST"])
def api_suppliers_create():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Supplier name is required"}), 400
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        # Duplicate name check
        cur.execute("SELECT supplier_id FROM suppliers WHERE LOWER(name) = LOWER(%s) LIMIT 1", (name,))
        existing = cur.fetchone()
        if existing:
            return jsonify({"error": f"Supplier '{name}' already exists ({existing[0]}). Please use the existing record or choose a different name."}), 409
        sid = generate_supplier_id(cur)
        ob = safe_float(data.get("opening_balance", 0))
        cur.execute("""
            INSERT INTO suppliers (supplier_id, name, contact_person, phone, email, address, tax_number, opening_balance, status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING supplier_id, name
        """, (sid, name, data.get("contact_person","").strip() or None,
               data.get("phone","").strip() or None, data.get("email","").strip() or None,
               data.get("address","").strip() or None, data.get("tax_number","").strip() or None,
               ob, data.get("status","Active")))
        row = cur.fetchone()
        conn.commit()
        return jsonify({"success": True, "supplier_id": row[0], "name": row[1],
                        "message": f"Supplier {sid} registered successfully"}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()


@app.route("/api/suppliers/<supplier_id>", methods=["GET"])
def api_supplier_detail(supplier_id):
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT s.id, s.supplier_id, s.name, s.contact_person, s.phone, s.email,
                   s.address, s.tax_number, s.opening_balance, s.status, s.registered_at,
                   COUNT(p.id), COALESCE(SUM(p.total), 0),
                   COALESCE(SUM(CASE WHEN COALESCE(p.payment_status, 'Paid') = 'Unpaid' THEN p.total
                                     WHEN COALESCE(p.payment_status, 'Paid') = 'Partially Paid'
                                          THEN (p.total - COALESCE(p.paid_amount, 0))
                                     ELSE 0 END), 0)
            FROM suppliers s
            LEFT JOIN purchases p ON p.supplier_id::text = s.supplier_id::text
            WHERE s.supplier_id = %s
            GROUP BY s.id, s.supplier_id, s.name, s.contact_person, s.phone, s.email,
                     s.address, s.tax_number, s.opening_balance, s.status, s.registered_at
        """, (supplier_id,))
        r = cur.fetchone()
        if not r:
            return jsonify({"error": "Supplier not found"}), 404

        # Recent purchases
        cur.execute("""
            SELECT id, purchase_date, total,
                   COALESCE(receipt_status, 'Received'),
                   COALESCE(payment_status, 'Paid'),
                   COALESCE(payment_method, 'Cash')
            FROM purchases WHERE supplier_id = %s
            ORDER BY purchase_date DESC, id DESC LIMIT 20
        """, (supplier_id,))
        purchases = [
            {"id": p[0], "purchase_date": str(p[1]) if p[1] else None,
             "total": float(p[2]), "receipt_status": p[3],
             "payment_status": p[4], "payment_method": p[5]}
            for p in cur.fetchall()
        ]
        return jsonify({
            "id": r[0], "supplier_id": r[1], "name": r[2], "contact_person": r[3] or "",
            "phone": r[4] or "", "email": r[5] or "", "address": r[6] or "",
            "tax_number": r[7] or "", "opening_balance": float(r[8] or 0),
            "status": r[9], "registered_at": r[10].isoformat() if r[10] else None,
            "purchase_count": int(r[11]), "total_purchase_value": float(r[12]),
            "outstanding_payable": float(r[13]), "purchases": purchases
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()


@app.route("/api/suppliers/<supplier_id>", methods=["PUT"])
def api_supplier_update(supplier_id):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Supplier name is required"}), 400
    conn = get_db_connection()
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT supplier_id FROM suppliers
            WHERE LOWER(name) = LOWER(%s) AND supplier_id != %s LIMIT 1
        """, (name, supplier_id))
        if cur.fetchone():
            return jsonify({"error": f"Another supplier named '{name}' already exists"}), 409
        ob = safe_float(data.get("opening_balance", 0))
        cur.execute("""
            UPDATE suppliers
            SET name=%s, contact_person=%s, phone=%s, email=%s, address=%s,
                tax_number=%s, opening_balance=%s, status=%s
            WHERE supplier_id=%s RETURNING supplier_id
        """, (name, data.get("contact_person","").strip() or None,
               data.get("phone","").strip() or None, data.get("email","").strip() or None,
               data.get("address","").strip() or None, data.get("tax_number","").strip() or None,
               ob, data.get("status","Active"), supplier_id))
        if not cur.fetchone():
            return jsonify({"error": "Supplier not found"}), 404
        conn.commit()
        return jsonify({"success": True, "message": f"Supplier {supplier_id} updated"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()



# -------------------------------------------------------------------
# EXPENSE MANAGEMENT SCHEMA & APIs
# -------------------------------------------------------------------

def ensure_expense_schema(conn):
    """Create expense management tables if they do not exist."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS expense_categories (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL
                );
                INSERT INTO expense_categories (name) VALUES
                    ('Shop Rent'),
                    ('Electricity'),
                    ('Employee Salary'),
                    ('Transportation'),
                    ('Packaging Materials'),
                    ('Maintenance'),
                    ('Internet and Telephone'),
                    ('Other Expenses')
                ON CONFLICT (name) DO NOTHING;

                CREATE TABLE IF NOT EXISTS expenses (
                    id SERIAL PRIMARY KEY,
                    title VARCHAR(200) NOT NULL,
                    category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
                    amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
                    expense_date DATE NOT NULL,
                    payment_method VARCHAR(50),
                    description TEXT,
                    receipt BYTEA,
                    receipt_mime VARCHAR(100),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL;
                ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
                ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description TEXT;
                ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt BYTEA;
                ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_mime VARCHAR(100);
                ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

                CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
                CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
            """)
            conn.commit()
    except Exception:
        conn.rollback()


# Expense Categories API
@app.route("/api/expenses/categories", methods=["GET"])
def api_get_expense_categories():
    conn = get_db_connection()
    ensure_expense_schema(conn)
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM expense_categories ORDER BY name")
    cats = [{"id": r[0], "name": r[1]} for r in cur.fetchall()]
    cur.close(); conn.close()
    return jsonify(cats)

@app.route("/api/expenses/categories", methods=["POST"])
@admin_required
def api_add_expense_category():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "Category name required"}), 400
    conn = get_db_connection()
    ensure_expense_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO expense_categories (name) VALUES (%s) RETURNING id", (name,))
        cat_id = cur.fetchone()[0]
        conn.commit()
        return jsonify({"id": cat_id, "name": name})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()

# Expenses CRUD API
@app.route("/api/expenses", methods=["GET"])
@admin_required
def api_get_expenses():
    cat = request.args.get("category_id")
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    method = request.args.get("payment_method")
    search = request.args.get("search", "").strip()
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    offset = (page - 1) * page_size

    conn = get_db_connection()
    ensure_expense_schema(conn)
    cur = conn.cursor()
    query = """
        SELECT e.id, e.title, c.name AS category, e.category_id, e.amount, e.expense_date,
               e.payment_method, e.description, e.created_at, e.updated_at
        FROM expenses e
        LEFT JOIN expense_categories c ON e.category_id = c.id
        WHERE 1=1
    """
    params = []
    pattern = ""
    if cat:
        query += " AND e.category_id = %s"
        params.append(cat)
    if start:
        query += " AND e.expense_date >= %s"
        params.append(start)
    if end:
        query += " AND e.expense_date <= %s"
        params.append(end)
    if method:
        query += " AND e.payment_method = %s"
        params.append(method)
    if search:
        query += " AND (e.title ILIKE %s OR e.description ILIKE %s)"
        pattern = f"%{search}%"
        params.extend([pattern, pattern])
    query += " ORDER BY e.expense_date DESC, e.id DESC"
    query += " LIMIT %s OFFSET %s"
    params.extend([page_size, offset])
    cur.execute(query, tuple(params))
    rows = cur.fetchall()
    expenses = []
    for r in rows:
        expenses.append({
            "id": r[0],
            "title": r[1],
            "category": r[2],
            "category_id": r[3],
            "amount": float(r[4]),
            "expense_date": r[5].isoformat() if r[5] else None,
            "payment_method": r[6],
            "description": r[7],
            "created_at": r[8].isoformat() if r[8] else None,
            "updated_at": r[9].isoformat() if r[9] else None,
        })
    # Total count for pagination
    count_query = "SELECT COUNT(*) FROM expenses e WHERE 1=1"
    count_params = []
    if cat:
        count_query += " AND e.category_id = %s"; count_params.append(cat)
    if start:
        count_query += " AND e.expense_date >= %s"; count_params.append(start)
    if end:
        count_query += " AND e.expense_date <= %s"; count_params.append(end)
    if method:
        count_query += " AND e.payment_method = %s"; count_params.append(method)
    if search:
        count_query += " AND (e.title ILIKE %s OR e.description ILIKE %s)"
        count_params.extend([pattern, pattern])
    cur.execute(count_query, tuple(count_params))
    total = cur.fetchone()[0]
    cur.close(); conn.close()
    return jsonify({"expenses": expenses, "total": total, "page": page, "page_size": page_size})

@app.route("/api/expenses", methods=["POST"])
@admin_required
def api_create_expense():
    data = {}
    if request.is_json:
        data = request.get_json(silent=True) or {}
    elif request.form:
        data = request.form.to_dict()
    elif request.values:
        data = request.values.to_dict()

    receipt_file = request.files.get("receipt") if request.files else None
    title = data.get("title", "").strip()
    category_id = data.get("category_id")
    amount = data.get("amount")
    expense_date = data.get("expense_date")
    payment_method = data.get("payment_method", "").strip()
    description = data.get("description", "").strip()
    if not title or not amount or not expense_date:
        return jsonify({"error": "Title, amount and date are required"}), 400
    try:
        amount_val = float(amount)
    except Exception:
        return jsonify({"error": "Invalid amount"}), 400
    receipt_bytes = receipt_file.read() if receipt_file and receipt_file.filename else None
    receipt_mime = receipt_file.mimetype if receipt_file and receipt_file.filename else None
    conn = get_db_connection()
    ensure_expense_schema(conn)
    cur = conn.cursor()
    try:
        category_name = None
        if category_id:
            cur.execute("SELECT name FROM expense_categories WHERE id = %s", (category_id,))
            c_row = cur.fetchone()
            if c_row:
                category_name = c_row[0]
        if not category_name:
            category_name = "Other Expenses"

        cur.execute(
            """INSERT INTO expenses (title, category, category_id, amount, expense_date, payment_method, payment_mode, description, notes, receipt, receipt_mime)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (title, category_name, category_id or None, amount_val, expense_date, payment_method, payment_method, description, description, receipt_bytes, receipt_mime)
        )
        exp_id = cur.fetchone()[0]
        conn.commit()
        return jsonify({"success": True, "id": exp_id})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()

@app.route("/api/expenses/<int:exp_id>", methods=["GET"])
@admin_required
def api_get_expense_detail(exp_id):
    conn = get_db_connection()
    ensure_expense_schema(conn)
    cur = conn.cursor()
    cur.execute("""
        SELECT e.id, e.title, c.name, e.category_id, e.amount, e.expense_date,
               e.payment_method, e.description, e.created_at, e.updated_at
        FROM expenses e LEFT JOIN expense_categories c ON e.category_id = c.id
        WHERE e.id = %s
    """, (exp_id,))
    r = cur.fetchone()
    cur.close(); conn.close()
    if not r:
        return jsonify({"error": "Expense not found"}), 404
    return jsonify({
        "id": r[0], "title": r[1], "category": r[2], "category_id": r[3],
        "amount": float(r[4]), "expense_date": r[5].isoformat() if r[5] else None,
        "payment_method": r[6], "description": r[7],
        "created_at": r[8].isoformat() if r[8] else None,
        "updated_at": r[9].isoformat() if r[9] else None,
    })

@app.route("/api/expenses/<int:exp_id>", methods=["PUT", "POST"])
@admin_required
def api_update_expense(exp_id):
    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or request.values.to_dict() if hasattr(request, 'values') else {})
    receipt_file = request.files.get("receipt") if request.files else None
    title = data.get("title", "").strip()
    category_id = data.get("category_id")
    amount = data.get("amount")
    expense_date = data.get("expense_date")
    payment_method = data.get("payment_method", "").strip()
    description = data.get("description", "").strip()
    if not title or not amount or not expense_date:
        return jsonify({"error": "Title, amount and date are required"}), 400
    try:
        amount_val = float(amount)
    except Exception:
        return jsonify({"error": "Invalid amount"}), 400
    receipt_bytes = receipt_file.read() if receipt_file and receipt_file.filename else None
    receipt_mime = receipt_file.mimetype if receipt_file and receipt_file.filename else None
    conn = get_db_connection()
    ensure_expense_schema(conn)
    cur = conn.cursor()
    try:
        category_name = None
        if category_id:
            cur.execute("SELECT name FROM expense_categories WHERE id = %s", (category_id,))
            c_row = cur.fetchone()
            if c_row:
                category_name = c_row[0]
        if not category_name:
            category_name = "Other Expenses"

        if receipt_bytes is not None:
            cur.execute(
                """UPDATE expenses SET title=%s, category=%s, category_id=%s, amount=%s, expense_date=%s,
                      payment_method=%s, payment_mode=%s, description=%s, notes=%s, receipt=%s, receipt_mime=%s, updated_at=NOW()
                   WHERE id=%s""",
                (title, category_name, category_id or None, amount_val, expense_date, payment_method, payment_method, description, description, receipt_bytes, receipt_mime, exp_id)
            )
        else:
            cur.execute(
                """UPDATE expenses SET title=%s, category=%s, category_id=%s, amount=%s, expense_date=%s,
                      payment_method=%s, payment_mode=%s, description=%s, notes=%s, updated_at=NOW()
                   WHERE id=%s""",
                (title, category_name, category_id or None, amount_val, expense_date, payment_method, payment_method, description, description, exp_id)
            )
        conn.commit()
        return jsonify({"success": True, "id": exp_id})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()

@app.route("/api/expenses/<int:exp_id>", methods=["DELETE"])
@admin_required
def api_delete_expense(exp_id):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM expenses WHERE id=%s", (exp_id,))
        conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close(); conn.close()

# Expense Reports API
@app.route("/api/expenses/report", methods=["GET"])
@admin_required
def api_expense_report():
    period = request.args.get("period", "month").lower()
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    conn = get_db_connection()
    ensure_expense_schema(conn)
    cur = conn.cursor()
    base_query = """
        SELECT COALESCE(c.name, 'Uncategorized') AS category, SUM(e.amount) AS total_amount,
               DATE_TRUNC(%s, e.expense_date) AS period_date
        FROM expenses e
        LEFT JOIN expense_categories c ON e.category_id = c.id
        WHERE 1=1
    """
    params = [period]
    if start:
        base_query += " AND e.expense_date >= %s"
        params.append(start)
    if end:
        base_query += " AND e.expense_date <= %s"
        params.append(end)
    base_query += " GROUP BY c.name, DATE_TRUNC(%s, e.expense_date) ORDER BY DATE_TRUNC(%s, e.expense_date) DESC, total_amount DESC"
    params.extend([period, period])
    cur.execute(base_query, tuple(params))
    rows = cur.fetchall()
    report = []
    for r in rows:
        report.append({
            "category": r[0],
            "total_amount": float(r[1]),
            "period_date": r[2].date().isoformat() if r[2] else None
        })
    cur.close(); conn.close()
    return jsonify(report)


# -------------------------------------------------------------------
# PROFIT & LOSS SCHEMA, HELPERS & APIs
# -------------------------------------------------------------------

def ensure_profit_schema(conn):
    """Create profit_snapshots table and add cost_at_sale to bill_items."""
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS profit_snapshots (
                    snapshot_date DATE PRIMARY KEY,
                    total_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
                    net_sales   NUMERIC(12,2) NOT NULL DEFAULT 0,
                    cogs        NUMERIC(12,2) NOT NULL DEFAULT 0,
                    gross_profit NUMERIC(12,2) NOT NULL DEFAULT 0,
                    gross_margin NUMERIC(6,2) NOT NULL DEFAULT 0,
                    operating_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
                    operating_profit   NUMERIC(12,2) NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS cost_at_sale NUMERIC(12,2) DEFAULT 0.00;
            """)
            conn.commit()
    except Exception:
        conn.rollback()


def calculate_profit_for_range(start_date, end_date):
    """
    Compute P&L numbers for a date range.
    Returns a dict with all financial metrics.
    """
    conn = get_db_connection()
    ensure_expense_schema(conn)
    ensure_profit_schema(conn)
    cur = conn.cursor()

    # --- Net Sales (completed sales only) ---
    cur.execute("""
        SELECT COALESCE(SUM(total), 0),
               COALESCE(SUM(COALESCE(subtotal, total)), 0),
               COALESCE(SUM(COALESCE(discount_amount, 0)), 0)
        FROM bills
        WHERE DATE(created_at) >= %s AND DATE(created_at) <= %s AND status = 'PAID'
    """, (start_date, end_date))
    net_sales_row, gross_sales_row, discounts_row = cur.fetchone()
    gross_sales = float(gross_sales_row)
    discounts = float(discounts_row)
    net_sales = float(net_sales_row)
    total_sales = gross_sales

    # --- COGS ---
    # Use cost_at_sale if populated; fall back to product cost_price
    cur.execute("""
        SELECT COALESCE(SUM(
            bi.quantity * CASE
                WHEN bi.cost_at_sale > 0 THEN bi.cost_at_sale
                ELSE COALESCE(p.cost_price, 0)
            END
        ), 0)
        FROM bill_items bi
        JOIN bills b ON bi.invoice_no = b.invoice_no
        LEFT JOIN products p ON bi.item_code = p.item_code
        WHERE DATE(b.created_at) >= %s AND DATE(b.created_at) <= %s AND b.status = 'PAID'
    """, (start_date, end_date))
    cogs = float(cur.fetchone()[0])

    gross_profit = net_sales - cogs
    gross_margin = (gross_profit / net_sales * 100) if net_sales != 0 else 0.0

    # --- Operating Expenses ---
    cur.execute("""
        SELECT COALESCE(SUM(amount), 0)
        FROM expenses
        WHERE expense_date >= %s AND expense_date <= %s
    """, (start_date, end_date))
    operating_expenses = float(cur.fetchone()[0])

    operating_profit = gross_profit - operating_expenses

    cur.close(); conn.close()

    return {
        "gross_sales": round(gross_sales, 2),
        "total_sales": round(total_sales, 2),
        "discounts": round(discounts, 2),
        "net_sales": round(net_sales, 2),
        "cogs": round(cogs, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_margin": round(gross_margin, 2),
        "operating_expenses": round(operating_expenses, 2),
        "operating_profit": round(operating_profit, 2),
    }


@app.route("/api/profit/summary", methods=["GET"])
@admin_required
def api_profit_summary():
    """Return P&L summary. Default: current month. Supports ?start_date=&end_date="""
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    if not start:
        today = datetime.now().date()
        start = today.replace(day=1).isoformat()
    if not end:
        end = datetime.now().date().isoformat()
    result = calculate_profit_for_range(start, end)
    result["start_date"] = start
    result["end_date"] = end
    return jsonify(result)


@app.route("/api/profit/report", methods=["GET"])
@admin_required
def api_profit_report():
    """
    Aggregated P&L report by period.
    query params: period=day|week|month|year, start_date, end_date
    """
    period = request.args.get("period", "month").lower()
    start = request.args.get("start_date")
    end = request.args.get("end_date")

    if period not in ("day", "week", "month", "year"):
        return jsonify({"error": "period must be day, week, month, or year"}), 400

    conn = get_db_connection()
    ensure_expense_schema(conn)
    ensure_profit_schema(conn)
    cur = conn.cursor()

    # --- Sales grouped by period ---
    sales_q = """
        SELECT DATE_TRUNC(%s, created_at) AS p, COALESCE(SUM(total), 0)
        FROM bills WHERE status = 'PAID'
    """
    sales_params = [period]
    if start:
        sales_q += " AND DATE(created_at) >= %s"; sales_params.append(start)
    if end:
        sales_q += " AND DATE(created_at) <= %s"; sales_params.append(end)
    sales_q += " GROUP BY p ORDER BY p DESC"
    cur.execute(sales_q, tuple(sales_params))
    sales_by_period = {r[0]: float(r[1]) for r in cur.fetchall()}

    # --- COGS grouped by period ---
    cogs_q = """
        SELECT DATE_TRUNC(%s, b.created_at) AS p,
               COALESCE(SUM(bi.quantity * CASE
                   WHEN bi.cost_at_sale > 0 THEN bi.cost_at_sale
                   ELSE COALESCE(p.cost_price, 0)
               END), 0)
        FROM bill_items bi
        JOIN bills b ON bi.invoice_no = b.invoice_no
        LEFT JOIN products p ON bi.item_code = p.item_code
        WHERE b.status = 'PAID'
    """
    cogs_params = [period]
    if start:
        cogs_q += " AND DATE(b.created_at) >= %s"; cogs_params.append(start)
    if end:
        cogs_q += " AND DATE(b.created_at) <= %s"; cogs_params.append(end)
    cogs_q += " GROUP BY p ORDER BY p DESC"
    cur.execute(cogs_q, tuple(cogs_params))
    cogs_by_period = {r[0]: float(r[1]) for r in cur.fetchall()}

    # --- Expenses grouped by period ---
    exp_q = """
        SELECT DATE_TRUNC(%s, expense_date) AS p, COALESCE(SUM(amount), 0)
        FROM expenses WHERE 1=1
    """
    exp_params = [period]
    if start:
        exp_q += " AND expense_date >= %s"; exp_params.append(start)
    if end:
        exp_q += " AND expense_date <= %s"; exp_params.append(end)
    exp_q += " GROUP BY p ORDER BY p DESC"
    cur.execute(exp_q, tuple(exp_params))
    exp_by_period = {r[0]: float(r[1]) for r in cur.fetchall()}

    cur.close(); conn.close()

    # Merge all periods (convert all keys to date strings for uniform sorting)
    def normalize_period_key(k):
        if hasattr(k, 'date'):
            return k.date().isoformat()
        return str(k)

    sales_normalized = {normalize_period_key(k): v for k, v in sales_by_period.items()}
    cogs_normalized = {normalize_period_key(k): v for k, v in cogs_by_period.items()}
    exp_normalized = {normalize_period_key(k): v for k, v in exp_by_period.items()}

    all_periods = sorted(set(list(sales_normalized.keys()) + list(cogs_normalized.keys()) + list(exp_normalized.keys())), reverse=True)

    report = []
    for p in all_periods:
        ts = sales_normalized.get(p, 0)
        ns = ts  # net_sales = total_sales (no separate discounts column)
        cg = cogs_normalized.get(p, 0)
        gp = ns - cg
        gm = (gp / ns * 100) if ns != 0 else 0.0
        oe = exp_normalized.get(p, 0)
        op = gp - oe
        report.append({
            "period": p,
            "total_sales": round(ts, 2),
            "net_sales": round(ns, 2),
            "cogs": round(cg, 2),
            "gross_profit": round(gp, 2),
            "gross_margin": round(gm, 2),
            "operating_expenses": round(oe, 2),
            "operating_profit": round(op, 2),
        })
    return jsonify(report)


# -------------------------------------------------------------------
# ACCOUNTS PAYABLE (MODULE 8) APIs
# -------------------------------------------------------------------

@app.route("/api/payables/summary", methods=["GET"])
@admin_required
def api_payables_summary():
    """
    Summary metrics for Accounts Payable:
    Total purchases, total paid, total outstanding, counts of unpaid/partially paid/overdue.
    """
    conn = get_db_connection()
    ensure_purchase_schema(conn)
    cur = conn.cursor()
    try:
        # Sum of total purchases and sum of actual paid amount
        cur.execute("""
            SELECT
                COALESCE(SUM(total), 0) AS total_purchases,
                COALESCE(SUM(paid_amount), 0) AS total_paid,
                COALESCE(SUM(CASE WHEN total > paid_amount THEN (total - paid_amount) ELSE 0 END), 0) AS total_outstanding,
                COUNT(CASE WHEN paid_amount = 0 THEN 1 END) AS unpaid_count,
                COUNT(CASE WHEN paid_amount > 0 AND paid_amount < total THEN 1 END) AS partially_paid_count,
                COUNT(CASE WHEN paid_amount >= total THEN 1 END) AS fully_paid_count,
                COUNT(CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE AND paid_amount < total THEN 1 END) AS overdue_count,
                COALESCE(SUM(CASE WHEN due_date IS NOT NULL AND due_date < CURRENT_DATE AND paid_amount < total THEN (total - paid_amount) ELSE 0 END), 0) AS overdue_amount
            FROM purchases;
        """)
        r = cur.fetchone()
        summary = {
            "total_purchases": float(r[0]),
            "total_paid": float(r[1]),
            "total_outstanding": float(r[2]),
            "unpaid_count": int(r[3]),
            "partially_paid_count": int(r[4]),
            "fully_paid_count": int(r[5]),
            "overdue_count": int(r[6]),
            "overdue_amount": float(r[7]),
        }
        return jsonify(summary)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()


@app.route("/api/payables/suppliers", methods=["GET"])
@admin_required
def api_payables_by_supplier():
    """
    Supplier-wise accounts payable aggregation:
    Supplier name, supplier_id, total purchases, total paid, outstanding amount, unpaid count.
    """
    search = request.args.get("search", "").strip()
    status_filter = request.args.get("status", "").strip() # 'outstanding' or 'all'

    conn = get_db_connection()
    ensure_purchase_schema(conn)
    ensure_customer_supplier_schema(conn)
    cur = conn.cursor()
    try:
        query = """
            SELECT
                COALESCE(CAST(p.supplier_id AS TEXT), CAST(s.supplier_id AS TEXT), 'UNKNOWN') AS supplier_id,
                COALESCE(s.name, p.supplier_name) AS supplier_name,
                s.phone,
                s.contact_person,
                COUNT(p.id) AS total_purchases_count,
                COALESCE(SUM(p.total), 0) AS total_purchase_amount,
                COALESCE(SUM(p.paid_amount), 0) AS total_paid_amount,
                COALESCE(SUM(CASE WHEN p.total > p.paid_amount THEN (p.total - p.paid_amount) ELSE 0 END), 0) AS outstanding_amount,
                COUNT(CASE WHEN p.paid_amount < p.total THEN 1 END) AS unpaid_purchases_count,
                COUNT(CASE WHEN p.due_date IS NOT NULL AND p.due_date < CURRENT_DATE AND p.paid_amount < p.total THEN 1 END) AS overdue_count,
                MAX(p.purchase_date) AS last_purchase_date
            FROM purchases p
            LEFT JOIN suppliers s ON CAST(s.supplier_id AS TEXT) = CAST(p.supplier_id AS TEXT) OR LOWER(s.name) = LOWER(p.supplier_name)
            WHERE 1=1
        """
        params = []
        if search:
            query += " AND (p.supplier_name ILIKE %s OR s.name ILIKE %s OR s.phone ILIKE %s)"
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

        query += " GROUP BY COALESCE(CAST(p.supplier_id AS TEXT), CAST(s.supplier_id AS TEXT), 'UNKNOWN'), COALESCE(s.name, p.supplier_name), s.phone, s.contact_person"

        if status_filter == "outstanding":
            query += " HAVING SUM(CASE WHEN p.total > p.paid_amount THEN (p.total - p.paid_amount) ELSE 0 END) > 0"

        query += " ORDER BY outstanding_amount DESC, supplier_name ASC"

        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        result = []
        for r in rows:
            result.append({
                "supplier_id": r[0],
                "supplier_name": r[1],
                "phone": r[2] or "",
                "contact_person": r[3] or "",
                "total_purchases_count": int(r[4]),
                "total_purchase_amount": float(r[5]),
                "total_paid_amount": float(r[6]),
                "outstanding_amount": float(r[7]),
                "unpaid_purchases_count": int(r[8]),
                "overdue_count": int(r[9]),
                "last_purchase_date": r[10].isoformat() if r[10] else None,
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()


@app.route("/api/payables/purchases", methods=["GET"])
@admin_required
def api_payables_purchases():
    """
    List purchases with payable statuses:
    Filter by status ('all', 'unpaid', 'partially_paid', 'paid', 'overdue'), supplier, date range.
    """
    status = request.args.get("status", "all").strip().lower()
    supplier = request.args.get("supplier", "").strip()
    search = request.args.get("search", "").strip()
    start_date = request.args.get("start_date", "").strip()
    end_date = request.args.get("end_date", "").strip()

    conn = get_db_connection()
    ensure_purchase_schema(conn)
    cur = conn.cursor()
    try:
        query = """
            SELECT
                p.id, p.supplier_name, p.supplier_id, p.total, p.paid_amount,
                (p.total - p.paid_amount) AS outstanding_amount,
                p.payment_status, p.receipt_status, p.payment_method,
                p.purchase_date, p.due_date, p.created_at,
                (p.due_date IS NOT NULL AND p.due_date < CURRENT_DATE AND p.paid_amount < p.total) AS is_overdue,
                COALESCE((SELECT COUNT(*) FROM purchase_payments WHERE purchase_id = p.id), 0) AS payment_count
            FROM purchases p
            WHERE 1=1
        """
        params = []
        if supplier:
            query += " AND (p.supplier_name ILIKE %s OR p.supplier_id ILIKE %s)"
            params.extend([f"%{supplier}%", f"%{supplier}%"])
        if search:
            query += " AND (p.supplier_name ILIKE %s OR CAST(p.id AS TEXT) ILIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])
        if start_date:
            query += " AND p.purchase_date >= %s"
            params.append(start_date)
        if end_date:
            query += " AND p.purchase_date <= %s"
            params.append(end_date)

        if status == "unpaid":
            query += " AND p.paid_amount = 0"
        elif status == "partially_paid":
            query += " AND p.paid_amount > 0 AND p.paid_amount < p.total"
        elif status == "paid":
            query += " AND p.paid_amount >= p.total"
        elif status == "overdue":
            query += " AND p.due_date IS NOT NULL AND p.due_date < CURRENT_DATE AND p.paid_amount < p.total"
        elif status == "outstanding":
            query += " AND p.paid_amount < p.total"

        query += " ORDER BY p.purchase_date DESC, p.id DESC"

        cur.execute(query, tuple(params))
        rows = cur.fetchall()
        result = []
        for r in rows:
            result.append({
                "id": r[0],
                "supplier_name": r[1],
                "supplier_id": r[2],
                "total": float(r[3]),
                "paid_amount": float(r[4]),
                "outstanding_amount": float(r[5]),
                "payment_status": r[6],
                "receipt_status": r[7],
                "payment_method": r[8],
                "purchase_date": r[9].isoformat() if r[9] else None,
                "due_date": r[10].isoformat() if r[10] else None,
                "created_at": r[11].isoformat() if r[11] else None,
                "is_overdue": bool(r[12]),
                "payment_count": int(r[13]),
            })
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()


@app.route("/api/payables/purchases/<int:purchase_id>", methods=["GET"])
@admin_required
def api_payables_purchase_detail(purchase_id):
    """
    Detailed view of a single purchase with line items, payments history, and calculated balances.
    """
    conn = get_db_connection()
    ensure_purchase_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, supplier_name, supplier_id, total, paid_amount,
                   payment_status, receipt_status, payment_method, purchase_date,
                   due_date, created_at, receipt_date, verified_date
            FROM purchases
            WHERE id = %s
        """, (purchase_id,))
        p = cur.fetchone()
        if not p:
            return jsonify({"error": "Purchase not found"}), 404

        # Line items
        cur.execute("""
            SELECT product_name, item_code, cost_price, quantity, total
            FROM purchase_items
            WHERE purchase_id = %s
            ORDER BY id ASC
        """, (purchase_id,))
        items = [
            {
                "product_name": ir[0], "item_code": ir[1],
                "cost_price": float(ir[2]), "quantity": float(ir[3]),
                "total": float(ir[4])
            }
            for ir in cur.fetchall()
        ]

        # Payment records ledger
        cur.execute("""
            SELECT id, payment_date, amount, payment_method, reference_no, notes, created_at
            FROM purchase_payments
            WHERE purchase_id = %s
            ORDER BY payment_date DESC, id DESC
        """, (purchase_id,))
        payments = [
            {
                "id": pr[0],
                "payment_date": pr[1].isoformat() if pr[1] else None,
                "amount": float(pr[2]),
                "payment_method": pr[3],
                "reference_no": pr[4] or "",
                "notes": pr[5] or "",
                "created_at": pr[6].isoformat() if pr[6] else None,
            }
            for pr in cur.fetchall()
        ]

        total_amount = float(p[3])
        # Sum payments directly from ledger to ensure consistency
        ledger_paid = sum(pm["amount"] for pm in payments)
        paid_amount = ledger_paid if payments else float(p[4])
        outstanding_amount = max(0.0, total_amount - paid_amount)

        detail = {
            "id": p[0],
            "supplier_name": p[1],
            "supplier_id": p[2],
            "total": total_amount,
            "paid_amount": round(paid_amount, 2),
            "outstanding_amount": round(outstanding_amount, 2),
            "payment_status": p[5],
            "receipt_status": p[6],
            "payment_method": p[7],
            "purchase_date": p[8].isoformat() if p[8] else None,
            "due_date": p[9].isoformat() if p[9] else None,
            "created_at": p[10].isoformat() if p[10] else None,
            "receipt_date": p[11].isoformat() if p[11] else None,
            "verified_date": p[12].isoformat() if p[12] else None,
            "items": items,
            "payments": payments,
        }
        return jsonify(detail)
    except Exception as e:
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()


@app.route("/api/payables/payments", methods=["POST"])
@admin_required
def api_record_purchase_payment():
    """
    Record an Accounts Payable payment against a purchase:
    Strict business rules:
      - Never allows payments to exceed outstanding amount.
      - Calculates new status ('Paid' or 'Partially Paid').
      - Updates paid_amount and payment_status in a single atomic transaction.
      - Does NOT touch inventory stock.
      - Inserts audit record into purchase_payments.
    """
    data = request.get_json() or request.form
    purchase_id = data.get("purchase_id")
    raw_amount = data.get("amount")
    payment_method = (data.get("payment_method") or "Cash").strip()
    payment_date = data.get("payment_date") or datetime.now().strftime("%Y-%m-%d")
    reference_no = (data.get("reference_no") or "").strip() or None
    notes = (data.get("notes") or "").strip() or None

    if not purchase_id:
        return jsonify({"error": "Purchase ID is required"}), 400
    if raw_amount is None or str(raw_amount).strip() == "":
        return jsonify({"error": "Payment amount is required"}), 400

    try:
        payment_amount = Decimal(str(raw_amount))
        if payment_amount <= Decimal("0.00"):
            return jsonify({"error": "Payment amount must be greater than zero"}), 400
    except Exception:
        return jsonify({"error": "Invalid payment amount"}), 400

    conn = get_db_connection()
    ensure_purchase_schema(conn)
    cur = conn.cursor()
    try:
        # Lock row for atomic update
        cur.execute("""
            SELECT id, total, paid_amount, supplier_name
            FROM purchases
            WHERE id = %s
            FOR UPDATE
        """, (purchase_id,))
        p = cur.fetchone()
        if not p:
            return jsonify({"error": f"Purchase #{purchase_id} not found"}), 404

        purchase_total = Decimal(str(p[1]))
        current_paid = Decimal(str(p[2] or 0))
        outstanding = purchase_total - current_paid

        # Business Rule: Never allow payments to exceed outstanding amount
        if payment_amount > outstanding:
            return jsonify({
                "error": f"Payment amount (₹{payment_amount}) exceeds outstanding balance (₹{outstanding}). Maximum allowed payment is ₹{outstanding}."
            }), 400

        new_paid = current_paid + payment_amount
        new_status = "Paid" if new_paid >= purchase_total else "Partially Paid"

        # 1. Insert into immutable ledger
        cur.execute("""
            INSERT INTO purchase_payments
            (purchase_id, payment_date, amount, payment_method, reference_no, notes)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (purchase_id, payment_date, payment_amount, payment_method, reference_no, notes))
        payment_record_id = cur.fetchone()[0]

        # 2. Update purchases summary fields atomically
        cur.execute("""
            UPDATE purchases
            SET paid_amount = %s,
                payment_status = %s,
                bill_status = %s,
                payment_method = %s
            WHERE id = %s
        """, (new_paid, new_status, new_status, payment_method, purchase_id))

        conn.commit()
        return jsonify({
            "success": True,
            "payment_id": payment_record_id,
            "purchase_id": purchase_id,
            "paid_amount": float(new_paid),
            "outstanding_balance": float(purchase_total - new_paid),
            "payment_status": new_status,
            "message": f"Payment of ₹{payment_amount} recorded successfully. New status: {new_status}."
        })
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()


@app.route("/api/payables/purchases/<int:purchase_id>/due-date", methods=["PATCH", "POST"])
@admin_required
def api_update_purchase_due_date(purchase_id):
    """Update or assign a due date to a purchase."""
    data = request.get_json() or request.form
    due_date = (data.get("due_date") or "").strip() or None

    conn = get_db_connection()
    ensure_purchase_schema(conn)
    cur = conn.cursor()
    try:
        cur.execute("""
            UPDATE purchases
            SET due_date = %s
            WHERE id = %s
            RETURNING id, due_date
        """, (due_date, purchase_id))
        r = cur.fetchone()
        if not r:
            return jsonify({"error": "Purchase not found"}), 404
        conn.commit()
        return jsonify({
            "success": True,
            "purchase_id": purchase_id,
            "due_date": r[1].isoformat() if r[1] else None,
            "message": "Due date updated successfully"
        })
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 400
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    # Run schema migration on startup
    try:
        _startup_conn = get_db_connection()
        ensure_customer_supplier_schema(_startup_conn)
        ensure_expense_schema(_startup_conn)
        ensure_profit_schema(_startup_conn)
        _startup_conn.close()
    except Exception as e:
        print(f"[STARTUP] Schema migration warning: {e}")
    app.run(debug=True, port=5000)
