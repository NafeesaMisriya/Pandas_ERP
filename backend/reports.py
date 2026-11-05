from db import get_db_connection

def daily_sales():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT DATE(created_at), SUM(total)
        FROM bills
        GROUP BY DATE(created_at)
        ORDER BY DATE(created_at) DESC
    """)
    data = cur.fetchall()
    cur.close()
    conn.close()
    return data
