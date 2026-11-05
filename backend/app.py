from flask import (Flask, render_template, request, session, redirect, url_for, send_file, jsonify, Response)
from db import get_db_connection
from decimal import Decimal
from xhtml2pdf import pisa
from datetime import datetime, date
import io
import os
import json
import csv
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

def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

def json_serialize_value(val):
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    return val

# ----------------- HEALTH & SYSTEM API -----------------
@app.route("/api/health")
def api_health():
    return jsonify({"status": "ok", "app": "PANDAS ERP", "time": datetime.now().isoformat()})

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

    # Product counts
    cur.execute("SELECT COUNT(*) FROM products")
    total_products = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM products WHERE stock <= 5")
    low_stock_count = cur.fetchone()[0]

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
        "total_products": total_products,
        "low_stock_count": low_stock_count,
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
            (product_image IS NOT NULL) AS has_image
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
            "image_url": f"/product-image/{r[0]}" if r[18] else None
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
            (product_image IS NOT NULL) AS has_image
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
        "image_url": f"/product-image/{r[0]}" if r[18] else None
    }
    return jsonify(product)

@app.route("/api/products", methods=["POST"])
def api_create_product():
    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})
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

        cur.execute("""
            INSERT INTO products (
                item_code, item_name, category, unit, stock,
                price, cost_price, sales_tax,
                invoicing_policy, purchase_tax,
                purchase_unit, income_account,
                expense_account, description, company,
                is_sale, is_purchase, is_manufactured,
                product_image, product_image_mime
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
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
            image_mime
        ))
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
    data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})
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

    if errors:
        return jsonify({"error": "Validation failed", "details": errors}), 422

    conn = get_db_connection()
    cur = conn.cursor()

    try:
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
                    product_image=%s, product_image_mime=%s
                WHERE item_code=%s
            """, (
                item_name, category, unit, safe_float(stock),
                safe_float(sale_price), safe_float(cost_price), safe_float(data.get("sales_tax")),
                data.get("invoicing_policy"), safe_float(data.get("purchase_tax")),
                data.get("purchase_unit") or unit,
                data.get("income_account"), data.get("expense_account"),
                data.get("description"), data.get("company"),
                is_sale, is_purchase, is_manufactured,
                image_bytes, image_mime,
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
                    company=%s, is_sale=%s, is_purchase=%s, is_manufactured=%s
                WHERE item_code=%s
            """, (
                item_name, category, unit, safe_float(stock),
                safe_float(sale_price), safe_float(cost_price), safe_float(data.get("sales_tax")),
                data.get("invoicing_policy"), safe_float(data.get("purchase_tax")),
                data.get("purchase_unit") or unit,
                data.get("income_account"), data.get("expense_account"),
                data.get("description"), data.get("company"),
                is_sale, is_purchase, is_manufactured,
                item_code
            ))

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
    cur = conn.cursor()
    try:
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

    bill_total = sum(float(i["total"]) for i in session["cart"])

    return jsonify({
        "cart": session["cart"],
        "customer": session["customer"],
        "bill_total": round(bill_total, 2),
        "categories": categories,
        "held_bills": held_bills
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

    # Check if item already in cart to increment or add new line
    found = False
    for item in session["cart"]:
        if item.get("code") == code:
            existing_qty = Decimal(str(item["qty"]))
            new_qty = existing_qty + qty
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
    bill_total = sum(i["total"] for i in session["cart"])

    return jsonify({
        "success": True,
        "cart": session["cart"],
        "bill_total": round(bill_total, 2)
    })

@app.route("/api/billing/cart/update-qty", methods=["POST"])
def api_cart_update_qty():
    data = request.get_json() or request.form
    index = int(data.get("index", -1))
    quantity = data.get("quantity")

    cart = session.get("cart", [])
    if 0 <= index < len(cart):
        new_qty = Decimal(str(quantity))
        price = Decimal(str(cart[index]["price"]))
        cart[index]["qty"] = float(new_qty)
        cart[index]["total"] = float(price * new_qty)
        session.modified = True
        bill_total = sum(i["total"] for i in cart)
        return jsonify({"success": True, "cart": cart, "bill_total": round(bill_total, 2)})

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
        bill_total = sum(i["total"] for i in cart)
        return jsonify({"success": True, "cart": cart, "bill_total": round(bill_total, 2)})

    return jsonify({"error": "Invalid cart item index"}), 400

@app.route("/api/billing/cart/remove/<int:index>", methods=["DELETE", "POST"])
def api_cart_remove(index):
    cart = session.get("cart", [])
    if 0 <= index < len(cart):
        cart.pop(index)
        session.modified = True
        bill_total = sum(i["total"] for i in cart)
        return jsonify({"success": True, "cart": cart, "bill_total": round(bill_total, 2)})

    return jsonify({"error": "Invalid index"}), 400

@app.route("/api/billing/cart/clear", methods=["POST"])
def api_cart_clear():
    session["cart"] = []
    session.modified = True
    return jsonify({"success": True, "cart": [], "bill_total": 0.0})

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
    cur = conn.cursor()

    total = sum(i["total"] for i in cart)

    cur.execute("""
        INSERT INTO held_bills (cart, customer_name, customer_phone, total)
        VALUES (%s,%s,%s,%s)
        RETURNING id
    """, (
        json.dumps(cart),
        customer.get("name"),
        customer.get("phone"),
        total
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

    return jsonify({
        "success": True,
        "hold_id": hold_id,
        "held_bills": held_bills,
        "message": "Bill successfully parked"
    })

@app.route("/api/billing/resume/<int:hold_id>", methods=["POST"])
def api_resume_bill(hold_id):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT cart, customer_name, customer_phone
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
    bill_total = sum(i["total"] for i in session["cart"])

    return jsonify({
        "success": True,
        "cart": session["cart"],
        "customer": session["customer"],
        "bill_total": round(bill_total, 2),
        "held_bills": held_bills
    })

@app.route("/api/billing/checkout", methods=["POST"])
def api_checkout():
    cart = session.get("cart", [])
    if not cart:
        return jsonify({"error": "Cart is empty"}), 400

    data = request.get_json(silent=True) or {}
    customer = session.get("customer", {})

    cust_name = data.get("customer_name") or customer.get("name") or "Walk-in Customer"
    cust_phone = data.get("customer_phone") or customer.get("phone") or ""
    pay_mode = data.get("payment_mode") or customer.get("payment_mode") or "Cash"

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        invoice_no = generate_invoice_no(cur)
        total = sum(i["total"] for i in cart)

        # 1. Insert Bill
        cur.execute("""
            INSERT INTO bills
            (invoice_no, total, customer_name, customer_phone, payment_mode, status)
            VALUES (%s,%s,%s,%s,%s,'PAID')
        """, (invoice_no, total, cust_name, cust_phone, pay_mode))

        # 2. Insert Items & Decrement Stock
        for item in cart:
            cur.execute("""
                INSERT INTO bill_items
                (invoice_no, product_name, price, quantity, total)
                VALUES (%s,%s,%s,%s,%s)
            """, (
                invoice_no,
                item["name"],
                item["price"],
                item["qty"],
                item["total"]
            ))

            cur.execute("""
                UPDATE products
                SET stock = stock - %s
                WHERE item_code = %s
            """, (item["qty"], item["code"]))

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
            items=items_rows
        )

        year = datetime.now().strftime("%Y")
        month = datetime.now().strftime("%m")
        folder_path = os.path.join(BASE_DIR, "static", "invoices", year, month)
        os.makedirs(folder_path, exist_ok=True)

        pdf_path = os.path.join(folder_path, f"{invoice_no}.pdf")
        rel_pdf_path = f"static/invoices/{year}/{month}/{invoice_no}.pdf"

        with open(pdf_path, "wb") as f:
            pisa.CreatePDF(html, dest=f)

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

    # Clear active session cart
    session.pop("cart", None)
    session.pop("customer", None)

    return jsonify({
        "success": True,
        "invoice_no": invoice_no,
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

    conn = get_db_connection()
    cur = conn.cursor()

    if search:
        cur.execute("""
            SELECT invoice_no, customer_name, total, created_at, pdf_path, status, payment_mode
            FROM bills
            WHERE invoice_no ILIKE %s
               OR customer_name ILIKE %s
            ORDER BY created_at DESC
        """, (f"%{search}%", f"%{search}%"))
    else:
        cur.execute("""
            SELECT invoice_no, customer_name, total, created_at, pdf_path, status, payment_mode
            FROM bills
            ORDER BY created_at DESC
        """)

    bills = []
    for r in cur.fetchall():
        bills.append({
            "invoice_no": r[0],
            "customer_name": r[1] or "Walk-in Customer",
            "total": float(r[2]),
            "created_at": r[3].strftime("%d-%m-%Y %H:%M:%S") if r[3] else None,
            "pdf_path": r[4],
            "pdf_url": f"/{r[4]}" if r[4] else f"/bill/{r[0]}/pdf",
            "status": r[5] or "PAID",
            "payment_mode": r[6] or "Cash"
        })

    cur.close()
    conn.close()
    return jsonify(bills)

@app.route("/api/bills/<invoice_no>")
def api_bill_detail(invoice_no):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT invoice_no, customer_name, customer_phone, payment_mode, total, created_at, pdf_path, status
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
        "items": items
    }
    return jsonify(bill)

@app.route("/api/bills/<invoice_no>/cancel", methods=["POST"])
def api_cancel_bill(invoice_no):
    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute("UPDATE bills SET status='CANCELLED' WHERE invoice_no=%s", (invoice_no,))
        conn.commit()
        return jsonify({"success": True, "message": f"Bill {invoice_no} cancelled successfully"})
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
    purchase_date = data.get("purchase_date")
    bill_status = data.get("bill_status", "Received")
    grand_total = data.get("grand_total")
    items = data.get("items", [])

    if not supplier:
        return jsonify({"error": "Supplier name is required"}), 400
    if not purchase_date:
        return jsonify({"error": "Purchase date is required"}), 400
    if not items or len(items) == 0:
        return jsonify({"error": "At least one purchase item is required"}), 400

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        cur.execute("""
            INSERT INTO purchases
            (supplier_name, total, bill_status, purchase_date)
            VALUES (%s,%s,%s,%s)
            RETURNING id
        """, (supplier, grand_total, bill_status, purchase_date))
        purchase_id = cur.fetchone()[0]

        for item in items:
            code = item.get("item_code")
            qty = Decimal(str(item.get("quantity", 0)))
            cost = Decimal(str(item.get("cost_price", 0)))
            tot = Decimal(str(item.get("total", cost * qty)))

            cur.execute("""
                INSERT INTO purchase_items
                (purchase_id, item_code, product_name, cost_price, quantity, total)
                VALUES (
                    %s, %s,
                    (SELECT item_name FROM products WHERE item_code=%s),
                    %s, %s, %s
                )
            """, (purchase_id, code, code, cost, qty, tot))

            # Automatically increment stock in inventory!
            cur.execute("""
                UPDATE products
                SET stock = stock + %s
                WHERE item_code = %s
            """, (qty, code))

        conn.commit()
        return jsonify({
            "success": True,
            "purchase_id": purchase_id,
            "message": "Purchase recorded and inventory updated successfully"
        })

    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Failed to save purchase: {str(e)}"}), 400
    finally:
        cur.close()
        conn.close()

@app.route("/api/purchases/history")
def api_purchase_history():
    supplier = request.args.get("supplier", "").strip()
    purchase_date = request.args.get("purchase_date", "").strip()

    conn = get_db_connection()
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

    purchases_list = []
    if supplier and purchase_date:
        cur.execute("""
            SELECT id, total, bill_status, purchase_date, created_at
            FROM purchases
            WHERE supplier_name=%s
            AND purchase_date=%s
            ORDER BY id DESC
        """, (supplier, purchase_date))
        p_rows = cur.fetchall()

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
                "supplier_name": supplier,
                "total": float(p[1]),
                "bill_status": p[2] or "Received",
                "purchase_date": p[3].isoformat() if isinstance(p[3], date) else str(p[3]),
                "created_at": p[4].isoformat() if p[4] else None,
                "items": p_items
            })
    elif not supplier and not purchase_date:
        # Return recent 15 purchases when no filters selected
        cur.execute("""
            SELECT id, supplier_name, total, bill_status, purchase_date, created_at
            FROM purchases
            ORDER BY purchase_date DESC, id DESC
            LIMIT 15
        """)
        for p in cur.fetchall():
            purchases_list.append({
                "id": p[0],
                "supplier_name": p[1],
                "total": float(p[2]),
                "bill_status": p[3] or "Received",
                "purchase_date": p[4].isoformat() if isinstance(p[4], date) else str(p[4]),
                "created_at": p[5].isoformat() if p[5] else None,
                "items": []
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

# ----------------- REPORTS API -----------------
@app.route("/api/reports")
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
        SELECT COUNT(*), COALESCE(SUM(b.total), 0)
        FROM bills b
        WHERE {date_filter} AND b.status = 'PAID'
    """, params)
    total_bills, total_sales = cur.fetchone()

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
        "from_date": from_date or datetime.now().strftime("%Y-%m-%d"),
        "to_date": to_date or datetime.now().strftime("%Y-%m-%d"),
        "category_sales": category_sales,
        "items": items
    })

# ----------------- DAILY Z-REPORT API -----------------
@app.route("/api/z-report")
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
            pisa.CreatePDF(html, dest=f)

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

    html = render_template("bill.html", invoice_no=invoice_no, bill=bill, items=items)
    pdf = io.BytesIO()
    pisa.CreatePDF(html, dest=pdf)
    pdf.seek(0)

    return send_file(pdf, mimetype="application/pdf", download_name=f"{invoice_no}.pdf", as_attachment=True)

@app.route("/bill/<invoice_no>")
def bill_view(invoice_no):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT total, created_at, customer_name FROM bills WHERE invoice_no=%s", (invoice_no,))
    bill = cur.fetchone()

    cur.execute("SELECT product_name, price, quantity, total FROM bill_items WHERE invoice_no=%s", (invoice_no,))
    items = cur.fetchall()
    cur.close()
    conn.close()

    return render_template("bill.html", invoice_no=invoice_no, bill=bill, items=items)

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
            WHERE invoice_no ILIKE %s OR customer_name ILIKE %s
            ORDER BY created_at DESC
        """, (f"%{search}%", f"%{search}%"))
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

if __name__ == "__main__":
    app.run(debug=True, port=5000)
