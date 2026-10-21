"""
export_figure_data.py

Baca output/rfm_table.csv (hasil 02_rfm.py) lalu simpan ringkasan per segmen
ke output/figur/rfm_segments.json. File ini satu-satunya sumber angka untuk
figur interaktif di docs/rfm/: build figur tidak menghitung angka sendiri.

Isi JSON:
- segments  : per segmen -> jumlah & persen customer, persen revenue, rentang
              skor R/F/M, median Recency (hari), Frequency, Monetary.
- rf_grid   : 25 kombinasi (R_score, F_score) -> segmen dan jumlah customer.
              Ini peta yang dipakai 02_rfm.py (M_score tidak ikut menentukan
              segmen), diambil dari hasilnya, bukan diketik ulang.
- score_bins: per dimensi dan skor 1-5 -> jumlah customer dan rentang nilai
              mentah (batas quintile yang sebenarnya).
- examples  : 5 contoh customer, ID asli diganti nomor urut.

Dijalankan dari root repo: python src/export_figure_data.py
"""

import json
from pathlib import Path

import pandas as pd

PATH_RFM = Path("output/rfm_table.csv")
PATH_OUTPUT = Path("output/figur/rfm_segments.json")

# Angka acuan (README / segment_summary.csv): jumlah customer, % customer, % revenue.
# Kalau hasil hitungan di sini beda satu angka pun, script berhenti.
TOTAL_CUSTOMER_ACUAN = 5861
ACUAN = {
    "Champions": (830, 14.16, 51.52),
    "Loyal Customers": (1157, 19.74, 27.30),
    "At Risk": (756, 12.90, 5.92),
    "Potential Loyalists": (711, 12.13, 4.74),
    "Hibernating": (1515, 25.85, 3.62),
    "Can't Lose": (73, 1.25, 3.40),
    "Need Attention": (269, 4.59, 1.97),
    "About To Sleep": (382, 6.52, 1.20),
    "Promising": (114, 1.95, 0.21),
    "New Customers": (54, 0.92, 0.11),
}

# Segmen asal 5 contoh customer yang dijalankan lewat gerbang di figur.
SEGMEN_CONTOH = ["Champions", "Loyal Customers", "At Risk", "Hibernating", "New Customers"]

# Kolom nilai mentah untuk tiap skor.
DIMENSI = {"R": "Recency", "F": "Frequency", "M": "Monetary"}


def ringkas_segmen(rfm: pd.DataFrame) -> list:
    """Satu dict per segmen, urut dari persen revenue terbesar."""
    total_customer = len(rfm)
    total_monetary = rfm["Monetary"].sum()
    segmen = []
    for nama, grup in rfm.groupby("Segment"):
        segmen.append(
            {
                "segment": nama,
                "customers": int(len(grup)),
                "pct_customers": round(len(grup) / total_customer * 100, 2),
                "pct_revenue": round(grup["Monetary"].sum() / total_monetary * 100, 2),
                "revenue": round(float(grup["Monetary"].sum()), 2),
                "r_range": [int(grup["R_score"].min()), int(grup["R_score"].max())],
                "f_range": [int(grup["F_score"].min()), int(grup["F_score"].max())],
                "m_range": [int(grup["M_score"].min()), int(grup["M_score"].max())],
                "median_recency_days": float(grup["Recency"].median()),
                "median_frequency": float(grup["Frequency"].median()),
                "median_monetary": round(float(grup["Monetary"].median()), 2),
            }
        )
    return sorted(segmen, key=lambda s: -s["pct_revenue"])


def cocokkan_acuan(rfm: pd.DataFrame, segmen: list) -> None:
    """Berhenti kalau ada satu angka yang tidak sama dengan acuan."""
    selisih = []
    if len(rfm) != TOTAL_CUSTOMER_ACUAN:
        selisih.append(("total customer", len(rfm), TOTAL_CUSTOMER_ACUAN))
    if sorted(s["segment"] for s in segmen) != sorted(ACUAN):
        selisih.append(("nama segmen", [s["segment"] for s in segmen], list(ACUAN)))
    for s in segmen:
        hasil = (s["customers"], s["pct_customers"], s["pct_revenue"])
        acuan = ACUAN.get(s["segment"])
        if hasil != acuan:
            selisih.append((s["segment"], hasil, acuan))
    if selisih:
        for baris in selisih:
            print("SELISIH (hasil vs acuan):", baris)
        raise SystemExit("Angka tidak cocok dengan acuan, berhenti.")


