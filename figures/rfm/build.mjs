// Figur interaktif "cara kerja segmentasi RFM": mesin sortir customer di atas laci tipe-case.
//
// Semua angka dibaca dari output/figur/rfm_segments.json (hasil src/export_figure_data.py):
// luas tiap sel laci = jumlah customer di kombinasi skor R x F itu, jumlah gulungan koin =
// revenue segmen (satu gulungan penuh = £1 juta), dan 10 token di magasin = 10 contoh customer (satu per segmen).
//
//   node figures/rfm/build.mjs           -> docs/rfm/index.html + docs/rfm/rfm-figure.svg
//   node figures/rfm/build.mjs --audit   -> juga cek urutan gambar & tumpuan di banyak pose (kit/audit.mjs)
//
// kit/ adalah Anatomy (MIT, lihat LICENSE-anatomy).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./kit/audit.mjs";
import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/lathe.mjs";
import { cartogram, compartments } from "./layout.mjs";
import { planOf, poseAt } from "./motion.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DATA = JSON.parse(readFileSync(join(ROOT, "output", "figur", "rfm_segments.json"), "utf8"));
const { meta: META, segments: SEGMENTS, rf_grid: GRID, score_bins: BINS, examples: EXAMPLES } = DATA;

const total = (list, key) => list.reduce((sum, item) => sum + item[key], 0);
if (total(GRID, "customers") !== META.total_customers) throw new Error("rf_grid tidak menjumlah ke total customer");
for (const seg of SEGMENTS) {
  const inGrid = total(GRID.filter((cell) => cell.segment === seg.segment), "customers");
  if (inGrid !== seg.customers) throw new Error(`${seg.segment}: ${inGrid} di rf_grid vs ${seg.customers} di segments`);
}
for (const ex of EXAMPLES) {
  const cell = GRID.find((c) => c.r === ex.r && c.f === ex.f);
  if (!cell || cell.segment !== ex.segment) throw new Error(`contoh #${ex.customer_no}: sel R${ex.r}F${ex.f} bukan ${ex.segment}`);
}

// ---------------------------------------------------------------- dunia
// x = skor F naik ke kanan, y = ke arah pembaca (skor R turun ke depan), z = ke atas.

const WIDTH = 640;
const TRAY = { x: 0, y: 0, w: 250, d: 140 };
const FLOOR = 2; // lantai laci
const WALL_T = 0.8;
const WALL_H = 3.6;
const RIM_T = 3.5;
const RIM_TOP = 7;

const COIN_R = 2.9;
const ROLL_VALUE = 1e6; // satu gulungan penuh = £1 juta
const ROLL_H = 16;
const SEAM_VALUE = 250000; // garis tipis tiap £250 ribu
const ROLL_GAP = 6.6;

const TOKEN_R = 3;
const TOKEN_H = 1.4;
const TOKEN_Z = FLOOR + ROLL_H + 3.5; // dasar token yang tergantung, di atas gulungan tertinggi
const HEAD_Z = TOKEN_Z + TOKEN_H; // muka kutub magnet
const TOKEN_DY = 10; // token 10 unit di depan sumbu balok
const Y_HOME = -11; // y token saat jembatan di rumah (di belakang laci)
const X_HOME = 14; // magasin token
const GATE_X = [40, 66, 92];
const GATE_KEYS = ["R", "F", "M"];
const SHELF_Z = TOKEN_Z - 1.6;
const DIAL = { z: (8.5 + SHELF_Z) / 2, r: 5, face: 0.8, ring: 4.2, needle: 3.7, rest: 200 };
const angleOfScore = (score) => 180 - (score - 0.5) * 36; // 5 sektor sama lebar: skor 1 kiri, 5 kanan

// Gantry "goliath": rel di lantai, kaki ikut berjalan bersama jembatan.
const XL = -14;
const XR = 266;
const RAIL_H = 2.4;
const TRUCK_Z = [RAIL_H, 8];
const BEAM_Z = [HEAD_Z + 4.6, HEAD_Z + 11.6];
const LEG_Z = [8, BEAM_Z[0]];
const PLATE_Z = [HEAD_Z + 3.1, HEAD_Z + 13.1];
const RAIL_Y = [-44, 150];
const YB_HOME = Y_HOME - TOKEN_DY;
const BENCH = { x: -30, y: -54, w: 312, d: 218, r: 9 };
const BENCH_H = 10;
const FOOT_H = 5;

const { cells: CELLS, cuts: CUTS } = cartogram(GRID, TRAY);
const BOXES = compartments(CELLS);
const AREA_PER_CUSTOMER = (TRAY.w * TRAY.d) / META.total_customers;
for (const cell of CELLS) {
  if (Math.abs(cell.w * cell.d - cell.customers * AREA_PER_CUSTOMER) > 1e-6) throw new Error(`luas sel R${cell.r}F${cell.f} tidak sebanding jumlah customer`);
}
const SEG_INDEX = new Map(SEGMENTS.map((seg, index) => [seg.segment, index]));

// Ruang dalam tiap kotak: dikurangi setengah tebal sekat, kecuali di tepi laci (muka bingkai).
const inner = (box) => ({
  x0: box.x0 + (box.x0 > TRAY.x + 1e-6 ? WALL_T / 2 : 0),
  x1: box.x1 - (box.x1 < TRAY.x + TRAY.w - 1e-6 ? WALL_T / 2 : 0),
  y0: box.y0 + (box.y0 > TRAY.y + 1e-6 ? WALL_T / 2 : 0),
  y1: box.y1 - (box.y1 < TRAY.y + TRAY.d - 1e-6 ? WALL_T / 2 : 0),
});

// Gulungan koin berjajar di sepanjang sekat belakang kotak, mulai dari satu pojok.
// Loyal Customers mulai dari kiri supaya jajarannya tidak sejajar dengan Champions di belakangnya.
const ROLL_FROM_LEFT = new Set(["Loyal Customers", "New Customers"]);
const ROLLS = SEGMENTS.map((seg) => {
  const box = inner(BOXES.get(seg.segment));
  const amount = seg.revenue / ROLL_VALUE;
  const full = Math.floor(amount);
  const heights = Array.from({ length: full }, () => ROLL_H);
  if (amount - full > 1e-9) heights.push((amount - full) * ROLL_H);
  const inset = COIN_R + 1.4;
  const room = box.x1 - box.x0;
  const perRow = Math.max(1, Math.floor((room - 2 * inset) / ROLL_GAP) + 1);
  const rolls = heights.map((h, index) => {
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    const cx = room < 2 * inset ? (box.x0 + box.x1) / 2 : ROLL_FROM_LEFT.has(seg.segment) ? box.x0 + inset + col * ROLL_GAP : box.x1 - inset - col * ROLL_GAP;
    return { cx, cy: box.y0 + inset + row * ROLL_GAP, h, value: Math.min(ROLL_VALUE, seg.revenue - index * ROLL_VALUE) };
  });
  return { seg, rolls };
});

