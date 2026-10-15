"""
04_churn_geo.py

Validasi ambang churn 180 hari (dari definisi awal proyek) lewat distribusi interval
antar-order repeat customer, tandai status Churned/Active di
output/rfm_table.csv, bandingkan UK vs non-UK, dan uji-t rata-rata order
value antara customer Churned vs Active.

Geografis: UK vs non-UK saja (sesuai definisi yang dikunci di awal proyek) —
tidak dipecah jadi banyak negara karena sampelnya timpang (UK dominan).
"""

from pathlib import Path

import pandas as pd
from scipy import stats

PATH_BERSIH = Path("data/processed/retail_bersih.parquet")
PATH_RFM = Path("output/rfm_table.csv")
PATH_OUTPUT = Path("output/churn_summary.csv")

SNAPSHOT_DATE = pd.Timestamp("2011-12-10")
AMBANG_CHURN_AWAL = 180  # hari, dari definisi awal proyek — divalidasi di bawah


def main() -> None:
    df = pd.read_parquet(PATH_BERSIH)
    print(f"Baris data bersih dibaca: {len(df):,}")

    # 1. Interval hari antar-order berurutan, khusus repeat customer.
    # Satu invoice = satu order; ambil tanggal per invoice (bukan per baris
    # item), urutkan per customer, lalu groupby + diff.
    order = df.groupby(["Customer ID", "Invoice"])["InvoiceDate"].min().reset_index()
    order = order.sort_values(["Customer ID", "InvoiceDate"])
    order["interval_hari"] = order.groupby("Customer ID")["InvoiceDate"].diff().dt.days

    interval = order["interval_hari"].dropna()
    jumlah_customer = order["Customer ID"].nunique()
    jumlah_repeat_customer = order.loc[order["interval_hari"].notna(), "Customer ID"].nunique()
    print(
        f"\nRepeat customer (>=2 invoice): {jumlah_repeat_customer:,} dari {jumlah_customer:,} customer"
    )
    print(f"Jumlah interval antar-order yang dihitung: {len(interval):,}")

    # 2. Distribusi interval (persentil 25/50/75/90).
    persentil = interval.quantile([0.25, 0.50, 0.75, 0.90])
    print("\nDistribusi interval antar-order (hari):")
    for p, nilai in persentil.items():
        print(f"  P{int(p * 100)}: {nilai:.0f} hari")

    # 3. Validasi ambang churn 180 hari berdasarkan distribusi di atas.
    proporsi_lebih_180 = (interval > AMBANG_CHURN_AWAL).mean() * 100
    persentil_90 = persentil[0.90]
    print(f"\nProporsi interval antar-order > {AMBANG_CHURN_AWAL} hari: {proporsi_lebih_180:.2f}%")

    if proporsi_lebih_180 <= 10:
        ambang_churn = AMBANG_CHURN_AWAL
        keputusan = (
            f"DIPERTAHANKAN di {AMBANG_CHURN_AWAL} hari. P90 interval antar-order repeat "
            f"customer cuma {persentil_90:.0f} hari, jauh di bawah {AMBANG_CHURN_AWAL} hari, dan "
            f"cuma {proporsi_lebih_180:.2f}% interval yang melebihi {AMBANG_CHURN_AWAL} hari. Artinya "
            f"{AMBANG_CHURN_AWAL} hari cukup longgar untuk tidak salah menandai customer yang siklus "
            "belanjanya memang panjang tapi masih wajar sebagai churn, sekaligus masih menangkap "
            "kasus jeda beli yang benar-benar ekstrem (long tail di atas P90/P95)."
        )
    else:
        ambang_churn = persentil_90
        keputusan = (
            f"DIGANTI dari {AMBANG_CHURN_AWAL} hari ke P90 = {ambang_churn:.0f} hari. "
            f"{proporsi_lebih_180:.2f}% interval antar-order repeat customer sudah melebihi "
            f"{AMBANG_CHURN_AWAL} hari, artinya ambang segitu terlalu ketat dan akan menandai banyak "
            "customer yang sebenarnya masih repeat order secara wajar sebagai churn."
        )
    print(f"\nKEPUTUSAN ambang churn: {keputusan}")

    # 4. Tandai Churned/Active di output/rfm_table.csv pakai ambang final.
    # (Recency di rfm_table.csv sudah dihitung dari SNAPSHOT_DATE yang sama
    # di 02_rfm.py, jadi tinggal dibandingkan langsung.)
    rfm = pd.read_csv(PATH_RFM)
    rfm["ChurnStatus"] = ["Churned" if r > ambang_churn else "Active" for r in rfm["Recency"]]
    rfm.to_csv(PATH_RFM, index=False)

    jumlah_churned = (rfm["ChurnStatus"] == "Churned").sum()
    jumlah_active = (rfm["ChurnStatus"] == "Active").sum()
    print(
        f"\n{PATH_RFM} diupdate dengan kolom ChurnStatus: "
        f"{jumlah_churned:,} Churned ({jumlah_churned / len(rfm) * 100:.2f}%), "
        f"{jumlah_active:,} Active ({jumlah_active / len(rfm) * 100:.2f}%)"
    )

    # Data level customer buat langkah 5-7: negara, frequency, average
    # order value (total Revenue / jumlah invoice).
    customer_level = (
        df.groupby("Customer ID")
        .agg(
            Country=("Country", "first"),
            Frequency=("Invoice", "nunique"),
            Total_Revenue=("Revenue", "sum"),
        )
        .reset_index()
        .rename(columns={"Customer ID": "CustomerID"})
    )
    customer_level["AverageOrderValue"] = customer_level["Total_Revenue"] / customer_level["Frequency"]
    customer_level["GeoGroup"] = customer_level["Country"].apply(
        lambda negara: "UK" if negara == "United Kingdom" else "Non-UK"
    )
    customer_level = customer_level.merge(rfm[["CustomerID", "ChurnStatus"]], on="CustomerID")

    # 5. Bandingkan UK vs non-UK.
    ringkasan_geo = customer_level.groupby("GeoGroup").agg(
        Jumlah_customer=("CustomerID", "count"),
        Rata2_order_value=("AverageOrderValue", "mean"),
        Rata2_frequency=("Frequency", "mean"),
    )
    print("\nPerbandingan UK vs non-UK:")
    for grup, baris in ringkasan_geo.iterrows():
        print(
            f"  {grup}: {baris['Jumlah_customer']:,.0f} customer, "
            f"rata-rata order value {baris['Rata2_order_value']:.2f}, "
            f"rata-rata frequency {baris['Rata2_frequency']:.2f}"
        )

    # 6. Uji-t: rata-rata order value Churned vs Active.
    aov_churned = customer_level.loc[customer_level["ChurnStatus"] == "Churned", "AverageOrderValue"]
    aov_active = customer_level.loc[customer_level["ChurnStatus"] == "Active", "AverageOrderValue"]
    # Welch's t-test (equal_var=False): tidak mengasumsikan varians kedua
    # grup sama, lebih aman karena ukuran & sebaran kedua grup jelas beda.
    t_stat, p_value = stats.ttest_ind(aov_churned, aov_active, equal_var=False)
    print("\nUji-t average order value: Churned vs Active")
    print(f"  rata-rata Churned : {aov_churned.mean():.2f}  (n={len(aov_churned):,})")
    print(f"  rata-rata Active  : {aov_active.mean():.2f}  (n={len(aov_active):,})")
    print(f"  t-statistic = {t_stat:.4f}, p-value = {p_value:.4f}")
    alpha = 0.05
    if p_value < alpha:
        interpretasi = (
            f"p-value < {alpha} -> perbedaan rata-rata order value antara Churned dan Active "
            "signifikan secara statistik (bukan kebetulan sampel)."
        )
    else:
        interpretasi = (
            f"p-value >= {alpha} -> belum cukup bukti bahwa rata-rata order value Churned dan "
            "Active benar-benar berbeda (bisa jadi cuma variasi sampel)."
        )
    print(f"  Interpretasi: {interpretasi}")

    # 7. Simpan ke output/churn_summary.csv.
    PATH_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    churn_summary = customer_level[["CustomerID", "Country", "ChurnStatus", "AverageOrderValue"]]
    churn_summary.to_csv(PATH_OUTPUT, index=False)
    print(f"\nDisimpan ke {PATH_OUTPUT} ({len(churn_summary):,} baris)")


if __name__ == "__main__":
    main()