def peta_rf(rfm: pd.DataFrame) -> list:
    """25 sel (R_score, F_score) -> segmen, diambil dari hasil 02_rfm.py."""
    grid = []
    for (r, f), grup in rfm.groupby(["R_score", "F_score"]):
        nama = grup["Segment"].unique()
        # Satu sel harus tepat satu segmen; kalau tidak, pemetaannya bukan dari R & F saja.
        assert len(nama) == 1, f"Sel R={r} F={f} punya lebih dari satu segmen: {nama}"
        grid.append({"r": int(r), "f": int(f), "segment": nama[0], "customers": int(len(grup))})
    assert len(grid) == 25, f"Hanya {len(grid)} dari 25 kombinasi R/F yang terisi"
    return grid


def batas_skor(rfm: pd.DataFrame) -> dict:
    """Per dimensi & skor: jumlah customer dan rentang nilai mentahnya."""
    hasil = {}
    for huruf, kolom in DIMENSI.items():
        baris = []
        for skor, grup in rfm.groupby(f"{huruf}_score"):
            baris.append(
                {
                    "score": int(skor),
                    "customers": int(len(grup)),
                    "min": round(float(grup[kolom].min()), 2),
                    "max": round(float(grup[kolom].max()), 2),
                }
            )
        hasil[huruf] = baris
    return hasil


def pilih_contoh(rfm: pd.DataFrame) -> list:
    """Per segmen contoh: customer yang Monetary-nya paling dekat median segmennya.

    Deterministik, bukan acak: jarak dibulatkan ke sen supaya seri benar-benar
    seri, lalu dipecah dengan CustomerID terkecil. CustomerID asli tidak ikut disimpan.
    """
    contoh = []
    for urut, nama in enumerate(SEGMEN_CONTOH, start=1):
        grup = rfm[rfm["Segment"] == nama].copy()
        grup["jarak_median"] = (grup["Monetary"] - grup["Monetary"].median()).abs().round(2)
        baris = grup.sort_values(["jarak_median", "CustomerID"]).iloc[0]
        contoh.append(
            {
                "customer_no": urut,
                "recency_days": int(baris["Recency"]),
                "frequency": int(baris["Frequency"]),
                "monetary": round(float(baris["Monetary"]), 2),
                "r": int(baris["R_score"]),
                "f": int(baris["F_score"]),
                "m": int(baris["M_score"]),
                "segment": nama,
            }
        )
    return contoh


def main() -> None:
    rfm = pd.read_csv(PATH_RFM)
    print(f"Customer dibaca dari {PATH_RFM.as_posix()}: {len(rfm):,}")

    segmen = ringkas_segmen(rfm)
    cocokkan_acuan(rfm, segmen)
    print("Semua angka cocok dengan acuan.")

    keluaran = {
        "meta": {
            "source": PATH_RFM.as_posix(),
            "snapshot_date": "2011-12-10",
            "total_customers": int(len(rfm)),
            "total_revenue": round(float(rfm["Monetary"].sum()), 2),
            "segment_rule": "segmen ditentukan oleh kombinasi R_score dan F_score; M_score tidak ikut",
        },
        "segments": segmen,
        "rf_grid": peta_rf(rfm),
        "score_bins": batas_skor(rfm),
        "examples": pilih_contoh(rfm),
    }
    PATH_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PATH_OUTPUT.write_text(json.dumps(keluaran, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"Disimpan ke {PATH_OUTPUT.as_posix()}\n")

    for s in segmen:
        print(
            f"{s['segment']:<20}{s['customers']:>6,}  {s['pct_customers']:>5.2f}% cust  "
            f"{s['pct_revenue']:>5.2f}% rev  R{s['r_range']} F{s['f_range']} M{s['m_range']}  "
            f"median: {s['median_recency_days']:.0f} hari, {s['median_frequency']:.0f}x, "
            f"{s['median_monetary']:,.2f}"
        )
    print()
    for huruf, baris in keluaran["score_bins"].items():
        print(huruf, [(b["score"], b["customers"], b["min"], b["max"]) for b in baris])
    print()
    for c in keluaran["examples"]:
        print(c)


if __name__ == "__main__":
    main()