// Titik jatuh tiap contoh: titik di selnya yang paling dekat pusat sel dan bebas dari gulungan.
const TARGETS = EXAMPLES.map((ex) => {
  const cell = CELLS.find((c) => c.r === ex.r && c.f === ex.f);
  const { rolls } = ROLLS[SEG_INDEX.get(ex.segment)];
  // Jarak aman ke sekat: 1,2 normal; sel yang terlalu sempit (mis. kolom F5) dilonggarkan jadi 0,6.
  const padFor = (size) => TOKEN_R + (size >= 2 * (TOKEN_R + 1.2) ? 1.2 : 0.6);
  const [padX, padY] = [padFor(cell.w), padFor(cell.d)];
  const need = COIN_R + TOKEN_R + 1.4;
  const centre = [cell.x + cell.w / 2, cell.y + cell.d / 2];
  let best = null;
  for (let x = cell.x + padX; x <= cell.x + cell.w - padX + 1e-9; x += 0.5) {
    for (let y = cell.y + padY; y <= cell.y + cell.d - padY + 1e-9; y += 0.5) {
      if (rolls.some((roll) => Math.hypot(x - roll.cx, y - roll.cy) < need)) continue;
      const score = Math.hypot(x - centre[0], y - centre[1]);
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  if (!best) throw new Error(`contoh #${ex.customer_no}: tidak ada ruang di sel R${ex.r}F${ex.f} (${cell.w.toFixed(1)} × ${cell.d.toFixed(1)}, perlu ≥ ${(2 * padX).toFixed(1)} × ${(2 * padY).toFixed(1)})`);
  return { ex, cell, x: best.x, y: best.y, seg: SEG_INDEX.get(ex.segment) };
});

const MOTION = { xHome: X_HOME, yHome: Y_HOME, gates: GATE_X, tokenZ: TOKEN_Z, floorZ: FLOOR, g: 260 };

const AZIMUTH = 60;
const ELEVATION = 32;
const PAD = 12;
const FIT = [...k.boxCorners(BENCH, -BENCH_H - FOOT_H, 0), [XL - 2.5, YB_HOME - 3.5, BEAM_Z[1]], [XR + 2.5, YB_HOME - 3.5, BEAM_Z[1]], [XR + 2.5, YB_HOME + 3.5, BEAM_Z[1]]];
const HEIGHT = (() => {
  const loose = k.fitProjection(FIT, WIDTH, 10000, { pad: PAD, azimuth: AZIMUTH, elevation: ELEVATION });
  const ys = FIT.map((point) => k.iso(point, loose)[1]);
  return Math.ceil(Math.max(...ys) - Math.min(...ys) + 2 * PAD);
})();
const P = k.fitProjection(FIT, WIDTH, HEIGHT, { pad: PAD, azimuth: AZIMUTH, elevation: ELEVATION });

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const screws = (plan, z, inset = 2.2, size = 0.45) => D(k.corners(plan, inset).map(([x, y]) => at([x, y, z])), { size });
const frontFrame = (x, y, z) => G.frameOf([x, y, z], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const sideFrame = (x, y, z) => G.frameOf([x, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const pathAt = (points, closed = false) => k.pathOf(points.map(at), closed);

// ---------------------------------------------------------------- bagian yang juga digambar ulang di halaman
// Fungsi-fungsi ini dikirim apa adanya ke halaman (toString), jadi hanya memakai argumennya.

function rollsSvg(K, P, rolls, z0, r, seamStep, lit) {
  const sorted = [...rolls].sort((a, b) => K.depthOf([a.cx, a.cy, 0], P) - K.depthOf([b.cx, b.cy, 0], P));
  let out = "";
  for (const roll of sorted) {
    const h = Math.max(roll.h, 0.08);
    let seams = "";
    for (let z = z0 + seamStep; z < z0 + h - 0.3; z += seamStep) seams += K.lineSvg(K.sideArc(roll.cx, roll.cy, r, z, P, 40), { tone: "faint" });
    out += K.solidSvg(K.cylinder(roll.cx, roll.cy, r, z0, h, P, 40), { tone: "hi", lit, inner: seams, className: "rf-roll" }) + K.lineSvg(K.ring(roll.cx, roll.cy, r - 0.75, z0 + h, P, 32), { tone: "faint" });
  }
  return out;
}

function tokenSvg(K, P, cx, cy, z, lit) {
  return K.solidSvg(K.cylinder(cx, cy, 3, z, 1.4, P, 32, 0.3), { tone: "hi", lit, className: "rf-token" }) + K.lineSvg(K.ring(cx, cy, 2, z + 1.4, P, 24), { tone: "lo" });
}

// Isi magasin: batang dorong, pelat, lalu n token; token teratas selalu di muka kutub magnet.
// rise 0..1: setelah token atas diambil, sisa tumpukan naik satu tebal token.
function magazineSvg(K, P, M, n, rise) {
  const top = M.top - (1 - rise) * M.token;
  const plate = top - n * M.token;
  let out = K.solidSvg(K.cylinder(M.x, M.y, 0.9, M.cup, plate - 0.6 - M.cup, P, 12), { tone: "mid", crease: "none" });
  out += K.solidSvg(K.cylinder(M.x, M.y, 3.3, plate - 0.6, 0.6, P, 32), { tone: "mid" });
  for (let i = 0; i < n; i++) out += K.solidSvg(K.cylinder(M.x, M.y, 3, plate + i * M.token, M.token, P, 32, 0.3), { tone: "hi" }) + K.lineSvg(K.ring(M.x, M.y, 2, plate + (i + 1) * M.token, P, 24), { tone: "lo" });
  return out;
}
// cup = bibir mangkuk; harus di bawah dasar tumpukan penuh (HEAD_Z - 10 × TOKEN_H - 0,6).
const MAG = { x: X_HOME, y: Y_HOME, top: HEAD_Z, token: TOKEN_H, cup: 8 };
const MAG_CUP_BASE = 5; // dasar mangkuk di atas kolom
function magazineShapes(n, rise) {
  const top = MAG.top - (1 - rise) * MAG.token;
  const plate = top - n * MAG.token;
  return [
    A.cylinder(MAG.x, MAG.y, 0.9, MAG.cup, plate - 0.6 - MAG.cup, { name: "magazine.rod" }),
    A.cylinder(MAG.x, MAG.y, 3.3, plate - 0.6, 0.6, { name: "magazine.plate" }),
    ...Array.from({ length: n }, (_, i) => A.cylinder(MAG.x, MAG.y, 3, plate + i * MAG.token, MAG.token, { name: `magazine.token${i}` })),
  ];
}

// ---------------------------------------------------------------- adegan statis

function staticItems() {
  const items = [];
  const put = (name, svg, shapes, extra = {}) => items.push({ name, svg, shapes, ...extra });

  // Kaki dan meja.
  for (const [index, [x, y]] of byDepth(k.corners(BENCH, 26)).entries()) {
    put(
      `stand.foot${index}`,
      S(k.cylinder(x, y, 8, -BENCH_H - FOOT_H, 1.6, P, 32), { tone: "lo" }) + S(k.cylinder(x, y, 6, -BENCH_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 32), { tone: "mid" }),
      [A.cylinder(x, y, 8, -BENCH_H - FOOT_H, 1.6, { name: `stand.flange${index}` }), A.cylinder(x, y, 6, -BENCH_H - FOOT_H + 1.6, FOOT_H - 1.6, { name: `stand.foot${index}` })],
      { at: [x, y, -BENCH_H], key: -2e6 + index },
    );
  }
  put(
    "stand.bench",
    S(k.slabOf(BENCH, -BENCH_H, BENCH_H, P, 8, 1.6), { tone: "mid" }) +
      L(k.planOutline(k.insetPlan(BENCH, 5), 0, P), { tone: "lo" }) +
      L(k.corners(BENCH, 11).map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }) +
      screws(BENCH, 0, 11, 0.55),
    [A.slab(BENCH, -BENCH_H, BENCH_H, { name: "stand.bench" })],
    { at: [BENCH.x + BENCH.w / 2, BENCH.y + BENCH.d / 2, -BENCH_H], key: -1e6 },
  );

  // Laci: alas dengan lantai, inlay tiap kotak segmen, garis sel R x F.
  {
    const base = { x: TRAY.x, y: TRAY.y, w: TRAY.w, d: TRAY.d, r: 0.6 };
    let floor = "";
    for (const seg of SEGMENTS) {
      const box = inner(BOXES.get(seg.segment));
      const plan = { x: box.x0 + 1.3, y: box.y0 + 1.3, w: box.x1 - box.x0 - 2.6, d: box.y1 - box.y0 - 2.6, r: 1 };
      floor += `<path class="seg-floor" data-seg-floor="${SEG_INDEX.get(seg.segment)}" d="${k.planOutline(plan, FLOOR, P)}"/>`;
    }
    for (const cut of CUTS.filter((c) => !c.wall)) {
      floor += L(cut.axis === "f" ? k.lineOnTop([cut.x, cut.y0], [cut.x, cut.y1], FLOOR, P) : k.lineOnTop([cut.x0, cut.y], [cut.x1, cut.y], FLOOR, P), { tone: "lo" });
    }
    put("tray.base", S(k.slabOf(base, 0, FLOOR, P, 2), { tone: "lo" }) + floor, [A.slab(base, 0, FLOOR, { name: "tray.base" }, 2)], { at: [125, 70, 0], key: -9e5 });
  }
  const rims = [
    ["tray.rim.back", { x: TRAY.x - RIM_T, y: TRAY.y - RIM_T, w: TRAY.w + 2 * RIM_T, d: RIM_T, r: 1 }],
    ["tray.rim.left", { x: TRAY.x - RIM_T, y: TRAY.y, w: RIM_T, d: TRAY.d, r: 0.3 }],
    ["tray.rim.right", { x: TRAY.x + TRAY.w, y: TRAY.y, w: RIM_T, d: TRAY.d, r: 0.3 }],
    ["tray.rim.front", { x: TRAY.x - RIM_T, y: TRAY.y + TRAY.d, w: TRAY.w + 2 * RIM_T, d: RIM_T, r: 1 }],
  ];
  for (const [name, plan] of rims) {
    // Siku logam di empat sudut laci, di atas bingkai depan dan belakang.
    const fittings = name === "tray.rim.back" || name === "tray.rim.front" ? [plan.x, plan.x + plan.w - 6].map((x) => ({ x, y: plan.y, w: 6, d: RIM_T, r: 0.8 })) : [];
    put(
      name,
      S(k.slabOf(plan, 0, RIM_TOP, P, 3, 0.5), { tone: "mid" }) + fittings.map((fit) => S(k.slabOf(fit, RIM_TOP, 0.5, P, 3, 0.3), { tone: "mid" }) + D([at([fit.x + 1.6, fit.y + RIM_T / 2, RIM_TOP + 0.5]), at([fit.x + fit.w - 1.6, fit.y + RIM_T / 2, RIM_TOP + 0.5])], { size: 0.4 })).join(""),
      [A.slab(plan, 0, RIM_TOP, { name }, 3), ...fittings.map((fit, index) => A.slab(fit, RIM_TOP, 0.5, { name: `${name}.fitting${index}` }, 3))],
      { at: [plan.x + plan.w / 2, plan.y + plan.d / 2, RIM_TOP / 2] },
    );
  }
  // Pegangan laci dan tempat kartu di muka depan.
  {
    const y = TRAY.y + TRAY.d + RIM_T;
    const posts = [113, 137].map((x) => ({ x: x - 1.1, y, w: 2.2, d: 3.2, r: 0.5 }));
    const bar = { x: 110.5, y: y + 3.2, w: 29, d: 1.8, r: 0.8 };
    put(
      "tray.pull",
      posts.map((plan) => S(k.slabOf(plan, 2.4, 2.4, P, 2), { tone: "mid" })).join("") + S(k.slabOf(bar, 2.1, 3, P, 3, 0.3), { tone: "hi" }),
      [...posts.map((plan, index) => A.slab(plan, 2.4, 2.4, { name: `tray.pull.post${index}` }, 2)), A.slab(bar, 2.1, 3, { name: "tray.pull.bar" }, 3)],
      { at: [125, y + 3, 3.5] },
    );
    const card = { x: 56, y, w: 30, d: 0.6, r: 0.2 };
    const face = y + 0.6;
    const outline = pathAt([[card.x + 1.4, face, 1.6], [card.x + card.w - 1.4, face, 1.6], [card.x + card.w - 1.4, face, 5.4], [card.x + 1.4, face, 5.4]], true);
    const rules = [0.62, 0.4].map((w, index) => L(pathAt([[card.x + 3.2, face, 4.2 - index * 1.4], [card.x + 3.2 + (card.w - 6.4) * w, face, 4.2 - index * 1.4]]), { tone: "lo", free: true })).join("");
    put("tray.card", S(k.slabOf(card, 0.9, 5.2, P, 2), { tone: "mid" }) + L(outline, { tone: "faint" }) + rules, [A.slab(card, 0.9, 5.2, { name: "tray.card" }, 2)], { at: [card.x + card.w / 2, face, 3.5] });
  }

  // Sekat antar-segmen (garis potong yang memisahkan dua segmen).
  CUTS.filter((cut) => cut.wall).forEach((cut, index) => {
    const trim = (value, edge) => (Math.abs(value - edge) < 1e-6 ? 0 : WALL_T / 2);
    const plan =
      cut.axis === "f"
        ? { x: cut.x - WALL_T / 2, y: cut.y0 + trim(cut.y0, TRAY.y), w: WALL_T, d: cut.y1 - cut.y0 - trim(cut.y0, TRAY.y) - trim(cut.y1, TRAY.y + TRAY.d), r: 0.2 }
        : { x: cut.x0 + trim(cut.x0, TRAY.x), y: cut.y - WALL_T / 2, w: cut.x1 - cut.x0 - trim(cut.x0, TRAY.x) - trim(cut.x1, TRAY.x + TRAY.w), d: WALL_T, r: 0.2 };
    put(`tray.wall${index}`, S(k.slabOf(plan, FLOOR, WALL_H, P, 2), { tone: "mid" }), [A.slab(plan, FLOOR, WALL_H, { name: `tray.wall${index}` }, 2)], { at: [plan.x + plan.w / 2, plan.y + plan.d / 2, FLOOR + WALL_H / 2] });
  });

  // Gulungan koin tiap segmen: satu gulungan penuh = £1 juta revenue.
  ROLLS.forEach(({ rolls }, index) => {
    const [first] = rolls;
    put(`rolls.${index}`, rollsSvg(k, P, rolls, FLOOR, COIN_R, (ROLL_H * SEAM_VALUE) / ROLL_VALUE, false), rolls.map((roll, j) => A.cylinder(roll.cx, roll.cy, COIN_R, FLOOR, Math.max(roll.h, 0.08), { name: `rolls.${index}.${j}` })), {
      at: [first.cx, first.cy, FLOOR + 2],
      seg: index,
    });
  });

  // Rel lantai gantry dengan baut dan stopper di kedua ujung.
  for (const x of [XL, XR]) {
    const side = x < 0 ? "l" : "r";
    const rail = { x: x - 2, y: RAIL_Y[0], w: 4, d: RAIL_Y[1] - RAIL_Y[0], r: 0.6 };
    const bolts = [];
    for (let y = RAIL_Y[0] + 9; y < RAIL_Y[1] - 6; y += 18) bolts.push(at([x, y, RAIL_H]));
    put(
      `gantry.rail.${side}`,
      S(k.slabOf(rail, 0, RAIL_H, P, 3, 0.3), { tone: "mid" }) + L(k.lineOnTop([x, RAIL_Y[0]], [x, RAIL_Y[1]], RAIL_H, P), { tone: "faint" }) + D(bolts, { size: 0.4 }),
      [A.slab(rail, 0, RAIL_H, { name: `gantry.rail.${side}` }, 3)],
      { at: [x, (RAIL_Y[0] + RAIL_Y[1]) / 2, RAIL_H / 2] },
    );
    if (side === "r") {
      // Penggaris posisi jembatan di samping rel kanan; penunjuknya ada di truk.
      const strip = { x: x + 4.5, y: RAIL_Y[0] + 10, w: 5, d: RAIL_Y[1] - RAIL_Y[0] - 20, r: 0.6 };
      const ticks = k.topTicks(strip.y + 2, strip.y + strip.d - 2, 4, 5, strip.x + 0.4, 0.6, [1.6, 3], P, "y");
      put(
        "gantry.scale",
        S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }) + L(ticks.minor, { tone: "lo" }) + L(ticks.major, { tone: "mid" }) + D([at([strip.x + strip.w / 2, strip.y + 1.2, 0.6]), at([strip.x + strip.w / 2, strip.y + strip.d - 1.2, 0.6])], { size: 0.4 }),
        [A.slab(strip, 0, 0.6, { name: "gantry.scale" }, 3)],
        { at: [strip.x + strip.w / 2, strip.y + strip.d / 2, 0.3] },
      );
    }
    for (const [end, y] of [["b", RAIL_Y[0]], ["f", RAIL_Y[1] - 3.2]]) {
      const stop = { x: x - 3, y, w: 6, d: 3.2, r: 0.6 };
      put(`gantry.stop.${side}${end}`, S(k.slabOf(stop, RAIL_H, 3.6, P, 3, 0.4), { tone: "mid" }) + D([at([x - 1.5, y + 1.6, RAIL_H + 3.6]), at([x + 1.5, y + 1.6, RAIL_H + 3.6])], { size: 0.4 }), [A.slab(stop, RAIL_H, 3.6, { name: `gantry.stop.${side}${end}` }, 3)], {
        at: [x, y + 1.6, RAIL_H + 1.8],
        after: end === "f",
      });
    }
  }

  // Tiga gerbang ukur R, F, M: kaki, badan, kepala dengan dial skor, jendela baca di atas,
  // pipi belakang berhuruf. Token lewat di atas jendela, di depan pipi.
  GATE_X.forEach((gx, gate) => {
    const yt = Y_HOME;
    const key = GATE_KEYS[gate];
    const foot = { x: gx - 9, y: yt - 8.5, w: 18, d: 15, r: 1.6 };
    const body = { x: gx - 5, y: yt - 5, w: 10, d: 8.4, r: 1 };
    const head = { x: gx - 8, y: yt - 6, w: 16, d: 10.6, r: 1.2 };
    const cheek = { x: gx - 7, y: yt - 6, w: 14, d: 1.4, r: 0.4 };
    const F = frontFrame(gx, yt + 4.6, DIAL.z);
    const face = DIAL.face;
    const ticks = [];
    for (let s = 0; s <= 5; s++) {
      const a = ((180 - s * 36) * Math.PI) / 180;
      ticks.push(pathAt([G.pointOf(F, face, DIAL.ring, a), G.pointOf(F, face, DIAL.ring - 0.9, a)]));
    }
    const dial =
      S(G.disc(0, face, DIAL.r, F, P, { steps: 40 }), { tone: "mid" }) +
      L(G.circleOf(F, face, DIAL.ring, P, 48), { tone: "lo" }) +
      L(ticks.join(""), { tone: "mid" }) +
      D([1, 2, 3, 4, 5].map((s) => at(G.pointOf(F, face, DIAL.ring - 0.5, (angleOfScore(s) * Math.PI) / 180))), { size: 0.3, tone: "lo" }) +
      `<path class="iso-line" data-tone="hi" data-needle="${gate}" data-free="end" style="stroke-width:1" d="${pathAt([G.pointOf(F, face + 0.1, 0, 0), G.pointOf(F, face + 0.1, DIAL.needle, (DIAL.rest * Math.PI) / 180)])}"/>` +
      D([at(G.pointOf(F, face + 0.15, 0, 0))], { size: 0.55, tone: "hi" });
    put(
      `gate.${key}`,
      S(k.slabOf(foot, 0, 1.4, P, 3, 0.4), { tone: "lo" }) +
        screws(foot, 1.4, 2, 0.4) +
        S(k.slabOf(body, 1.4, 7.1, P, 3, 0.4), { tone: "mid" }) +
        S(k.slabOf(head, 8.5, SHELF_Z - 8.5, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(head, SHELF_Z - 1.4, P, 3), { tone: "faint" }) }) +
        L(k.ring(gx, yt, 3.4, SHELF_Z, P, 32), { tone: "faint" }) +
        L(k.ring(gx, yt, 2.1, SHELF_Z, P, 24), { tone: "lo" }) +
        D([at([head.x + 1.6, head.y + head.d - 1.6, SHELF_Z]), at([head.x + head.w - 1.6, head.y + head.d - 1.6, SHELF_Z])], { size: 0.4 }) +
        S(k.slabOf(cheek, SHELF_Z, 4.6, P, 2, 0.3), { tone: "mid" }) +
        k.faceTextSvg(k.sideMatrix([gx, cheek.y + cheek.d], SHELF_Z + 1.2, P, "left"), key, { size: 3.2, tone: "hi", anchor: "middle" }) +
        dial,
      [
        A.slab(foot, 0, 1.4, { name: `gate.${key}.foot` }, 3),
        A.slab(body, 1.4, 7.1, { name: `gate.${key}.body` }, 3),
        A.slab(head, 8.5, SHELF_Z - 8.5, { name: `gate.${key}.head` }, 3),
        A.slab(cheek, SHELF_Z, 4.6, { name: `gate.${key}.cheek` }, 2),
        A.disc(F, 0, face, DIAL.r, { name: `gate.${key}.dial` }),
      ],
      { at: [gx, yt, 10] },
    );
  });

  // Magasin: 10 token = 10 contoh customer di JSON, didorong ke atas oleh batang.
  {
    const [x, y] = [X_HOME, Y_HOME];
    const foot = { x: x - 8, y: y - 8.5, w: 16, d: 15, r: 1.6 };
    const posts = [180, 240, 300].map((deg) => [x + Math.cos((deg * Math.PI) / 180) * 4.55, y + Math.sin((deg * Math.PI) / 180) * 4.55]);
    const postTop = HEAD_Z - 0.6;
    put(
      "magazine.stand",
      S(k.slabOf(foot, 0, 1.4, P, 3, 0.4), { tone: "lo" }) +
        screws(foot, 1.4, 2, 0.4) +
        S(k.cylinder(x, y, 3.2, 1.4, MAG_CUP_BASE - 1.4, P, 28), { tone: "mid", inner: L(k.sideArc(x, y, 3.2, 3.2, P, 24), { tone: "faint" }) }) +
        S(k.cylinder(x, y, 6, MAG_CUP_BASE, MAG.cup - MAG_CUP_BASE, P, 40, 0.4), { tone: "mid" }) +
        byDepth(posts).map(([px, py]) => S(k.cylinder(px, py, 0.75, MAG.cup, postTop - MAG.cup, P, 12), { tone: "mid", crease: "none" }) + D([at([px, py, postTop])], { size: 0.35 })).join(""),
      [
        A.slab(foot, 0, 1.4, { name: "magazine.foot" }, 3),
        A.cylinder(x, y, 3.2, 1.4, MAG_CUP_BASE - 1.4, { name: "magazine.column" }),
        A.cylinder(x, y, 6, MAG_CUP_BASE, MAG.cup - MAG_CUP_BASE, { name: "magazine.cup" }),
        ...posts.map(([px, py], index) => A.cylinder(px, py, 0.75, MAG.cup, postTop - MAG.cup, { name: `magazine.post${index}` })),
      ],
      { at: [x, y - 2, 10] },
    );
    put("magazine.stack", magazineSvg(k, P, MAG, EXAMPLES.length, 1), magazineShapes(EXAMPLES.length, 1), { at: [x, y, 16], magazine: true });
  }

  // Kotak kontrol dengan tombol "jalankan contoh customer".
  {
    const box = { x: 204, y: 147.5, w: 32, d: 14, r: 2 };
    const label = { x: box.x + 3, y: box.y + 2.5, w: 15, d: 9, r: 1 };
    const [bx, by] = [box.x + box.w - 7.5, box.y + box.d / 2];
    put(
      "control.box",
      S(k.slabOf(box, 0, 9, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(box, 2.4, P, 4), { tone: "faint" }) }) +
        screws(box, 9, 2, 0.45) +
        S(k.slabOf(label, 9, 0.6, P, 3), { tone: "mid" }) +
        L(k.planOutline(k.insetPlan(label, 1.2), 9.6, P), { tone: "faint" }) +
        [0.7, 0.45, 0.58].map((w, index) => L(k.lineOnTop([label.x + 2.6, label.y + 2.6 + index * 1.9], [label.x + 2.6 + (label.w - 5.2) * w, label.y + 2.6 + index * 1.9], 9.6, P), { tone: "lo", free: true })).join("") +
        S(k.cylinder(bx, by, 4.4, 9, 1.2, P, 32), { tone: "lo" }),
      [A.slab(box, 0, 9, { name: "control.box" }, 4), A.slab(label, 9, 0.6, { name: "control.label" }, 3), A.cylinder(bx, by, 4.4, 9, 1.2, { name: "control.collar" })],
      { at: [box.x + box.w / 2, box.y + box.d / 2, 4.5] },
    );
    put("control.button", S(k.cylinder(bx, by, 3.3, 10.2, 2.4, P, 32, 0.4), { tone: "hi" }) + L(k.ring(bx, by, 2.2, 12.6, P, 24), { tone: "lo" }), [A.cylinder(bx, by, 3.3, 10.2, 2.4, { name: "control.button" })], {
      at: [bx, by, 11.4],
      button: { x: bx, y: by, z: 12.6, r: 3.3 },
    });
  }

  // Pelat label di meja depan kiri.
  {
    const plan = { x: 6, y: 150.5, w: 52, d: 8.5, r: 1.2 };
    put(
      "bench.label",
      S(k.slabOf(plan, 0, 0.8, P, 3), { tone: "mid" }) +
        L(k.planOutline(k.insetPlan(plan, 1.4), 0.8, P), { tone: "faint" }) +
        [0.66, 0.42].map((w, index) => L(k.lineOnTop([plan.x + 4, plan.y + 3 + index * 2.6], [plan.x + 4 + (plan.w - 12) * w, plan.y + 3 + index * 2.6], 0.8, P), { tone: "lo", free: true })).join("") +
        D([at([plan.x + plan.w - 3, plan.y + 2.4, 0.8]), at([plan.x + plan.w - 3, plan.y + plan.d - 2.4, 0.8])], { size: 0.45 }),
      [A.slab(plan, 0, 0.8, { name: "bench.label" }, 3)],
      { at: [plan.x + plan.w / 2, plan.y + plan.d / 2, 0.4] },
    );
  }
  return items;
}

