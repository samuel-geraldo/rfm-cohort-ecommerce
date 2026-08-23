# CLAUDE.md — rfm-cohort-ecommerce

Project portofolio: RFM Segmentation & Cohort Analysis di data e-commerce retail.
Pemilik: Samuel Geraldo Tobia Lumika. Paham pandas, SQL (window function, CTE, self-join),
uji-t. Windows.

## Aturan kerja

- Selesaikan satu script sampai tuntas sebelum pindah ke script berikutnya. Jangan
  menambah scope atau fitur yang tidak diminta.
- Setiap langkah cleaning yang membuang baris **wajib** mencetak jumlah baris sebelum dan
  sesudah, plus persentase revenue yang ikut hilang. Angka-angka ini dipakai di README.
- Kalau ketemu bug nyata, catat di `docs/bugs.md` dengan format: gejala, penyebab, solusi.
  Ini bahan cerita interview — jangan cuma diperbaiki diam-diam.
- Komentar kode dan nama variabel dalam bahasa Indonesia. Nama file dan nama kolom output
  dalam bahasa Inggris.
- Jangan commit isi `data/raw/` dan `data/processed/`.
- Commit message deskriptif dan berbahasa Indonesia, format singkat: `tambah: ...`,
  `perbaiki: ...`, `dokumentasi: ...`. **Jangan pernah** menambahkan baris
  `Co-Authored-By: Claude`, `Generated with Claude Code`, atau atribusi AI apa pun ke
  commit message manapun.
- Commit per tahap selesai (bukan per file, bukan satu commit raksasa di akhir) — supaya
  history-nya sendiri jadi bukti proses, bukan cuma hasil akhir.

## Reproducibility

- `requirements.txt` pin versi tiap package (`pandas==2.x.x`, bukan `pandas`), supaya
  siapa pun yang clone repo dapat environment yang sama persis dengan yang dipakai
  waktu analisis dibuat.
- Setiap script di `src/` bisa dijalankan langsung dari root repo tanpa argumen
  tambahan (`python src/01_load_clean.py`), baca dan tulis lewat path relatif tetap,
  bukan path absolut yang ketik manual.
- README wajib punya bagian "Cara Menjalankan" — urutan perintah dari clone sampai
  dashboard jadi, termasuk cara bikin venv dan install requirements. Ditulis di akhir,
  tapi divalidasi dengan benar-benar dijalankan ulang dari awal sebelum di-push.

## Security & data hygiene

- Tidak ada credential, API key, atau token apa pun di project ini. Kalau nanti ada
  kebutuhan itu, jangan pernah hardcode di kode — pakai environment variable dan
  tambahkan filenya ke `.gitignore`.
- Dataset UCI Online Retail II sudah anonim (`Customer ID` cuma angka, tidak ada nama
  atau alamat asli) — tidak ada isu data pribadi, tapi file mentah dan hasil olahan
  tetap tidak di-commit (soal ukuran repo, bukan privasi).
- `.gitignore` minimal: `data/`, `venv/`, `*.pbix`, `__pycache__/`, `.ipynb_checkpoints/`,
  `*.pyc`.

## Dataset

`data/raw/online_retail_II.xlsx` — UCI Online Retail II, ~1 juta baris, Des 2009–Des 2011.

Kolom: `Invoice`, `StockCode`, `Description`, `Quantity`, `InvoiceDate`, `Price`,
`Customer ID`, `Country`.

**PENTING:** file ini punya **dua sheet** (satu per rentang tahun). `pd.read_excel()`
default hanya membaca sheet pertama, dan separuh data hilang tanpa error apa pun.
Wajib `sheet_name=None` lalu concat.

Snapshot date untuk Recency: **2011-12-10**.

## Struktur

```
rfm-cohort-ecommerce/
├── data/
│   ├── raw/            # file mentah, gitignore, sisakan .gitkeep + catatan sumber
│   └── processed/      # retail_bersih.parquet
├── src/
│   ├── 00_cek_olist.py     # hitung repeat rate Olist, simpan hasil, selesai
│   ├── 01_load_clean.py
│   ├── 02_rfm.py
│   ├── 03_cohort.py
│   └── 04_churn_geo.py
├── sql/
│   ├── buat_database.py
│   └── queries.sql
├── output/
│   ├── rfm_table.csv
│   ├── cohort_matrix.csv
│   ├── segment_summary.csv
│   └── figures/
├── notebooks/analisis_lanjutan.ipynb
├── docs/bugs.md
├── dashboard/customer_analytics.pbix
├── README.md
├── requirements.txt     # versi package di-pin, lihat bagian Reproducibility
└── .gitignore
```

## Aturan cleaning (`01_load_clean.py`)

Urutannya penting — jangan diubah tanpa diskusi:

1. Baca semua sheet, concat jadi satu DataFrame
2. Buang baris dengan `Customer ID` kosong (sekitar 22% — catat berapa persen revenue
   yang ikut hilang, ini masuk README)
3. Buang invoice pembatalan (`Invoice` berawalan `C`), catat jumlahnya
4. Buang `Quantity <= 0` dan `Price <= 0`
5. Buang StockCode non-produk: `POST`, `D`, `M`, `C2`, `DOT`, `BANK CHARGES`, `PADS`,
   `CRUK`, `S`, `AMAZONFEE`, `B`
6. Buang baris duplikat persis (dataset ini memang punya)
7. Tambah kolom `Revenue = Quantity * Price`
8. `Customer ID` jadi integer
9. Simpan ke `data/processed/retail_bersih.parquet` (butuh `pyarrow`)

## Definisi yang sudah dikunci

- **Churn**: Recency > 180 hari pada snapshot date. Validasi dulu angka 180 ini dengan
  distribusi interval antar-order dari repeat customer di `04_churn_geo.py`; kalau
  distribusinya bilang lain, ganti dan catat alasannya.
- **Retained (cohort)**: customer yang belanja lagi di bulan ke-n setelah bulan pertama.
- **Geografis**: UK vs non-UK saja. Jangan pecah jadi 40 negara — sampelnya timpang.

## Skill yang harus terlihat di kode

Ini portofolio. Teknik berikut harus benar-benar muncul, jangan diakali dengan cara yang
lebih pendek:

- `NTILE(5) OVER (ORDER BY recency DESC)` untuk skor RFM di `queries.sql`
- `LAG()` untuk jarak hari antar order
- CTE bertingkat untuk rata-rata monetary & retention per cohort
- Self-join: order pertama tiap customer dipasangkan dengan order berikutnya

## Bug watchlist

Yang kemungkinan besar muncul. Kalau kejadian, catat di `docs/bugs.md`:

- Dua sheet di file Excel (lihat bagian Dataset)
- `qcut` error "Bin edges must be unique" kalau distribusi Frequency menumpuk →
  pakai `rank(method='first')` sebelum binning
- Pivot cohort menghasilkan MultiIndex kolom
- SQLite tidak punya tipe date native → `strftime('%Y-%m', ...)` untuk grouping bulan
- Encoding pada `Description` (ada karakter non-ASCII)
- Power BI butuh date table terpisah untuk cohort matrix
