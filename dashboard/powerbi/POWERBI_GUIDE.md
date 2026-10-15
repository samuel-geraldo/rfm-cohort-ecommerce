# Panduan Dashboard Power BI

Paket ini dibangun otomatis oleh `src/07_powerbi_data.py` dari file di `output/`.
Isinya data siap impor, measure DAX, dan tema warna. Visualnya disusun di Power BI
Desktop (sekitar 20 sampai 30 menit), lalu disimpan sebagai
`dashboard/customer_analytics.pbix`. Tampilan acuannya ada di
[`preview-0-pengantar.png`](../preview-0-pengantar.png), [`preview-1-ringkasan.png`](../preview-1-ringkasan.png), [`preview-2-segmen.png`](../preview-2-segmen.png), dan [`preview-3-cohort.png`](../preview-3-cohort.png) di `dashboard/`.

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

## 3. Susun empat halaman

Tata letaknya sama dengan dashboard HTML (`dashboard/customer_analytics.html`): landscape,
tiap halaman satu fokus. Buat empat halaman dan beri nama **Mulai di sini**,
**Ringkasan**, **Segmen dan wilayah**, **Cohort retention**. Letakkan slicer `customers[Region]` dan
`customers[ChurnStatus]` di halaman pertama, lalu salin ke halaman 2 lewat
**View > Sync slicers**.

### Halaman 0: Mulai di sini

Halaman pembuka tanpa slicer, supaya siapa pun langsung tahu ini dashboard RFM dan cohort.
Isinya kotak teks dan satu tabel; tidak butuh measure baru.

| Visual | Isi | Catatan |
|---|---|---|
| Text box (judul) | "E-commerce Customer Analytics: RFM Segmentation dan Cohort Retention" | di bagian atas |
| Tiga text box | R Recency: berapa hari sejak belanja terakhir. F Frequency: berapa kali belanja. M Monetary: berapa total uang yang dibelanjakan | satu kotak per huruf; jelaskan skor 1 sampai 5 (5 terbaik) |
| Table | `segments[Segment]`, `[Customers]`, `[Avg Recency]`, `[Avg Frequency]`, `[Avg Monetary]` | contoh nyata per segmen; filter visual untuk Champions dan Hibernating saja |
| Matrix kecil | baris: `cohort_retention[cohort_month]`, kolom: `month_index`, nilai: `[Avg Retention %]` | filter visual: enam cohort pertama dan `month_index` 0 sampai 5, tampilkan nilainya |
| Text box | "Bulan 0 selalu 100%. Gambar lengkap ada di halaman Cohort retention." | |
| Page navigation | tombol ke tiga halaman lain (Insert > Buttons > Navigator > Page navigator) | |

### Halaman 1: Ringkasan

| Visual | Field | Catatan |
|---|---|---|
| Card (besar) | `[Champions Revenue Share]` | angka utama, ukuran font 48 ke atas |
| Card | `[Customers]` | |
| Card | `[Total Revenue]` | format £ |
| Card | `[Avg Order Value]` | format £ |
| Card | `[Churn Rate (Region)]` | format persen; pakai measure ini, bukan `[Churn Rate]`, supaya tidak jadi 100% saat slicer status = Churned |
| Clustered bar | sumbu: `segments[Segment]`, nilai: `[Revenue Share]` | urutkan menurun menurut `[Revenue Share]`; warnai Champions biru `#2a78d6`, segmen lain abu-abu (Format > Bars > Colors > fx) |
| Clustered bar | sumbu: `customers[ChurnStatus]`, nilai: `[Avg Order Value]` | aktif dibanding churn |

Saat slicer `ChurnStatus` = Churned, `[Champions Revenue Share]` akan kosong atau 0 dan itu
benar, bukan kesalahan measure. Churn berarti Recency lebih dari 180 hari, sedangkan Champions,
Potential Loyalists, Promising, dan New Customers dibentuk dari pelanggan yang baru belanja,
jadi tidak ada yang beririsan. Dashboard HTML menangani ini dengan menyorot segmen terbesar;
di Power BI cukup tambahkan kotak teks yang menjelaskannya di dekat slicer.

### Halaman 2: Segmen dan wilayah

| Visual | Field | Catatan |
|---|---|---|
| Table | `segments[Segment]`, `[Customers]`, `[Customer Share]`, `[Revenue Share]`, `[Avg Recency]`, `[Avg Frequency]`, `[Avg Monetary]` | urutkan menurut `[Revenue Share]` menurun |
| Clustered bar | sumbu: `customers[Region]`, nilai: `[Avg Order Value]` | Inggris dibanding luar Inggris |
| Clustered bar | sumbu: `customers[Region]`, nilai: `[Avg Frequency]` | |
| Clustered bar | sumbu: `customers[Region]`, nilai: `[Churn Rate (Region)]` | pakai measure ini supaya tidak ikut slicer status |

Untuk tiga bar wilayah, matikan pengaruh slicer Region: pilih slicer Region, **Format >
Edit interactions**, lalu klik ikon **None** di tiga visual itu. Halaman ini membandingkan
kedua wilayah, jadi tidak boleh tersaring ke salah satunya. Slicer status tetap berlaku untuk order value dan frequency, tapi tidak untuk churn.

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
| `[Churn Rate]` dan `[Churn Rate (Region)]` | 40.73% |
| `[Churn Rate (Region)]` Region = UK, status apa pun | 41.12% |
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
