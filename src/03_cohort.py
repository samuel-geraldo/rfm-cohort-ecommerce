"""
03_cohort.py

Bangun cohort matrix (retention rate customer per bulan sejak bulan
pembelian pertamanya) dari data bersih hasil 01_load_clean.py.

Retained (definisi yang dikunci di CLAUDE.md): customer yang belanja lagi
di bulan ke-n setelah bulan pertama.
"""

from pathlib import Path

import pandas as pd

PATH_BERSIH = Path("data/processed/retail_bersih.parquet")
PATH_OUTPUT = Path("output/cohort_matrix.csv")


def main() -> None:
    df = pd.read_parquet(PATH_BERSIH)
    print(f"Baris data bersih dibaca: {len(df):,}")

    # 2. cohort_month: bulan transaksi pertama tiap customer (format YYYY-MM).
    df["order_month"] = df["InvoiceDate"].dt.to_period("M")
    df["cohort_month"] = df.groupby("Customer ID")["order_month"].transform("min")

    # 3. cohort_index: selisih bulan antara bulan transaksi dan cohort_month
    # customernya (0 = bulan pertama, 1 = bulan berikutnya, dst). Dihitung
    # manual dari tahun & bulan (bukan (order_month - cohort_month).n)
    # supaya jelas satuannya bulan kalender, bukan hari.
    selisih_tahun = df["order_month"].dt.year - df["cohort_month"].dt.year
    selisih_bulan = df["order_month"].dt.month - df["cohort_month"].dt.month
    df["cohort_index"] = selisih_tahun * 12 + selisih_bulan

    # 4. Jumlah customer unik per kombinasi (cohort_month, cohort_index).
    cohort_data = (
        df.groupby(["cohort_month", "cohort_index"])["Customer ID"]
        .nunique()
        .reset_index()
    )

    # cohort_month di-cast ke str dulu sebelum pivot. Kalau cohort_month
    # dibiarkan bertipe Period dan pivot dipanggil tanpa `values` eksplisit
    # (mis. lewat pivot_table setelah groupby.agg({...})), hasilnya
    # MultiIndex kolom (level pertama nama kolom value, level kedua
    # cohort_index) — sesuai bug watchlist di CLAUDE.md, sudah dicoba dan
    # kejadian nyata saat development. Pakai .pivot() dengan `values`
    # eksplisit menghindari itu, hasilnya tetap kolom flat.
    cohort_data["cohort_month"] = cohort_data["cohort_month"].astype(str)
    cohort_matrix = cohort_data.pivot(
        index="cohort_month", columns="cohort_index", values="Customer ID"
    )
    assert not isinstance(cohort_matrix.columns, pd.MultiIndex), "Kolom cohort matrix jadi MultiIndex"

    # 5. Retention rate (%): tiap baris dibagi ukuran cohort di cohort_index 0.
    ukuran_cohort = cohort_matrix[0]
    retention = cohort_matrix.divide(ukuran_cohort, axis=0) * 100

    # 6. Simpan retention rate ke CSV.
    PATH_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    retention.round(2).to_csv(PATH_OUTPUT)
    print(f"Disimpan ke {PATH_OUTPUT} ({retention.shape[0]} cohort x {retention.shape[1]} cohort_index)")

    # 7. Ukuran tiap cohort + retention rata-rata bulan ke-1 & ke-3.
    print("\nUkuran tiap cohort (cohort_index 0):")
    for bulan, ukuran in ukuran_cohort.items():
        print(f"  {bulan}: {ukuran:,.0f} customer")

    retensi_bulan_1 = retention[1].mean()
    retensi_bulan_3 = retention[3].mean()
    print(f"\nRetention rate rata-rata bulan ke-1 (across semua cohort): {retensi_bulan_1:.2f}%")
    print(f"Retention rate rata-rata bulan ke-3 (across semua cohort): {retensi_bulan_3:.2f}%")


if __name__ == "__main__":
    main()
