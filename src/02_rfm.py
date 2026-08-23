"""
02_rfm.py

Hitung Recency, Frequency, Monetary per customer dari data bersih hasil
01_load_clean.py, lalu skor tiap dimensi 1-5 pakai quintile.

Mapping RFM_score ke nama segmen (Champions, Loyal, dst) BELUM dibuat di
sini — distribusi RFM_score dicetak dulu ke terminal supaya mapping-nya
bisa didiskusikan berdasarkan data, bukan ditebak di awal.
"""

from pathlib import Path

import pandas as pd

PATH_BERSIH = Path("data/processed/retail_bersih.parquet")
PATH_OUTPUT = Path("output/rfm_table.csv")

# Snapshot date untuk Recency, sudah dikunci di CLAUDE.md.
SNAPSHOT_DATE = pd.Timestamp("2011-12-10")


def main() -> None:
    df = pd.read_parquet(PATH_BERSIH)
    print(f"Baris data bersih dibaca: {len(df):,}")

    # Recency  : hari sejak transaksi terakhir tiap customer.
    # Frequency: jumlah invoice unik (bukan jumlah baris/item per invoice).
    # Monetary : total Revenue.
    rfm = (
        df.groupby("Customer ID")
        .agg(
            Recency=("InvoiceDate", lambda tgl: (SNAPSHOT_DATE - tgl.max()).days),
            Frequency=("Invoice", "nunique"),
            Monetary=("Revenue", "sum"),
        )
        .reset_index()
        .rename(columns={"Customer ID": "CustomerID"})
    )
    print(f"Jumlah customer unik: {len(rfm):,}")

    # Skor 1-5 pakai quintile (qcut). rank(method='first') dipakai dulu
    # sebelum qcut supaya nilai yang menumpuk (terutama Frequency, banyak
    # customer yang cuma belanja 1x) tidak bikin error "Bin edges must be
    # unique" — sesuai bug watchlist di CLAUDE.md.
    #
    # Recency  : makin kecil (belanja baru-baru ini) makin bagus -> label dibalik.
    rfm["R_score"] = pd.qcut(
        rfm["Recency"].rank(method="first"), 5, labels=[5, 4, 3, 2, 1]
    ).astype(int)
    # Frequency & Monetary: makin besar makin bagus -> label naik.
    rfm["F_score"] = pd.qcut(
        rfm["Frequency"].rank(method="first"), 5, labels=[1, 2, 3, 4, 5]
    ).astype(int)
    rfm["M_score"] = pd.qcut(
        rfm["Monetary"].rank(method="first"), 5, labels=[1, 2, 3, 4, 5]
    ).astype(int)

    # Gabungan tiga skor jadi satu string, mis. "543".
    rfm["RFM_score"] = (
        rfm["R_score"].astype(str) + rfm["F_score"].astype(str) + rfm["M_score"].astype(str)
    )

    kolom_output = [
        "CustomerID", "Recency", "Frequency", "Monetary",
        "R_score", "F_score", "M_score", "RFM_score",
    ]
    rfm = rfm[kolom_output]

    PATH_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    rfm.to_csv(PATH_OUTPUT, index=False)
    print(f"Disimpan ke {PATH_OUTPUT} ({len(rfm):,} baris)")

    # Distribusi RFM_score gabungan — bahan diskusi sebelum mapping ke
    # nama segmen dibuat.
    print("\nDistribusi RFM_score (belum di-mapping ke nama segmen):")
    distribusi = rfm["RFM_score"].value_counts().sort_values(ascending=False)
    for skor, jumlah in distribusi.items():
        persen = jumlah / len(rfm) * 100
        print(f"  {skor}: {jumlah:,} customer ({persen:.2f}%)")


if __name__ == "__main__":
    main()
