from flask import (Flask, render_template, request, session, redirect,url_for,send_file)
from db import get_db_connection
from decimal import Decimal
from xhtml2pdf import pisa
from flask import jsonify
from datetime import datetime
import io,os
from billing import calculate_item_total, calculate_bill_total

app = Flask(__name__)
app.secret_key = "pandas-secret-key"

@app.route("/")
def dashboard():
    return render_template("dashboard.html")


CATEGORY_PREFIX = {
    "Chocolates": "C",
    "Nuts": "N",
    "Dates": "D",
    "Dry Fruits": "F",
    "Drinks": "W",
    "Mill Products": "M"
}

# ---------------- BILLING ----------------
@app.route("/billing", methods=["GET", "POST"])
def billing():

    if "cart" not in session:
        session["cart"] = []

    if "customer" not in session:
        session["customer"] = {
            "name": "",
            "phone": "",
            "payment_mode": ""
        }

    conn = get_db_connection()
    cur = conn.cursor()

    # Categories
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

    # Products
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

    # ----------- HANDLE POST -----------
    if request.method == "POST":

        # Add item only (NO customer overwrite here)
        if "item_code" in request.form:

            code = request.form.get("item_code")
            quantity = request.form.get("quantity")

            if code and quantity:
                qty = Decimal(quantity)

                cur.execute("""
                    SELECT item_name, price, unit
                    FROM products
                    WHERE item_code=%s
                """, (code,))
                row = cur.fetchone()

                if row:
                    name, price, unit = row
                    price = Decimal(price)
                    total = price * qty

                    session["cart"].append({
                        "code": code,
                        "name": name,
                        "price": float(price),
                        "qty": float(qty),
                        "unit": unit,
                        "total": float(total)
                    })

                    session.modified = True

    # Held bills
    cur.execute("""
        SELECT id, customer_name, total
        FROM held_bills
        ORDER BY created_at DESC
    """)
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

#--------EDITING QTY--------
@app.route("/update-qty/<int:index>", methods=["POST"])
def update_qty(index):
    from decimal import Decimal

    cart = session.get("cart", [])

    if 0 <= index < len(cart):
        new_qty = Decimal(request.form["quantity"])
        price = Decimal(cart[index]["price"])

        cart[index]["qty"] = float(new_qty)
        cart[index]["total"] = float(price * new_qty)
        session.modified = True

    return redirect(url_for("billing"))

#---------------EDIT PRICE---------
@app.route("/update-price/<int:index>", methods=["POST"])
def update_price(index):
    from decimal import Decimal

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

