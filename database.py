import sqlite3
conn=sqlite3.connect("FieldScan.db")
cursor=conn.cursor()

cursor.execute("""
        CREATE TABLE IF NOT EXISTS leaf_scans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id INTEGER NOT NULL,
                user_name TEXT,
                image_filename TEXT,
                image_path TEXT,
                crop TEXT,
                field TEXT,
                disease TEXT,
                confidence REAL,
                latin TEXT,
                spread_risk TEXT,
                note TEXT,
                treatment TEXT,
                top5 TEXT
        )
        
        """)


