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

## F_score beda ~24% antara `NTILE(5)` (SQL) dan `qcut`+`rank` (Python)

- **Gejala:** Validasi silang `sql/queries.sql` vs `output/rfm_table.csv`
  (`src/02_rfm.py`): nilai mentah Recency/Frequency/Monetary cocok 100% per
  customer (logika agregasinya benar di kedua sisi). Tapi F_score cuma cocok
  76.22% (1,394 dari 5,861 customer beda, semua selisih tepat ±1 — tidak ada
  yang beda 2+). R_score cocok 99.25% (44 beda, juga ±1). M_score cocok
  100%.
- **Penyebab:** Frequency sangat menumpuk di nilai kecil (1,625 customer
  dengan Frequency=1, 945 dengan Frequency=2, dst. — jauh lebih dari 1/5
  populasi per nilai), sama seperti yang sudah diantisipasi di bug watchlist
  soal `qcut` "Bin edges must be unique". Baik `NTILE(5) OVER (ORDER BY
  Frequency ASC)` (SQL) maupun `qcut(rank(method='first'))` (Python) harus
  memotong paksa blok nilai yang identik ini supaya ukuran quintile rata,
  tapi keduanya pakai urutan tie-break yang berbeda: SQLite mengurutkan
  baris yang Frequency-nya sama pakai urutan implisit (rowid/urutan insert
  dari parquet, ~urutan transaksi), sedangkan pandas `rank(method='first')`
  memakai urutan baris DataFrame (~urutan CustomerID, karena `groupby`
  sort by key). Customer yang persis di garis batas quintile jadi jatuh ke
  bucket berbeda tergantung urutan tie-break yang dipakai. R_score juga
  kena efek serupa tapi lebih kecil (Recency lebih jarang tie persis).
  M_score nyaris tidak kena karena Monetary hampir kontinu (jarang ada
  angka Revenue total yang identik persis antar customer).
- **Solusi:** Bukan bug yang perlu "diperbaiki" — kedua sisi sama-sama
  quintile yang valid untuk data dengan tie sebanyak ini, cuma beda pilihan
  tie-break yang keduanya arbitrer (tidak ada satu urutan tie-break yang
  "benar"). Diverifikasi selisihnya selalu ±1 (bukan ±2 atau lebih) untuk
  memastikan ini murni pergeseran batas quintile, bukan salah hitung.
  Kesimpulan: pakai `output/rfm_table.csv` (Python) sebagai sumber
  kebenaran untuk Segment & dashboard (karena itu yang sudah dipipeline ke
  README/Power BI); `sql/queries.sql` tetap berguna sebagai validasi
  independen atas Recency/Frequency/Monetary mentah (yang cocok 100%), dan
  sebagai demonstrasi teknik `NTILE()` window function.
