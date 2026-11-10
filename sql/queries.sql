-- Kumpulan query analisis di atas tabel transactions (database PostgreSQL
-- "retail", dibuat oleh buat_database.py). Semuanya dihitung ulang langsung
-- dari transactions (bukan diimpor dari CSV hasil src/*.py) supaya jadi
-- validasi silang terhadap hasil Python.
--
-- InvoiceDate bertipe TIMESTAMP asli. Selisih hari dihitung dari selisih
-- detik dibagi 86.400 lalu dipotong ke bilangan bulat (TRUNC), bukan dari
-- pengurangan tanggal kalender: pengurangan tanggal menghitung selisih hari
-- kalender dan bisa beda satu hari dari selisih sebenarnya (mis. 08:00 hari
-- pertama ke 07:00 hari berikutnya = 0 hari, bukan 1). Grouping bulan
-- memakai to_char().

-- ============================================================================
-- Query 1: Skor RFM per customer pakai NTILE(5) OVER (ORDER BY ...).
-- Validasi silang terhadap output/rfm_table.csv (hasil src/02_rfm.py).
-- ============================================================================
WITH customer_rfm AS (
    SELECT
        CustomerID,
        TRUNC(
            EXTRACT(EPOCH FROM (TIMESTAMP '2011-12-10' - MAX(InvoiceDate))) / 86400
        )::INTEGER AS Recency,
        COUNT(DISTINCT Invoice) AS Frequency,
        SUM(Revenue) AS Monetary
    FROM transactions
    GROUP BY CustomerID
)
SELECT
    CustomerID,
    Recency,
    Frequency,
    Monetary,
    -- Recency: makin kecil (belanja baru-baru ini) makin bagus -> ORDER BY
    -- DESC, jadi bucket NTILE=5 jatuh ke Recency terkecil.
    NTILE(5) OVER (ORDER BY Recency DESC) AS R_score,
    -- Frequency & Monetary: makin besar makin bagus -> ORDER BY ASC, jadi
    -- bucket NTILE=5 jatuh ke nilai terbesar.
    NTILE(5) OVER (ORDER BY Frequency ASC) AS F_score,
    NTILE(5) OVER (ORDER BY Monetary ASC) AS M_score
FROM customer_rfm
ORDER BY CustomerID
LIMIT 20;


-- ============================================================================
-- Query 2: LAG() untuk jarak hari antar-order (invoice) per customer.
-- ============================================================================
WITH customer_orders AS (
    -- Satu invoice = satu order; ambil tanggal order pertama per invoice
    -- (bukan per baris item).
    SELECT
        CustomerID,
        Invoice,
        MIN(InvoiceDate) AS order_date
    FROM transactions
    GROUP BY CustomerID, Invoice
)
SELECT
    CustomerID,
    Invoice,
    order_date,
    LAG(order_date) OVER (PARTITION BY CustomerID ORDER BY order_date) AS order_sebelumnya,
    TRUNC(
        EXTRACT(EPOCH FROM (
            order_date
            - LAG(order_date) OVER (PARTITION BY CustomerID ORDER BY order_date)
        )) / 86400
    )::INTEGER AS interval_hari
FROM customer_orders
ORDER BY CustomerID, order_date
LIMIT 30;


-- ============================================================================
-- Query 3: CTE bertingkat -> rata-rata Monetary per cohort_month.
-- cohort_month ditentukan di dalam query ini (bulan transaksi pertama tiap
-- customer), bukan diimpor dari output/cohort_matrix.csv.
-- ============================================================================
WITH customer_monetary AS (
    -- CTE tingkat 1: total Monetary (lifetime) per customer.
    SELECT
        CustomerID,
        SUM(Revenue) AS Monetary
    FROM transactions
    GROUP BY CustomerID
),
customer_cohort AS (
    -- CTE tingkat 2: cohort_month = bulan transaksi pertama tiap customer.
    SELECT
        CustomerID,
        to_char(MIN(InvoiceDate), 'YYYY-MM') AS cohort_month
    FROM transactions
    GROUP BY CustomerID
)
-- CTE tingkat 3 (final): join keduanya, rata-rata Monetary per cohort_month.
-- ROUND(x, 2) di PostgreSQL hanya ada untuk tipe numeric, jadi AVG di-cast.
SELECT
    cc.cohort_month,
    COUNT(*) AS jumlah_customer,
    ROUND(AVG(cm.Monetary)::NUMERIC, 2) AS rata2_monetary
FROM customer_monetary AS cm
JOIN customer_cohort AS cc ON cc.CustomerID = cm.CustomerID
GROUP BY cc.cohort_month
ORDER BY cc.cohort_month;


-- ============================================================================
-- Query 4: Self-join -> order pertama tiap customer dipasangkan dengan
-- semua order berikutnya, untuk hitung interval repeat.
-- ============================================================================
WITH customer_orders AS (
    SELECT
        CustomerID,
        Invoice,
        MIN(InvoiceDate) AS order_date
    FROM transactions
    GROUP BY CustomerID, Invoice
),
order_pertama AS (
    SELECT
        CustomerID,
        MIN(order_date) AS first_order_date
    FROM customer_orders
    GROUP BY CustomerID
)
-- Self-join: customer_orders (semua order) dipasangkan dengan order_pertama
-- (order pertama tiap customer, dari tabel/CTE order yang sama) lewat
-- CustomerID, hanya ambil order yang tanggalnya setelah order pertama.
SELECT
    berikutnya.CustomerID,
    order_pertama.first_order_date,
    berikutnya.Invoice AS invoice_berikutnya,
    berikutnya.order_date AS tanggal_order_berikutnya,
    TRUNC(
        EXTRACT(EPOCH FROM (berikutnya.order_date - order_pertama.first_order_date)) / 86400
    )::INTEGER AS interval_hari_dari_order_pertama
FROM customer_orders AS berikutnya
JOIN order_pertama ON order_pertama.CustomerID = berikutnya.CustomerID
WHERE berikutnya.order_date > order_pertama.first_order_date
ORDER BY berikutnya.CustomerID, berikutnya.order_date
LIMIT 30;
