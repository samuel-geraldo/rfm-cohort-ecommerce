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
