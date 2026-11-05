import sys
import unittest
from datetime import datetime, date
from app import app, get_db_connection

class TestInvoiceFiltering(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()

    def test_01_search_by_invoice_id(self):
        """Test 1: Search by Invoice ID / Invoice Number"""
        res = self.client.get('/api/bills?search=INV-2026-00024')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        bills = data if isinstance(data, list) else data.get('bills', [])
        self.assertGreaterEqual(len(bills), 1)
        self.assertTrue(any(b['invoice_no'] == 'INV-2026-00024' for b in bills))
        print("PASS: Test 1 - Search by invoice ID")

    def test_02_search_by_customer_name(self):
        """Test 2: Search by customer name"""
        res = self.client.get('/api/bills?search=basheer')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        bills = data if isinstance(data, list) else data.get('bills', [])
        self.assertGreaterEqual(len(bills), 1)
        self.assertTrue(all('basheer' in b['customer_name'].lower() for b in bills))
        print("PASS: Test 2 - Search by customer name")

    def test_02b_search_by_phone(self):
        """Test 2b: Search by customer phone number"""
        res = self.client.get('/api/bills?search=9847345005')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        bills = data if isinstance(data, list) else data.get('bills', [])
        self.assertGreaterEqual(len(bills), 1)
        self.assertTrue(any('9847345005' in b.get('customer_phone', '') for b in bills))
        print("PASS: Test 2b - Search by phone number")

    def test_03_filter_by_single_date(self):
        """Test 3: Filter by a specific invoice date"""
        today_str = datetime.now().strftime("%Y-%m-%d")
        res = self.client.get(f'/api/bills?date={today_str}')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        bills = data if isinstance(data, list) else data.get('bills', [])
        self.assertGreaterEqual(len(bills), 1)
        today_display = datetime.now().strftime("%d-%m-%Y")
        for b in bills:
            self.assertTrue(b['created_at'].startswith(today_display))
        print(f"PASS: Test 3 - Filter by single date ({today_str}): found {len(bills)} bills")

    def test_04_filter_by_date_range(self):
        """Test 4: Filter by date range (inclusive)"""
        from_d = "2026-11-01"
        to_d = datetime.now().strftime("%Y-%m-%d")
        res = self.client.get(f'/api/bills?from_date={from_d}&to_date={to_d}')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        bills = data if isinstance(data, list) else data.get('bills', [])
        self.assertGreaterEqual(len(bills), 1)
        print(f"PASS: Test 4 - Filter by date range ({from_d} to {to_d}): found {len(bills)} bills")

    def test_05_combine_customer_search_and_date_filtering(self):
        """Test 5: Combine customer search and date filtering"""
        today_str = datetime.now().strftime("%Y-%m-%d")
        res = self.client.get(f'/api/bills?search=rabeeh&date={today_str}')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        bills = data if isinstance(data, list) else data.get('bills', [])
        self.assertGreaterEqual(len(bills), 1)
        self.assertTrue(all('rabeeh' in b['customer_name'].lower() for b in bills))
        print("PASS: Test 5 - Combine customer search and date filtering")

    def test_06_reset_filters(self):
        """Test 6: Reset filters returns full unfiltered invoice list"""
        # Unfiltered query
        res_all = self.client.get('/api/bills')
        self.assertEqual(res_all.status_code, 200)
        data_all = res_all.get_json()
        bills_all = data_all if isinstance(data_all, list) else data_all.get('bills', [])

        # Filtered query
        res_filtered = self.client.get('/api/bills?search=nonexistent_xyz_123')
        data_filtered = res_filtered.get_json()
        bills_filtered = data_filtered if isinstance(data_filtered, list) else data_filtered.get('bills', [])
        self.assertEqual(len(bills_filtered), 0)

        # "Reset" by querying /api/bills again without filters
        res_reset = self.client.get('/api/bills')
        data_reset = res_reset.get_json()
        bills_reset = data_reset if isinstance(data_reset, list) else data_reset.get('bills', [])
        self.assertEqual(len(bills_reset), len(bills_all))
        self.assertGreaterEqual(len(bills_reset), 1)
        print(f"PASS: Test 6 - Reset filters (all {len(bills_reset)} bills restored)")

    def test_07_pagination_with_filtered_results(self):
        """Test 7: Pagination with filtered results"""
        today_str = datetime.now().strftime("%Y-%m-%d")
        # Request page 1 with page_size=2
        res = self.client.get(f'/api/bills?date={today_str}&page=1&page_size=2')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIsInstance(data, dict)
        self.assertIn('bills', data)
        self.assertIn('total', data)
        self.assertIn('page', data)
        self.assertIn('page_size', data)
        self.assertIn('total_pages', data)
        self.assertEqual(data['page'], 1)
        self.assertEqual(data['page_size'], 2)
        self.assertLessEqual(len(data['bills']), 2)
        print(f"PASS: Test 7 - Pagination (total: {data['total']}, page: {data['page']}, page_size: {data['page_size']}, total_pages: {data['total_pages']})")

    def test_08_empty_search_results(self):
        """Test 8: Empty search results handled gracefully"""
        res = self.client.get('/api/bills?search=NOT_AN_INVOICE_XYZ_999999')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        bills = data if isinstance(data, list) else data.get('bills', [])
        self.assertEqual(len(bills), 0)

        # Empty search with pagination
        res_paged = self.client.get('/api/bills?search=NOT_AN_INVOICE_XYZ_999999&page=1&page_size=10')
        self.assertEqual(res_paged.status_code, 200)
        data_paged = res_paged.get_json()
        self.assertEqual(data_paged['total'], 0)
        self.assertEqual(len(data_paged['bills']), 0)
        print("PASS: Test 8 - Empty search results returned empty array/total 0 cleanly")

if __name__ == '__main__':
    unittest.main()

