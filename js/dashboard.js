// dashboard.js — lógica de dashboard.html (depende de js/data.js y js/icons.js)
// Todo lo que se muestra (tarjetas, personas, equipos y cursos) sale de la misma lista `people`,
// así las cifras siempre coinciden entre vistas.
const PAGE = 20;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const short = t => (t.includes(": ") ? t.split(": ").pop() : t).replace(/\.$/, "").trim();
const fmt = new Intl.NumberFormat("en-US");
// mismo umbral de color en toda la página: rojo < 70 %, naranja < 95 %, verde ≥ 95 %
const level = p => p < 70 ? "vlo" : p < 95 ? "lo" : "ok";

$("today").textContent = new Date().toLocaleDateString("es-SV", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

/* =====================================================
   Modelo de personas (una fila por persona evaluada)
   estado: "pend" = con cursos pendientes · "ok" = todo completo · "lms" = sin cuenta LMS
   ===================================================== */
const filterCourses = titles => (titles || []).filter(t => !isExcludedCourse(t));
const pendRows = EMPLOYEES.map(([name, email, dept, , ix]) => {
  const titles = filterCourses(ix.map(i => TITLES[i]));
  return { name, email, dept, st: titles.length ? "pend" : "ok", titles, filteredOnly: !titles.length };
});
const okRows = COMPLETED.map(([name, email, dept, , n, last]) => ({ name, email, dept, st: "ok", n, last }));
const lmsRows = NO_LMS.map(([name, email, dept]) => ({ name, email, dept, st: "lms" }));
let people = [...pendRows, ...okRows, ...lmsRows];
let summary = { active: SUMMARY.active, completed: SUMMARY.completed };
let liveAt = null;

const ST = { pend: ["Con pendientes", "pend"], ok: ["Al día", "ok"], lms: ["Sin cuenta LMS", "lms"] };
const ORDER = { pend: 0, lms: 1, ok: 2 };
const EXEMPT = Object.fromEntries(TEAMS.map(t => [t[0], t[2]]));
const totalExempt = TEAMS.reduce((a, t) => a + t[2], 0);
const count = st => people.filter(p => p.st === st).length;

/* =====================================================
   Estado de la vista (se guarda en la URL: #personas, #equipos, #cursos)
   ===================================================== */
let viewName = "personas", state = "pend", page = 0, desc = true;
const expanded = new Set(), openCourses = new Set();

function showView(v, push = true) {
  viewName = ["personas", "equipos", "cursos"].includes(v) ? v : "personas";
  document.querySelectorAll(".views [data-v]").forEach(b => b.setAttribute("aria-selected", b.dataset.v === viewName));
  document.querySelectorAll(".view").forEach(s => s.hidden = s.id !== "v-" + viewName);
  if (push) history.replaceState(null, "", "#" + viewName);
}
document.querySelector(".views").onclick = e => { const b = e.target.closest("[data-v]"); if (b) showView(b.dataset.v); };
window.addEventListener("hashchange", () => showView(location.hash.slice(1), false));

/* =====================================================
   Tarjetas (resumen + filtro por estado)
   ===================================================== */
function renderKpis() {
  const pend = people.filter(p => p.st === "pend"), ok = count("ok"), lms = count("lms");
  const evaluated = people.length, pct = evaluated ? Math.round(ok / evaluated * 100) : 0;
  const pendingCourses = pend.reduce((a, p) => a + p.titles.length, 0);
  const cards = [
    ["pend", "CON PENDIENTES", pend.length, `${pendingCourses} cursos por completar`, "var(--orange)", "alert"],
    ["lms", "SIN CUENTA LMS", lms, "No aparecen en LearnDash", "var(--red)", "userx"],
    ["ok", "AL DÍA", ok, `${pct}% de ${evaluated} personas evaluadas`, "var(--green)", "check"],
    [null, "EXENTOS", totalExempt, "No cuentan en el cálculo", "var(--muted)", "ban"],
  ];
  $("kpis").innerHTML = cards.map(([st, l, v, sub, c, ic]) => st
    ? `<button class="card kpi" data-st="${st}" aria-pressed="${state === st}" style="--c:${c}"><i>${icon(ic)}</i><small>${l}</small><strong>${fmt.format(v)}</strong><span>${sub}</span></button>`
    : `<div class="card kpi static" style="--c:${c}"><i>${icon(ic)}</i><small>${l}</small><strong>${fmt.format(v)}</strong><span>${sub}</span></div>`).join("");
  $("scope").innerHTML = `<b>${fmt.format(summary.active)}</b> empleados activos · <b>${fmt.format(summary.completed)}</b> cursos completados · `
    + (liveAt ? `actualizado a las ${liveAt}` : "datos guardados");
}
$("kpis").onclick = e => {
  const b = e.target.closest("[data-st]"); if (!b) return;
  state = state === b.dataset.st ? "all" : b.dataset.st;   // un segundo clic quita el filtro
  page = 0; showView("personas"); renderKpis(); renderPeople();
};

/* =====================================================
   Vista: Personas
   ===================================================== */
const teams = [...new Set([...TEAMS.map(t => t[0]), ...people.map(p => p.dept)].filter(Boolean))].sort();
$("dept").innerHTML = `<option value="">Todos los equipos</option>` + teams.map(v => `<option>${esc(v)}</option>`).join("");

function peopleList() {
  const q = $("q").value.trim().toLowerCase(), d = $("dept").value, dir = desc ? -1 : 1;
  return people
    .filter(r => (state === "all" || r.st === state) && (!d || r.dept === d) && (!q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)))
    .sort((a, b) => ORDER[a.st] - ORDER[b.st]
      || (a.st === "pend" ? (a.titles.length - b.titles.length) * dir : 0)
      || (a.st === "ok" ? String(b.last || "").localeCompare(String(a.last || "")) : 0)
      || a.name.localeCompare(b.name));
}

