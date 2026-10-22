// Gerak satu contoh customer sebagai fungsi murni dari waktu. Halaman dan audit memakai
// fungsi yang sama, jadi pose yang diaudit adalah pose yang dilihat pembaca.
//
// M: { xHome, yHome, gates: [x R, x F, x M], tokenZ, floorZ, g }
// target: { x, y } titik jatuh token (pusat sel R x F customer itu).

export const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function planOf(target, M) {
  const steps = [];
  let t = 0;
  const add = (name, seconds, extra = {}) => {
    steps.push({ name, t0: t, t1: t + seconds, ...extra });
    t += seconds;
  };
  add("pick", 0.5);
  let x = M.xHome;
  M.gates.forEach((gx, gate) => {
    add("move", gate === 0 ? 0.8 : 0.6, { x0: x, x1: gx });
    x = gx;
    add("measure", 1.05, { gate });
  });
  // Maju dulu (menjauh dari magasin dan gerbang di belakang laci), baru bergeser ke kolom sel.
  add("forward", 0.45 + Math.abs(target.y - M.yHome) / 140, { y0: M.yHome, y1: target.y });
  add("move", 0.5 + Math.abs(target.x - x) / 230, { x0: x, x1: target.x });
  const fall = Math.sqrt((2 * (M.tokenZ - M.floorZ)) / M.g);
  add("drop", fall);
  add("rest", 0.4);
  add("return", Math.max(0.5 + Math.abs(target.x - M.xHome) / 260, 0.45 + Math.abs(target.y - M.yHome) / 140), { x0: target.x, x1: M.xHome, y0: target.y, y1: M.yHome });
  return { steps, total: t, fall };
}

// Pose pada waktu t: posisi token/kereta (x, y), tinggi token z, apakah token masih
// menempel di kepala magnet, berapa gerbang sudah mengukur, dan naiknya magasin.
export function poseAt(plan, t, target, M) {
  const pose = { x: M.xHome, y: M.yHome, z: M.tokenZ, held: true, landed: false, measured: 0, gate: -1, lift: 0, phase: "pick", carriageX: M.xHome, carriageY: M.yHome };
  for (const step of plan.steps) {
    if (t < step.t0) break;
    const p = Math.min(1, (t - step.t0) / (step.t1 - step.t0));
    const e = smoothstep(p);
    pose.phase = step.name;
    if (step.name === "move") {
      pose.x = step.x0 + (step.x1 - step.x0) * e;
      if (step.x0 === M.xHome) pose.lift = e;
    } else if (step.name === "measure") {
      pose.gate = p < 1 ? step.gate : -1;
      pose.measured = Math.max(pose.measured, step.gate + (p >= 0.45 ? 1 : 0));
    } else if (step.name === "forward") {
      pose.y = step.y0 + (step.y1 - step.y0) * e;
    } else if (step.name === "drop") {
      const age = Math.min(t, step.t1) - step.t0;
      pose.held = false;
      pose.z = Math.max(M.floorZ, M.tokenZ - 0.5 * M.g * age * age);
      pose.landed = p >= 1;
    } else if (step.name === "rest") {
      pose.held = false;
      pose.landed = true;
      pose.z = M.floorZ;
    } else if (step.name === "return") {
      pose.held = false;
      pose.landed = true;
      pose.z = M.floorZ;
      pose.carriageX = step.x0 + (step.x1 - step.x0) * e;
      pose.carriageY = step.y0 + (step.y1 - step.y0) * e;
      continue;
    }
    if (step.name !== "return") {
      pose.carriageX = pose.x;
      pose.carriageY = pose.y;
    }
  }
  if (!pose.held) {
    pose.x = target.x;
    pose.y = target.y;
  }
  return pose;
}
