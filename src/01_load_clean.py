"""
01_load_clean.py

Baca data mentah Online Retail II (dua sheet, digabung), lalu bersihkan
sesuai urutan yang sudah dikunci di CLAUDE.md — urutan ini tidak boleh
diubah tanpa diskusi. Hasil akhir disimpan ke data/processed/retail_bersih.parquet.

Setiap langkah yang membuang baris mencetak jumlah baris sebelum & sesudah,
plus persentase revenue yang ikut hilang (dipakai untuk README).
"""

from pathlib import Path

import pandas as pd

PATH_MENTAH = Path("data/raw/online_retail_II.xlsx")
PATH_BERSIH = Path("data/processed/retail_bersih.parquet")

# StockCode yang bukan produk fisik (biaya kirim, diskon, biaya bank, dll.)
KODE_NON_PRODUK = [
    "POST", "D", "M", "C2", "DOT", "BANK CHARGES", "PADS", "CRUK", "S",
    "AMAZONFEE", "B",
]


def hitung_revenue(df: pd.DataFrame) -> float:
    """Revenue = Quantity * Price. Dipakai sebelum kolom Revenue resmi
    ditambahkan di langkah 7, supaya persentase revenue yang hilang bisa
    dilaporkan di setiap langkah pembuangan baris."""
    return (df["Quantity"] * df["Price"]).sum()


def cetak_ringkasan_langkah(nama_langkah: str, df_sebelum: pd.DataFrame, df_sesudah: pd.DataFrame) -> None:
    """Cetak jumlah baris sebelum/sesudah + persentase revenue yang hilang
    untuk satu langkah cleaning yang membuang baris."""
    n_sebelum, n_sesudah = len(df_sebelum), len(df_sesudah)
    baris_hilang = n_sebelum - n_sesudah
    persen_baris = (baris_hilang / n_sebelum * 100) if n_sebelum else 0.0

    revenue_sebelum = hitung_revenue(df_sebelum)
    revenue_sesudah = hitung_revenue(df_sesudah)
    revenue_hilang = revenue_sebelum - revenue_sesudah
    persen_revenue = (revenue_hilang / revenue_sebelum * 100) if revenue_sebelum else 0.0

    print(f"\n[{nama_langkah}]")
    print(f"  baris   : {n_sebelum:,} -> {n_sesudah:,}  (hilang {baris_hilang:,}, {persen_baris:.2f}%)")
    print(f"  revenue : {revenue_sebelum:,.2f} -> {revenue_sesudah:,.2f}  "
          f"(hilang {revenue_hilang:,.2f}, {persen_revenue:.2f}%)")


def main() -> None:
    # 1. Baca semua sheet, concat jadi satu DataFrame.
    # PENTING: file ini punya dua sheet (satu per rentang tahun). Kalau
    # sheet_name tidak diisi None, pandas cuma baca sheet pertama dan
    # separuh data hilang tanpa error apa pun.
    print("Membaca semua sheet dari file Excel...")
    semua_sheet = pd.read_excel(PATH_MENTAH, sheet_name=None)
    print(f"Sheet ditemukan: {list(semua_sheet.keys())}")
    df = pd.concat(semua_sheet.values(), ignore_index=True)
    print(f"Total baris setelah digabung: {len(df):,}")

    # 2. Buang baris dengan Customer ID kosong (~22% baris).
    df_sebelum = df
    df = df[df["Customer ID"].notna()].copy()
    cetak_ringkasan_langkah("2. Buang Customer ID kosong", df_sebelum, df)

    # 3. Buang invoice pembatalan (Invoice berawalan 'C').
    # Kolom Invoice bertipe campuran int & str dalam satu kolom object
    # (angka murni terbaca sebagai int, yang mengandung huruf sebagai str).
    # .str.startswith langsung di atasnya menghasilkan NaN untuk baris
    # bertipe int — wajib .astype(str) dulu. Lihat docs/bugs.md.
    df_sebelum = df
    mask_batal = df["Invoice"].astype(str).str.startswith("C")
    print(f"\nJumlah invoice pembatalan yang ditemukan: {mask_batal.sum():,}")
    df = df[~mask_batal].copy()
    cetak_ringkasan_langkah("3. Buang invoice pembatalan", df_sebelum, df)

    # 4. Buang Quantity <= 0 dan Price <= 0.
    df_sebelum = df
    df = df[(df["Quantity"] > 0) & (df["Price"] > 0)].copy()
    cetak_ringkasan_langkah("4. Buang Quantity <= 0 dan Price <= 0", df_sebelum, df)

    # 5. Buang StockCode non-produk (biaya kirim, diskon, biaya bank, dll.).
    df_sebelum = df
    kode_upper = df["StockCode"].astype(str).str.strip().str.upper()
    mask_non_produk = kode_upper.isin(KODE_NON_PRODUK)
    df = df[~mask_non_produk].copy()
    cetak_ringkasan_langkah("5. Buang StockCode non-produk", df_sebelum, df)

    # 6. Buang baris duplikat persis.
    df_sebelum = df
    df = df.drop_duplicates().copy()
    cetak_ringkasan_langkah("6. Buang baris duplikat persis", df_sebelum, df)

    # 7. Tambah kolom Revenue.
    df["Revenue"] = df["Quantity"] * df["Price"]

    # 8. Customer ID jadi integer (aman sekarang, NaN sudah dibuang di langkah 2).
    df["Customer ID"] = df["Customer ID"].astype(int)

    # Invoice & StockCode berisi campuran int dan str di kolom object yang sama
    # (mis. StockCode '79323P' vs 85123). pyarrow menyimpulkan tipe kolom dari
    # sampel lalu gagal saat ketemu nilai yang tidak cocok — lihat docs/bugs.md.
    # Keduanya memang identifier, bukan angka untuk dihitung, jadi wajar disimpan
    # sebagai string.
    df["Invoice"] = df["Invoice"].astype(str)
    df["StockCode"] = df["StockCode"].astype(str)

    # 9. Simpan ke parquet.
    PATH_BERSIH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(PATH_BERSIH, index=False)
    print(f"\nSelesai. Disimpan ke {PATH_BERSIH}")
    print(f"Baris akhir: {len(df):,} | Total revenue akhir: {df['Revenue'].sum():,.2f}")


if __name__ == "__main__":
    main()
