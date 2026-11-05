import unittest
import json
import os
from decimal import Decimal
from app import app, get_db_connection

class ComprehensiveAuditTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def setUp(self):
        # Clear cart before each test
        with self.client.session_transaction() as sess:
            sess["cart"] = []
            sess["customer"] = {"name": "", "phone": "", "payment_mode": "Cash"}
            sess["bill_discount"] = {"type": None, "value": 0.0, "amount": 0.0}

    # ========================================================
    # 1. CRITICAL FINANCIAL CALCULATIONS & BILLING
    # ========================================================
    def test_01_normal_bill_no_discount(self):
        """Test Scenario 1: Normal bill without discount"""
        self.client.post('/api/billing/cart/add', json={"item_code": "C101", "quantity": 2})
        res = self.client.get('/api/billing/state')
        data = res.get_json()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(data["subtotal"], 300.0)
        self.assertEqual(data["bill_total"], 300.0)
        self.assertEqual(data["bill_discount"]["amount"], 0.0)
        print("PASS: Financial Test 1 - Normal bill without discount (2 * 150 = 300)")

    def test_02_fixed_monetary_discount(self):
        """Test Scenario 2: Bill with fixed monetary discount"""
        self.client.post('/api/billing/cart/add', json={"item_code": "C101", "quantity": 2}) # 300.0
        # Apply ₹50 fixed discount
        d_res = self.client.post('/api/billing/discount', json={"type": "fixed", "value": 50})
        d_data = d_res.get_json()
        self.assertEqual(d_res.status_code, 200)
        self.assertEqual(d_data["subtotal"], 300.0)
        self.assertEqual(d_data["discount_amount"], 50.0)
        self.assertEqual(d_data["bill_total"], 250.0)
        print("PASS: Financial Test 2 - Fixed discount (300 - 50 = 250)")

    def test_03_percentage_discount(self):
        """Test Scenario 3: Bill with percentage discount"""
        self.client.post('/api/billing/cart/add', json={"item_code": "C101", "quantity": 2}) # 300.0
        # Apply 10% discount
        d_res = self.client.post('/api/billing/discount', json={"type": "percentage", "value": 10})
        d_data = d_res.get_json()
        self.assertEqual(d_res.status_code, 200)
        self.assertEqual(d_data["subtotal"], 300.0)
        self.assertEqual(d_data["discount_amount"], 30.0)
        self.assertEqual(d_data["bill_total"], 270.0)
        print("PASS: Financial Test 3 - Percentage discount (300 - 10% = 270)")

    def test_04_multiple_products_and_quantities(self):
        """Test Scenario 4: Bill with multiple products and different quantities"""
        self.client.post('/api/billing/cart/add', json={"item_code": "C101", "quantity": 2}) # 2 * 150 = 300
        self.client.post('/api/billing/cart/add', json={"item_code": "C130", "quantity": 5}) # 5 * 20 = 100
        res = self.client.get('/api/billing/state')
        data = res.get_json()
        self.assertEqual(data["subtotal"], 400.0)
        self.assertEqual(data["bill_total"], 400.0)
        print("PASS: Financial Test 4 - Multiple products line total summation (300 + 100 = 400)")

    def test_05_decimal_quantities(self):
        """Test Scenario 5: Decimal quantities for weighted products"""
        # D102 (Safavi) is kg unit, price 490/kg. Buy 0.5 kg = 245.0
        self.client.post('/api/billing/cart/add', json={"item_code": "D102", "quantity": 0.5})
        res = self.client.get('/api/billing/state')
        data = res.get_json()
        self.assertEqual(data["subtotal"], 245.0)
        self.assertEqual(data["bill_total"], 245.0)
        print("PASS: Financial Test 5 - Decimal quantity (0.5 kg @ 490 = 245.0)")

    def test_06_price_adjustment_and_auto_quantity(self):
        """Test Scenario 6: Price adjustment and target amount calculation"""
        # Add D102 (Safavi, 490/kg), adjust price to 400
        self.client.post('/api/billing/cart/add', json={"item_code": "D102", "quantity": 1})
        p_res = self.client.post('/api/billing/cart/update-price', json={"index": 0, "price": 400.0})
        self.assertEqual(p_res.get_json()["bill_total"], 400.0)
        # Update quantity to 0.25 (target ₹100 / ₹400 = 0.25 kg)
        q_res = self.client.post('/api/billing/cart/update-qty', json={"index": 0, "quantity": 0.25})
        self.assertEqual(q_res.get_json()["bill_total"], 100.0)
        print("PASS: Financial Test 6 - Price adjustment & auto quantity (0.25 kg @ 400 = 100.0)")

    def test_07_price_adjustment_and_discount_together(self):
        """Test Scenario 7: Price adjustment combined with overall bill discount"""
        self.client.post('/api/billing/cart/add', json={"item_code": "D102", "quantity": 1}) # 490
        self.client.post('/api/billing/cart/update-price', json={"index": 0, "price": 500.0}) # 500
        self.client.post('/api/billing/cart/update-qty', json={"index": 0, "quantity": 2}) # 1000 subtotal
        d_res = self.client.post('/api/billing/discount', json={"type": "percentage", "value": 15})
        d_data = d_res.get_json()
        self.assertEqual(d_data["subtotal"], 1000.0)
        self.assertEqual(d_data["discount_amount"], 150.0)
        self.assertEqual(d_data["bill_total"], 850.0)
        print("PASS: Financial Test 7 - Price adjustment + overall discount together")

    def test_08_invalid_discounts_rejected(self):
        """Test Scenario 8: Validation rejects invalid discounts"""
        self.client.post('/api/billing/cart/add', json={"item_code": "C101", "quantity": 1}) # 150
        # Discount > subtotal (200 > 150)
        res1 = self.client.post('/api/billing/discount', json={"type": "fixed", "value": 200})
        self.assertEqual(res1.status_code, 400)
        # Negative discount
        res2 = self.client.post('/api/billing/discount', json={"type": "fixed", "value": -10})
        self.assertEqual(res2.status_code, 400)
        # Percentage > 100%
        res3 = self.client.post('/api/billing/discount', json={"type": "percentage", "value": 105})
        self.assertEqual(res3.status_code, 400)
        # Percentage < 0%
        res4 = self.client.post('/api/billing/discount', json={"type": "percentage", "value": -5})
        self.assertEqual(res4.status_code, 400)
        print("PASS: Financial Test 8 - Invalid discounts rejected with 400")

    def test_09_discount_equal_to_subtotal(self):
        """Test Scenario 9: 100% discount or discount equal to subtotal produces 0 payable"""
        self.client.post('/api/billing/cart/add', json={"item_code": "C101", "quantity": 1}) # 150
        res = self.client.post('/api/billing/discount', json={"type": "fixed", "value": 150})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["bill_total"], 0.0)
        print("PASS: Financial Test 9 - Discount equal to subtotal yields 0 payable")

    def test_10_hold_and_resume_preserves_discount(self):
        """Test Scenario 10: Parked bill preserves discount and subtotal upon resume"""
        self.client.post('/api/billing/cart/add', json={"item_code": "C101", "quantity": 2}) # 300
        self.client.post('/api/billing/discount', json={"type": "fixed", "value": 30}) # total 270
        h_res = self.client.post('/api/billing/hold')
        self.assertEqual(h_res.status_code, 200)
        hold_id = h_res.get_json()["hold_id"]

        r_res = self.client.post(f'/api/billing/resume/{hold_id}')
        r_data = r_res.get_json()
        self.assertEqual(r_res.status_code, 200)
        self.assertEqual(r_data["subtotal"], 300.0)
        self.assertEqual(r_data["bill_discount"]["amount"], 30.0)
        self.assertEqual(r_data["bill_total"], 270.0)
        print("PASS: Financial Test 10 - Hold and resume preserves discount")

    # ========================================================
    # 2. CHECKOUT & INVOICE RECORD VERIFICATION
    # ========================================================
    def test_11_checkout_with_discount_records_db_and_pdf(self):
        """Test Scenario 11: Checkout records subtotal, discount, net total and generates PDF"""
        self.client.post('/api/billing/cart/add', json={"item_code": "C101", "quantity": 1}) # 150
        self.client.post('/api/billing/discount', json={"type": "fixed", "value": 30}) # 120 net
        chk_res = self.client.post('/api/billing/checkout', json={
            "customer_name": "Audit Test Customer",
            "customer_phone": "9998887776",
            "payment_mode": "Cash"
        })
        self.assertEqual(chk_res.status_code, 200)
        chk_data = chk_res.get_json()
        inv_no = chk_data["invoice_no"]
        self.assertEqual(chk_data["subtotal"], 150.0)
        self.assertEqual(chk_data["discount_amount"], 30.0)
        self.assertEqual(chk_data["total"], 120.0)

        # Verify DB record
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT subtotal, discount_amount, total, status FROM bills WHERE invoice_no = %s", (inv_no,))
        row = cur.fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(float(row[0]), 150.0)
        self.assertEqual(float(row[1]), 30.0)
        self.assertEqual(float(row[2]), 120.0)
        self.assertEqual(row[3], "PAID")

        # Verify bill detail API
        detail_res = self.client.get(f'/api/bills/{inv_no}')
        d_json = detail_res.get_json()
        self.assertEqual(d_json["subtotal"], 150.0)
        self.assertEqual(d_json["discount_amount"], 30.0)
        self.assertEqual(d_json["total"], 120.0)

        # Verify PDF file created on disk
        pdf_rel = chk_data["pdf_url"].lstrip('/')
        self.assertTrue(os.path.exists(pdf_rel), f"PDF file does not exist at {pdf_rel}")
        cur.close()
        conn.close()
        print(f"PASS: Checkout Test 11 - Generated {inv_no} with subtotal 150, discount 30, total 120")

    # ========================================================
    # 3. SECURITY & ACCESS CONTROL (ADMIN VS CASHIER)
    # ========================================================
    def test_12_cashier_mode_restricted_endpoints_return_403(self):
        """Test Scenario 12: Cashier mode is denied access to admin-only endpoints"""
        # Ensure session is not admin
        with self.client.session_transaction() as sess:
            sess["is_admin"] = False
            sess.pop("admin_auth_time", None)

        endpoints = [
            ('/api/reports', 'GET'),
            ('/api/z-report', 'GET'),
            ('/api/expenses', 'GET'),
            ('/api/profit/summary', 'GET'),
            ('/api/profit/report', 'GET'),
            ('/api/payables/summary', 'GET'),
            ('/api/payables/suppliers', 'GET'),
            ('/api/payables/purchases', 'GET'),
        ]
        for url, method in endpoints:
            res = self.client.get(url)
            self.assertEqual(res.status_code, 403, f"Endpoint {url} did not return 403 for Cashier Mode!")
            self.assertEqual(res.get_json().get("code"), "ADMIN_REQUIRED")
        print("PASS: Security Test 12 - All restricted financial endpoints return 403 for Cashier Mode")

    def test_13_admin_mode_unlock_and_lock(self):
        """Test Scenario 13: Admin unlock with valid password grants access, lock revokes access"""
        # Wrong password rejected
        bad_res = self.client.post('/api/auth/unlock-admin', json={"password": "wrong_password_999"})
        self.assertEqual(bad_res.status_code, 401)

        # Correct password accepted (admin123)
        good_res = self.client.post('/api/auth/unlock-admin', json={"password": "admin123"})
        self.assertEqual(good_res.status_code, 200)
        self.assertTrue(good_res.get_json()["is_admin"])

        # Now admin-only endpoint succeeds
        rep_res = self.client.get('/api/reports')
        self.assertEqual(rep_res.status_code, 200)

        # Lock admin
        lock_res = self.client.post('/api/auth/lock-admin')
        self.assertEqual(lock_res.status_code, 200)
        self.assertFalse(lock_res.get_json()["is_admin"])

        # After lock, endpoint returns 403 again
        rep_res2 = self.client.get('/api/reports')
        self.assertEqual(rep_res2.status_code, 403)
        print("PASS: Security Test 13 - Admin unlock, authentication, and lock cycle verified")

    # ========================================================
    # 4. INVOICE DATE FILTERING & COMBINED SEARCH
    # ========================================================
    def test_14_invoice_filtering_combined(self):
        """Test Scenario 14: Invoice filtering with combined search and dates"""
        res = self.client.get('/api/bills?search=Audit Test Customer&payment_mode=Cash')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        bills = data if isinstance(data, list) else data.get("bills", [])
        self.assertGreaterEqual(len(bills), 1)
        self.assertTrue(all("Audit Test Customer" in b["customer_name"] for b in bills))
        print("PASS: Filtering Test 14 - Combined invoice search and payment mode")

if __name__ == '__main__':
    unittest.main()
