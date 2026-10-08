// seguimiento.js — lógica de seguimiento.html (depende de js/data.js)
// Envío MANUAL desde el correo de quien usa la página: cada correo se abre ya escrito en su programa
// de correo (mailto) y la persona presiona «Enviar» ahí. Para: la persona · CC: RR.HH.
// (La versión que enviaba desde noreply@ejemplo.com vía Supabase está en _respaldo/2026-10-08-version-noreply.)
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const norm = t => (t.includes(": ") ? t.split(": ").pop() : t).replace(/\.$/, "").trim();

// Personas con pendientes (foto de data.js; se reemplaza por la lectura en vivo de Supabase)
// Los cursos aún no oficiales (EXCLUDED_COURSES en data.js) se ocultan aquí y no cuentan como pendientes.
const filterCourses = titles => (titles || []).filter(t => !isExcludedCourse(t));
let people = EMPLOYEES.map(([name, email, dept, , ix]) => ({ name, email, dept, courses: filterCourses(ix.map(i => norm(TITLES[i]))) }))
  .filter(p => p.courses.length);

$("today").textContent = new Date().toLocaleDateString("es-SV", { weekday:"long", day:"numeric", month:"long", year:"numeric" });

/* =====================================================
   1) Plantilla y configuración (se guardan en el navegador)
   ===================================================== */
const KEY = "compass-reminders";
const DEFAULT_SUBJECT = "Recordatorio: {total} curso(s) de capacitación pendiente(s) · {mes}";
const DEFAULT_BODY = `Hola {nombre},

Te escribimos de Recursos Humanos de UAssist.ME. Al {fecha} tienes {total} curso(s) obligatorio(s) pendiente(s) de completar en UAssist.ME Academy:

{cursos}

Te pedimos completarlos lo antes posible. RR.HH. va en copia de este mensaje para darte seguimiento.

Si ya terminaste alguno y aún aparece como pendiente, responde este correo y lo revisamos.

Gracias,
Recursos Humanos · UAssist.ME`;
// frase de la plantilla anterior (con jefe de área); se reemplaza en plantillas ya guardadas
const OLD_MGR_LINE = "Tu jefe de área ({jefe}) y RR.HH. van en copia de este mensaje para darte seguimiento.";

const DEFAULTS = { cc:"rrhh@ejemplo.com", subject:DEFAULT_SUBJECT, body:DEFAULT_BODY, excluded:[] };
let cfg = { ...DEFAULTS };
try { cfg = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY)) }; } catch (e) {}
cfg.body = String(cfg.body).replace(OLD_MGR_LINE, "RR.HH. va en copia de este mensaje para darte seguimiento.");
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); return true; } catch (e) { return false; } };

function readForm() { cfg.cc = $("cc").value.trim(); cfg.subject = $("subject").value; cfg.body = $("body").value; }
function writeForm() { $("cc").value = cfg.cc; $("subject").value = cfg.subject; $("body").value = cfg.body; }

/* =====================================================
   2) Destinatarios, selección y correo
   ===================================================== */
let selected = null, liveTag = "";
const isOn = p => !cfg.excluded.includes(p.email);
const uniq = () => [...new Set(people.map(p => p.dept).filter(Boolean))].sort();

function fillTeams() {
  const cur = $("rdept").value;
  $("rdept").innerHTML = `<option value="">Todos los equipos</option>` + uniq().map(d => `<option>${esc(d)}</option>`).join("");
  $("rdept").value = cur;
}
const visible = () => {
  const q = $("rq").value.trim().toLowerCase(), d = $("rdept").value;
  return people.filter(p => (!q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) && (!d || p.dept === d));
};
const chosen = () => people.filter(isOn);

