// Gerak halaman (disisipkan apa adanya oleh build.mjs setelah kit dan motion.mjs).
// Pilih segmen (klik atau panah), jalankan satu contoh customer (tombol, Enter, tombol di mesin),
// dan tur saat diam yang menjalankan semua contoh bergantian.

const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = document.querySelector("[data-readout]");
const v = Object.fromEntries([...document.querySelectorAll("[data-v]")].map((el) => [el.dataset.v, el]));
const exCells = [...document.querySelectorAll('[data-board="ex"] > div')];
const runButton = document.querySelector("[data-run]");
const pickSelect = document.querySelector("[data-pick]");
const autoBox = document.querySelector("[data-auto]");
const part = (name) => svg.querySelector(`[data-part="${name}"]`);
const bridge = part("bridge");
const carriage = part("carriage");
const token = part("token");
const magazine = part("magazine");
const button = part("button");
const heldSlot = svg.querySelector('[data-slot="held"]');
const dropSlot = (e) => svg.querySelector(`[data-drop="${e}"]`);
const segEls = D.segs.map((_, i) => svg.querySelector(`[data-seg="${i}"]`));
const floorEls = D.segs.map((_, i) => svg.querySelector(`[data-seg-floor="${i}"]`));
const needles = D.dials.map((_, g) => svg.querySelector(`[data-needle="${g}"]`));
const still = matchMedia("(prefers-reduced-motion: reduce)");
const M = D.motion;
const [X0, Y0, Z0] = D.home;
const cam = cameraOf(P);
const keyNames = ["R", "F", "M"];
const scoreAngle = (score) => 180 - (score - 0.5) * 36;

const state = {
  sel: D.start,
  run: null,
  next: 0,
  magN: D.magCount,
  magRise: 1,
  needle: D.dials.map(() => D.rest),
  needleGoal: D.dials.map(() => D.rest),
  auto: !still.matches,
  touring: !still.matches,
  wait: 1.4,
  clock: 0,
  lastInput: -1e9,
  press: 0,
  queued: false,
};

// ---------------------------------------------------------------- pilihan segmen

// Lantai kotak terpilih selalu disorot; gulungannya baru menyala kalau tidak ada token yang
// sedang berjalan, supaya hanya ada satu aksen menyala.
function showSelection(index, lit = true) {
  segEls.forEach((el, i) => el.querySelectorAll(".iso-solid").forEach((solid) => solid.toggleAttribute("data-lit", lit && i === index)));
  floorEls.forEach((el, i) => el.toggleAttribute("data-on", i === index));
}

function describe(index) {
  const seg = D.segs[index];
  stage.setAttribute("aria-valuenow", String(index + 1));
  stage.setAttribute("aria-valuetext", seg.aria);
}

function select(index) {
  const seg = D.segs[index];
  state.sel = index;
  v.name.textContent = seg.name;
  v.scores.textContent = seg.scores;
  v.customers.textContent = seg.customers;
  v.pctCustomers.textContent = `${seg.pctCustomers} dari ${D.totalText}`;
  v.pctRevenue.textContent = seg.pctRevenue;
  v.revenue.textContent = seg.revenue;
  v.ratio.textContent = `${seg.ratio} rata-rata`;
  v.perCustomer.textContent = seg.perCustomer;
  v.median.textContent = seg.median;
  v.medianSub.textContent = seg.medianSub;
  if (!state.run) readout.textContent = seg.short;
  showSelection(index, !state.run || state.run.landed);
  describe(index);
}

// ---------------------------------------------------------------- contoh customer

function resetExample(e) {
  const ex = D.ex[e];
  exCells.forEach((cell) => cell.setAttribute("data-wait", ""));
  exCells[0].removeAttribute("data-wait");
  v.exNo.textContent = `#${ex.no}`;
  for (let g = 0; g < 3; g++) {
    v[`ex${g}`].textContent = "—";
    v[`exb${g}`].textContent = g === 2 ? "gerbang M · tidak menentukan segmen" : `gerbang ${keyNames[g]}`;
  }
  v.exSeg.textContent = "—";
  v.exCell.textContent = "sel R × F";
}

function revealGate(e, g) {
  const ex = D.ex[e];
  exCells[g + 1].removeAttribute("data-wait");
  v[`ex${g}`].textContent = `${ex.values[g]} → ${keyNames[g]} ${ex.scores[g]}`;
  v[`exb${g}`].textContent = g === 2 ? `skor ${ex.scores[g]} = ${ex.bands[g]} · tidak menentukan segmen` : `skor ${ex.scores[g]} = ${ex.bands[g]}`;
}

function revealSegment(e) {
  const ex = D.ex[e];
  exCells[4].removeAttribute("data-wait");
  v.exSeg.textContent = ex.segment;
  v.exCell.textContent = ex.cell;
}

function setLit(on) {
  token.querySelector(".iso-solid").toggleAttribute("data-lit", on);
}

