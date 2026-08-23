-- Kumpulan query analisis di atas tabel transactions (sql/retail.db, dibuat
-- oleh buat_database.py). Semuanya dihitung ulang langsung dari transactions
-- (bukan diimpor dari CSV hasil src/*.py) supaya jadi validasi silang
-- terhadap hasil Python.
--
-- SQLite tidak punya tipe date native -> InvoiceDate disimpan sebagai TEXT
-- ISO, dipakai lewat julianday() (selisih tanggal) dan strftime() (grouping
-- bulan).

-- ============================================================================
-- Query 1: Skor RFM per customer pakai NTILE(5) OVER (ORDER BY ...).
-- Validasi silang terhadap output/rfm_table.csv (hasil src/02_rfm.py).
-- ============================================================================
WITH customer_rfm AS (
    SELECT
        CustomerID,
        CAST(julianday('2011-12-10') - julianday(MAX(InvoiceDate)) AS INTEGER) AS Recency,
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
    CAST(
        julianday(order_date)
        - julianday(LAG(order_date) OVER (PARTITION BY CustomerID ORDER BY order_date))
        AS INTEGER
    ) AS interval_hari
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
        strftime('%Y-%m', MIN(InvoiceDate)) AS cohort_month
    FROM transactions
    GROUP BY CustomerID
)
-- CTE tingkat 3 (final): join keduanya, rata-rata Monetary per cohort_month.
SELECT
    cc.cohort_month,
    COUNT(*) AS jumlah_customer,
    ROUND(AVG(cm.Monetary), 2) AS rata2_monetary
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
    CAST(
        julianday(berikutnya.order_date) - julianday(order_pertama.first_order_date)
        AS INTEGER
    ) AS interval_hari_dari_order_pertama
FROM customer_orders AS berikutnya
JOIN order_pertama ON order_pertama.CustomerID = berikutnya.CustomerID
WHERE berikutnya.order_date > order_pertama.first_order_date
ORDER BY berikutnya.CustomerID, berikutnya.order_date
LIMIT 30;