// ---------------------------------------------------------------- bagian bergerak
// Dibangun di posisi rumah; halaman menggesernya dengan translateAlong.

function bridgeItems() {
  const yb = YB_HOME;
  const items = [];
  const put = (name, svg, shapes) => items.push({ name, svg, shapes });
  for (const x of [XL, XR]) {
    const side = x < 0 ? "l" : "r";
    const truck = { x: x - 4, y: yb - 8, w: 8, d: 16, r: 1.2 };
    const leg = { x: x - 2.5, y: yb - 3, w: 5, d: 6, r: 0.8 };
    // Roda di muka luar truk; yang kanan menghadap pembaca.
    const wheels = side === "r" ? [yb - 4.6, yb + 4.6].map((y) => sideFrame(x + 4, y, 5.2)) : [];
    // Penunjuk di truk kanan, di antara kedua roda, menunjuk penggaris posisi.
    const pointer = side === "r" ? [{ x: x + 4, y: yb - 0.8, w: 3.6, d: 1.6, r: 0.3 }] : [];
    put(
      `bridge.truck.${side}`,
      S(k.slabOf(truck, TRUCK_Z[0], TRUCK_Z[1] - TRUCK_Z[0], P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(truck, 5.2, P, 3), { tone: "faint" }) }) +
        screws(truck, TRUCK_Z[1], 1.8, 0.4) +
        wheels.map((F) => S(G.disc(0, 1, 2.2, F, P, { steps: 28 }), { tone: "lo" }) + D([at(G.pointOf(F, 1.05, 0, 0))], { size: 0.45, tone: "mid" })).join("") +
        pointer.map((plan) => S(k.slabOf(plan, 2.6, 0.7, P, 2), { tone: "mid" }) + L(k.lineOnTop([plan.x + 0.4, yb], [plan.x + plan.w - 0.3, yb], 3.3, P), { tone: "hi", free: "end" })).join(""),
      [
        A.slab(truck, TRUCK_Z[0], TRUCK_Z[1] - TRUCK_Z[0], { name: `bridge.truck.${side}` }, 3),
        ...wheels.map((F, index) => A.disc(F, 0, 1, 2.2, { name: `bridge.wheel.${side}${index}` })),
        ...pointer.map((plan) => A.slab(plan, 2.6, 0.7, { name: "bridge.pointer" }, 2)),
      ],
    );
    put(
      `bridge.leg.${side}`,
      S(k.slabOf(leg, LEG_Z[0], LEG_Z[1] - LEG_Z[0], P, 3, 0.4), { tone: "mid", inner: L(k.sideSeam(leg, (LEG_Z[0] + LEG_Z[1]) / 2, P, 3), { tone: "faint" }) }),
      [A.slab(leg, LEG_Z[0], LEG_Z[1] - LEG_Z[0], { name: `bridge.leg.${side}` }, 3)],
    );
  }
  const beam = { x: XL - 2.5, y: yb - 3.5, w: XR - XL + 5, d: 7, r: 0.8 };
  const rails = [BEAM_Z[0] + 1.2, BEAM_Z[1] - 2.4].map((z) => ({ plan: { x: XL + 4, y: yb + 3.5, w: XR - XL - 8, d: 0.8, r: 0.2 }, z }));
  put(
    "bridge.beam",
    S(k.slabOf(beam, BEAM_Z[0], BEAM_Z[1] - BEAM_Z[0], P, 3, 0.6), { tone: "mid" }) +
      D([XL, XR].flatMap((x) => [at([x - 1.2, yb - 1.8, BEAM_Z[1]]), at([x + 1.2, yb + 1.8, BEAM_Z[1]])]), { size: 0.45 }) +
      rails.map(({ plan, z }) => S(k.slabOf(plan, z, 1.2, P, 2), { tone: "mid" })).join(""),
    [A.slab(beam, BEAM_Z[0], BEAM_Z[1] - BEAM_Z[0], { name: "bridge.beam" }, 3), ...rails.map(({ plan, z }, index) => A.slab(plan, z, 1.2, { name: `bridge.rail${index}` }, 2))],
  );
  return items;
}