function drawMagazine(rise) {
  if (rise === state.magRise && magazine.dataset.n === String(state.magN)) return;
  state.magRise = rise;
  magazine.dataset.n = String(state.magN);
  magazine.innerHTML = magazineSvg(K, P, D.mag, state.magN, rise);
}

function startRun() {
  if (state.run) return false;
  const e = state.next;
  state.next = (e + 1) % D.ex.length;
  if (pickSelect) pickSelect.value = String(state.next);
  if (state.magN === 0) state.magN = D.magCount;
  state.magN -= 1;
  const target = D.targets[e];
  state.run = { e, target, plan: planOf(target, M), t: 0, revealed: 0, landed: false, picked: false };
  heldSlot.appendChild(token);
  token.removeAttribute("transform");
  token.style.display = "";
  setLit(true);
  showSelection(state.sel, false);
  state.needleGoal = D.dials.map(() => D.rest);
  resetExample(e);
  const ex = D.ex[e];
  v.exStatus.textContent = `Contoh #${ex.no}: ${ex.values.join(" · ")}`;
  runButton.setAttribute("aria-busy", "true");
  state.press = 1;
  if (still.matches) state.run.t = state.run.plan.total;
  drawMagazine(still.matches ? 1 : 0);
  kick();
  return true;
}

function phaseText(run, pose) {
  const ex = D.ex[run.e];
  const head = `contoh #${ex.no}`;
  if (pose.phase === "pick") return `${head} · diambil dari magasin`;
  if (pose.phase === "measure" && pose.gate >= 0) return `gerbang ${keyNames[pose.gate]} · ${ex.values[pose.gate]} → skor ${ex.scores[pose.gate]}`;
  if (pose.phase === "move" && run.revealed < 3) return `${head} · menuju gerbang ${keyNames[run.revealed]}`;
  if (pose.phase === "forward" || pose.phase === "move") return `R ${ex.scores[0]} · F ${ex.scores[1]} → ${ex.segment}`;
  return `${head} · masuk ${ex.segment}`;
}

function applyPose(run, pose) {
  const by = pose.carriageY - Y0;
  if (by) bridge.setAttribute("transform", translateAlong(P, [0, by, 0]));
  else bridge.removeAttribute("transform");
  const bx = pose.carriageX - X0;
  if (bx || by) carriage.setAttribute("transform", translateAlong(P, [bx, by, 0]));
  else carriage.removeAttribute("transform");
  if (pose.held) {
    if (token.parentNode !== heldSlot) heldSlot.appendChild(token);
    token.removeAttribute("transform");
  } else {
    const slot = dropSlot(run.e);
    if (token.parentNode !== slot) slot.appendChild(token);
    token.setAttribute("transform", translateAlong(P, [pose.x - X0, pose.y - Y0, pose.z - Z0]));
  }
  drawMagazine(pose.lift);
  run.plan.steps.forEach((step) => {
    if (step.name === "measure" && run.t >= step.t0) state.needleGoal[step.gate] = scoreAngle(D.ex[run.e].scores[step.gate]);
  });
  while (run.revealed < pose.measured) revealGate(run.e, run.revealed++);
  if (pose.landed && !run.landed) {
    run.landed = true;
    setLit(false);
    revealSegment(run.e);
    const ex = D.ex[run.e];
    v.exStatus.textContent = `Contoh #${ex.no} masuk ${ex.segment} (${ex.cell})`;
    if (!run.picked) select(ex.seg);
    else showSelection(state.sel, true);
  }
  readout.textContent = pose.landed ? D.segs[state.sel].short : phaseText(run, pose);
}

function finishRun() {
  state.run = null;
  runButton.removeAttribute("aria-busy");
  readout.textContent = D.segs[state.sel].short;
  state.wait = 3.2;
  // Tombol yang ditekan saat contoh lain masih berjalan: jalankan sekarang.
  if (state.queued) {
    state.queued = false;
    startRun();
  }
}

// ---------------------------------------------------------------- loop

function needlePath(g, angle) {
  const d = D.dials[g];
  const a = (angle * Math.PI) / 180;
  const x = d.c[0] + Math.cos(a) * d.ex[0] + Math.sin(a) * d.ez[0];
  const y = d.c[1] + Math.cos(a) * d.ex[1] + Math.sin(a) * d.ez[1];
  return `M${d.c[0].toFixed(2)} ${d.c[1].toFixed(2)}L${x.toFixed(2)} ${y.toFixed(2)}`;
}