const fmtDate = s => s ? new Date(s + "T12:00:00").toLocaleDateString("es-SV", { day:"numeric", month:"short", year:"numeric" }) : "";
function detail(r) {
  if (r.caughtUp) return `<span class="okline">Al día (completó sus cursos pendientes recientemente)</span>`;
  if (r.st === "ok") return r.filteredOnly
    ? `<span class="okline">Al día (sus únicos pendientes eran cursos aún no oficiales)</span>`
    : `<span class="okline">${r.n} cursos completados${r.last ? ` · último: ${fmtDate(r.last)}` : ""}</span>`;
  if (r.st === "lms") return `<span class="lmsline">No aparece en LearnDash. Revisa que su correo coincida con el de su cuenta.</span>`;
  const open = expanded.has(r.email), shown = open ? r.titles : r.titles.slice(0, 3);
  return `<div class="chips">${shown.map(t => `<span class="chip" title="${esc(t)}">${esc(short(t))}</span>`).join("")}
    ${r.titles.length > 3 ? `<button class="more" data-e="${esc(r.email)}">${open ? "Ver menos" : `+${r.titles.length - 3} más`}</button>` : ""}</div>`;
}

function renderPeople() {
  const list = peopleList(), pages = Math.max(1, Math.ceil(list.length / PAGE));
  page = Math.min(page, pages - 1);
  const filtered = state !== "all" || $("dept").value || $("q").value.trim();
  const noun = list.length === 1 ? "persona" : "personas";
  const what = state === "all" ? noun : `${noun} ${{ pend: "con pendientes", ok: "al día", lms: "sin cuenta LMS" }[state]}`;
  $("sub").innerHTML = `<b>${list.length}</b> ${what}${$("dept").value ? ` en <b>${esc($("dept").value)}</b>` : ""}`
    + (state !== "all" ? ` · <button class="linkbtn" id="showAll">ver todas</button>` : "");
  $("clear").hidden = !filtered;
  $("pg").textContent = `Página ${page + 1} de ${pages}`;
  $("prev").disabled = page === 0; $("next").disabled = page >= pages - 1;
  document.querySelector("#v-personas .pager").hidden = pages <= 1;
  $("rows").innerHTML = list.slice(page * PAGE, (page + 1) * PAGE).map(r => `<tr>
    <td>${esc(r.name)}<small>${esc(r.email)}</small></td><td>${esc(r.dept)}</td>
    <td><span class="pill ${ST[r.st][1]}">${ST[r.st][0]}</span></td>
    <td>${r.st === "pend" ? `<span class="num">${r.titles.length}</span>` : ""}</td>
    <td>${detail(r)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty-row">Nadie coincide con estos filtros.</td></tr>`;
}

["q", "dept"].forEach(id => $(id).addEventListener("input", () => { page = 0; renderPeople(); }));
$("clear").onclick = () => { $("q").value = ""; $("dept").value = ""; state = "all"; page = 0; renderKpis(); renderPeople(); };
$("sub").onclick = e => { if (e.target.id === "showAll") { state = "all"; page = 0; renderKpis(); renderPeople(); } };
$("sort").onclick = () => { desc = !desc; $("sort").textContent = `PEND. ${desc ? "↓" : "↑"}`; $("sort").setAttribute("aria-sort", desc ? "descending" : "ascending"); renderPeople(); };
$("prev").onclick = () => { page--; renderPeople(); };
$("next").onclick = () => { page++; renderPeople(); };
$("rows").onclick = e => { const b = e.target.closest("[data-e]"); if (!b) return; const k = b.dataset.e; expanded.has(k) ? expanded.delete(k) : expanded.add(k); renderPeople(); };

$("csv").onclick = () => {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const out = ["Nombre,Correo,Equipo,Estado,# Pendientes,Cursos pendientes",
    ...peopleList().map(r => [r.name, r.email, r.dept, ST[r.st][0], r.st === "pend" ? r.titles.length : "", r.st === "pend" ? r.titles.map(short).join(" | ") : ""].map(q).join(","))].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["﻿" + out], { type: "text/csv" })), download: "reporte-por-persona.csv" });
  a.click(); URL.revokeObjectURL(a.href);
};

