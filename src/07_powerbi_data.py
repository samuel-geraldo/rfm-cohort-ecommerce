# 07_powerbi_data.py
# Menyiapkan paket impor Power BI di dashboard/powerbi/ dari CSV di output/:
# tabel data siap pakai, measure DAX, tema warna, dan panduan dengan angka acuan.
# Angka acuan dihitung dari data yang sama, jadi measure DAX bisa dicek setelah dibuat.
#
# Jalankan dari root repo:  python src/07_powerbi_data.py
# Tidak butuh data mentah; hanya file di output/.

import json
from pathlib import Path

import pandas as pd

FOLDER = Path("dashboard/powerbi")
FOLDER.mkdir(parents=True, exist_ok=True)

rfm = pd.read_csv("output/rfm_table.csv")
churn = pd.read_csv("output/churn_summary.csv")
ringkas_segmen = pd.read_csv("output/segment_summary.csv")
cohort = pd.read_csv("output/cohort_matrix.csv", index_col=0)

# --- customers.csv: satu baris per pelanggan ---
pelanggan = rfm.merge(
    churn[["CustomerID", "Country", "AverageOrderValue"]], on="CustomerID", how="left"
)
assert len(pelanggan) == 5861 and pelanggan["AverageOrderValue"].notna().all()
customers = pd.DataFrame({
    "CustomerID": pelanggan["CustomerID"],
    "Segment": pelanggan["Segment"],
    "ChurnStatus": pelanggan["ChurnStatus"],
    "Region": pelanggan["Country"].map(lambda n: "UK" if n == "United Kingdom" else "Non-UK"),
    "Country": pelanggan["Country"],
    "Recency": pelanggan["Recency"],
    "Frequency": pelanggan["Frequency"],
    "Monetary": pelanggan["Monetary"].round(2),
    "AvgOrderValue": pelanggan["AverageOrderValue"].round(2),
})
customers.to_csv(FOLDER / "customers.csv", index=False)

# --- segments.csv: tabel dimensi segmen + urutan (omzet terbesar = 1) ---
urut = ringkas_segmen.sort_values("Persen_monetary", ascending=False)["Segment"].tolist()
segments = pd.DataFrame({"Segment": urut, "SortOrder": range(1, len(urut) + 1)})
segments.to_csv(FOLDER / "segments.csv", index=False)

# --- cohort_retention.csv: format panjang; sel kosong (belum ada data) dibuang, bukan 0 ---
panjang = cohort.reset_index().melt(
    id_vars="cohort_month", var_name="month_index", value_name="retention_pct"
).dropna()
panjang["month_index"] = panjang["month_index"].astype(int)
panjang = panjang.sort_values(["cohort_month", "month_index"])
panjang.to_csv(FOLDER / "cohort_retention.csv", index=False)

# --- Angka acuan untuk memeriksa measure DAX ---
total_omzet = customers["Monetary"].sum()
champions = customers[customers["Segment"] == "Champions"]
rata_bulan = panjang.groupby("month_index")["retention_pct"].agg(["mean", "count"])
acuan = {
    "jumlah_pelanggan": len(customers),
    "total_omzet": total_omzet,
    "share_champions": champions["Monetary"].sum() / total_omzet * 100,
    "persen_churn": (customers["ChurnStatus"] == "Churned").mean() * 100,
    "aov_semua": customers["AvgOrderValue"].mean(),
    "aov_aktif": customers.loc[customers["ChurnStatus"] == "Active", "AvgOrderValue"].mean(),
    "aov_churn": customers.loc[customers["ChurnStatus"] == "Churned", "AvgOrderValue"].mean(),
    "aov_uk": customers.loc[customers["Region"] == "UK", "AvgOrderValue"].mean(),
    "aov_luar": customers.loc[customers["Region"] == "Non-UK", "AvgOrderValue"].mean(),
    "frq_uk": customers.loc[customers["Region"] == "UK", "Frequency"].mean(),
    "frq_luar": customers.loc[customers["Region"] == "Non-UK", "Frequency"].mean(),
    "churn_uk": (customers.loc[customers["Region"] == "UK", "ChurnStatus"] == "Churned").mean() * 100,
    "churn_luar": (customers.loc[customers["Region"] == "Non-UK", "ChurnStatus"] == "Churned").mean() * 100,
    "ret_1": rata_bulan.loc[1, "mean"], "ret_1_n": int(rata_bulan.loc[1, "count"]),
    "ret_6": rata_bulan.loc[6, "mean"], "ret_6_n": int(rata_bulan.loc[6, "count"]),
    "ret_24_n": int(rata_bulan.loc[24, "count"]),
}
# Pemeriksaan silang terhadap angka yang sudah ada di README
assert acuan["jumlah_pelanggan"] == 5861
assert round(acuan["share_champions"], 2) == 51.52
assert round(acuan["persen_churn"], 2) == 40.73
assert round(acuan["ret_1"], 2) == 20.99 and acuan["ret_1_n"] == 24
assert round(acuan["ret_6"], 2) == 17.88 and acuan["ret_6_n"] == 19
assert (round(acuan["frq_uk"], 2), round(acuan["frq_luar"], 2)) == (6.26, 6.19)
assert round(acuan["aov_aktif"], 2) == 407.81 and round(acuan["aov_churn"], 2) == 340.81

