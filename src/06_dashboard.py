# 06_dashboard.py
# Membangun dashboard interaktif satu-file (dashboard/customer_analytics.html)
# dari CSV hasil tahap sebelumnya. Tidak butuh data mentah dan tidak butuh package baru.
#
# Jalankan dari root repo:  python src/06_dashboard.py

import json
from pathlib import Path

import pandas as pd

TEMPLATE = Path("src/dashboard_template.html")
KELUARAN = Path("dashboard/customer_analytics.html")

rfm = pd.read_csv("output/rfm_table.csv")
churn = pd.read_csv("output/churn_summary.csv")
ringkas_segmen = pd.read_csv("output/segment_summary.csv")
cohort = pd.read_csv("output/cohort_matrix.csv", index_col=0)

# --- Gabung tabel RFM dengan order value dan negara per pelanggan ---
pelanggan = rfm.merge(
    churn[["CustomerID", "Country", "ChurnStatus", "AverageOrderValue"]],
    on="CustomerID", how="left", suffixes=("", "_churn"),
)
assert len(pelanggan) == len(rfm) == 5861, "jumlah pelanggan tidak sesuai README"
assert pelanggan["AverageOrderValue"].notna().all(), "ada pelanggan tanpa order value"
assert (pelanggan["ChurnStatus"] == pelanggan["ChurnStatus_churn"]).all(), \
    "status churn di rfm_table dan churn_summary berbeda"

# Urutan segmen: omzet terbesar dulu, supaya Champions selalu indeks 0
ringkas_segmen = ringkas_segmen.sort_values("Persen_monetary", ascending=False)
nama_segmen = ringkas_segmen["Segment"].tolist()
indeks_segmen = {nama: i for i, nama in enumerate(nama_segmen)}

# Satu baris per pelanggan, dipadatkan jadi list supaya file tetap kecil:
# [indeks segmen, churn (1/0), Inggris (1/0), monetary, order value, recency, frequency]
baris = [
    [
        indeks_segmen[r.Segment],
        int(r.ChurnStatus == "Churned"),
        int(r.Country == "United Kingdom"),
        round(float(r.Monetary), 2),
        round(float(r.AverageOrderValue), 2),
        int(r.Recency),
        int(r.Frequency),
    ]
    for r in pelanggan.itertuples()
]

# --- Pemeriksaan silang terhadap angka yang sudah ada di README ---
total_churn = sum(b[1] for b in baris)
total_inggris = sum(b[2] for b in baris)
assert total_churn == 2387, f"churn {total_churn}, README menulis 2.387"
assert total_inggris == 5335, f"Inggris {total_inggris}, README menulis 5.335"
for r in ringkas_segmen.itertuples():
    omzet = sum(b[3] for b in baris if b[0] == indeks_segmen[r.Segment])
    assert abs(omzet - r.Total_monetary) < 5, f"omzet {r.Segment} tidak cocok"
rata_bulan_1 = cohort["1"].mean()
assert round(rata_bulan_1, 2) == 20.99, f"retention bulan ke-1 {rata_bulan_1:.2f}, README 20,99"

data = {
    "segmen": nama_segmen,
    "pelanggan": baris,
    "cohort_bulan": cohort.index.tolist(),
    # NaN (segitiga kanan-atas) jadi null, bukan 0
    "cohort_matriks": [[None if pd.isna(v) else float(v) for v in baris_c] for baris_c in cohort.values],
}

html = TEMPLATE.read_text(encoding="utf-8").replace(
    "/*__DATA__*/null", json.dumps(data, separators=(",", ":"), ensure_ascii=False)
)
KELUARAN.parent.mkdir(exist_ok=True)
KELUARAN.write_text(html, encoding="utf-8")
print(f"Dashboard ditulis ke {KELUARAN} ({KELUARAN.stat().st_size / 1024:.0f} KB), "
      f"{len(baris)} pelanggan, semua pemeriksaan silang lulus.")
