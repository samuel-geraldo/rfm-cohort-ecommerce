# Catatan Bug

Setiap bug nyata yang ditemukan selama pengerjaan dicatat di sini dengan format:

## <judul singkat>

- **Gejala:**
- **Penyebab:**
- **Solusi:**

## `to_parquet` gagal: ArrowInvalid pada kolom StockCode

- **Gejala:** `df.to_parquet(...)` di akhir `01_load_clean.py` melempar
  `pyarrow.lib.ArrowInvalid: ("Could not convert '79323P' with type str: tried
  to convert to int64", 'Conversion failed for column StockCode with type
  object')`. Error baru muncul di langkah terakhir, setelah semua langkah
  cleaning selesai jalan tanpa keluhan.
- **Penyebab:** `Invoice` dan `StockCode` dibaca pandas sebagai kolom
  `object` yang isinya campuran `int` (mis. `85123`) dan `str` (mis.
  `'79323P'`, `'POST'`) — dikonfirmasi lewat `.apply(type).value_counts()`.
  Selama masih di pandas, campuran ini tidak masalah (`.isin()`, `.astype(str)`
  di langkah 3 & 5 tetap benar). Tapi pyarrow menyimpulkan tipe Arrow untuk
  kolom dari sampel nilai (kalau sampel awal kebetulan angka, ia pilih
  `int64`), lalu gagal begitu ketemu nilai string di baris lain.
- **Solusi:** Cast eksplisit `Invoice` dan `StockCode` ke `str` sebelum
  `to_parquet` (setelah langkah 8, sebelum langkah 9). Keduanya memang kode
  identifier, bukan kolom numerik untuk dihitung, jadi disimpan sebagai
  string konsisten dengan maknanya.

## Pivot cohort matrix menghasilkan MultiIndex kolom

- **Gejala:** Percobaan pertama bikin cohort matrix dengan
  `df.groupby([...]).agg({'Customer ID': 'nunique'}).reset_index().pivot_table(index='cohort_month', columns='cohort_index')`
  (tanpa argumen `values` eksplisit) menghasilkan kolom `MultiIndex`, level
  pertama nama kolom value (`'Customer ID'`), level kedua `cohort_index`.
  Selection sederhana seperti `cohort_matrix[0]` gagal karena kolomnya
  sebenarnya `('Customer ID', 0)`.
- **Penyebab:** `pivot_table` tanpa `values` eksplisit memakai semua kolom
  numerik sisa sebagai value, jadi hasilnya selalu bertingkat dua level
  meskipun cuma ada satu kolom value.
- **Solusi:** Pakai `.pivot(index=..., columns=..., values='Customer ID')`
  (bukan `pivot_table`) dengan `values` diisi eksplisit satu nama kolom —
  hasilnya kolom flat (`pd.Index`, bukan `MultiIndex`). Ditambah `assert not
  isinstance(cohort_matrix.columns, pd.MultiIndex)` di `03_cohort.py` supaya
  kalau regresi lagi langsung ketahuan, bukan salah baca kolom diam-diam.