/* =====================================================
   Vista: Equipos (calculada desde `people`; exentos desde TEAMS)
   ===================================================== */
const teamSort = { k: "pct", desc: false };
function teamRows() {
  const g = {};
  teams.forEach(d => g[d] = { name: d, pend: 0, ok: 0, lms: 0, ex: EXEMPT[d] || 0 });
  people.forEach(p => { if (g[p.dept]) g[p.dept][p.st]++; });
  return Object.values(g).map(t => {
    const evaluated = t.pend + t.ok + t.lms;
    // sin datos = nadie del equipo tiene registros en el LMS (o todos son exentos)
    return { ...t, evaluated, pct: evaluated && evaluated > t.lms ? Math.round(t.ok / evaluated * 100) : null };
  }).filter(t => t.evaluated || t.ex);
}
function renderTeams() {
  const dir = teamSort.desc ? -1 : 1, k = teamSort.k;
  const list = teamRows().sort((a, b) => k === "name" ? a.name.localeCompare(b.name) * dir
    : k === "pct" ? ((a.pct ?? 101) - (b.pct ?? 101)) * dir || b.pend - a.pend
    : (a[k] - b[k]) * dir || a.name.localeCompare(b.name));
  $("trows").innerHTML = list.map(t => {
    const note = !t.evaluated ? "Todo el equipo exento" : t.pct == null ? "Nadie tiene cuenta LMS" : "";
    return `<tr data-team="${esc(t.name)}" tabindex="0" aria-label="Ver personas de ${esc(t.name)}">
      <td><b>${esc(t.name)}</b>${note ? `<small>${note}</small>` : ""}</td>
      <td>${t.pend ? `<span class="num">${t.pend}</span>` : `<span class="zero">0</span>`}</td>
      <td>${t.lms ? `<span class="warnc">${t.lms}</span>` : `<span class="zero">0</span>`}</td>
      <td>${t.ok}</td><td>${t.ex || `<span class="zero">0</span>`}</td>
      <td>${t.pct == null ? `<span class="nodata">Sin datos</span>`
        : `<div class="mini"><div class="bar"><div class="${level(t.pct)}" style="width:${t.pct}%"></div></div><b>${t.pct}%</b></div>`}</td></tr>`;
  }).join("");
  document.querySelectorAll("#thead [data-k]").forEach(h => h.setAttribute("aria-sort", h.dataset.k === k ? (teamSort.desc ? "descending" : "ascending") : "none"));
}
$("thead").onclick = e => {
  const th = e.target.closest("[data-k]"); if (!th) return;
  const k = th.dataset.k;
  teamSort.desc = teamSort.k === k ? !teamSort.desc : (k !== "name" && k !== "pct");
  teamSort.k = k; renderTeams();
};
$("trows").onclick = e => {
  const tr = e.target.closest("[data-team]"); if (!tr) return;
  $("dept").value = tr.dataset.team; $("q").value = ""; state = "all"; page = 0;
  showView("personas"); renderKpis(); renderPeople();
  $("v-personas").scrollIntoView({ behavior: "smooth", block: "start" });
};

/* =====================================================
   Vista: Cursos (quién debe cada curso, calculado desde `people`)
   ===================================================== */
const CATEGORY = Object.fromEntries(COURSE_STATS.map(c => [c[0], c[3]]));
const COURSES = COURSE_ORDER.filter(c => !isExcludedCourse(c));
$("cat").innerHTML = `<option value="">Todas las categorías</option>` + [...new Set(Object.values(CATEGORY))].map(c => `<option>${esc(c)}</option>`).join("");

