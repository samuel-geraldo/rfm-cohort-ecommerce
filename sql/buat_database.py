"""
buat_database.py

Muat data bersih (parquet, hasil src/01_load_clean.py) ke database PostgreSQL
supaya bisa dipakai queries.sql. Satu tabel: transactions.

Koneksi dibaca dari environment variable standar PostgreSQL (PGHOST, PGPORT,
PGDATABASE, PGUSER, PGPASSWORD). Tidak ada kredensial di kode maupun di repo.
Kalau PGPASSWORD tidak diisi, psycopg memakai file pgpass bawaan PostgreSQL.
Nilai bawaan kalau variabel tidak diisi: localhost:5432, database "retail",
user "postgres".

Kolom "Customer ID" (ada spasi di parquet) di-rename jadi CustomerID saat
disimpan, supaya queries.sql tidak perlu quoting nama kolom terus-menerus —
konsisten dengan penamaan yang sudah dipakai di 02_rfm.py & 04_churn_geo.py.
PostgreSQL menyimpan nama tanpa tanda kutip dalam huruf kecil, jadi kolomnya
bernama customerid di database (queries.sql tetap boleh menulis CustomerID).
"""

import io
import os
from pathlib import Path

import pandas as pd
import psycopg

PATH_BERSIH = Path("data/processed/retail_bersih.parquet")

# Jumlah baris per kiriman ke COPY, supaya CSV di memori tidak menumpuk.
UKURAN_POTONGAN = 100_000

# Skema eksplisit. Beda dengan versi SQLite, InvoiceDate sekarang bertipe
# TIMESTAMP asli (bukan TEXT ISO), jadi queries.sql tidak butuh julianday()
# atau strftime() — selisih dan grouping tanggal memakai fungsi bawaan
# PostgreSQL.
SQL_BUAT_TABEL = """
CREATE TABLE transactions (
    Invoice      TEXT             NOT NULL,
    StockCode    TEXT             NOT NULL,
    Description  TEXT,
    Quantity     INTEGER          NOT NULL,
    InvoiceDate  TIMESTAMP        NOT NULL,
    Price        DOUBLE PRECISION NOT NULL,
    CustomerID   INTEGER          NOT NULL,
    Country      TEXT             NOT NULL,
    Revenue      DOUBLE PRECISION NOT NULL
)
"""

URUTAN_KOLOM = [
    "Invoice", "StockCode", "Description", "Quantity", "InvoiceDate",
    "Price", "CustomerID", "Country", "Revenue",
]


def buka_koneksi() -> psycopg.Connection:
    """Buka koneksi dari environment variable (lihat docstring modul)."""
    return psycopg.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=os.environ.get("PGPORT", "5432"),
        dbname=os.environ.get("PGDATABASE", "retail"),
        user=os.environ.get("PGUSER", "postgres"),
    )


def main() -> None:
    df = pd.read_parquet(PATH_BERSIH)
    print(f"Baris data bersih dibaca: {len(df):,}")

    df = df.rename(columns={"Customer ID": "CustomerID"})[URUTAN_KOLOM]

    with buka_koneksi() as koneksi:
        with koneksi.cursor() as kursor:
            # Bangun ulang dari nol supaya skrip aman dijalankan berulang.
            kursor.execute("DROP TABLE IF EXISTS transactions")
            kursor.execute(SQL_BUAT_TABEL)

            # COPY jauh lebih cepat daripada INSERT per baris untuk ~777 ribu baris.
            with kursor.copy(
                "COPY transactions FROM STDIN WITH (FORMAT csv)"
            ) as salin:
                for awal in range(0, len(df), UKURAN_POTONGAN):
                    potongan = df.iloc[awal:awal + UKURAN_POTONGAN]
                    buffer = io.StringIO()
                    potongan.to_csv(buffer, index=False, header=False)
                    salin.write(buffer.getvalue())

            # Index dasar buat query yang banyak group-by/join per customer.
            kursor.execute("CREATE INDEX idx_customer ON transactions (CustomerID)")
            kursor.execute("CREATE INDEX idx_invoice ON transactions (Invoice)")
            # Perbarui statistik supaya perencana query punya data yang segar.
            kursor.execute("ANALYZE transactions")

            # Verifikasi: hitung baris, customer unik, dan total revenue
            # langsung dari PostgreSQL.
            kursor.execute(
                "SELECT COUNT(*), COUNT(DISTINCT CustomerID), SUM(Revenue) "
                "FROM transactions"
            )
            jumlah_baris, jumlah_customer, total_revenue = kursor.fetchone()

    print(f"Disimpan ke tabel transactions di database {os.environ.get('PGDATABASE', 'retail')}")
    print(f"Verifikasi tabel transactions: {jumlah_baris:,} baris, {jumlah_customer:,} customer unik")
    assert jumlah_baris == len(df), "Jumlah baris di PostgreSQL tidak cocok dengan parquet"
    # Selisih kecil wajar: penjumlahan bilangan desimal bisa beda urutan.
    assert abs(total_revenue - df["Revenue"].sum()) < 0.01, "Total revenue tidak cocok dengan parquet"


if __name__ == "__main__":
    main()
