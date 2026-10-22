"""
09_churn_segmen.py

Baca output/rfm_table.csv (hasil 02_rfm.py, kolom ChurnStatus ditambah 04_churn_geo.py)
lalu ringkas churn per segmen RFM ke output/churn_per_segment.csv.

Catatan membaca hasilnya: Churn = Recency > 180 hari, dan segmen sendiri ditentukan
skor R dan F. Jadi segmen ber-R rendah (At Risk, Can't Lose, Hibernating) otomatis 100%
churn. Persentase churn per segmen itu bukan temuan; yang informatif adalah
Monetary yang ikut churn (uang yang sudah berhenti mengalir) dan rata-rata per customer.

Dijalankan dari root repo: python src/09_churn_segmen.py
"""

from pathlib import Path

import pandas as pd

PATH_RFM = Path("output/rfm_table.csv")
PATH_OUTPUT = Path("output/churn_per_segment.csv")

# Angka acuan dari 04_churn_geo.py (README): total customer Churned. Kalau beda, berhenti.
TOTAL_CHURN_ACUAN = 2387


def main() -> None:
    rfm = pd.read_csv(PATH_RFM)
    print(f"Customer dibaca dari {PATH_RFM.as_posix()}: {len(rfm):,}")

    rfm["is_churn"] = rfm["ChurnStatus"] == "Churned"
    total_churn = int(rfm["is_churn"].sum())
    if total_churn != TOTAL_CHURN_ACUAN:
        raise SystemExit(f"Total churn {total_churn:,} != acuan {TOTAL_CHURN_ACUAN:,}, berhenti.")
    print(f"Total churn cocok dengan acuan: {total_churn:,}")

    total_monetary = rfm["Monetary"].sum()
    baris = []
    for segmen, grup in rfm.groupby("Segment"):
        churn = grup[grup["is_churn"]]
        baris.append(
            {
                "Segment": segmen,
                "Jumlah_customer": len(grup),
                "Churned_customer": len(churn),
                "Persen_churn": round(len(churn) / len(grup) * 100, 2),
                "Monetary_churned": round(churn["Monetary"].sum(), 2),
                "Persen_monetary_churned": round(churn["Monetary"].sum() / grup["Monetary"].sum() * 100, 2),
                "Rata2_monetary_churned": round(churn["Monetary"].mean(), 2) if len(churn) else 0.0,
                "Persen_dari_total_monetary": round(churn["Monetary"].sum() / total_monetary * 100, 2),
            }
        )

    hasil = pd.DataFrame(baris).sort_values("Monetary_churned", ascending=False)
    PATH_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    hasil.to_csv(PATH_OUTPUT, index=False)
    print(f"Disimpan ke {PATH_OUTPUT.as_posix()}\n")
    print(hasil.to_string(index=False))
    print(
        f"\nMonetary yang ikut churn: £{hasil['Monetary_churned'].sum():,.2f} "
        f"({hasil['Persen_dari_total_monetary'].sum():.2f}% dari total)"
    )


if __name__ == "__main__":
    main()
