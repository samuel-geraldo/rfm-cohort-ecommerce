"""
05_export_figures.py

Export chart dari output/*.csv ke output/figures/ sebagai PNG, supaya bisa
dipakai di README (GitHub tidak merender chart yang cuma tertanam di dalam
notebook). Kode plotting-nya sengaja sama persis dengan
notebooks/analisis_lanjutan.ipynb — notebook untuk eksplorasi interaktif,
script ini untuk menghasilkan file gambar yang bisa direproduksi.
"""

from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # tanpa GUI, supaya bisa jalan di mana saja
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

DIR_FIGURES = Path("output/figures")
PATH_RFM = Path("output/rfm_table.csv")
PATH_COHORT = Path("output/cohort_matrix.csv")
PATH_CHURN = Path("output/churn_summary.csv")
PATH_SEGMENT_SUMMARY = Path("output/segment_summary.csv")

# Palet warna sama dengan notebook: biru = fokus utama, oranye = pembanding,
# abu-abu = kategori non-fokus.
WARNA_SURFACE = "#fcfcfb"
WARNA_INK_UTAMA = "#0b0b0b"
WARNA_INK_SEKUNDER = "#52514e"
WARNA_GRID = "#e1e0d9"
WARNA_BASELINE = "#c3c2b7"
WARNA_BIRU = "#2a78d6"
WARNA_ORANYE = "#eb6834"

plt.rcParams.update({
    "figure.facecolor": WARNA_SURFACE,
    "axes.facecolor": WARNA_SURFACE,
    "savefig.facecolor": WARNA_SURFACE,
    "axes.edgecolor": WARNA_GRID,
    "axes.labelcolor": WARNA_INK_SEKUNDER,
    "text.color": WARNA_INK_UTAMA,
    "xtick.color": WARNA_INK_SEKUNDER,
    "ytick.color": WARNA_INK_SEKUNDER,
    "grid.color": WARNA_GRID,
    "figure.dpi": 110,
    "savefig.dpi": 150,
    "savefig.bbox": "tight",
})


def simpan(fig, nama: str) -> None:
    path = DIR_FIGURES / nama
    fig.savefig(path)
    plt.close(fig)
    print(f"  tersimpan: {path}")


