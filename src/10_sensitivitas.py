"""
10_sensitivitas.py

Uji sensitivitas segmentasi RFM: seberapa banyak customer pindah segmen kalau skor
R dan F dihitung dengan cara lain, dibanding hasil 02_rfm.py (baseline).

Skenario (semua memakai peta segmen R x F yang sama dengan 02_rfm.py):
- tie-break acak : urutan baris diacak sebelum rank(method='first'), diulang 200 kali.
                   Mengukur satu hal: efek urutan tie-break pada nilai yang menumpuk.
- nilai sama satu skor (rank min / rank max): customer dengan nilai identik selalu
                   masuk bucket yang sama, jadi bucket tidak lagi sama besar.
- ambang tetap   : batas bisnis, bukan quintile (Recency 30/90/180/365 hari,
                   Frequency 1/2/3-4/5-9/10+).

Hanya membaca output/rfm_table.csv, tidak butuh data mentah.
Dijalankan dari root repo: python src/10_sensitivitas.py
"""

import importlib.util
from pathlib import Path

import numpy as np
import pandas as pd

PATH_RFM = Path("output/rfm_table.csv")
PATH_RINGKASAN = Path("output/sensitivity_summary.csv")
PATH_PER_SEGMEN = Path("output/sensitivity_per_segment.csv")

JUMLAH_ACAKAN = 200
BENIH = 42

# Peta segmen dipakai dari 02_rfm.py (nama file berawalan angka, tidak bisa di-import biasa).
spesifikasi = importlib.util.spec_from_file_location("rfm02", Path("src/02_rfm.py"))
rfm02 = importlib.util.module_from_spec(spesifikasi)
spesifikasi.loader.exec_module(rfm02)
PETA_SEGMEN = rfm02.PETA_SEGMEN


def skor_quintile(nilai: pd.Series, naik: bool) -> pd.Series:
    """Cara 02_rfm.py: qcut atas rank(method='first'). naik=False membalik label (Recency)."""
    label = [1, 2, 3, 4, 5] if naik else [5, 4, 3, 2, 1]
    return pd.qcut(nilai.rank(method="first"), 5, labels=label).astype(int)


def skor_rank(nilai: pd.Series, naik: bool, metode: str) -> pd.Series:
    """Nilai identik selalu satu skor: bucket = ceil(5 x rank / n). metode 'min' atau 'max'."""
    persen = nilai.rank(method=metode) / len(nilai)
    bucket = np.ceil(persen * 5).clip(1, 5).astype(int)
    return bucket if naik else 6 - bucket


def skor_ambang_tetap(rfm: pd.DataFrame) -> tuple:
    """Batas bisnis tetap. Recency kecil = skor tinggi."""
    r = pd.cut(rfm["Recency"], [-1, 30, 90, 180, 365, 10**6], labels=[5, 4, 3, 2, 1]).astype(int)
    f = pd.cut(rfm["Frequency"], [0, 1, 2, 4, 9, 10**6], labels=[1, 2, 3, 4, 5]).astype(int)
    return r, f


def segmen_dari(r: pd.Series, f: pd.Series) -> pd.Series:
    return pd.Series([PETA_SEGMEN[(a, b)] for a, b in zip(r, f)], index=r.index)


def bandingkan(rfm: pd.DataFrame, r: pd.Series, f: pd.Series, nama: str) -> dict:
    """Ringkasan satu skenario terhadap baseline (kolom Segment, R_score, F_score di rfm)."""
    segmen = segmen_dari(r, f)
    pindah = segmen != rfm["Segment"]
    champions_baseline = rfm.loc[rfm["Segment"] == "Champions", "Monetary"].sum() / rfm["Monetary"].sum() * 100
    champions_skenario = rfm.loc[segmen == "Champions", "Monetary"].sum() / rfm["Monetary"].sum() * 100
    return {
        "Skenario": nama,
        "Persen_customer_pindah_segmen": round(pindah.mean() * 100, 2),
        "Persen_customer_R_berubah": round((r != rfm["R_score"]).mean() * 100, 2),
        "Persen_customer_F_berubah": round((f != rfm["F_score"]).mean() * 100, 2),
        "Persen_monetary_pindah_segmen": round(rfm.loc[pindah, "Monetary"].sum() / rfm["Monetary"].sum() * 100, 2),
        "Persen_revenue_Champions": round(champions_skenario, 2),
        "Selisih_revenue_Champions_vs_baseline": round(champions_skenario - champions_baseline, 2),
    }, segmen