#-----------------HOLD BILLS--------
import json
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
    """, (
        json.dumps(cart),
        customer.get("name"),
        customer.get("phone"),
        total
    ))

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

    cur.execute("""
        SELECT cart, customer_name, customer_phone
        FROM held_bills
        WHERE id=%s
    """, (hold_id,))

    row = cur.fetchone()

    if row:
        session["cart"] = row[0]

        session["customer"] = {
            "name": row[1] or "",
            "phone": row[2] or "",
            "payment_mode": ""
        }

        cur.execute("DELETE FROM held_bills WHERE id=%s", (hold_id,))
        session.modified = True

    conn.commit()
    cur.close()
    conn.close()

    return redirect(url_for("billing"))

# ---------------- FINALIZE BILL ----------------
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

        # ---------------- INSERT BILL ----------------
        cur.execute("""
            INSERT INTO bills
            (invoice_no, total, customer_name, customer_phone, payment_mode,status)
            VALUES (%s,%s,%s,%s,%s,'PAID')
        """, (
            invoice_no,
            total,
            customer.get("name"),
            customer.get("phone"),
            customer.get("payment_mode")
        ))

        # ---------------- INSERT ITEMS ----------------
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

            # Reduce stock
            cur.execute("""
                UPDATE products
                SET stock = stock - %s
                WHERE item_code = %s
            """, (
                item["qty"],
                item["code"]
            ))

        conn.commit()

        # ---------------- FETCH DATA FOR PDF ----------------
        cur.execute(
            "SELECT total, created_at FROM bills WHERE invoice_no=%s",
            (invoice_no,)
        )
        bill = cur.fetchone()

        cur.execute("""
            SELECT product_name, price, quantity, total
            FROM bill_items
            WHERE invoice_no=%s
        """, (invoice_no,))
        items = cur.fetchall()

        # ---------------- GENERATE PDF ----------------
        html = render_template(
            "bill.html",
            invoice_no=invoice_no,
            bill=bill,
            items=items
        )

        year = datetime.now().strftime("%Y")
        month = datetime.now().strftime("%m")

        folder_path = os.path.join("static", "invoices", year, month)
        os.makedirs(folder_path, exist_ok=True)

        pdf_path = os.path.join(folder_path, f"{invoice_no}.pdf")

        with open(pdf_path, "wb") as f:
            pisa.CreatePDF(html, dest=f)

        # Save PDF path
        cur.execute("""
            UPDATE bills
            SET pdf_path=%s
            WHERE invoice_no=%s
        """, (pdf_path, invoice_no))

        conn.commit()

    except Exception as e:
        conn.rollback()
        print("Checkout error:", e)
        return redirect(url_for("billing"))

    finally:
        cur.close()
        conn.close()

    # ---------------- CLEAR SESSION ----------------
    session.pop("cart", None)
    session.pop("customer", None)

    return redirect(url_for("bill_view", invoice_no=invoice_no))

#---------------BILL TO PDF---------
@app.route("/bill/<invoice_no>/pdf")
def bill_pdf(invoice_no):

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT total, created_at FROM bills WHERE invoice_no=%s", (invoice_no,))
    bill = cur.fetchone()

    cur.execute("""
        SELECT product_name, price, quantity, total
        FROM bill_items
        WHERE invoice_no=%s
    """, (invoice_no,))
    items = cur.fetchall()

    cur.close()
    conn.close()

    html = render_template(
        "bill.html",
        invoice_no=invoice_no,
        bill=bill,
        items=items
    )

    pdf = io.BytesIO()
    pisa.CreatePDF(html, dest=pdf)
    pdf.seek(0)

    return send_file(
        pdf,
        mimetype="application/pdf",
        download_name=f"{invoice_no}.pdf",
        as_attachment=True
    )


#-------BILL DISPLAY_____
@app.route("/bill/<invoice_no>")
def bill_view(invoice_no):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT total, created_at, customer_name
        FROM bills
        WHERE invoice_no=%s
    """, (invoice_no,))
    bill = cur.fetchone()

    cur.execute("""
        SELECT product_name, price, quantity, total
        FROM bill_items
        WHERE invoice_no=%s
    """, (invoice_no,))
    items = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "bill.html",
        invoice_no=invoice_no,
        bill=bill,
        items=items
    )

#---------------INVOICE---------
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

#------------------------
@app.route("/verify-bill", methods=["POST"])
def verify_bill():

    if "cart" not in session or not session["cart"]:
        return redirect(url_for("billing"))

    # Save customer properly
    session["customer"] = {
        "name": request.form.get("customer_name"),
        "phone": request.form.get("customer_phone"),
        "payment_mode": request.form.get("payment_mode")
    }

    session.modified = True

    return redirect(url_for("checkout"))

#---------------SEARCH BILLS---------
@app.route("/bills", methods=["GET", "POST"])
def bills_list():

    conn = get_db_connection()
    cur = conn.cursor()

    search = request.form.get("search")

    if search:
        cur.execute("""
            SELECT invoice_no, customer_name, total, created_at,pdf_path, status
            FROM bills
            WHERE invoice_no ILIKE %s
               OR customer_name ILIKE %s
            ORDER BY created_at DESC
        """, (f"%{search}%", f"%{search}%"))
    else:
        cur.execute("""
            SELECT invoice_no, customer_name, total, created_at,pdf_path, status
            FROM bills
            ORDER BY created_at DESC
        """)

    bills = cur.fetchall()

    cur.close()
    conn.close()

    return render_template("bills_list.html", bills=bills)

