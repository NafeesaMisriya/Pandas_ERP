import os
import psycopg2

def get_db_connection():
    host = os.environ.get("DB_HOST", "localhost")
    database = os.environ.get("DB_NAME", "pandas")
    user = os.environ.get("DB_USER", "postgres")
    port = int(os.environ.get("DB_PORT", 5432))

    candidate_passwords = []
    if os.environ.get("DB_PASSWORD"):
        candidate_passwords.append(os.environ.get("DB_PASSWORD"))
    candidate_passwords.extend(["postgres", "Postgres123"])

    last_error = None
    for pwd in candidate_passwords:
        try:
            return psycopg2.connect(
                host=host,
                database=database,
                user=user,
                password=pwd,
                port=port
            )
        except Exception as e:
            last_error = e
            continue

    if last_error:
        raise last_error