// Kereta: pelat di rel balok, token yang dibawa, kepala magnet, lengan.
function carriageItems() {
  const yb = YB_HOME;
  const [x, y] = [X_HOME, Y_HOME];
  const items = [];
  const put = (name, svg, shapes, extra = {}) => items.push({ name, svg, shapes, ...extra });
  const plate = { x: x - 7.5, y: yb + 4.3, w: 15, d: 2.5, r: 0.8 };
  const front = plate.y + plate.d;
  const zMid = (PLATE_Z[0] + PLATE_Z[1]) / 2;
  put(
    "carriage.plate",
    S(k.slabOf(plate, PLATE_Z[0], PLATE_Z[1] - PLATE_Z[0], P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(plate, zMid, P, 3), { tone: "faint" }) }) +
      D([[x - 5.4, PLATE_Z[0] + 1.9], [x + 5.4, PLATE_Z[0] + 1.9], [x - 5.4, PLATE_Z[1] - 1.9], [x + 5.4, PLATE_Z[1] - 1.9]].map(([px, pz]) => at([px, front, pz])), { size: 0.45 }),
    [A.slab(plate, PLATE_Z[0], PLATE_Z[1] - PLATE_Z[0], { name: "carriage.plate" }, 3)],
  );
  put("token", tokenSvg(k, P, x, y, TOKEN_Z, true), [A.cylinder(x, y, TOKEN_R, TOKEN_Z, TOKEN_H, { name: "token" })], { token: true });
  const arm = { x: x - 2.6, y: front, w: 5.2, d: y + 3.4 - front, r: 0.8 };
  put(
    "carriage.head",
    S(k.cylinder(x, y, 2.4, HEAD_Z, 0.6, P, 28), { tone: "lo" }) + S(k.cylinder(x, y, 3.2, HEAD_Z + 0.6, 3.2, P, 32, 0.3), { tone: "mid", inner: L(k.sideArc(x, y, 3.2, HEAD_Z + 2.2, P, 24), { tone: "faint" }) }),
    [A.cylinder(x, y, 2.4, HEAD_Z, 0.6, { name: "carriage.pole" }), A.cylinder(x, y, 3.2, HEAD_Z + 0.6, 3.2, { name: "carriage.head" })],
  );
  put("carriage.arm", S(k.slabOf(arm, HEAD_Z + 3.8, 1.6, P, 3, 0.3), { tone: "mid" }) + D([at([x, arm.y + 1.4, HEAD_Z + 5.4])], { size: 0.45 }), [A.slab(arm, HEAD_Z + 3.8, 1.6, { name: "carriage.arm" }, 3)]);
  return items;
}

