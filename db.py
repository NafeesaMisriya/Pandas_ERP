import psycopg2

def get_db_connection():
    return psycopg2.connect(
        host="localhost",
        database="pandas",
        user="postgres",
        password="Postgres123",
        port=5432
    )
