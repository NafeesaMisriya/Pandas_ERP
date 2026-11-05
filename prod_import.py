import csv
from db import get_db_connection

def get_category(item_code):
    prefix = item_code[0].upper()
    return {
        "N": "Nuts",
        "C": "Chocolates",
        "D": "Dates",
        "F": "Dry Fruits",
        "W": "Drinks",
        "M": "Mill Products"
    }.get(prefix, "Others")

conn = get_db_connection()
cur = conn.cursor()

with open("products.csv", newline="", encoding="utf-8") as file:
    reader = csv.DictReader(file)
    for row in reader:
        category = row.get("category") or get_category(row["item_code"])

        cur.execute("""
            INSERT INTO products
            (item_code, item_name, category, price, stock, unit)
            VALUES (%s,%s,%s,%s,%s,%s)
            ON CONFLICT (item_code) DO NOTHING
        """, (
            row["item_code"],
            row["item_name"],
            category,
            float(row["price"]),
            float(row["stock"]),
            row["unit"]
        ))

conn.commit()
cur.close()
conn.close()

print("✅ Products imported successfully")