// ---------------------------------------------------------------- urutan gambar

// Urutan statis diselesaikan bersama jalur jatuh tiap token (silinder dari kepala magnet sampai
// lantai sel), jadi tiap contoh punya satu slot yang benar di semua ketinggian jatuhnya.
const { STATIC, DROP_SLOTS } = (() => {
  const R = A.recorder(P);
  for (const item of staticItems()) R.put({ ...item, shapes: item.shapes.map(R.solid) });
  TARGETS.forEach((target, e) => R.put({ name: `drop.${e}`, svg: "", phantom: e, at: [target.x, target.y, FLOOR], shapes: [R.solid(A.cylinder(target.x, target.y, TOKEN_R, FLOOR, HEAD_Z - FLOOR, { name: `drop.${e}` }))] }));
  A.settle(R, P, { states: [0] });
  const { solved } = R.settled;
  if (solved.cycles.length || solved.dropped.length) {
    for (const pair of solved.cycles) console.log("cycle", R.items[pair.a].name, "×", R.items[pair.b].name);
    throw new Error("urutan statis tidak bisa diselesaikan");
  }
  const sorted = R.items.map((item, index) => ({ item, index })).sort((a, b) => a.item.key - b.item.key || a.index - b.index).map(({ item }) => item);
  const slots = [];
  let before = 0;
  for (const item of sorted) {
    if (item.phantom !== undefined) slots[item.phantom] = before;
    else if (!item.after) before++;
  }
  return { STATIC: sorted.filter((item) => item.phantom === undefined), DROP_SLOTS: slots };
})();
const BEFORE = STATIC.filter((item) => !item.after);
const AFTER = STATIC.filter((item) => item.after);

const moveShape = (shape, offset) => (offset.some((v) => v) ? A.moved(shape, offset) : shape);

