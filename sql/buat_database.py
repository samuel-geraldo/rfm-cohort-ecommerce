"""
buat_database.py

Muat data bersih (parquet, hasil src/01_load_clean.py) ke database SQLite
(sql/retail.db) supaya bisa dipakai queries.sql. Satu tabel: transactions.

Kolom "Customer ID" (ada spasi di parquet) di-rename jadi "CustomerID" saat
disimpan ke SQLite, supaya queries.sql tidak perlu quoting nama kolom
terus-terusan — konsisten dengan penamaan yang sudah dipakai di
02_rfm.py & 04_churn_geo.py.
"""

import sqlite3
from pathlib import Path

import pandas as pd

PATH_BERSIH = Path("data/processed/retail_bersih.parquet")
PATH_DB = Path("sql/retail.db")


def main() -> None:
    df = pd.read_parquet(PATH_BERSIH)
    print(f"Baris data bersih dibaca: {len(df):,}")

    df = df.rename(columns={"Customer ID": "CustomerID"})

    # InvoiceDate disimpan sqlite3 sebagai TEXT format ISO (default adapter
    # pandas/sqlite3) — SQLite tidak punya tipe date native, jadi queries.sql
    # pakai julianday()/strftime() di atas kolom TEXT ini.
    PATH_DB.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(PATH_DB) as koneksi:
        df.to_sql("transactions", koneksi, if_exists="replace", index=False)

        # Index dasar buat query yang banyak group-by/join per customer.
        koneksi.execute("CREATE INDEX IF NOT EXISTS idx_customer ON transactions (CustomerID)")
        koneksi.execute("CREATE INDEX IF NOT EXISTS idx_invoice ON transactions (Invoice)")

        # Verifikasi: hitung baris & customer unik langsung dari SQLite.
        jumlah_baris = koneksi.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
        jumlah_customer = koneksi.execute(
            "SELECT COUNT(DISTINCT CustomerID) FROM transactions"
        ).fetchone()[0]

    print(f"Disimpan ke {PATH_DB}")
    print(f"Verifikasi tabel transactions: {jumlah_baris:,} baris, {jumlah_customer:,} customer unik")
    assert jumlah_baris == len(df), "Jumlah baris di SQLite tidak cocok dengan parquet"


if __name__ == "__main__":
    main()
