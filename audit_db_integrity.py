from app import get_db_connection

def run_db_integrity_audit():
    conn = get_db_connection()
    cur = conn.cursor()
    findings = []

    print("=== 1. CHECK BILLS VS BILL_ITEMS TOTALS ===")
    cur.execute("""
        SELECT b.invoice_no, b.total, b.status, 
               COALESCE(SUM(bi.total), 0) AS items_sum
        FROM bills b
        LEFT JOIN bill_items bi ON b.invoice_no = bi.invoice_no
        GROUP BY b.invoice_no, b.total, b.status
        ORDER BY b.invoice_no;
    """)
    rows = cur.fetchall()
    for inv, total, status, items_sum in rows:
        diff = abs(float(total) - float(items_sum))
        if diff > 0.05:
            findings.append(f"Bill Total Mismatch: Invoice {inv} has total={total}, items_sum={items_sum}, diff={diff}")
    print(f"Checked {len(rows)} bills.")

    print("=== 2. CHECK ORPHANED BILL_ITEMS ===")
    cur.execute("""
        SELECT bi.invoice_no, bi.product_name
        FROM bill_items bi
        LEFT JOIN bills b ON bi.invoice_no = b.invoice_no
        WHERE b.invoice_no IS NULL;
    """)
    orphaned_bi = cur.fetchall()
    if orphaned_bi:
        findings.append(f"Orphaned bill_items found: {len(orphaned_bi)} records: {orphaned_bi}")
    else:
        print("Zero orphaned bill_items.")

    print("=== 3. CHECK ORPHANED PURCHASE_ITEMS ===")
    cur.execute("""
        SELECT pi.id, pi.purchase_id, pi.product_name
        FROM purchase_items pi
        LEFT JOIN purchases p ON pi.purchase_id = p.id
        WHERE p.id IS NULL;
    """)
    orphaned_pi = cur.fetchall()
    if orphaned_pi:
        findings.append(f"Orphaned purchase_items found: {len(orphaned_pi)} records")
    else:
        print("Zero orphaned purchase_items.")

    print("=== 4. CHECK PURCHASES TOTAL VS PAID + OUTSTANDING ===")
    cur.execute("""
        SELECT id, supplier_name, total, paid_amount, 
               COALESCE(total - paid_amount, 0) as expected_outstanding,
               payment_status
        FROM purchases
        ORDER BY id;
    """)
    purchases = cur.fetchall()
    for pid, sname, total, paid, exp_out, pstatus in purchases:
        cur.execute("SELECT COALESCE(SUM(amount), 0) FROM purchase_payments WHERE purchase_id = %s", (pid,))
        actual_payments = float(cur.fetchone()[0])
        paid = float(paid or 0)
        total = float(total or 0)
        if abs(paid - actual_payments) > 0.05 and actual_payments > 0:
            findings.append(f"Purchase {pid}: paid_amount ({paid}) != recorded payments sum ({actual_payments})")
    print(f"Checked {len(purchases)} purchases.")

    print("=== 5. CHECK DUPLICATE CUSTOMER / SUPPLIER IDS ===")
    cur.execute("SELECT customer_id, COUNT(*) FROM customers GROUP BY customer_id HAVING COUNT(*) > 1")
    dup_cust = cur.fetchall()
    if dup_cust:
        findings.append(f"Duplicate customer_ids found: {dup_cust}")
    else:
        print("Zero duplicate customer_ids.")

    cur.execute("SELECT supplier_id, COUNT(*) FROM suppliers GROUP BY supplier_id HAVING COUNT(*) > 1")
    dup_supp = cur.fetchall()
    if dup_supp:
        findings.append(f"Duplicate supplier_ids found: {dup_supp}")
    else:
        print("Zero duplicate supplier_ids.")

    print("=== 6. CHECK PRODUCTS DATA INTEGRITY ===")
    cur.execute("SELECT item_code, item_name, price, cost_price, unit, stock FROM products WHERE price < 0 OR cost_price < 0")
    neg_price = cur.fetchall()
    if neg_price:
        findings.append(f"Negative price or cost in products: {neg_price}")
    else:
        print("Zero negative price/costs in products.")

    cur.execute("SELECT item_code, COUNT(*) FROM products GROUP BY item_code HAVING COUNT(*) > 1")
    dup_products = cur.fetchall()
    if dup_products:
        findings.append(f"Duplicate product item_codes: {dup_products}")
    else:
        print("Zero duplicate product item_codes.")

    print("=== 7. CHECK BILL_ITEMS COST_AT_SALE ===")
    cur.execute("""
        SELECT COUNT(*), 
               COUNT(*) FILTER (WHERE cost_at_sale IS NULL OR cost_at_sale = 0) as missing_cost
        FROM bill_items
    """)
    bi_cost = cur.fetchone()
    print(f"Bill items total: {bi_cost[0]}, missing or zero cost_at_sale: {bi_cost[1]}")

    print("=== 8. CHECK ADMIN SETTINGS & SECURITY ===")
    cur.execute("SELECT key, length(value), updated_at FROM app_settings")
    settings = cur.fetchall()
    print(f"App settings: {settings}")

    print("\n--- AUDIT FINDINGS ---")
    if not findings:
        print("ALL DATABASE INTEGRITY CHECKS PASSED WITH ZERO VIOLATIONS!")
    else:
        for f in findings:
            print("[FINDING]", f)

    cur.close()
    conn.close()

if __name__ == "__main__":
    run_db_integrity_audit()
