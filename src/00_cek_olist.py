"""
00_cek_olist.py

Cek kelayakan dataset Olist Brazilian E-Commerce sebagai alternatif Online
Retail II, khusus untuk analisis RFM & cohort. Script ini berdiri sendiri —
tidak dipakai pipeline utama, dan tidak menulis apa pun ke data/processed/.

Alasan script ini ada: keputusan menolak Olist harus bisa dibuktikan ulang,
bukan cuma diklaim di README.

Yang dicek dua hal:

1. Jebakan kolom. Di Olist, `customer_id` pada tabel orders itu UNIK PER
   ORDER, bukan per pelanggan. Pelanggan yang sebenarnya ada di
   `customer_unique_id` pada tabel customers. Kalau RFM dihitung pakai
   `customer_id`, semua Frequency = 1 dan seluruh sel cohort retention jadi
   0% — dan tidak ada satu pun error yang muncul untuk memberi tahu.

2. Repeat purchase rate memakai kolom yang benar. Kalau terlalu rendah,
   cohort matrix-nya nyaris kosong dan analisis retention kehilangan makna.

Dataset Olist tidak disertakan di repo (lihat .gitignore). Unduh dari
https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce lalu taruh
`olist_orders_dataset.csv` dan `olist_customers_dataset.csv` di data/raw/.
"""

import sys
from pathlib import Path

import pandas as pd

PATH_ORDERS = Path("data/raw/olist_orders_dataset.csv")
PATH_CUSTOMERS = Path("data/raw/olist_customers_dataset.csv")

# Di bawah ambang ini, cohort retention matrix tidak layak dibuat: sebagian
# besar selnya akan mendekati nol dan heatmap-nya tidak menunjukkan apa pun.
AMBANG_REPEAT_RATE_LAYAK = 15.0  # persen


def main() -> int:
    if not PATH_ORDERS.exists() or not PATH_CUSTOMERS.exists():
        print("File Olist tidak ditemukan. Yang dibutuhkan:")
        print(f"  {PATH_ORDERS}")
        print(f"  {PATH_CUSTOMERS}")
        print("\nUnduh dari https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce")
        print("lalu taruh kedua file itu di data/raw/.")
        return 1

    orders = pd.read_csv(PATH_ORDERS, usecols=["order_id", "customer_id"])
    customers = pd.read_csv(PATH_CUSTOMERS, usecols=["customer_id", "customer_unique_id"])
    print(f"orders   : {len(orders):,} baris")
    print(f"customers: {len(customers):,} baris")

    # 1. Buktikan jebakan kolomnya: bandingkan jumlah nilai unik dua kolom itu.
    n_customer_id = orders["customer_id"].nunique()
    n_order_id = orders["order_id"].nunique()
    n_unique_customer = customers["customer_unique_id"].nunique()
    print("\n[1] Jebakan kolom")
    print(f"  order_id unik           : {n_order_id:,}")
    print(f"  customer_id unik        : {n_customer_id:,}  <- ikut jumlah order, bukan pelanggan")
    print(f"  customer_unique_id unik : {n_unique_customer:,}  <- pelanggan yang sebenarnya")

    # Kalau customer_id benar-benar per order, jumlahnya akan sama persis
    # dengan jumlah order.
    if n_customer_id == n_order_id:
        print("  -> TERKONFIRMASI: customer_id unik per order, bukan per pelanggan.")
        print("     Pakai customer_id untuk RFM = semua Frequency 1 dan cohort 0%, tanpa error.")

    # 2. Repeat purchase rate dengan kolom yang benar.
    gabung = orders.merge(customers, on="customer_id", how="left")
    order_per_pelanggan = gabung.groupby("customer_unique_id")["order_id"].nunique()
    n_repeat = (order_per_pelanggan > 1).sum()
    repeat_rate = n_repeat / len(order_per_pelanggan) * 100

    print("\n[2] Repeat purchase rate (pakai customer_unique_id)")
    print(f"  total pelanggan          : {len(order_per_pelanggan):,}")
    print(f"  pelanggan dengan >1 order: {n_repeat:,}")
    print(f"  repeat purchase rate     : {repeat_rate:.2f}%")

    # Pembanding kalau kolomnya salah dipilih — angka inilah yang bikin orang
    # mengira datasetnya rusak padahal cuma salah kolom.
    repeat_rate_salah = (orders.groupby("customer_id")["order_id"].nunique() > 1).mean() * 100
    print(f"  (kalau salah pakai customer_id: {repeat_rate_salah:.2f}%)")

    print("\n[Kesimpulan]")
    if repeat_rate < AMBANG_REPEAT_RATE_LAYAK:
        print(
            f"  Repeat purchase rate {repeat_rate:.2f}% di bawah ambang layak "
            f"{AMBANG_REPEAT_RATE_LAYAK:.0f}%.\n"
            "  Olist TIDAK dipakai: cohort retention matrix-nya akan nyaris kosong dan\n"
            "  komponen retention dari analisis ini kehilangan isi. Dataset utama tetap\n"
            "  Online Retail II (UCI), yang repeat customer-nya 4.236 dari 5.861 (72%)."
        )
    else:
        print(
            f"  Repeat purchase rate {repeat_rate:.2f}% di atas ambang layak "
            f"{AMBANG_REPEAT_RATE_LAYAK:.0f}% — Olist layak dipertimbangkan."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