def main() -> None:
    DIR_FIGURES.mkdir(parents=True, exist_ok=True)

    rfm = pd.read_csv(PATH_RFM)
    cohort = pd.read_csv(PATH_COHORT, index_col=0)
    churn = pd.read_csv(PATH_CHURN)
    print(f"rfm_table.csv     : {rfm.shape[0]:,} baris")
    print(f"cohort_matrix.csv : {cohort.shape[0]} cohort x {cohort.shape[1]} cohort_index")
    print(f"churn_summary.csv : {churn.shape[0]:,} baris\n")

    # 1. Cohort retention heatmap. Segitiga kanan-atas di-mask (NaN), bukan
    # ditampilkan sebagai 0% — cohort yang lebih baru memang belum "hidup"
    # sepanjang itu sampai snapshot date.
    fig, ax = plt.subplots(figsize=(14, 8))
    sns.heatmap(
        cohort, mask=cohort.isna(), annot=True, fmt=".0f", annot_kws={"size": 7},
        cmap=sns.light_palette(WARNA_BIRU, as_cmap=True),
        linewidths=0.5, linecolor=WARNA_SURFACE,
        cbar_kws={"label": "Retention rate (%)"}, ax=ax,
    )
    ax.set_title("Cohort Retention Rate (%) per Bulan sejak Pembelian Pertama", fontsize=13, pad=12)
    ax.set_xlabel("cohort_index (bulan ke-n)")
    ax.set_ylabel("cohort_month")
    simpan(fig, "cohort_retention_heatmap.png")

    # 2. Jumlah customer per Segment.
    jumlah_per_segmen = rfm["Segment"].value_counts()
    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(jumlah_per_segmen.index, jumlah_per_segmen.values, color=WARNA_BIRU, width=0.65)
    ax.bar_label(bars, labels=[f"{v:,}" for v in jumlah_per_segmen.values],
                 padding=3, fontsize=9, color=WARNA_INK_SEKUNDER)
    ax.set_ylabel("Jumlah customer")
    ax.set_title("Jumlah Customer per Segment RFM", fontsize=13, pad=12)
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(axis="x", rotation=35)
    for label in ax.get_xticklabels():
        label.set_ha("right")
    simpan(fig, "distribusi_segment.png")

    # 3. Kontribusi Monetary per Segment — Champions & Hibernating disorot
    # karena justru berlawanan arah (segmen kecil bernilai tinggi vs segmen
    # besar bernilai rendah).
    persen_monetary = (
        rfm.groupby("Segment")["Monetary"].sum() / rfm["Monetary"].sum() * 100
    ).sort_values(ascending=False)
    warna_bar = [
        WARNA_BIRU if s == "Champions" else WARNA_ORANYE if s == "Hibernating" else WARNA_BASELINE
        for s in persen_monetary.index
    ]
    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(persen_monetary.index, persen_monetary.values, color=warna_bar, width=0.65)
    ax.bar_label(bars, labels=[f"{v:.1f}%" for v in persen_monetary.values],
                 padding=3, fontsize=9, color=WARNA_INK_SEKUNDER)
    ax.set_ylabel("% dari total Monetary")
    ax.set_title("Kontribusi Monetary per Segment RFM", fontsize=13, pad=12)
    ax.spines[["top", "right"]].set_visible(False)
    ax.tick_params(axis="x", rotation=35)
    for label in ax.get_xticklabels():
        label.set_ha("right")
    simpan(fig, "kontribusi_monetary_segment.png")

    # 4. Boxplot AOV Churned vs Active. Outlier ekstrem disembunyikan
    # (showfliers=False) supaya box-nya masih kebaca — distribusinya sangat
    # right-skewed. Garis putus-putus = rata-rata, garis solid = median.
    fig, ax = plt.subplots(figsize=(8, 6))
    urutan = ["Active", "Churned"]
    sns.boxplot(
        data=churn, x="ChurnStatus", y="AverageOrderValue", order=urutan,
        hue="ChurnStatus", hue_order=urutan,
        palette={"Active": WARNA_BIRU, "Churned": WARNA_ORANYE},
        legend=False, showfliers=False, showmeans=True, meanline=True,
        meanprops={"color": WARNA_INK_UTAMA, "linestyle": "--", "linewidth": 1.5},
        medianprops={"color": WARNA_INK_SEKUNDER, "linewidth": 1.5}, ax=ax,
    )
    ax.set_ylabel("Average Order Value")
    ax.set_xlabel("")
    ax.set_title("Average Order Value: Churned vs Active", fontsize=13, pad=12)
    ax.spines[["top", "right"]].set_visible(False)
    simpan(fig, "aov_churned_vs_active.png")

    # 5. segment_summary.csv — ringkasan per segmen, dipakai di README dan
    # sebagai sumber tabel di Power BI.
    ringkasan = rfm.groupby("Segment").agg(
        Jumlah_customer=("CustomerID", "count"),
        Rata2_recency=("Recency", "mean"),
        Rata2_frequency=("Frequency", "mean"),
        Rata2_monetary=("Monetary", "mean"),
        Total_monetary=("Monetary", "sum"),
    )
    ringkasan["Persen_customer"] = ringkasan["Jumlah_customer"] / len(rfm) * 100
    ringkasan["Persen_monetary"] = ringkasan["Total_monetary"] / rfm["Monetary"].sum() * 100
    ringkasan = ringkasan.sort_values("Persen_monetary", ascending=False).round(2).reset_index()
    ringkasan.to_csv(PATH_SEGMENT_SUMMARY, index=False)
    print(f"\n  tersimpan: {PATH_SEGMENT_SUMMARY} ({len(ringkasan)} segmen)")
    print(ringkasan[["Segment", "Jumlah_customer", "Persen_customer", "Persen_monetary"]].to_string(index=False))


if __name__ == "__main__":
    main()