function renderCourses() {
  const cat = $("cat").value;
  const pendBy = Object.fromEntries(COURSES.map(c => [c, []]));
  people.filter(p => p.st === "pend").forEach(p => p.titles.forEach(t => { const k = short(t); if (pendBy[k]) pendBy[k].push(p); }));
  const list = COURSES.filter(c => !cat || CATEGORY[c] === cat)
    .map(c => ({ c, who: pendBy[c].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.who.length - a.who.length || a.c.localeCompare(b.c));
  const clean = list.filter(x => !x.who.length).length;
  $("csub").innerHTML = `<b>${list.length - clean}</b> de ${list.length} cursos tienen personas pendientes`;
  $("courses").innerHTML = list.map(({ c, who }) => {
    const open = openCourses.has(c);
    return `<div class="course">
      <button class="crow" data-c="${esc(c)}" aria-expanded="${open}" ${who.length ? "" : "disabled"}>
        <span class="t">${esc(c)}</span>
        ${CATEGORY[c] ? `<span class="tag">${esc(CATEGORY[c])}</span>` : "<span></span>"}
        <span class="cnum">${who.length ? `<span class="num">${who.length}</span> ${who.length === 1 ? "pendiente" : "pendientes"}` : `<span class="okline">Todos al día</span>`}</span>
      </button>
      ${open ? `<div class="who">${who.map(p => `<button class="person" data-p="${esc(p.email)}" title="${esc(p.email)}">${esc(p.name)} <small>${esc(p.dept)}</small></button>`).join("")}</div>` : ""}
    </div>`;
  }).join("");
}
$("cat").oninput = renderCourses;
$("courses").onclick = e => {
  const person = e.target.closest("[data-p]");
  if (person) {   // ir a esa persona en la vista Personas
    $("q").value = person.dataset.p; $("dept").value = ""; state = "all"; page = 0;
    showView("personas"); renderKpis(); renderPeople(); return;
  }
  const b = e.target.closest("[data-c]"); if (!b) return;
  const k = b.dataset.c; openCourses.has(k) ? openCourses.delete(k) : openCourses.add(k); renderCourses();
};

/* =====================================================
   Teclado: Enter o Espacio activan filas y encabezados con tabindex
   ===================================================== */
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[tabindex], th[tabindex]")) { e.preventDefault(); e.target.click(); }
});

const renderAll = () => { renderKpis(); renderPeople(); renderTeams(); renderCourses(); };
showView(location.hash.slice(1), false);
renderAll();

/* =====================================================
   Conexión en vivo a Supabase
   ===================================================== */
const SB_URL = "";
const SB_KEY = ""; // publishable: pensada para el navegador
const sb = async path => {
  const r = await fetch(`${SB_URL}/${path}`, { headers: { apikey: SB_KEY, Range: "0-999" } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
};

(async () => {
  if (window.DEMO) return;   // versión demo: solo datos ficticios
  try {
    const [[sum], pend] = await Promise.all([
      sb("v_overall_summary?select=*"),
      sb("v_employee_pending_courses?select=full_name,email,department,pending_course_titles,pending_courses_count&order=pending_courses_count.desc"),
    ]);
    // Pendientes en vivo; "al día" y "sin cuenta" de la foto se descartan si ya aparecen con pendientes
    const livePend = pend.map(p => {
      const titles = filterCourses(p.pending_course_titles);
      return { name: p.full_name, email: p.email, dept: p.department || "Sin equipo", st: titles.length ? "pend" : "ok", titles, filteredOnly: !titles.length };
    });
    const live = new Set(livePend.map(p => p.email.toLowerCase()));
    // quien tenía pendientes en la foto y ya no aparece en vivo, los completó
    const caughtUp = pendRows.filter(r => r.st === "pend" && !live.has(r.email.toLowerCase())).map(r => ({ ...r, st: "ok", titles: [], caughtUp: true }));
    const seen = new Set([...live, ...caughtUp.map(r => r.email.toLowerCase())]);
    people = [...livePend, ...caughtUp, ...okRows.filter(r => !seen.has(r.email.toLowerCase())), ...lmsRows.filter(r => !seen.has(r.email.toLowerCase()))];
    summary = { active: sum.active_employees, completed: sum.total_completed };
    liveAt = new Date().toLocaleTimeString("es-SV", { hour: "numeric", minute: "2-digit" });
    renderAll();
  } catch (err) {
    $("scope").innerHTML += ` · <span class="warnc" title="${esc(err.message)}">no se pudo actualizar en vivo</span>`;
  }
})();
