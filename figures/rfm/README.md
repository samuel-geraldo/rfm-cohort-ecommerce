# Figur segmentasi RFM

Sumber figur interaktif di `docs/rfm/index.html` (GitHub Pages) dan preview `docs/rfm/rfm-figure.{svg,png}`.

Semua angka dibaca dari `output/figur/rfm_segments.json`, jadi urutannya:

```bash
python src/export_figure_data.py            # ringkasan segmen dari output/rfm_table.csv
node figures/rfm/build.mjs                  # halaman + SVG (Node 18+)
node figures/rfm/build.mjs --audit          # opsional: cek urutan gambar & tumpuan di tiap pose gerak (beberapa menit)
```

PNG preview diambil dari SVG dengan screenshot headless Chrome (skrip `capture.mjs` dari Anatomy).

Isi folder:

- `build.mjs`: geometri mesin, urutan gambar, audit, dan halaman.
- `layout.mjs`: tata letak laci. Sel R × F dipotong lurus berulang sehingga luas tiap sel = jumlah customer-nya, dan sekat hanya berdiri di antara dua segmen.
- `motion.mjs`: gerak satu contoh customer sebagai fungsi waktu, dipakai halaman dan audit.
- `live.js`: interaksi halaman (pilih segmen, jalankan contoh, tur saat diam).
- `kit/`: kit Anatomy (`iso-kit.mjs`, `audit.mjs`, `lathe.mjs`, `tube.mjs`) tanpa perubahan, berlisensi MIT: lihat `LICENSE-anatomy`.