let frame = 0;
let last = 0;
let visible = false;

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  state.clock += dt;
  if (state.auto && !state.touring && !calm && !state.run && state.clock - state.lastInput > 8) {
    state.touring = true;
    state.wait = 0.6;
  }
  if (state.touring && !state.run) {
    state.wait -= dt;
    if (state.wait <= 0) startRun();
  }
  const run = state.run;
  if (run) {
    run.t = Math.min(run.plan.total, run.t + dt);
    applyPose(run, poseAt(run.plan, run.t, run.target, M));
    if (run.t >= run.plan.total) finishRun();
  }
  let moving = false;
  state.needleGoal.forEach((goal, g) => {
    const now = state.needle[g];
    const next = calm ? goal : now + (goal - now) * (1 - Math.exp(-dt / 0.12));
    state.needle[g] = Math.abs(goal - next) < 0.05 ? goal : next;
    if (state.needle[g] !== goal) moving = true;
    if (state.needle[g] !== now || !needles[g].dataset.drawn) {
      needles[g].setAttribute("d", needlePath(g, state.needle[g]));
      needles[g].dataset.drawn = "1";
    }
  });
  if (state.press > 0) {
    state.press = calm ? 0 : Math.max(0, state.press - dt / 0.28);
    const depth = Math.sin(Math.PI * Math.min(1, state.press * 1.4)) * 0.9;
    if (depth > 0.01) button.setAttribute("transform", translateAlong(P, [0, 0, -depth]));
    else button.removeAttribute("transform");
    moving = true;
  }
  const busy = state.run || moving || state.touring || (!calm && state.clock - state.lastInput <= 8.5);
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}

function kick() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}

// ---------------------------------------------------------------- masukan

function touched() {
  state.touring = false;
  state.lastInput = state.clock;
  kick();
}

function userSelect(index) {
  touched();
  if (state.run && !state.run.landed) state.run.picked = true;
  select(index);
}

function userRun() {
  touched();
  state.press = 1;
  if (!startRun()) state.queued = true;
}

function hitTest(clientX, clientY) {
  const box = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const sx = ((clientX - box.left) / box.width) * vb.width;
  const sy = ((clientY - box.top) / box.height) * vb.height;
  const b = D.button;
  if (((sx - b.c[0]) / b.rx) ** 2 + ((sy - b.c[1]) / b.ry) ** 2 <= 1) return { button: true };
  const rx = D.roll.r * cam.k;
  const ry = rx * cam.sinE;
  let best = null;
  D.rolls.forEach((rolls, seg) =>
    rolls.forEach((roll) => {
      const bottom = iso([roll.cx, roll.cy, D.roll.z0], P);
      const top = iso([roll.cx, roll.cy, D.roll.z0 + Math.max(roll.h, 0.08)], P);
      if (Math.abs(sx - bottom[0]) > rx || sy < top[1] - ry || sy > bottom[1] + ry) return;
      const depth = depthOf([roll.cx, roll.cy, 0], P);
      if (!best || depth > best.depth) best = { seg, depth };
    }),
  );
  if (best) return { seg: best.seg };
  const u = (sx - P.origin[0]) / cam.k;
  const w = ((sy - P.origin[1]) / cam.k + D.floorZ * cam.cosE) / cam.sinE;
  const x = u * cam.sinA + w * cam.cosA;
  const y = -u * cam.cosA + w * cam.sinA;
  const seg = D.boxes.findIndex(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  return seg >= 0 ? { seg } : null;
}

stage.addEventListener("pointermove", (event) => {
  stage.toggleAttribute("data-hover", Boolean(hitTest(event.clientX, event.clientY)));
});
stage.addEventListener("pointerleave", () => stage.removeAttribute("data-hover"));
stage.addEventListener("click", (event) => {
  const hit = hitTest(event.clientX, event.clientY);
  if (!hit) return;
  if (hit.button) userRun();
  else userSelect(hit.seg);
});
stage.addEventListener("keydown", (event) => {
  const n = D.segs.length;
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") to = (state.sel + 1) % n;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = (state.sel - 1 + n) % n;
  if (event.key === "Home") to = 0;
  if (event.key === "End") to = n - 1;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    userRun();
    return;
  }
  if (event.key === "Escape") {
    touched();
    return;
  }
  if (to === null) return;
  event.preventDefault();
  userSelect(to);
});
stage.addEventListener("focus", () => describe(state.sel));
runButton.addEventListener("click", userRun);
// Pilihan contoh: tombol menjalankan contoh yang tampil di daftar, lalu lanjut berurutan dari situ.
if (pickSelect) pickSelect.addEventListener("change", () => {
  touched();
  state.next = Number(pickSelect.value);
});
// Putar otomatis: mati = figur diam sampai tombol ditekan; hidup lagi = tur langsung jalan.
if (autoBox) autoBox.addEventListener("change", () => {
  state.auto = autoBox.checked;
  state.touring = state.auto && !still.matches;
  state.wait = 0.6;
  // Dimatikan saat contoh berjalan: lompat ke akhir supaya langsung berhenti dengan token sudah mendarat.
  if (!state.auto && state.run) state.run.t = state.run.plan.total;
  kick();
});
new IntersectionObserver(
  (entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) kick();
  },
  { rootMargin: "120px 0px" },
).observe(stage);

select(state.sel);
