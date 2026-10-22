// Tata letak laci RFM: peta R x F yang luas tiap selnya sebanding jumlah customer.
//
// Laci dipotong lurus berulang (guillotine): di tiap langkah dicari satu garis potong
// antar-skor R atau F yang tidak membelah segmen mana pun, lalu lebar/kedalaman dibagi
// menurut jumlah customer di kedua sisi. Di dalam satu segmen, sel boleh dipotong bebas
// (R dulu, supaya baris skor R terbaca lurus). Hasilnya: F naik ke kanan (+x), R naik
// ke belakang (-y), dan luas tiap sel = jumlah customer x luas per customer.

const sum = (cells) => cells.reduce((total, cell) => total + cell.customers, 0);

function cutsOf(cells) {
  const rs = [...new Set(cells.map((cell) => cell.r))].sort((a, b) => a - b);
  const fs = [...new Set(cells.map((cell) => cell.f))].sort((a, b) => a - b);
  return [...rs.slice(0, -1).map((at) => ({ axis: "r", at })), ...fs.slice(0, -1).map((at) => ({ axis: "f", at }))];
}

function splits(cells, cut) {
  const low = cells.filter((cell) => cell[cut.axis] <= cut.at);
  const high = cells.filter((cell) => cell[cut.axis] > cut.at);
  const segments = new Set(cells.map((cell) => cell.segment));
  if (segments.size === 1) return { low, high };
  const lowSeg = new Set(low.map((cell) => cell.segment));
  return high.some((cell) => lowSeg.has(cell.segment)) ? null : { low, high };
}

export function cartogram(grid, rect) {
  const cells = [];
  const cuts = [];
  const walk = (group, box) => {
    if (group.length === 1) {
      cells.push({ ...group[0], ...box });
      return;
    }
    for (const cut of cutsOf(group)) {
      const parts = splits(group, cut);
      if (!parts) continue;
      const share = sum(parts.low) / sum(group);
      const between = new Set(group.map((cell) => cell.segment)).size > 1;
      if (cut.axis === "f") {
        // F rendah di kiri.
        const w = box.w * share;
        cuts.push({ axis: "f", wall: between, x: box.x + w, y0: box.y, y1: box.y + box.d });
        walk(parts.low, { x: box.x, y: box.y, w, d: box.d });
        walk(parts.high, { x: box.x + w, y: box.y, w: box.w - w, d: box.d });
      } else {
        // R tinggi di belakang (y kecil), R rendah di depan.
        const d = box.d * (1 - share);
        cuts.push({ axis: "r", wall: between, y: box.y + d, x0: box.x, x1: box.x + box.w });
        walk(parts.high, { x: box.x, y: box.y, w: box.w, d });
        walk(parts.low, { x: box.x, y: box.y + d, w: box.w, d: box.d - d });
      }
      return;
    }
    throw new Error(`tidak ada potongan lurus untuk ${group.map((cell) => `R${cell.r}F${cell.f}`).join(" ")}`);
  };
  walk(grid, rect);
  return { cells, cuts };
}

// Kotak tiap segmen = gabungan sel-selnya (selalu persegi panjang di peta ini).
export function compartments(cells) {
  const bySegment = new Map();
  for (const cell of cells) {
    const box = bySegment.get(cell.segment) ?? { segment: cell.segment, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, cells: [] };
    box.x0 = Math.min(box.x0, cell.x);
    box.y0 = Math.min(box.y0, cell.y);
    box.x1 = Math.max(box.x1, cell.x + cell.w);
    box.y1 = Math.max(box.y1, cell.y + cell.d);
    box.cells.push(cell);
    bySegment.set(cell.segment, box);
  }
  for (const box of bySegment.values()) {
    const area = (box.x1 - box.x0) * (box.y1 - box.y0);
    const filled = box.cells.reduce((total, cell) => total + cell.w * cell.d, 0);
    if (Math.abs(area - filled) > 1e-6 * area) throw new Error(`segmen ${box.segment} bukan persegi panjang`);
  }
  return bySegment;
}