function renderRecipients() {
  const list = visible(), on = chosen().length, vis = list.filter(isOn).length;
  $("rsub").textContent = `${people.length} personas con cursos pendientes · ${on} seleccionadas para el envío${liveTag}`;
  $("selCount").textContent = `${vis} de ${list.length} visibles seleccionadas`;
  const all = $("chkAll");
  all.checked = list.length > 0 && vis === list.length;
  all.indeterminate = vis > 0 && vis < list.length;
  $("rrows").innerHTML = list.map(p => `<tr data-e="${esc(p.email)}" tabindex="0" aria-label="Ver correo de ${esc(p.name)}" class="${isOn(p) ? "" : "off"} ${selected === p.email ? "sel" : ""}">
      <td><input type="checkbox" data-inc="${esc(p.email)}" ${isOn(p) ? "checked" : ""} aria-label="Enviar a ${esc(p.name)}"></td>
      <td>${esc(p.name)}<small>${esc(p.dept)} · ${esc(p.email)}</small></td>
      <td><b>${p.courses.length}</b></td></tr>`).join("")
    || `<tr><td colspan="3" class="muted" style="text-align:center">Sin resultados</td></tr>`;
}

// El correo se abre en el programa de correo con mailto, que solo admite texto plano.
function buildMail(p) {
  const vars = {
    nombre: p.name.trim().split(/\s+/)[0],
    cursos: p.courses.map(c => "  • " + c).join("\n"),
    total: String(p.courses.length),
    equipo: p.dept,
    jefe: "RR.HH.",
    mes: new Date().toLocaleDateString("es-SV", { month:"long", year:"numeric" }),
    fecha: new Date().toLocaleDateString("es-SV", { day:"numeric", month:"long", year:"numeric" }),
  };
  const fill = s => s.replace(/\{(\w+)\}/g, (m, k) => k in vars ? vars[k] : m);
  return { to: [p.email], cc: cfg.cc ? [cfg.cc] : [], subject: fill(cfg.subject), text: fill(cfg.body) };
}
const mailtoUrl = m => `mailto:${m.to.join(",")}?cc=${encodeURIComponent(m.cc.join(","))}&subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}`;

function renderPreview() {
  const p = people.find(x => x.email === selected);
  $("mail").hidden = $("mActions").hidden = !p;
  if (!p) { $("pvsub").textContent = "Haz clic en una persona de la lista para ver su correo."; return; }
  const m = buildMail(p);
  $("pvsub").textContent = `Correo para ${p.name}`;
  $("mTo").textContent = m.to.join(", ");
  $("mCc").textContent = m.cc.join(", ") || "(nadie)";
  $("mSub").textContent = m.subject;
  $("mBody").textContent = m.text;
  $("sendOne").textContent = `Abrir solo el correo de ${p.name.split(" ")[0]}`;
}

function renderSend() {
  const n = chosen().length;
  $("sendSummary").innerHTML = n
    ? `<b>${n}</b> ${n === 1 ? "correo" : "correos"}, uno para cada persona${cfg.cc ? `, con copia a ${esc(cfg.cc)}` : ""}.`
    : "No hay personas seleccionadas. Márcalas en la lista de la izquierda.";
  $("send").disabled = !n;
  $("send").textContent = n ? `Abrir ${n} ${n === 1 ? "correo" : "correos"}` : "Abrir correos";
}

const refresh = () => { renderRecipients(); renderPreview(); renderSend(); };

$("rrows").addEventListener("click", e => {
  if (e.target.closest("[data-inc]")) return;
  const tr = e.target.closest("[data-e]"); if (!tr) return;
  selected = tr.dataset.e; refresh();
});
$("rrows").addEventListener("change", e => {
  const inc = e.target.dataset.inc; if (!inc) return;
  cfg.excluded = e.target.checked ? cfg.excluded.filter(x => x !== inc) : [...new Set([...cfg.excluded, inc])];
  persist(); refresh();
});
$("rrows").addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-e]")) { e.preventDefault(); selected = e.target.dataset.e; refresh(); $("rrows").querySelector(`tr[data-e="${CSS.escape(selected)}"]`)?.focus(); }
});
["rq", "rdept"].forEach(id => $(id).addEventListener("input", renderRecipients));

// Seleccionar / deseleccionar (aplica a las personas visibles con el filtro actual)
const setVisible = on => {
  const emails = visible().map(p => p.email);
  cfg.excluded = on ? cfg.excluded.filter(e => !emails.includes(e)) : [...new Set([...cfg.excluded, ...emails])];
  persist(); refresh();
};
$("selAll").onclick = () => setVisible(true);
$("selNone").onclick = () => setVisible(false);
$("chkAll").onchange = e => setVisible(e.target.checked);