# --- measures.dax ---
DAX = """\
// Tempel satu per satu: Model view > tabel customers > New measure.
// Measure retention ditaruh di tabel cohort_retention.

// ===== Tabel customers =====
Customers = DISTINCTCOUNT ( customers[CustomerID] )

Total Revenue = SUM ( customers[Monetary] )

Avg Order Value = AVERAGE ( customers[AvgOrderValue] )

// Rata-rata per pelanggan, dipakai di tabel rincian segmen
Avg Recency = AVERAGE ( customers[Recency] )

Avg Frequency = AVERAGE ( customers[Frequency] )

Avg Monetary = AVERAGE ( customers[Monetary] )

Churn Rate =
DIVIDE (
    CALCULATE ( [Customers], customers[ChurnStatus] = "Churned" ),
    [Customers]
)

// Persen churn terhadap semua pelanggan di wilayah yang dipilih, tanpa memedulikan slicer status.
// Dipakai di kartu: kalau slicer status ikut berlaku, hasilnya selalu 100% (Churned) atau 0% (Active).
Churn Rate (Region) =
DIVIDE (
    CALCULATE ( [Customers], customers[ChurnStatus] = "Churned", REMOVEFILTERS ( customers[ChurnStatus] ) ),
    CALCULATE ( [Customers], REMOVEFILTERS ( customers[ChurnStatus] ) )
)

// Persen omzet satu segmen dari total omzet pada slicer yang aktif
Revenue Share =
DIVIDE (
    [Total Revenue],
    CALCULATE ( [Total Revenue], REMOVEFILTERS ( customers[Segment] ) )
)

Customer Share =
DIVIDE (
    [Customers],
    CALCULATE ( [Customers], REMOVEFILTERS ( customers[Segment] ) )
)

// Angka besar di kartu utama
Champions Revenue Share =
CALCULATE ( [Revenue Share], customers[Segment] = "Champions" )

Champions Customer Share =
CALCULATE ( [Customer Share], customers[Segment] = "Champions" )

// ===== Tabel cohort_retention =====
// Baris kosong sudah dibuang di CSV, jadi AVERAGE hanya menghitung cohort yang punya data
Avg Retention % = AVERAGE ( cohort_retention[retention_pct] ) / 100

Cohorts Averaged = DISTINCTCOUNT ( cohort_retention[cohort_month] )
"""
(FOLDER / "measures.dax").write_text(DAX, encoding="utf-8")

# --- theme.json: warna sama dengan dashboard HTML ---
tema = {
    "name": "Customer Analytics",
    "dataColors": ["#2a78d6", "#c3c2b7", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6", "#e34948"],
    "background": "#fcfcfb",
    "foreground": "#0b0b0b",
    "tableAccent": "#2a78d6",
}
(FOLDER / "theme.json").write_text(json.dumps(tema, indent=2), encoding="utf-8")

# --- POWERBI_GUIDE.md ---
a = acuan
PANDUAN = f"""# Panduan Dashboard Power BI

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
| `customers.csv` | satu baris per pelanggan: segmen, status churn, wilayah, Recency, Frequency, Monetary, AvgOrderValue | {len(customers):,} |
| `segments.csv` | daftar segmen dan urutan omzet (`SortOrder`) | {len(segments)} |
| `cohort_retention.csv` | retention per cohort per bulan, format panjang; sel yang belum punya data tidak disertakan | {len(panjang):,} |

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
| `[Customers]` | {a["jumlah_pelanggan"]:,} |
| `[Total Revenue]` | {a["total_omzet"]:,.2f} |
| `[Champions Revenue Share]` | {a["share_champions"]:.2f}% |
| `[Churn Rate]` dan `[Churn Rate (Region)]` | {a["persen_churn"]:.2f}% |
| `[Churn Rate (Region)]` Region = UK, status apa pun | {a["churn_uk"]:.2f}% |
| `[Avg Order Value]` | {a["aov_semua"]:.2f} |
| `[Avg Order Value]` untuk Active / Churned | {a["aov_aktif"]:.2f} / {a["aov_churn"]:.2f} |
| `[Avg Order Value]` dengan Region = UK / Non-UK | {a["aov_uk"]:.2f} / {a["aov_luar"]:.2f} |
| `[Avg Frequency]` Region = UK / Non-UK | {a["frq_uk"]:.2f} / {a["frq_luar"]:.2f} |
| `[Churn Rate]` Region = UK / Non-UK | {a["churn_uk"]:.2f}% / {a["churn_luar"]:.2f}% |
| `[Avg Retention %]` bulan ke-1 | {a["ret_1"]:.2f}% dari {a["ret_1_n"]} cohort |
| `[Avg Retention %]` bulan ke-6 | {a["ret_6"]:.2f}% dari {a["ret_6_n"]} cohort |
| `[Cohorts Averaged]` bulan ke-24 | {a["ret_24_n"]} |

Kalau ada yang berbeda, periksa relasi di Model view dan filter visualnya dulu.

## 5. Simpan dan lampirkan

Simpan sebagai `dashboard/customer_analytics.pbix`, lalu commit. Ukuran file kecil
(data hanya sekitar 6 ribu baris pelanggan dan 325 baris cohort).
"""
(FOLDER / "POWERBI_GUIDE.md").write_text(PANDUAN, encoding="utf-8")

print(f"Paket Power BI ditulis ke {FOLDER}/: customers ({len(customers)}), "
      f"segments ({len(segments)}), cohort_retention ({len(panjang)}), measures.dax, theme.json, POWERBI_GUIDE.md")
print("Semua pemeriksaan silang terhadap README lulus.")