// Periksa ulang slot itu dengan token sungguhan di beberapa ketinggian jatuh (ray-cast audit).
TARGETS.forEach((target, e) => {
  const behind = new Set();
  const front = new Set();
  for (const z of [TOKEN_Z - 4, (TOKEN_Z + FLOOR) / 2, FLOOR + 4, FLOOR]) {
    const token = { name: "token", shapes: [A.cylinder(target.x, target.y, TOKEN_R, z, TOKEN_H, { name: "token" })] };
    const items = [...BEFORE, token];
    const last = items.length - 1;
    const overlaps = A.overlapsOf(items, P, { skip: (a, b) => a !== token && b !== token });
    for (const pair of overlaps.pairs) {
      const other = pair.a === last ? pair.b : pair.a;
      const tokenSide = pair.a === last ? 0 : 1;
      const tokenFront = pair.front[tokenSide].area >= overlaps.least;
      const otherFront = pair.front[1 - tokenSide].area >= overlaps.least;
      if (tokenFront && otherFront) throw new Error(`token contoh #${target.ex.customer_no} saling tembus dengan ${items[other].name}`);
      (tokenFront ? behind : front).add(other);
    }
  }
  const slot = DROP_SLOTS[e];
  for (const index of behind) if (index >= slot) throw new Error(`token contoh #${target.ex.customer_no}: ${BEFORE[index].name} di belakang tapi tergambar sesudahnya`);
  for (const index of front) if (index < slot) throw new Error(`token contoh #${target.ex.customer_no}: ${BEFORE[index].name} di depan tapi sudah tergambar`);
});

// ---------------------------------------------------------------- audit

// Susunan item pada satu pose, dalam urutan gambar halaman.
function poseItems(target, pose) {
  const offset = (dx, dy, dz = 0) => [dx, dy, dz];
  const items = [];
  const exIndex = TARGETS.indexOf(target);
  const n = EXAMPLES.length - 1 - (exIndex % EXAMPLES.length);
  // Gambar ikut digeser seperti di halaman, supaya cek "stand-in shapes" membandingkan hal yang sama.
  const moved = (item, shift) => ({ ...item, svg: `<g transform="${k.translateAlong(P, shift)}">${item.svg}</g>`, shapes: item.shapes.map((shape) => moveShape(shape, shift)) });
  BEFORE.forEach((item, index) => {
    if (index === DROP_SLOTS[exIndex] && !pose.held) {
      const shift = offset(pose.x - X_HOME, pose.y - Y_HOME, pose.z - TOKEN_Z);
      const token = { name: "token", svg: tokenSvg(k, P, X_HOME, Y_HOME, TOKEN_Z, false), shapes: [A.cylinder(X_HOME, Y_HOME, TOKEN_R, TOKEN_Z, TOKEN_H, { name: "token" })], falling: !pose.landed };
      items.push(moved(token, shift));
    }
    if (item.magazine) items.push({ ...item, svg: magazineSvg(k, P, MAG, n, pose.lift), shapes: magazineShapes(n, pose.lift) });
    else items.push(item);
  });
  const bridge = offset(0, pose.carriageY - Y_HOME);
  for (const item of bridgeItems()) items.push(moved(item, bridge));
  const carriage = offset(pose.carriageX - X_HOME, pose.carriageY - Y_HOME);
  for (const item of carriageItems()) {
    if (item.token && !pose.held) continue;
    items.push(moved(item, carriage));
  }
  for (const item of AFTER) items.push(item);
  return items;
}

function auditPose(label, items, { staticPairs = false } = {}) {
  const R = A.recorder(P);
  items.forEach((item, index) => R.put({ key: index, name: item.name, svg: item.svg, shapes: item.shapes.map(R.solid) }));
  const moving = new Set(["token", "carriage.plate", "carriage.head", "carriage.arm", "magazine.stack", ...bridgeItems().map((item) => item.name)]);
  const skip = staticPairs ? () => false : (a, b) => !moving.has(a.name) && !moving.has(b.name);
  // Di pose gerak, meja dan alas laci (selalu paling bawah, sudah dicek di pose rumah) tidak
  // diraster ulang; pemeriksaan tumpuan tetap memakai semua benda.
  const checked = staticPairs ? R.items : R.items.filter((item) => !/^stand\.|^tray\.base$/.test(item.name));
  const overlaps = A.overlapsOf(checked, P, { states: [0], skip });
  R.settled = { items: checked, overlaps, solved: { keys: checked.map((item) => item.key), dropped: [], cycles: [], rules: 0 }, states: [0] };
  // Token yang sedang jatuh memang tidak bertumpu pada apa pun; selain itu semua harus tersambung ke meja.
  const falling = items.find((item) => item.falling);
  const ground = (shape) => A.grounded(shape) || Boolean(falling && shape.name === "token");
  const result = A.audit(R, P, { frames: [], apart: false, ground });
  const count = A.failures(result);
  if (count || process.argv.includes("--verbose")) console.log(`\n=== ${label} ===\n${A.report(result)}`);
  return count;
}