#--------------PURCHASE---------
@app.route("/purchase", methods=["GET"])
def purchase():

    conn = get_db_connection()
    cur = conn.cursor()

    # Get categories only for purchase enabled items
    cur.execute("""
        SELECT DISTINCT category
        FROM products
        WHERE is_purchase = TRUE
        ORDER BY category
    """)

    categories = [c[0] for c in cur.fetchall()]

    cur.close()
    conn.close()

    return render_template(
        "purchase.html",
        categories=categories
    )

@app.route("/get-items/<category>")
def get_items(category):

    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT item_code, item_name
        FROM products
        WHERE category = %s
        AND is_purchase = TRUE
        ORDER BY item_name
    """, (category,))

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

    # Insert main purchase
    cur.execute("""
        INSERT INTO purchases
        (supplier_name, total, bill_status, purchase_date)
        VALUES (%s,%s,%s,%s)
        RETURNING id
    """, (supplier, grand_total, bill_status, purchase_date))

    purchase_id = cur.fetchone()[0]

    # Insert items
    for i in range(len(item_codes)):
        cur.execute("""
            INSERT INTO purchase_items
            (purchase_id, item_code, product_name,
             cost_price, quantity, total)
            VALUES (%s,%s,
                    (SELECT item_name FROM products WHERE item_code=%s),
                    %s,%s,%s)
        """, (
            purchase_id,
            item_codes[i],
            item_codes[i],
            costs[i],
            quantities[i],
            totals[i]
        ))

        # Update stock
        cur.execute("""
            UPDATE products
            SET stock = stock + %s
            WHERE item_code = %s
        """, (quantities[i], item_codes[i]))

    conn.commit()
    cur.close()
    conn.close()

    return redirect(url_for("dashboard"))


#---------------------PURCHASE HISTORY-----------
@app.route("/purchase/history")
def purchase_history():
    conn = get_db_connection()
    cur = conn.cursor()

    supplier = request.args.get("supplier")
    purchase_date = request.args.get("purchase_date")

    # 🔹 Get all suppliers for dropdown
    cur.execute("""
        SELECT DISTINCT supplier_name
        FROM purchases
        ORDER BY supplier_name
    """)
    suppliers = [s[0] for s in cur.fetchall()]

    # 🔹 Get dates for selected supplier
    dates = []
    if supplier:
        cur.execute("""
            SELECT DISTINCT purchase_date
            FROM purchases
            WHERE supplier_name=%s
            ORDER BY purchase_date DESC
        """, (supplier,))
        dates = [d[0] for d in cur.fetchall()]

    purchase = None
    items = []

    # 🔹 If both selected → show details
    if supplier and purchase_date:
        cur.execute("""
            SELECT id, total, bill_status, purchase_date
            FROM purchases
            WHERE supplier_name=%s
            AND purchase_date=%s
        """, (supplier, purchase_date))

        purchase = cur.fetchone()

        if purchase:
            purchase_id = purchase[0]

            cur.execute("""
                SELECT product_name, cost_price, quantity, total
                FROM purchase_items
                WHERE purchase_id=%s
            """, (purchase_id,))

            items = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "purchase_history.html",
        suppliers=suppliers,
        dates=dates,
        selected_supplier=supplier,
        selected_date=purchase_date,
        purchase=purchase,
        items=items
    )

# ---------------- PRODUCT MANAGEMENT ---------------

@app.route("/products", methods=["GET", "POST"])
def products():
    conn = get_db_connection()
    cur = conn.cursor()

    # ADD PRODUCT
    if request.method == "POST":
        cur.execute("""
            INSERT INTO products
            (item_code, item_name, category, price, stock, unit)
            VALUES (%s,%s,%s,%s,%s,%s)
        """, (
            request.form["item_code"],
            request.form["item_name"],
            request.form["category"],
            Decimal(request.form["price"]),
            Decimal(request.form["stock"]),
            request.form["unit"]
        ))
        conn.commit()

    # FETCH PRODUCTS
    cur.execute("""
        SELECT item_code, item_name, category, price, stock, unit
        FROM products
        ORDER BY category, item_name
    """)
    items = cur.fetchall()

    cur.close()
    conn.close()

    return render_template("products.html", items=items)

@app.route("/update-product/<item_code>", methods=["POST"])
def update_product(item_code):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        UPDATE products
        SET price=%s, stock=%s
        WHERE item_code=%s
    """, (
        Decimal(request.form["price"]),
        Decimal(request.form["stock"]),
        item_code
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


#------------
def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default

#-----------------PRODUCT FROM-----------------

@app.route("/products/form", methods=["GET"])
def product_form():
    raw_value = request.args.get("product_name")

    product_name = None
    if raw_value:
        product_name = raw_value.split(" – ")[0].strip()

    conn = get_db_connection()
    cur = conn.cursor()

    # fetch categories
    cur.execute("SELECT name FROM category ORDER BY name")
    category = [c[0] for c in cur.fetchall()]

    product = None
    if product_name:
        cur.execute("""
                SELECT
                item_code,        -- 0
                item_name,        -- 1
                category,         -- 2
                unit,             -- 3
                price,            -- 4
                cost_price,       -- 5
                sales_tax,        -- 6
                invoicing_policy, -- 7
                purchase_tax,     -- 8
                purchase_unit,    -- 9
                income_account,   --10
                expense_account,  --11
                description,      --12
                stock,            --13
                is_sale,          --14
                is_purchase,      --15
                is_manufactured,  --16
                company           --17
            FROM products
            WHERE item_name = %s
        """, (product_name,))
        product = cur.fetchone()

    cur.close()
    conn.close()

    return render_template(
        "product_form.html",
        product=product,
        product_name=product_name,
        category=category
    )


#-----------------PRODUCT-FORM-UPDATE--------------------
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
    image_bytes = None
    image_mime = None

    if image_file and image_file.filename:
        image_bytes = image_file.read()
        image_mime = image_file.mimetype

    # ---------- VALIDATION ----------
    if not item_name:
        errors["item_name"] = "Product name is required"
    if not category:
        errors["category"] = "Category is required"
    if not unit:
        errors["unit"] = "Unit is required"
    if not sale_price or not sale_price.replace('.', '', 1).isdigit():
        errors["sale_price"] = "Valid sales price required"
    if not cost_price or not cost_price.replace('.', '', 1).isdigit():
        errors["cost_price"] = "Valid cost price required"

    # ---------- IF ERRORS ----------
    if errors:
        return render_template(
            "product_form.html",
            errors=errors,
            form=request.form,
            product=None if not item_code else ("",)  # keeps edit mode
        )

    conn = get_db_connection()
    cur = conn.cursor()

    # ---------- NEW PRODUCT ----------
    if not item_code:
        item_code = generate_item_code(category, cur)
        cur.execute("""
            INSERT INTO products (
                item_code, item_name, category, unit, stock,
                price, cost_price, sales_tax,
                invoicing_policy, purchase_tax,
                purchase_unit, income_account,
                expense_account, description,company,
                is_sale, is_purchase, is_manufactured,
                product_image, product_image_mime
            )
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s
        """, (
            item_code,
            item_name,
            category,
            unit,
            safe_float(stock),
            safe_float(sale_price),
            safe_float(cost_price),
            safe_float(request.form.get("sales_tax")),
            request.form.get("invoicing_policy"),
            safe_float(request.form.get("purchase_tax")),
            request.form.get("purchase_unit"),
            request.form.get("income_account"),
            request.form.get("expense_account"),
            request.form.get("description"),
            request.form.get("company"),
            is_sale,
            is_purchase,
            is_manufactured,
            image_bytes, image_mime
        ))


    # ---------- UPDATE EXISTING ----------
    else:
        cur.execute("""
            UPDATE products
            SET
                item_name=%s,
                category=%s,
                unit=%s,
                stock=%s,
                price=%s,
                cost_price=%s,
                sales_tax=%s,
                invoicing_policy=%s,
                purchase_tax=%s,
                purchase_unit=%s,
                income_account=%s,
                expense_account=%s,
                description=%s,
                company=%s,
                is_sale=%s,
                is_purchase=%s,
                is_manufactured=%s,
                product_image = %s,
                product_image_mime = %s
            WHERE item_code=%s
        """, (
            item_name,
            category,
            unit,
            safe_float(stock),
            safe_float(sale_price),
            safe_float(cost_price),
            safe_float(request.form.get("sales_tax")),
            request.form.get("invoicing_policy"),
            safe_float(request.form.get("purchase_tax")),
            request.form.get("purchase_unit"),
            request.form.get("income_account"),
            request.form.get("expense_account"),
            request.form.get("description"),
            request.form.get("company"),
            is_sale,
            is_purchase,
            is_manufactured,
            image_bytes, image_mime,
            item_code
        ))

    if image_bytes:
        cur.execute("""
            UPDATE products
            SET product_image=%s,
                product_image_mime=%s
            WHERE item_code=%s
        """, (image_bytes, image_mime, item_code))

    conn.commit()
    cur.close()
    conn.close()

    return redirect(url_for("products"))


# ---------ITEM-code----
def generate_item_code(category, cur):
    prefix = CATEGORY_PREFIX.get(category)

    if not prefix:
        raise ValueError("Invalid category for item code generation")

    # Find max existing code for this prefix
    cur.execute("""
        SELECT item_code
        FROM products
        WHERE item_code LIKE %s
        ORDER BY item_code DESC
        LIMIT 1
    """, (prefix + '%',))

    row = cur.fetchone()

    if row:
        last_code = row[0]  # e.g. C105
        last_number = int(last_code[1:])
        return f"{prefix}{last_number + 1}"
    else:
        # First item in this category
        return f"{prefix}101"

#----------------IMAGE----------
from flask import Response

@app.route("/product-image/<item_code>")
def product_image(item_code):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT product_image, product_image_mime
        FROM products
        WHERE item_code = %s
    """, (item_code,))
    row = cur.fetchone()

    cur.close()
    conn.close()

    if not row or not row[0]:
        return "", 404

    image_data, mime = row
    return Response(image_data, mimetype=mime)

# ----------------REPORTS-------
@app.route("/reports", methods=["GET", "POST"])
def reports():
    conn = get_db_connection()
    cur = conn.cursor()

    # ---------------- DATE INPUT ----------------
    from_date = request.form.get("from_date")
    to_date = request.form.get("to_date")

    # Default: TODAY (keeps existing behavior)
    if not from_date or not to_date:
        date_filter = "DATE(b.created_at) = CURRENT_DATE"
        params = ()
    else:
        date_filter = "DATE(b.created_at) BETWEEN %s AND %s"
        params = (from_date, to_date)

    # ---------------- SUMMARY ----------------
    cur.execute(f"""
        SELECT COUNT(*), COALESCE(SUM(b.total),0)
        FROM bills b
        WHERE {date_filter}
    """, params)
    summary = cur.fetchone()

    # ---------------- CATEGORY SALES ----------------
    cur.execute(f"""
        SELECT p.category, COALESCE(SUM(bi.total),0)
        FROM bill_items bi
        JOIN bills b ON bi.invoice_no = b.invoice_no
        JOIN products p ON bi.product_name = p.item_name
        WHERE {date_filter}
        GROUP BY p.category
        ORDER BY p.category
    """, params)
    category_sales = cur.fetchall()

    # ---------------- ITEM SALES ----------------
    cur.execute(f"""
        SELECT bi.product_name,
               SUM(bi.quantity),
               SUM(bi.total)
        FROM bill_items bi
        JOIN bills b ON bi.invoice_no = b.invoice_no
        WHERE {date_filter}
        GROUP BY bi.product_name
        ORDER BY bi.product_name
    """, params)
    items = cur.fetchall()

    cur.close()
    conn.close()

    return render_template(
        "reports.html",
        summary=summary,
        category_sales=category_sales,
        items=items,
        from_date=from_date,
        to_date=to_date
    )

#---------------Z-REPORT----------
from datetime import datetime

@app.route("/z-report", methods=["GET", "POST"])
def z_report():

    conn = get_db_connection()
    cur = conn.cursor()

    selected_date = request.form.get("report_date")

    if not selected_date:
        selected_date = datetime.now().date()

    # Check if already closed
    cur.execute("""
        SELECT * FROM z_reports
        WHERE report_date=%s
    """, (selected_date,))
    existing = cur.fetchone()

    if existing:
        cur.close()
        conn.close()

        return render_template(
            "z_report.html",
            date=existing[1],  # report_date
            total_bills=existing[2],
            gross_sales=existing[3],
            cash_sales=existing[4],
            upi_sales=existing[5],
            card_sales=existing[6],
            cancelled_sales=existing[7],
            net_sales=existing[8],
            already_generated=True
        )

    # Total bills
    cur.execute("""
        SELECT COUNT(*), COALESCE(SUM(total),0)
        FROM bills
        WHERE DATE(created_at)=%s
        AND status='PAID'
    """, (selected_date,))
    total_bills, gross_sales = cur.fetchone()

    # Cash sales
    cur.execute("""
        SELECT COALESCE(SUM(total),0)
        FROM bills
        WHERE DATE(created_at)=%s
        AND payment_mode='Cash'
        AND status='PAID'
    """, (selected_date,))
    cash_sales = cur.fetchone()[0]

    # UPI sales
    cur.execute("""
        SELECT COALESCE(SUM(total),0)
        FROM bills
        WHERE DATE(created_at)=%s
        AND payment_mode='UPI'
        AND status='PAID'
    """, (selected_date,))
    upi_sales = cur.fetchone()[0]

    # Card sales
    cur.execute("""
        SELECT COALESCE(SUM(total),0)
        FROM bills
        WHERE DATE(created_at)=%s
        AND payment_mode='Card'
        AND status='PAID'
    """, (selected_date,))
    card_sales = cur.fetchone()[0]

    # Cancelled sales
    cur.execute("""
        SELECT COALESCE(SUM(total),0)
        FROM bills
        WHERE DATE(created_at)=%s
        AND status='CANCELLED'
    """, (selected_date,))
    cancelled_sales = cur.fetchone()[0]

    net_sales = gross_sales - cancelled_sales

    # Insert Z report
    cur.execute("""
        INSERT INTO z_reports
        (report_date, total_bills, gross_sales,
         cash_sales, upi_sales, card_sales,
         cancelled_sales, net_sales)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
    """, (
        selected_date,
        total_bills,
        gross_sales,
        cash_sales,
        upi_sales,
        card_sales,
        cancelled_sales,
        net_sales
    ))

    conn.commit()
    cur.close()
    conn.close()

    return render_template(
        "z_report.html",
        date=selected_date,
        total_bills=total_bills,
        gross_sales=gross_sales,
        cash_sales=cash_sales,
        upi_sales=upi_sales,
        card_sales=card_sales,
        cancelled_sales=cancelled_sales,
        net_sales=net_sales
    )

if __name__ == "__main__":
    app.run(debug=True)
