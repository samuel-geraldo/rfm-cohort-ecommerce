# Panduan Dashboard Power BI

Paket ini dibangun otomatis oleh `src/07_powerbi_data.py` dari file di `output/`.
Isinya data siap impor, measure DAX, dan tema warna. Visualnya disusun di Power BI
Desktop (sekitar 20 sampai 30 menit), lalu disimpan sebagai
`dashboard/customer_analytics.pbix`. Tampilan acuannya ada di
[`dashboard/preview.png`](../preview.png).

> Measure DAX di sini belum diuji di Power BI Desktop. Gunakan angka acuan di
> bagian bawah untuk memeriksanya setelah dibuat.

## 1. Impor data

Power BI Desktop > **Get data** > **Text/CSV**. Muat tiga file dari folder ini:

| File | Isi | Baris |
|---|---|---:|
| `customers.csv` | satu baris per pelanggan: segmen, status churn, wilayah, Recency, Frequency, Monetary, AvgOrderValue | 5,861 |
| `segments.csv` | daftar segmen dan urutan omzet (`SortOrder`) | 10 |
| `cohort_retention.csv` | retention per cohort per bulan, format panjang; sel yang belum punya data tidak disertakan | 325 |

Di **Model view**, buat relasi `segments[Segment]` (satu) ke `customers[Segment]`
(banyak). Tabel `cohort_retention` sengaja tidak punya relasi: data cohort tidak
tersedia per pelanggan, jadi slicer wilayah dan status tidak memengaruhinya.

Di Data view, pilih kolom `segments[Segment]`, lalu **Sort by column** > `SortOrder`.

## 2. Tema dan measure

- **View > Themes > Browse for themes** > pilih `theme.json`.
- Tempel measure dari [`measures.dax`](measures.dax) satu per satu lewat **New measure**.

## 3. Susun tiga halaman

Tata letaknya sama dengan dashboard HTML (`dashboard/customer_analytics.html`): landscape,
tiap halaman satu fokus. Buat tiga halaman dan beri nama **Ringkasan**,
**Segmen dan wilayah**, **Cohort retention**. Letakkan slicer `customers[Region]` dan
`customers[ChurnStatus]` di halaman pertama, lalu salin ke halaman 2 lewat
**View > Sync slicers**.

### Halaman 1: Ringkasan

| Visual | Field | Catatan |
|---|---|---|
| Card (besar) | `[Champions Revenue Share]` | angka utama, ukuran font 48 ke atas |
| Card | `[Customers]` | |
| Card | `[Total Revenue]` | format £ |
| Card | `[Avg Order Value]` | format £ |
| Card | `[Churn Rate]` | format persen |
| Clustered bar | sumbu: `segments[Segment]`, nilai: `[Revenue Share]` | urutkan menurun menurut `[Revenue Share]`; warnai Champions biru `#2a78d6`, segmen lain abu-abu (Format > Bars > Colors > fx) |
| Clustered bar | sumbu: `customers[ChurnStatus]`, nilai: `[Avg Order Value]` | aktif dibanding churn |

### Halaman 2: Segmen dan wilayah

| Visual | Field | Catatan |
|---|---|---|
| Table | `segments[Segment]`, `[Customers]`, `[Customer Share]`, `[Revenue Share]`, `[Avg Recency]`, `[Avg Frequency]`, `[Avg Monetary]` | urutkan menurut `[Revenue Share]` menurun |
| Clustered bar | sumbu: `customers[Region]`, nilai: `[Avg Order Value]` | Inggris dibanding luar Inggris |
| Clustered bar | sumbu: `customers[Region]`, nilai: `[Avg Frequency]` | |
| Clustered bar | sumbu: `customers[Region]`, nilai: `[Churn Rate]` | |

Untuk tiga bar wilayah, matikan pengaruh slicer Region: pilih slicer Region, **Format >
Edit interactions**, lalu klik ikon **None** di tiga visual itu. Halaman ini membandingkan
kedua wilayah, jadi tidak boleh tersaring ke salah satunya. Slicer status tetap berlaku.

### Halaman 3: Cohort retention

| Visual | Field | Catatan |
|---|---|---|
| Line chart | sumbu: `cohort_retention[month_index]`, nilai: `[Avg Retention %]` | filter visual: `month_index` lebih besar dari 0; tambahkan `[Cohorts Averaged]` ke Tooltips |
| Matrix | baris: `cohort_retention[cohort_month]`, kolom: `month_index`, nilai: `[Avg Retention %]` | Format > Cell elements > Background color > Gradient, minimum 0, maksimum 0,5 |

Halaman ini tidak punya slicer: tabel cohort tidak berelasi ke `customers`, jadi tidak
tersaring. Makin ke kanan, makin sedikit cohort yang ikut dirata-rata. Bulan ke-24 hanya
berasal dari satu cohort.

## 4. Periksa dengan angka acuan

Dengan semua slicer kosong, measure harus menghasilkan:

| Measure | Hasil yang diharapkan |
|---|---|
| `[Customers]` | 5,861 |
| `[Total Revenue]` | 17,073,078.29 |
| `[Champions Revenue Share]` | 51.52% |
| `[Churn Rate]` | 40.73% |
| `[Avg Order Value]` | 380.53 |
| `[Avg Order Value]` untuk Active / Churned | 407.81 / 340.81 |
| `[Avg Order Value]` dengan Region = UK / Non-UK | 356.13 / 627.92 |
| `[Avg Frequency]` Region = UK / Non-UK | 6.26 / 6.19 |
| `[Churn Rate]` Region = UK / Non-UK | 41.12% / 36.69% |
| `[Avg Retention %]` bulan ke-1 | 20.99% dari 24 cohort |
| `[Avg Retention %]` bulan ke-6 | 17.88% dari 19 cohort |
| `[Cohorts Averaged]` bulan ke-24 | 1 |

Kalau ada yang berbeda, periksa relasi di Model view dan filter visualnya dulu.

## 5. Simpan dan lampirkan

Simpan sebagai `dashboard/customer_analytics.pbix`, lalu commit. Ukuran file kecil
(data hanya sekitar 6 ribu baris pelanggan dan 325 baris cohort).