def kestabilan(rfm: pd.DataFrame, segmen: pd.Series) -> dict:
    """Per segmen baseline: persen anggotanya yang tetap di segmen yang sama."""
    tetap = segmen == rfm["Segment"]
    return {nama: round(tetap[rfm["Segment"] == nama].mean() * 100, 2) for nama in sorted(rfm["Segment"].unique())}


def main() -> None:
    rfm = pd.read_csv(PATH_RFM)
    print(f"Customer dibaca dari {PATH_RFM.as_posix()}: {len(rfm):,}")

    # Baseline harus identik dengan hasil 02_rfm.py, kalau tidak perbandingan tidak bermakna.
    r0, f0 = skor_quintile(rfm["Recency"], False), skor_quintile(rfm["Frequency"], True)
    if not (r0.equals(rfm["R_score"]) and f0.equals(rfm["F_score"])):
        raise SystemExit("Baseline tidak identik dengan rfm_table.csv, berhenti.")
    print("Baseline identik dengan rfm_table.csv.\n")

    ringkasan, stabil = [], {}

    # 1. Tie-break acak: urutan baris diacak, lalu rank(method='first') memecah seri.
    acak = np.random.default_rng(BENIH)
    hasil_acak, stabil_acak = [], []
    for _ in range(JUMLAH_ACAKAN):
        urutan = acak.permutation(len(rfm))
        sub = rfm.iloc[urutan]
        r = skor_quintile(sub["Recency"], False).reindex(rfm.index)
        f = skor_quintile(sub["Frequency"], True).reindex(rfm.index)
        baris, segmen = bandingkan(rfm, r, f, "tie-break acak")
        hasil_acak.append(baris)
        stabil_acak.append(kestabilan(rfm, segmen))
    acak_df = pd.DataFrame(hasil_acak).drop(columns="Skenario")
    ringkasan.append({"Skenario": f"tie-break acak (rata-rata {JUMLAH_ACAKAN}x)", **acak_df.mean().round(2).to_dict()})
    ringkasan.append({"Skenario": "tie-break acak (terburuk)", **acak_df.loc[acak_df["Persen_customer_pindah_segmen"].idxmax()].round(2).to_dict()})
    stabil["tie-break acak (rata-rata)"] = pd.DataFrame(stabil_acak).mean().round(2).to_dict()
    stabil["tie-break acak (terburuk)"] = pd.DataFrame(stabil_acak).min().round(2).to_dict()

    # 2. Nilai yang sama selalu satu skor.
    for metode in ("min", "max"):
        r = skor_rank(rfm["Recency"], False, metode)
        f = skor_rank(rfm["Frequency"], True, metode)
        baris, segmen = bandingkan(rfm, r, f, f"nilai sama satu skor (rank {metode})")
        ringkasan.append(baris)
        stabil[baris["Skenario"]] = kestabilan(rfm, segmen)

    # 3. Ambang tetap.
    r, f = skor_ambang_tetap(rfm)
    baris, segmen = bandingkan(rfm, r, f, "ambang tetap (bisnis)")
    ringkasan.append(baris)
    stabil[baris["Skenario"]] = kestabilan(rfm, segmen)

    tabel = pd.DataFrame(ringkasan)
    tabel_segmen = pd.DataFrame(stabil).T
    tabel_segmen.index.name = "Skenario"
    PATH_RINGKASAN.parent.mkdir(parents=True, exist_ok=True)
    tabel.to_csv(PATH_RINGKASAN, index=False)
    tabel_segmen.reset_index().to_csv(PATH_PER_SEGMEN, index=False)

    print(f"Disimpan ke {PATH_RINGKASAN.as_posix()} dan {PATH_PER_SEGMEN.as_posix()}\n")
    print(tabel.to_string(index=False))
    print("\nPersen anggota baseline yang tetap di segmennya:")
    print(tabel_segmen.T.to_string())


if __name__ == "__main__":
    main()