if (process.argv.includes("--audit")) {
  const started = Date.now();
  let failed = auditPose("rumah (semua pasangan statis)", poseItems(TARGETS[0], poseAt(planOf(TARGETS[0], MOTION), 0, TARGETS[0], MOTION)), { staticPairs: true });
  let poses = 1;
  for (const target of TARGETS) {
    const plan = planOf(target, MOTION);
    const times = [];
    // Jatuh dan maju diambil lebih rapat: di situlah urutan token terhadap laci berubah.
    for (const step of plan.steps) for (const share of step.name === "drop" || step.name === "forward" ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1]) times.push(step.t0 + (step.t1 - step.t0) * share);
    for (const t of [...new Set(times.map((t) => Math.round(t * 1000) / 1000))]) {
      const pose = poseAt(plan, t, target, MOTION);
      failed += auditPose(`contoh #${target.ex.customer_no} · t ${t.toFixed(2)} s · ${pose.phase}`, poseItems(target, pose));
      poses++;
    }
  }
  console.log(`\naudit · ${poses} pose · ${STATIC.length} item statis · ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.log(failed ? `audit failed: ${failed} problems` : "audit passed");
  if (failed) process.exitCode = 1;
}

// ---------------------------------------------------------------- halaman

const fmtInt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const fmtDec = (x, digits) => x.toFixed(digits).replace(".", ",");
const fmtPct = (x) => `${fmtDec(x, 2)}%`;
const fmtGbp = (x) => (x >= 1e6 ? `£${fmtDec(x / 1e6, 2)} juta` : `£${fmtInt(x)}`);
const rangeOf = ([lo, hi]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);
const avgRevenue = META.total_revenue / META.total_customers;

const SEG_VIEW = SEGMENTS.map((seg) => ({
  name: seg.segment,
  scores: `R ${rangeOf(seg.r_range)} · F ${rangeOf(seg.f_range)} · M ${rangeOf(seg.m_range)}`,
  customers: fmtInt(seg.customers),
  pctCustomers: fmtPct(seg.pct_customers),
  pctRevenue: fmtPct(seg.pct_revenue),
  revenue: fmtGbp(seg.revenue),
  rolls: fmtDec(seg.revenue / ROLL_VALUE, 2),
  ratio: `${fmtDec(seg.revenue / seg.customers / avgRevenue, 1)}×`,
  perCustomer: `£${fmtInt(seg.revenue / seg.customers)} vs £${fmtInt(avgRevenue)}`,
  median: `${fmtInt(seg.median_frequency)}× belanja`,
  medianSub: `terakhir ${fmtInt(seg.median_recency_days)} hari lalu · £${fmtInt(seg.median_monetary)}`,
  short: `${seg.segment} · ${fmtDec(seg.pct_customers, 1)}% customer → ${fmtDec(seg.pct_revenue, 1)}% revenue`,
  aria: `${seg.segment}: ${fmtInt(seg.customers)} customer (${fmtPct(seg.pct_customers)}), ${fmtPct(seg.pct_revenue)} revenue (${fmtGbp(seg.revenue)}), skor R ${rangeOf(seg.r_range)} dan F ${rangeOf(seg.f_range)} (yang menentukan segmen), skor M ${rangeOf(seg.m_range)}`,
}));

const bandText = (key, score) => {
  const bin = BINS[key].find((b) => b.score === score);
  if (key === "R") return `${fmtInt(bin.min)}–${fmtInt(bin.max)} hari`;
  if (key === "F") return bin.min === bin.max ? `${fmtInt(bin.min)}× belanja` : `${fmtInt(bin.min)}–${fmtInt(bin.max)}× belanja`;
  return `£${fmtInt(bin.min)}–£${fmtInt(bin.max)}`;
};
const EX_VIEW = TARGETS.map(({ ex, seg }) => ({
  no: ex.customer_no,
  values: [`${fmtInt(ex.recency_days)} hari`, `${fmtInt(ex.frequency)}×`, `£${fmtInt(ex.monetary)}`],
  scores: [ex.r, ex.f, ex.m],
  bands: [bandText("R", ex.r), bandText("F", ex.f), bandText("M", ex.m)],
  segment: ex.segment,
  seg,
  cell: `sel R${ex.r} · F${ex.f}`,
}));

// Halaman: urutan statis (token yang dilepas masuk ke slot jatuhnya), lalu jembatan dan kereta.
// Segmen `selected` digambar menyala; token hanya ada di halaman (tersembunyi sampai dijalankan).
const ITEMS = staticItems();
const SEAM_STEP = (ROLL_H * SEAM_VALUE) / ROLL_VALUE;
function pageBody(selected, { token }) {
  const body = [`<path class="iso-halo" d="${k.haloOf(BENCH, -BENCH_H - FOOT_H, BENCH_H, P)}"/>`];
  const markers = (index) => TARGETS.forEach((_, e) => DROP_SLOTS[e] === index && body.push(`<g data-drop="${e}"></g>`));
  BEFORE.forEach((item, index) => {
    markers(index);
    if (item.seg !== undefined) body.push(`<g data-seg="${item.seg}">${item.seg === selected ? rollsSvg(k, P, ROLLS[item.seg].rolls, FLOOR, COIN_R, SEAM_STEP, true) : item.svg}</g>`);
    else if (item.name === "tray.base") body.push(item.svg.replace(`data-seg-floor="${selected}"`, `data-seg-floor="${selected}" data-on=""`));
    else if (item.magazine) body.push(`<g data-part="magazine">${item.svg}</g>`);
    else if (item.button) body.push(`<g data-part="button">${item.svg}</g>`);
    else body.push(item.svg);
  });
  markers(BEFORE.length);
  body.push(`<g data-part="bridge">${bridgeItems().map((item) => item.svg).join("")}</g>`);
  body.push(`<g data-part="carriage">${carriageItems().map((item) => (item.token ? `<g data-slot="held">${token ? `<g data-part="token" style="display:none">${item.svg}</g>` : ""}</g>` : item.svg)).join("")}</g>`);
  for (const item of AFTER) body.push(item.svg);
  return body.join("");
}

const LABEL = `Mesin sortir customer di atas laci RFM. Laci dibagi menjadi 25 sel skor R kali F yang luasnya sebanding jumlah customer, dikelompokkan sekat menjadi 10 segmen. Gulungan koin di tiap kotak menunjukkan revenue segmen. Sepuluh token di magasin adalah contoh customer, satu per segmen, yang diukur tiga gerbang R, F, M lalu dijatuhkan gantry ke selnya.`;

const svg = k.figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: pageBody(SEG_INDEX.get("Champions"), { token: true }) });

const EXTRA_CSS = `
.seg-floor{fill:transparent;stroke:var(--anatomy-faint);stroke-width:var(--anatomy-weight);transition:fill .35s var(--anatomy-ease),stroke .35s var(--anatomy-ease)}
.seg-floor[data-on]{fill:var(--rf-aksen);fill-opacity:.2;stroke:var(--rf-aksen)}
.iso{--rf-aksen:#3fc1c9;--rf-koin-0:#7a5a12;--rf-koin-1:#946d16;--rf-koin-2:#ad8219;--rf-koin-3:#c79a1f;--rf-koin-top:#e8bd3a;--rf-koin-tepi:#f2cf6a;--rf-koin-lit-top:#ffdf70;--rf-koin-lit-shade:#d9ab2a}
.iso[data-theme="light"]{--rf-aksen:#0e7c86;--rf-koin-0:#a87908;--rf-koin-1:#c08f10;--rf-koin-2:#d6a420;--rf-koin-3:#e5b83a;--rf-koin-top:#f4cf5a;--rf-koin-tepi:#7a5605;--rf-koin-lit-top:#ffe070;--rf-koin-lit-shade:#e0b030}
.iso-solid.rf-roll>.iso-fill{fill:var(--rf-koin-1)}
.iso-solid.rf-roll>.iso-shade[data-shade="0"]{fill:var(--rf-koin-0)}
.iso-solid.rf-roll>.iso-shade[data-shade="1"]{fill:var(--rf-koin-1)}
.iso-solid.rf-roll>.iso-shade[data-shade="2"]{fill:var(--rf-koin-2)}
.iso-solid.rf-roll>.iso-shade[data-shade="3"]{fill:var(--rf-koin-3)}
.iso-solid.rf-roll>.iso-top{fill:var(--rf-koin-top)}
.iso-solid.rf-roll[data-lit]>.iso-top{fill:var(--rf-koin-lit-top)}
.iso-solid.rf-roll[data-lit]>.iso-shade{fill:var(--rf-koin-lit-shade)}
.iso-solid.rf-roll>.iso-edge,.iso-solid.rf-roll[data-lit]>.iso-edge{stroke:var(--rf-koin-tepi)}
.iso-solid.rf-roll .iso-line[data-tone="faint"]{stroke:var(--rf-koin-0)}
.iso-solid.rf-token>.iso-fill,.iso-solid.rf-token>.iso-top{fill:var(--rf-aksen)}
.iso-solid.rf-token>.iso-shade{fill:var(--rf-aksen);fill-opacity:.7}
.iso-solid.rf-token>.iso-edge{stroke:var(--rf-aksen)}
[data-part="token"]{transition:opacity .3s var(--anatomy-ease)}
@media (prefers-reduced-motion:reduce){.seg-floor,[data-part="token"]{transition:none}}
`;

const PAGE_CSS = `
.iso-stage{touch-action:pan-y;outline:none;border-radius:2px;cursor:default}
.iso-stage[data-hover]{cursor:pointer}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.rf-board{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1px;margin:18px 0 0;background:var(--anatomy-faint);border:1px solid var(--anatomy-faint)}
.rf-board>div{background:var(--anatomy-card);padding:8px 10px 9px;min-width:0}
.rf-board span{display:block;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.rf-board b{display:block;color:var(--anatomy-strong);font-family:var(--anatomy-mono);font-size:14.5px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}
.rf-board i{display:block;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10.5px;line-height:1.35;font-style:normal;margin-top:2px}
.rf-run{display:flex;align-items:center;gap:12px;margin:14px 0 0;flex-wrap:wrap}
.rf-run button{font:500 12.5px/1 var(--anatomy-mono);letter-spacing:.02em;color:var(--anatomy-strong);background:var(--anatomy-card);border:1px solid var(--anatomy-mid);border-radius:2px;padding:9px 12px;cursor:pointer}
.rf-run button:hover{border-color:var(--anatomy-hi)}
.rf-run button:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:3px}
.rf-run button[aria-busy="true"]{opacity:.55;cursor:progress}
.rf-pick,.rf-auto{display:flex;align-items:center;gap:6px;color:var(--anatomy-muted);font:11.5px/1 var(--anatomy-mono)}
.rf-pick select{font:inherit;color:var(--anatomy-strong);background:var(--anatomy-card);border:1px solid var(--anatomy-mid);border-radius:2px;padding:7px 6px;max-width:100%}
.rf-auto input{accent-color:var(--rf-aksen);margin:0}
.rf-run p{margin:0;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:11.5px}
.rf-board[data-board="ex"]{margin-top:10px}
.rf-board[data-board="ex"]>div[data-wait] b,.rf-board[data-board="ex"]>div[data-wait] i{color:var(--anatomy-lo)}
.iso-swatch[data-mark="roll"] path{fill:var(--rf-koin-3);stroke:var(--rf-koin-tepi)}
.iso-swatch[data-mark="box"] path{fill:var(--rf-aksen);fill-opacity:.2;stroke:var(--rf-aksen)}
.rf-intro{color:var(--anatomy-text);margin:0 0 18px}
.rf-intro h1{color:var(--anatomy-strong);font-size:20px;font-weight:600;margin:0 0 6px;letter-spacing:-.01em}
.rf-intro p{margin:0}
.rf-foot{margin-top:22px;color:var(--anatomy-muted);font-size:12.5px}
.rf-foot a{color:var(--anatomy-text)}
.rf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:640px){.rf-board{grid-template-columns:repeat(2,minmax(0,1fr))}.rf-board>div:first-child{grid-column:1/-1}.iso-plate-corner[data-corner="title"]{display:none}}
`;

const START = SEG_INDEX.get("Champions");
const s0 = SEG_VIEW[START];
const segBoard = `<div class="rf-board" data-board="seg" aria-hidden="true">
<div><span>Segmen</span><b data-v="name">${s0.name}</b><i data-v="scores">${s0.scores}</i></div>
<div><span>Customer</span><b data-v="customers">${s0.customers}</b><i data-v="pctCustomers">${s0.pctCustomers} dari ${fmtInt(META.total_customers)}</i></div>
<div><span>Revenue</span><b data-v="pctRevenue">${s0.pctRevenue}</b><i data-v="revenue">${s0.revenue}</i></div>
<div><span>Per customer</span><b data-v="ratio">${s0.ratio} rata-rata</b><i data-v="perCustomer">${s0.perCustomer}</i></div>
<div><span>Tipikal (median)</span><b data-v="median">${s0.median}</b><i data-v="medianSub">${s0.medianSub}</i></div>
</div>`;
const pickOptions = EX_VIEW.map((ex, i) => `<option value="${i}">#${ex.no} · ${ex.values.join(" · ")} · ${ex.segment}</option>`).join("");
const exBoard = `<div class="rf-run"><button type="button" data-run>Jalankan contoh customer</button><label class="rf-pick"><span>Contoh</span><select data-pick>${pickOptions}</select></label><label class="rf-auto"><input type="checkbox" data-auto checked> Putar otomatis</label><p data-v="exStatus" aria-live="polite">${EXAMPLES.length} token di magasin = ${EXAMPLES.length} contoh customer, satu per segmen</p></div>
<div class="rf-board" data-board="ex" aria-hidden="true">
<div data-wait><span>Contoh</span><b data-v="exNo">—</b><i>dari ${EXAMPLES.length} customer</i></div>
<div data-wait><span>Recency → R</span><b data-v="ex0">—</b><i data-v="exb0">gerbang R</i></div>
<div data-wait><span>Frequency → F</span><b data-v="ex1">—</b><i data-v="exb1">gerbang F</i></div>
<div data-wait><span>Monetary → M</span><b data-v="ex2">—</b><i data-v="exb2">gerbang M · tidak menentukan segmen</i></div>
<div data-wait><span>Jatuh ke</span><b data-v="exSeg">—</b><i data-v="exCell">sel R × F</i></div>
</div>`;

const swatch = (mark) => `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true">${mark === "line" || mark === "lit" ? `<path d="M1.5 5h13"/>` : `<path d="M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z"/>`}</svg>`;
const keys = [
  ["box", "Kotak bersekat: satu segmen; luas lantainya = jumlah customer"],
  ["roll", "Gulungan koin penuh = £1 juta revenue (garis tipis tiap £250 ribu)"],
  ["line", "Garis di lantai: batas sel skor R × F"],
  ["lit", "Bergaris hitam (menyala): token yang sedang berjalan, atau segmen yang dipilih"],
];
const legendKeys = keys.map(([mark, label]) => `<span class="iso-key">${swatch(mark)}${label}</span>`).join("");
const caption = `Laci dibagi menjadi 25 sel, satu untuk tiap kombinasi skor R (baris; makin ke belakang makin baru belanja) dan skor F (kolom; makin ke kanan makin sering). Luas tiap sel sebanding jumlah customer-nya, total ${fmtInt(META.total_customers)}. Sekat tebal mengelompokkan sel menjadi ${SEGMENTS.length} segmen menurut aturan di src/02_rfm.py, yang hanya memakai skor R dan F. Sepuluh token di magasin adalah contoh customer (satu per segmen): gerbang R, F, M mengubah nilainya menjadi skor 1–5 (quintile, tiap skor ±20% customer), lalu gantry menjatuhkannya ke sel R × F-nya. Skor M dicatat, tetapi tidak menggeser token.`;

const plate = k
  .plateHtml({
    fig: "Fig 1",
    title: "Segmentasi RFM",
    hint: "Klik laci · ← → · Enter = contoh",
    readout: s0.short,
    body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Segmen RFM: klik kotak laci atau tekan panah kiri/kanan untuk memilih segmen, Enter untuk menjalankan satu contoh customer" aria-valuemin="1" aria-valuemax="${SEGMENTS.length}" aria-valuenow="${START + 1}" aria-valuetext="${s0.aria}">${svg}</div>${segBoard}${exBoard}`,
  })
  .replace("</figure>", `<figcaption class="iso-legend"><span class="iso-keys">${legendKeys}</span><span class="iso-caption">${caption}</span></figcaption></figure>`);

const intro = `<header class="rf-intro"><h1>Cara kerja segmentasi RFM</h1><p>Tiap customer diukur tiga kali: seberapa baru terakhir belanja (Recency), seberapa sering (Frequency), dan seberapa besar totalnya (Monetary). Tiap ukuran diubah menjadi skor 1–5 menurut quintile, lalu kombinasi skor R dan F menentukan segmen. Hasilnya: segmen kecil bisa membawa sebagian besar revenue.</p></header>`;
const foot = `<p class="rf-foot">Angka: ${fmtInt(META.total_customers)} customer Online Retail II (UCI), snapshot ${META.snapshot_date}, dari <a href="https://github.com/samuel-geraldo/rfm-cohort-ecommerce/blob/master/output/figur/rfm_segments.json">output/figur/rfm_segments.json</a> (dibuat oleh src/export_figure_data.py dari output/rfm_table.csv). Figur dibuat dengan kit Anatomy (MIT).</p><p class="rf-sr" data-live aria-live="polite"></p>`;

const PAGE_DATA = {
  P,
  segs: SEG_VIEW,
  start: START,
  rolls: ROLLS.map(({ rolls }) => rolls),
  roll: { z0: FLOOR, r: COIN_R, seam: (ROLL_H * SEAM_VALUE) / ROLL_VALUE },
  boxes: SEGMENTS.map((seg) => {
    const box = BOXES.get(seg.segment);
    return [box.x0, box.y0, box.x1, box.y1];
  }),
  floorZ: FLOOR,
  totalText: fmtInt(META.total_customers),
  ex: EX_VIEW,
  targets: TARGETS.map(({ x, y }) => ({ x, y })),
  motion: MOTION,
  home: [X_HOME, Y_HOME, TOKEN_Z],
  mag: MAG,
  magCount: EXAMPLES.length,
  dials: GATE_X.map((gx) => {
    const F = frontFrame(gx, Y_HOME + 4.6, DIAL.z);
    const c = at(G.pointOf(F, DIAL.face + 0.1, 0, 0));
    const ex = at(G.pointOf(F, DIAL.face + 0.1, DIAL.needle, 0));
    const ez = at(G.pointOf(F, DIAL.face + 0.1, DIAL.needle, Math.PI / 2));
    return { c, ex: [ex[0] - c[0], ex[1] - c[1]], ez: [ez[0] - c[0], ez[1] - c[1]] };
  }),
  rest: DIAL.rest,
  button: (() => {
    const b = ITEMS.find((item) => item.button).button;
    const c = at([b.x, b.y, b.z]);
    return { c, rx: b.r * k.cameraOf(P).k, ry: b.r * k.cameraOf(P).k * Math.sin((ELEVATION * Math.PI) / 180) + 2 };
  })(),
};

const stripExports = (file) => readFileSync(join(HERE, file), "utf8").replace(/^export /gm, "");
const LIVE = `
const D = ${JSON.stringify(PAGE_DATA)};
const P = D.P;
const K = { cylinder, solidSvg, lineSvg, sideArc, ring, depthOf };
const rollsSvg = ${rollsSvg.toString()};
const tokenSvg = ${tokenSvg.toString()};
const magazineSvg = ${magazineSvg.toString()};
${readFileSync(join(HERE, "live.js"), "utf8")}
`;

const html = k
  .pageHtml({ title: "Cara kerja segmentasi RFM", theme: "light", body: intro + plate + foot, script: stripExports("kit/iso-kit.mjs") + stripExports("motion.mjs") + LIVE, width: 760 })
  .replace("</style>", `${EXTRA_CSS}${PAGE_CSS}</style>`)
  .replace('<html lang="en">', '<html lang="id">');

mkdirSync(join(ROOT, "docs", "rfm"), { recursive: true });
writeFileSync(join(ROOT, "docs", "rfm", "index.html"), html);

// SVG mandiri (tema terang) untuk README dan unduhan: pose rumah, Champions terpilih, tanpa interaksi.
const standalone = k
  .figureSvg({ width: WIDTH, height: HEIGHT, label: LABEL, body: pageBody(START, { token: false }), standalone: "light" })
  .replace("<svg ", `<svg width="${WIDTH * 2}" height="${HEIGHT * 2}" `)
  .replace("</style>", `.iso-svg{background:var(--anatomy-card)}${EXTRA_CSS}</style>`);
writeFileSync(join(ROOT, "docs", "rfm", "rfm-figure.svg"), standalone);
console.log(`wrote docs/rfm/index.html (${(html.length / 1024).toFixed(0)} KB), docs/rfm/rfm-figure.svg · ${STATIC.length} item statis · ${WIDTH}×${HEIGHT} · slot jatuh ${DROP_SLOTS.join(",")}`);