/* ---------- Exportar / copiar ---------- */
const csvCell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
$("export").onclick = () => {
  readForm();
  const out = ["Para,CC,Persona,Equipo,# Pendientes,Cursos pendientes",
    ...chosen().map(p => { const m = buildMail(p); return [m.to.join(";"), m.cc.join(";"), p.name, p.dept, p.courses.length, p.courses.join(" | ")].map(csvCell).join(","); })].join("\n");
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob(["﻿" + out], { type:"text/csv" })), download:"recordatorios-cursos.csv" });
  a.click(); URL.revokeObjectURL(a.href);
};
$("copy").onclick = async () => {
  const p = people.find(x => x.email === selected); if (!p) return;
  const m = buildMail(p);
  try { await navigator.clipboard.writeText(`Para: ${m.to.join(", ")}\nCC: ${m.cc.join(", ")}\nAsunto: ${m.subject}\n\n${m.text}`); $("copy").textContent = "¡Copiado!"; }
  catch (e) { $("copy").textContent = "No se pudo copiar"; }
  setTimeout(() => $("copy").textContent = "Copiar", 1500);
};

/* =====================================================
   3) Abrir los correos uno por uno en el programa de correo
   (el navegador solo permite abrir uno por clic, por eso hay un botón «Abrir siguiente»)
   ===================================================== */
let queue = [], qi = 0;
const status = html => { $("sendStatus").innerHTML = html; };
function openNext() {
  const m = queue[qi++];
  location.href = mailtoUrl(m);
  status(qi < queue.length
    ? `Correo ${qi} de ${queue.length} abierto para <b>${esc(m.to.join(", "))}</b>. Envíalo y luego:
       <button class="btn-primary" id="nextDraft">Abrir siguiente (${qi + 1} de ${queue.length})</button>`
    : `Listo: abriste los ${queue.length} ${queue.length === 1 ? "correo" : "correos"}. Revisa que cada uno se haya enviado desde tu programa de correo.`);
  const nb = $("nextDraft"); if (nb) nb.onclick = openNext;
}
$("send").onclick = () => { readForm(); persist(); queue = chosen().map(buildMail); qi = 0; if (queue.length) openNext(); };
$("sendOne").onclick = () => { const p = people.find(x => x.email === selected); if (p) { readForm(); queue = [buildMail(p)]; qi = 0; openNext(); } };

/* =====================================================
   4) Guardar / restaurar / cambios del formulario
   ===================================================== */
$("vars").onclick = e => {
  const b = e.target.closest("[data-v]"); if (!b) return;
  const t = $("body");
  t.setRangeText(b.dataset.v, t.selectionStart, t.selectionEnd, "end"); t.focus(); readForm(); renderPreview();
};
["cc", "subject", "body"].forEach(id => $(id).addEventListener("input", () => { readForm(); renderPreview(); renderSend(); }));
$("save").onclick = () => {
  readForm();
  $("saved").textContent = persist() ? "Guardado en este navegador · " + new Date().toLocaleTimeString("es-SV") : "No se pudo guardar (almacenamiento bloqueado)";
};
$("reset").onclick = () => { $("subject").value = DEFAULT_SUBJECT; $("body").value = DEFAULT_BODY; readForm(); renderPreview(); };

writeForm(); fillTeams(); refresh();

/* =====================================================
   5) Pendientes en vivo (vista por catálogo, sin depender de la vertical)
   ===================================================== */
(async () => {
  if (window.DEMO) return;   // versión demo: solo datos ficticios
  try {
    const r = await fetch("", {
      headers: { apikey: "" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const rows = await r.json();
    people = rows.map(x => ({ name: x.full_name, email: x.email, dept: x.department || "Sin equipo", courses: filterCourses((x.pending_course_titles || []).map(norm)) }))
      .filter(p => p.courses.length);
    fillTeams(); liveTag = " · en vivo"; refresh();
  } catch (e) { /* se queda con la foto de data.js */ }
})();
