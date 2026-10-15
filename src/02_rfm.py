"""
02_rfm.py

Hitung Recency, Frequency, Monetary per customer dari data bersih hasil
01_load_clean.py, lalu skor tiap dimensi 1-5 pakai quintile, dan mapping ke
nama Segment berdasarkan R_score & F_score (M_score sengaja tidak dipakai
untuk mapping ini — dipakai belakangan untuk lihat nilai per segmen).
"""

from pathlib import Path

import pandas as pd

PATH_BERSIH = Path("data/processed/retail_bersih.parquet")
PATH_OUTPUT = Path("output/rfm_table.csv")

# Snapshot date untuk Recency, sudah dikunci di awal proyek.
SNAPSHOT_DATE = pd.Timestamp("2011-12-10")

# Mapping Segment dari kombinasi (R_score, F_score). Ditulis lewat loop per
# kelompok aturan (bukan if/elif berjenjang) supaya gampang dicocokkan satu-
# satu dengan daftar aturan yang diminta, dan gampang dicek lengkap.
PETA_SEGMEN = {}
for r in (1, 2):
    for f in (1, 2):
        PETA_SEGMEN[(r, f)] = "Hibernating"
    for f in (3, 4):
        PETA_SEGMEN[(r, f)] = "At Risk"
    PETA_SEGMEN[(r, 5)] = "Can't Lose"
for f in (1, 2):
    PETA_SEGMEN[(3, f)] = "About To Sleep"
PETA_SEGMEN[(3, 3)] = "Need Attention"
for r in (3, 4):
    for f in (4, 5):
        PETA_SEGMEN[(r, f)] = "Loyal Customers"
PETA_SEGMEN[(4, 1)] = "Promising"
for r in (4, 5):
    for f in (2, 3):
        PETA_SEGMEN[(r, f)] = "Potential Loyalists"
PETA_SEGMEN[(5, 1)] = "New Customers"
for f in (4, 5):
    PETA_SEGMEN[(5, f)] = "Champions"

# Jaga-jaga: pastikan ke-25 kombinasi R_score x F_score (1-5) sudah
# ke-mapping semua, tidak ada yang celah atau tertimpa aturan lain.
assert len(PETA_SEGMEN) == 25, "Ada kombinasi R_score/F_score yang belum ke-mapping"


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
    # unique" — sesuai daftar bug yang diantisipasi di awal proyek.
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

    # Segment dari kombinasi R_score & F_score.
    rfm["Segment"] = [
        PETA_SEGMEN[(r, f)] for r, f in zip(rfm["R_score"], rfm["F_score"])
    ]

    kolom_output = [
        "CustomerID", "Recency", "Frequency", "Monetary",
        "R_score", "F_score", "M_score", "RFM_score", "Segment",
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

    # Ringkasan per Segment: jumlah & persentase customer, plus persentase
    # dari total Monetary — supaya kelihatan segmen mana yang paling
    # bernilai walau jumlah customernya sedikit.
    total_monetary = rfm["Monetary"].sum()
    ringkasan = rfm.groupby("Segment").agg(
        Jumlah_customer=("CustomerID", "count"),
        Total_monetary=("Monetary", "sum"),
    )
    ringkasan["Persen_customer"] = ringkasan["Jumlah_customer"] / len(rfm) * 100
    ringkasan["Persen_monetary"] = ringkasan["Total_monetary"] / total_monetary * 100
    ringkasan = ringkasan.sort_values("Persen_monetary", ascending=False)

    print("\nRingkasan per Segment (urut dari kontribusi Monetary terbesar):")
    for segmen, baris in ringkasan.iterrows():
        print(
            f"  {segmen}: {baris['Jumlah_customer']:,.0f} customer "
            f"({baris['Persen_customer']:.2f}%), {baris['Persen_monetary']:.2f}% dari total Monetary"
        )


if __name__ == "__main__":
    main()
