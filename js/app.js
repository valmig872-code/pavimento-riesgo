/* Interfaz de la web: carga de datos, formulario de la vía, resultados, umbrales, validación y exportación. */
(function () {
  const PAV = window.PAV;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ok = PAV.ok;
  const CLASE = (n) => (n === null || n === undefined ? "lvn" : "lv" + n);
  const NOMBRE_CAPA = { carpeta: "carpeta asfáltica", base: "base", subbase: "subbase", mejoramiento: "mejoramiento", subrasante: "subrasante" };
  const LIMITACIONES = [
    "Modelo de reglas y umbrales no calibrado con fallas observadas: los niveles indican condiciones favorables a cada falla, no una probabilidad.",
    "La mayoría de los umbrales, los coeficientes de capa, los ESAL por tipo de vía y la pérdida de soporte por saturación son PROVISIONALES (ver pestaña Umbrales).",
    "Los datos son de estación, no de la vía: hay incertidumbre por distancia y altitud. Los faltantes no se rellenan.",
    "La «capa crítica» es una inferencia por reglas (vulnerabilidad de cada capa según espesor y CBR, más el mecanismo climático dominante), no un cálculo mecanicista de esfuerzos y deformaciones.",
    "El análisis estructural usa el número estructural (SN, AASHTO-93) y una correlación CBR→Mr; no sustituye un diseño ni ensayos de campo (deflectometría, calicatas, DCP).",
    "Los ciclos hielo-deshielo se aproximan con Tmin ≤ 0 °C y Tmax > 0 °C; no se mide humedad ni temperatura dentro del pavimento.",
    "No se modela la hidrología ni la hidráulica (infiltración, escorrentía, nivel freático). El caudal solo se usa si usted carga una serie.",
    "Las variables de la vía (edad, drenaje, pendiente, tráfico) actúan como modificadores de ±1 nivel con efectos provisionales.",
    "El tipo de mantenimiento (diario, rutinario, periódico, rehabilitación, emergencia) se decide con criterios PROVISIONALES sobre el número de meses con riesgo Medio/Alto; solo la frecuencia de vigilancia diaria tiene respaldo en la literatura (Han, 2020, estudio de baches en Corea).",
    "La correlación CBR→Mr es válida para CBR saturado entre 5 y 10 %; fuera de ese rango el SN requerido es una extrapolación. Los coeficientes de capa no se verificaron contra la Guía AASHTO."
  ];

  /* ---------------- Estado ---------------- */
  const E = { cfg: null, serie: null, base: null, ind: null, indT: null, indA: null, ctx: null, resM: null, resT: null, demo: false, nombre: "", charts: {} };

  function cargarCfg() {
    let c = null;
    try { const s = localStorage.getItem("pav_cfg_v2"); if (s) c = JSON.parse(s); } catch (e) { /* sin almacenamiento */ }
    return c || JSON.parse(JSON.stringify(PAV.CONFIG_DEFECTO));
  }
  function guardarCfg() { try { localStorage.setItem("pav_cfg_v2", JSON.stringify(E.cfg)); } catch (e) { /* ignorar */ } }

  function contarProvisionales(cfg) {
    let n = 0;
    const cuenta = (o) => { if (o && typeof o === "object") { if (o.estado === "PROVISIONAL" && ("medio" in o || "delta" in o || "aplica_a" in o)) n++; Object.values(o).forEach(cuenta); } };
    cuenta(cfg.amenazas); cuenta(cfg.estructura); cuenta(cfg.modificadores);
    return n;
  }

  /* ---------------- Pestañas ---------------- */
  function irA(tab) {
    document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    document.querySelectorAll("section.tab").forEach((s) => s.classList.toggle("on", s.id === "tab-" + tab));
    window.scrollTo(0, 0);
  }
  document.getElementById("tabs").addEventListener("click", (e) => { if (e.target.dataset.tab) irA(e.target.dataset.tab); });

  function banner() {
    const prov = contarProvisionales(E.cfg);
    $("banner").innerHTML = (E.demo ? '<div class="demo">DEMO: datos meteorológicos sintéticos de ejemplo. No son mediciones del SENAMHI. No usar en el artículo.</div>' : "") +
      `<div class="aviso"><b>${prov} parámetros del modelo son PROVISIONALES</b> (sin respaldo directo en la literatura revisada). Véase la pestaña Umbrales.</div>`;
  }

  /* ---------------- Datos ---------------- */
  function colorFalt(p) { const a = Math.min(1, p / 100); return `background:rgba(200,55,45,${(a * 0.85).toFixed(2)});${a > 0.5 ? "color:#fff" : ""}`; }

  function mostrarCalidad() {
    const q = PAV.calidad(E.serie);
    const filas = q.tabla.map((r) => `<tr><td>${r.anio}</td><td>${r.dias}</td>` +
      ["pp", "tmax", "tmin", "caudal"].map((v) => `<td style="${colorFalt(r[v])}">${r[v].toFixed(1)}</td>`).join("") + "</tr>").join("");
    const an = Object.entries(q.anomalias).map(([k, v]) => `<li>${esc(k)}: <b>${v}</b></li>`).join("");
    $("calidad").innerHTML = `<div class="card"><h2 style="margin-top:0">Calidad de los datos</h2>
      <div class="kpi"><div><b>${q.inicio.slice(0, 4)}–${q.fin.slice(0, 4)}</b><span>Rango (${q.inicio} a ${q.fin})</span></div>
      <div><b>${q.dias.toLocaleString("es")}</b><span>Días de calendario</span></div>
      <div><b>${q.dias - q.diasConFila}</b><span>Días sin fila</span></div>
      <div><b>${q.faltantePct.pp.toFixed(1)} %</b><span>Faltante precipitación</span></div>
      <div><b>${q.faltantePct.tmax.toFixed(1)} %</b><span>Faltante Tmax</span></div>
      <div><b>${q.faltantePct.tmin.toFixed(1)} %</b><span>Faltante Tmin</span></div></div>
      <p class="small">Los faltantes <b>no se rellenan</b>: un indicador se anula si su ventana tiene menos de ${Math.round(E.cfg.indicadores.cobertura_minima * 100)} % de datos válidos.</p>
      <h3>Valores sospechosos</h3><ul>${an}</ul>
      <details><summary>Porcentaje faltante por variable y año</summary><div class="scroll"><table><tr><th>Año</th><th>Días</th><th>% pp</th><th>% Tmax</th><th>% Tmin</th><th>% caudal</th></tr>${filas}</table></div></details></div>`;
  }

  function fijarSerie(filas, avisos, nombre, demo) {
    E.serie = PAV.serieDiaria(filas); E.demo = !!demo; E.nombre = nombre || "";
    E.resM = E.resT = null;
    $("msg-datos").innerHTML = `<div class="card"><b>${filas.length.toLocaleString("es")} filas leídas.</b>` + (avisos.length ? "<ul>" + avisos.map((a) => `<li>${esc(a)}</li>`).join("") + "</ul>" : "") + "</div>";
    mostrarCalidad(); banner();
  }

  async function onDatos(ev) {
    const f = ev.target.files[0]; if (!f) return;
    try { const r = await PAV.leerArchivo(f); fijarSerie(r.filas, r.avisos, $("f-nombre").value || f.name.replace(/\.[^.]+$/, ""), false); }
    catch (e) { $("msg-datos").innerHTML = `<div class="err">No se pudo leer el archivo: ${esc(e.message)}</div>`; }
  }

  async function onCaudal(ev) {
    const f = ev.target.files[0]; if (!f || !E.serie) { if (f && !E.serie) $("msg-datos").innerHTML = '<div class="err">Cargue primero los datos diarios.</div>'; return; }
    try {
      const r = await PAV.leerArchivo(f); let n = 0;
      const t0 = E.serie.t[0];
      for (const fila of r.filas) { const i = Math.round((fila.t - t0) / 86400000); if (i >= 0 && i < E.serie.N && ok(fila.caudal)) { E.serie.caudal[i] = fila.caudal; n++; } }
      $("msg-datos").insertAdjacentHTML("beforeend", `<div class="card">Caudal: ${n} días asignados dentro del rango de los datos.</div>`);
      mostrarCalidad();
    } catch (e) { $("msg-datos").insertAdjacentHTML("beforeend", `<div class="err">No se pudo leer el caudal: ${esc(e.message)}</div>`); }
  }

  /* Datos meteorológicos sintéticos (DEMO) con PRNG determinista */
  function demoDatos() {
    let s = 12345; const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const pw = [0.6, 0.6, 0.5, 0.3, 0.1, 0.03, 0.03, 0.05, 0.12, 0.25, 0.3, 0.5];
    const filas = []; const t0 = Date.UTC(2010, 0, 1), t1 = Date.UTC(2019, 11, 31);
    for (let t = t0; t <= t1; t += 86400000) {
      const d = new Date(t), m = d.getUTCMonth();
      const llueve = rnd() < pw[m];
      const pp = llueve ? Math.round(-Math.log(1 - rnd()) * 8 * 10) / 10 : 0;
      const tmin = Math.round((-3.5 + 5 * Math.cos(((m - 0.5) / 12) * 2 * Math.PI) + (rnd() - 0.5) * 4 - (llueve ? 2 : 0)) * 10) / 10;
      const tmax = Math.round((tmin + 17 - (llueve ? 4 : 0) + (rnd() - 0.5) * 3) * 10) / 10;
      filas.push({ t, pp, tmax, tmin, caudal: NaN });
    }
    return filas;
  }

  /* ---------------- Vía ---------------- */
  function llenarSelects() {
    const cfg = E.cfg;
    $("v-tipo").innerHTML = Object.entries(cfg.tipos_via).map(([k, v]) => `<option value="${k}">${esc(v.nombre)}</option>`).join("");
    $("v-suelo").innerHTML = '<option value="">Sin dato</option>' + Object.keys(cfg.estructura.susceptibilidad_helada).map((k) => `<option value="${k}">${esc(k.replace(/_/g, " "))}</option>`).join("");
    $("ids-fallas").textContent = Object.keys(cfg.fallas).join(", ");
    if (cfg.tipos_via.arterial && !E.tipoInit) { $("v-tipo").value = "arterial"; E.tipoInit = true; }
  }

  const val = (id) => { const v = $(id).value; return v === "" ? NaN : Number(v); };
  function leerVia() {
    const err = [];
    const via = { tipo: $("v-tipo").value, trafico: $("v-trafico").value, esal: val("v-esal"), drenaje: $("v-drenaje").value || null,
      pendiente_pct: val("v-pend"), edad_anios: val("v-edad"), suelo: $("v-suelo").value || null, cbr_saturado: $("v-sat").checked, capas: {} };
    const c = via.capas;
    c.carpeta = { espesor: val("c-carp-e") };
    if (!(c.carpeta.espesor > 0)) err.push("Indique el espesor de la carpeta asfáltica (> 0 cm).");
    c.subrasante = { cbr: val("c-subr-c") };
    if (!(c.subrasante.cbr > 0)) err.push("Indique el CBR de la subrasante (> 0 %).");
    [["base", "c-base"], ["subbase", "c-sub"], ["mejoramiento", "c-mej"]].forEach(([k, p]) => {
      c[k] = { usa: $(p + "-u").checked, espesor: val(p + "-e"), cbr: val(p + "-c") };
      if (c[k].usa && !(c[k].espesor > 0)) err.push(`Indique el espesor de ${NOMBRE_CAPA[k]} (> 0 cm) o desmárquela.`);
    });
    for (const k of ["pendiente_pct", "edad_anios"]) if (Number.isNaN(via[k])) via[k] = null;
    if (Number.isNaN(via.esal)) via.esal = null;
    return { via, err };
  }

  /* ---------------- Evaluación ---------------- */
  function evaluar() {
    if (!E.serie) { $("msg-via").innerHTML = '<div class="err">Cargue primero los datos del SENAMHI (paso 1).</div>'; return; }
    const { via, err } = leerVia();
    if (err.length) { $("msg-via").innerHTML = '<div class="err">' + err.map(esc).join("<br>") + "</div>"; return; }
    const uq = val("f-umbral-q"); if (ok(uq) && uq > 0) E.cfg.indicadores.caudal_umbral_m3s = uq;
    $("msg-via").innerHTML = "";
    E.base = PAV.baseDiaria(E.serie, E.cfg);
    E.ind = PAV.indicadoresMensuales(E.base, E.cfg);
    E.indT = PAV.indicadoresTemporada(E.base, E.cfg);
    E.indA = PAV.indicadoresAnuales(E.base, E.cfg);
    E.ctx = PAV.analizarEstructura(via, E.cfg);
    E.resM = PAV.evaluarTodo(E.ind, E.ctx, E.cfg);
    E.resT = PAV.riesgoTemporada(E.resM, E.cfg);
    const meses = Object.keys(E.resM).sort();
    const fin = meses[meses.length - 1], [fy, fm] = fin.split("-").map(Number);
    const ini = `${fm === 12 ? fy - 2 : fy - 3}-${String(fm === 12 ? 1 : fm + 1).padStart(2, "0")}`;
    $("r-fin").value = fin; $("r-ini").value = ini < meses[0] ? meses[0] : ini;
    $("res-vacio").style.display = "none"; $("res").style.display = "block";
    banner(); renderEstructura(); renderPeriodo(); renderMapas(); renderPercentiles();
    irA("res");
  }

  function renderEstructura() {
    const c = E.ctx, R = Object.values(E.resM).map((r) => r.estructura.R);
    const rmin = Math.min(...R), rmed = R.reduce((a, b) => a + b, 0) / R.length;
    const f = PAV.fmt;
    const filas = c.presentes.map((k) => {
      const cap = c.via.capas[k]; const v = c.vuln[k];
      return `<tr><td>${NOMBRE_CAPA[k]}</td><td>${k === "subrasante" ? "—" : f(cap.espesor) + " cm"}</td><td>${k === "carpeta" ? "—" : ok(cap.cbr) ? f(cap.cbr) + " %" : "s/d"}</td>` +
        `<td class="${CLASE(v.nivel)}">${PAV.NIV[v.nivel]}</td><td>${esc(v.razones.join("; ") || "sin debilidad marcada")}</td></tr>`;
    }).join("");
    $("estructura").innerHTML = `<div class="kpi"><div><b>${f(c.sn_prov)}</b><span>SN provisto</span></div><div><b>${f(c.snReqSeco)}</b><span>SN requerido (CBR nominal)</span></div>
      <div><b class="">${f(c.razonSeco)}</b><span>R = SN prov./req. (nominal)</span></div><div><b>${f(rmin)}</b><span>R mínimo (mes más húmedo)</span></div>
      <div><b>${f(rmed)}</b><span>R medio de la serie</span></div><div><b>${c.esal.toExponential(1)}</b><span>ESAL de diseño</span></div><div><b>${f(c.cbrEq)} %</b><span>CBR equivalente de la plataforma</span></div></div>
      <p class="small">R &lt; ${E.cfg.estructura.razon_sn.medio} indica capacidad estructural insuficiente (Medio) y R &lt; ${E.cfg.estructura.razon_sn.alto}, Alto. Valores PROVISIONALES; fórmulas estándar AASHTO-93 (verificar).</p>
      <div class="scroll" style="max-height:none"><table class="capas"><tr><th>Capa</th><th>Espesor</th><th>CBR</th><th>Vulnerabilidad</th><th>Razones</th></tr>${filas}</table></div>` +
      (c.avisos.length ? '<div class="aviso">' + c.avisos.map(esc).join("<br>") + "</div>" : "");
  }

  /* Veredicto: tipo de mantenimiento requerido para el periodo elegido */
  const MESES_N = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  function renderVeredicto() {
    const cfg = E.cfg, T = cfg.mantenimiento.tipos, ini = $("r-ini").value, fin = $("r-fin").value;
    const m = PAV.mantenimiento(E.resM, E.ctx, cfg, ini, fin);
    if (!m.nAnios) { $("veredicto").innerHTML = "<h2>¿Qué mantenimiento necesita esta vía?</h2><p>No hay meses evaluables en el periodo elegido.</p>"; return; }
    const R = PAV.RANGO_MANT, rt = R[m.tipica];
    const chip = (k, on, txt) => `<span class="chip c-${k}${on ? " on" : ""}">${txt}</span>`;
    const chips = chip("diario", m.diaria, "Diario (vigilancia)") + chip("rutinario", rt >= 1, "Rutinario") + chip("periodico", rt >= 2, "Periódico") +
      chip("rehabilitacion", rt >= 3, "Rehabilitación") + chip("emergencia", m.emergencia, "Emergencia") + (rt === 0 ? chip("ninguno", true, "Solo monitoreo") : "");
    const peorFila = m.filas.reduce((a, b) => (R[b.clase] > R[a.clase] ? b : a), m.filas[0]);
    const tipicaFila = m.filas.find((f) => f.clase === m.tipica) || m.filas[0];
    const top = PAV.fallasFrecuentes(E.resM, ini, fin).slice(0, 3);
    const nombreTipo = { ninguno: "solo monitoreo (sin intervención)", rutinario: "mantenimiento RUTINARIO", periodico: "mantenimiento PERIÓDICO", rehabilitacion: "REHABILITACIÓN / REFUERZO ESTRUCTURAL" }[m.tipica];
    const activos = ["diario", "rutinario", "periodico", "rehabilitacion", "emergencia"].filter((k) => (k === "diario" ? m.diaria : k === "emergencia" ? m.emergencia : k === "rutinario" ? rt >= 1 : k === "periodico" ? rt >= 2 : rt >= 3));
    const filas = m.filas.map((f) => `<tr><td>${f.anio}</td><td>${f.meses}</td><td>${f.medioMas}</td><td>${f.altoSup}</td><td>${f.altoEst}</td><td><b>${T[f.clase] ? T[f.clase].nombre : "Solo monitoreo"}</b></td><td>${esc(f.motivo)}</td></tr>`).join("");
    $("veredicto").innerHTML = `<h2>¿Qué mantenimiento necesita esta vía?</h2>
      <p style="font-size:1.1rem;margin:.2rem 0">En el periodo ${ini || "inicial"} a ${fin || "final"} (${m.nAnios} año${m.nAnios > 1 ? "s" : ""}), la vía necesita principalmente <b>${nombreTipo}</b>${m.nAnios > 1 ? ` (tipo más frecuente: mediana de los años; el peor año fue ${peorFila.anio}: ${(T[peorFila.clase] || { nombre: "solo monitoreo" }).nombre.toLowerCase()})` : ""}.</p>
      <div class="chips">${chips}</div>
      ${top.length ? `<p><b>Fallas más probables:</b> ` + top.map((t) => `${esc(t.nombre)} en la <b>${NOMBRE_CAPA[t.capa]}</b> (${t.alto} meses Alto, ${t.medio} Medio)`).join("; ") + ".</p>" : "<p>Ninguna falla alcanza riesgo Medio o Alto en el periodo.</p>"}
      <p><b>Por qué:</b> ${esc(tipicaFila.motivo)}</p>
      ${m.diaria ? `<p><b>Vigilancia diaria</b> recomendada en ${m.aniosDiaria} de ${m.nAnios} años, sobre todo en: ${m.mesesFrecuentes.map((i) => MESES_N[i - 1]).join(", ") || "meses con lluvia intensa, crecida o hielo-deshielo con agua"}.</p>` : ""}
      ${m.emergencia ? `<p><b>Mantenimiento de emergencia:</b> hubo crecida sobre el umbral en ${m.aniosEmerg} año(s).</p>` : ""}
      <details open><summary>Qué hacer y con qué frecuencia</summary>${activos.map((k) => `<div class="ficha"><b>${esc(T[k].nombre)}</b><br>${esc(T[k].actividades)}<br><span class="small">Frecuencia: ${esc(T[k].frecuencia)}</span></div>`).join("") || "<p>Solo inspección visual periódica.</p>"}</details>
      <details><summary>Detalle por año</summary><div class="scroll"><table><tr><th>Año</th><th>Meses evaluados</th><th>Meses ≥ Medio</th><th>Meses Alto (superficial)</th><th>Meses Alto (estructural)</th><th>Tipo requerido</th><th>Motivo</th></tr>${filas}</table></div></details>
      <p class="small">${esc(cfg.mantenimiento.nota)} Es una orientación por reglas, no un programa de conservación: confírmela con una inspección en campo.</p>`;
  }

  function periodosRango() {
    const v = $("r-vent").value, ini = $("r-ini").value, fin = $("r-fin").value;
    if (v === "mensual") return Object.keys(E.resM).sort().filter((k) => (!ini || k >= ini) && (!fin || k <= fin));
    const iy = ini ? Number(ini.slice(0, 4)) - 1 : 0, fy = fin ? Number(fin.slice(0, 4)) : 9999;
    return Object.keys(E.resT).sort().filter((k) => Number(k.slice(0, 4)) >= iy && Number(k.slice(0, 4)) <= fy);
  }
  const resDe = (k) => ($("r-vent").value === "mensual" ? E.resM[k] : E.resT[k]);

  function renderPeriodo() {
    const per = periodosRango(), cfg = E.cfg, ids = Object.keys(cfg.fallas);
    let h = "<tr><th>Periodo</th>" + ids.map((i) => `<th>${esc(cfg.fallas[i].nombre)}</th>`).join("") + "<th>Falla más probable</th><th>Capa crítica</th></tr>";
    for (const k of per) {
      const r = resDe(k), dom = PAV.fallaDominante(r);
      h += `<tr><td>${k}</td>` + ids.map((i) => { const f = r.fallas[i]; return `<td class="${CLASE(f.nivel)}">${PAV.nivelTexto(f.nivel)}${f.nivel >= 1 && f.capa ? "<br><small>" + NOMBRE_CAPA[f.capa] + "</small>" : ""}</td>`; }).join("") +
        (dom && dom.nivel >= 1 ? `<td class="${CLASE(dom.nivel)}">${esc(dom.nombre)}</td><td>${NOMBRE_CAPA[dom.capa]}</td>` : '<td colspan="2">Sin riesgo Medio/Alto</td>') + "</tr>";
    }
    $("tabla-riesgo").innerHTML = h;
    $("r-det").innerHTML = per.map((k) => `<option value="${k}">${k}</option>`).join("");
    if (per.length) $("r-det").value = per[per.length - 1];
    renderVeredicto(); renderDetalle(); renderSeries(); renderTablaInd(per);
  }

  function renderDetalle() {
    const k = $("r-det").value; if (!k) { $("detalle").innerHTML = ""; return; }
    const r = resDe(k), dom = PAV.fallaDominante(r), cfg = E.cfg;
    let h = dom && dom.nivel >= 1 ? `<div class="aviso"><b>Falla más probable en ${k}: ${esc(dom.nombre)} (${PAV.nivelTexto(dom.nivel)})</b>, con la capa crítica en la <b>${NOMBRE_CAPA[dom.capa]}</b>.</div>` : '<div class="card">Ninguna falla alcanza riesgo Medio o Alto en este periodo.</div>';
    for (const f of Object.values(r.fallas)) {
      h += `<div class="ficha n${f.nivel ?? "x"}"><b>${esc(f.nombre)}: ${PAV.nivelTexto(f.nivel)}</b>${f.capa && f.nivel >= 1 ? ` · capa crítica: ${NOMBRE_CAPA[f.capa]}` : ""}${f.mes ? ` · mes crítico ${f.mes}` : ""}
        <div class="small" style="color:inherit">${esc(f.explicacion)}</div><div><b>Mantenimiento preventivo:</b> ${esc(f.recomendacion)}</div>${f.intervencion ? `<div><b>Si se interviene la capa crítica:</b> ${esc(f.intervencion)}</div>` : ""}
        <div class="small">${esc(cfg.recomendaciones_estado)}</div></div>`;
    }
    $("detalle").innerHTML = h;
  }

  function renderSeries() {
    if (!window.Chart) { return; }
    const ini = $("r-ini").value, fin = $("r-fin").value;
    const ks = Object.keys(E.ind).sort().filter((k) => (!ini || k >= ini) && (!fin || k <= fin));
    const ds = [{ type: "bar", label: "Precipitación mensual (mm)", data: ks.map((k) => (ok(E.ind[k].pp_total) ? E.ind[k].pp_total : null)), backgroundColor: "#2b6cb0", yAxisID: "y" },
      { type: "line", label: "Tmin mínima (°C)", data: ks.map((k) => (ok(E.ind[k].tmin_min) ? E.ind[k].tmin_min : null)), borderColor: "#c8372d", yAxisID: "y1", pointRadius: 1, spanGaps: false }];
    if (E.charts.s) E.charts.s.destroy();
    E.charts.s = new Chart($("graf-series"), { data: { labels: ks, datasets: ds }, options: { responsive: true, interaction: { mode: "index", intersect: false },
      scales: { y: { title: { display: true, text: "mm" } }, y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "°C" } } } } });
  }

  function renderTablaInd(per) {
    const cols = Object.keys(PAV.ETIQUETAS), v = $("r-vent").value, src = v === "mensual" ? E.ind : E.indT;
    const claves = v === "mensual" ? per : Object.keys(src).filter((k) => per.includes(k));
    $("tabla-ind").innerHTML = "<tr><th>Periodo</th>" + cols.map((c) => `<th title="${esc(PAV.ETIQUETAS[c][0])}">${esc(c)} [${PAV.ETIQUETAS[c][1]}]</th>`).join("") + "</tr>" +
      claves.map((k) => `<tr><td>${k}</td>` + cols.map((c) => `<td>${ok(src[k][c]) ? PAV.fmt(src[k][c]) : ""}</td>`).join("") + "</tr>").join("");
  }

  /* Mapas de calor año × mes (canvas) */
  const COL = ["#3a9d7b", "#f0b429", "#c8372d"], MESES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  function renderMapas() {
    const cont = $("mapas"); cont.innerHTML = "";
    const ks = Object.keys(E.resM).sort(), y0 = Number(ks[0].slice(0, 4)), y1 = Number(ks[ks.length - 1].slice(0, 4)), filas = y1 - y0 + 1;
    const dark = false;
    for (const [fid, f] of Object.entries(E.cfg.fallas)) {
      const w = 300, mx = 34, my = 18, ch = Math.max(8, Math.min(14, Math.floor(420 / filas))), h = my + filas * ch + 6, dpr = window.devicePixelRatio || 1;
      const wrap = document.createElement("div"); wrap.innerHTML = `<div class="small"><b>${esc(f.nombre)}</b></div>`;
      const cv = document.createElement("canvas"); cv.width = w * dpr; cv.height = h * dpr; wrap.appendChild(cv); cont.appendChild(wrap);
      const g = cv.getContext("2d"); g.scale(dpr, dpr); const cw = (w - mx - 4) / 12;
      g.font = "9px sans-serif"; g.fillStyle = dark ? "#c9d1da" : "#333";
      for (let m = 0; m < 12; m++) g.fillText(MESES[m], mx + m * cw + cw / 2 - 3, 11);
      for (let y = y0; y <= y1; y++) {
        const yy = my + (y - y0) * ch;
        if ((y - y0) % Math.max(1, Math.round(filas / 12)) === 0) { g.fillStyle = dark ? "#c9d1da" : "#333"; g.fillText(String(y), 2, yy + ch - 2); }
        for (let m = 1; m <= 12; m++) {
          const k = `${y}-${String(m).padStart(2, "0")}`, r = E.resM[k], n = r ? r.fallas[fid].nivel : null;
          g.fillStyle = n === null || n === undefined ? "#d9d9d9" : COL[n]; g.fillRect(mx + (m - 1) * cw, yy, cw - 0.5, ch - 0.5);
        }
      }
    }
  }

  function renderPercentiles() {
    const mes = [12, 1, 2, 3], cols = Object.keys(PAV.ETIQUETAS).filter((c) => c !== "pp_total");
    const ks = Object.keys(E.ind).filter((k) => mes.includes(Number(k.slice(5))));
    const q = (arr, p) => { const a = arr.filter(ok).sort((x, y) => x - y); if (!a.length) return NaN; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
    const P = [0.5, 0.75, 0.9, 0.95, 0.975, 0.99];
    $("percentiles").innerHTML = ks.length ? `<div class="scroll"><table><tr><th>Indicador</th>${P.map((p) => `<th>P${p * 100}</th>`).join("")}</tr>` +
      cols.map((c) => `<tr><td>${esc(c)}</td>${P.map((p) => `<td>${PAV.fmt(Math.round(q(ks.map((k) => E.ind[k][c]), p) * 10) / 10)}</td>`).join("")}</tr>`).join("") + "</table></div>" : "<p class='small'>Evalúe primero (paso 2).</p>";
  }

  /* ---------------- Umbrales ---------------- */
  function validarCfg(c) {
    for (const k of ["indicadores", "ventanas", "amenazas", "estructura", "fallas", "modificadores", "tipos_via"]) if (!c[k]) throw new Error(`Falta la sección '${k}'.`);
    const ESTADOS = ["LITERATURA", "FUENTE_OFICIAL", "PROVISIONAL"];
    for (const [a, am] of Object.entries(c.amenazas)) for (const r of am.reglas) for (const x of r.condiciones) {
      if (!ESTADOS.includes(x.estado)) throw new Error(`${a}/${r.id}/${x.indicador}: 'estado' debe ser ${ESTADOS.join(", ")}.`);
      const ge = (x.operador || ">=") === ">=";
      if (ge ? x.medio > x.alto : x.medio < x.alto) throw new Error(`${a}/${r.id}/${x.indicador}: 'medio' y 'alto' en orden incorrecto.`);
    }
    for (const [f, fa] of Object.entries(c.fallas)) for (const m of fa.mecanismos) if (m.amenaza !== "estructural" && !c.amenazas[m.amenaza]) throw new Error(`${f}: amenaza desconocida '${m.amenaza}'.`);
  }

  function renderUmbrales() {
    $("umb-json").value = JSON.stringify(E.cfg, null, 1);
    $("umb-aviso").innerHTML = `<div class="aviso"><b>${contarProvisionales(E.cfg)} parámetros PROVISIONALES.</b></div>`;
    $("fuentes").innerHTML = Object.entries(E.cfg.fuentes).map(([k, v]) => `<p><b>${esc(k)}</b> — ${esc(v.cita)} (p. ${esc(v.paginas)}). <i>${esc(v.respalda)}</i></p>`).join("");
  }

  function aplicarUmbrales() {
    try { const c = JSON.parse($("umb-json").value); validarCfg(c); E.cfg = c; guardarCfg(); llenarSelects(); renderUmbrales(); banner();
      $("umb-msg").innerHTML = '<div class="card">Aplicado. Vuelva a pulsar «Evaluar riesgo de fallas» en el paso 2.</div>'; }
    catch (e) { $("umb-msg").innerHTML = `<div class="err">Configuración inválida: ${esc(e.message)}</div>`; }
  }

  /* ---------------- Validación ---------------- */
  async function onObs(ev) {
    const f = ev.target.files[0]; if (!f) return;
    if (!E.resM) { $("val-res").innerHTML = '<div class="err">Evalúe primero (pasos 1 y 2).</div>'; return; }
    try {
      const obs = PAV.parseObservadas(await f.text()), corte = Number($("val-corte").value), r = PAV.validar(E.resM, obs, corte);
      $("val-res").innerHTML = "<div class='scroll'><table><tr><th>Falla</th><th>n</th><th>VP</th><th>FP</th><th>FN</th><th>VN</th><th>Exactitud</th><th>Precisión</th><th>Sensibilidad</th><th>Especificidad</th></tr>" +
        Object.entries(r).map(([k, m]) => `<tr><td>${esc(k)}</td><td>${m.n}</td><td>${m.VP}</td><td>${m.FP}</td><td>${m.FN}</td><td>${m.VN}</td><td>${m.exactitud ?? "—"}</td><td>${m.precision ?? "—"}</td><td>${m.sensibilidad ?? "—"}</td><td>${m.especificidad ?? "—"}</td></tr>`).join("") + "</table></div>" +
        (r.GLOBAL.n === 0 ? '<div class="err">Ningún periodo de las observaciones coincide con los datos meteorológicos.</div>' : "");
    } catch (e) { $("val-res").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  }

  /* ---------------- Exportar ---------------- */
  function descargar(nombre, texto, tipo) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportarCSV() {
    if (!E.resM) { alert("Evalúe primero."); return; }
    const cols = Object.keys(PAV.ETIQUETAS), ids = Object.keys(E.cfg.fallas);
    const cab = ["periodo", ...cols, "R_estructural", ...ids.flatMap((i) => [`nivel_${i}`, `capa_${i}`]), "falla_mas_probable", "capa_critica"];
    const lineas = [cab.join(",")];
    for (const k of Object.keys(E.resM).sort()) {
      const r = E.resM[k], dom = PAV.fallaDominante(r);
      lineas.push([k, ...cols.map((c) => (ok(E.ind[k][c]) ? E.ind[k][c] : "")), PAV.fmt(r.estructura.R),
        ...ids.flatMap((i) => [PAV.nivelTexto(r.fallas[i].nivel), r.fallas[i].nivel >= 1 ? r.fallas[i].capa : ""]),
        dom && dom.nivel >= 1 ? dom.fid : "", dom && dom.nivel >= 1 ? dom.capa : ""].join(","));
    }
    descargar("resultados_mensuales.csv", "﻿" + lineas.join("\n"), "text/csv;charset=utf-8");
  }

  /* ---------------- Inicio ---------------- */
  function init() {
    E.cfg = cargarCfg();
    llenarSelects(); renderUmbrales(); banner();
    $("limitaciones").innerHTML = LIMITACIONES.map((l) => `<li>${esc(l)}</li>`).join("");
    $("f-datos").addEventListener("change", onDatos);
    $("f-caudal").addEventListener("change", onCaudal);
    $("btn-demo").addEventListener("click", () => fijarSerie(demoDatos(), ["DEMO: datos sintéticos generados en su navegador."], "DEMO", true));
    $("btn-ejemplo").addEventListener("click", async () => {
      try {
        const r = await fetch("ejemplos/1_senamhi_diario_EXTRACTO_REAL_Lampa_2011-2013.txt"); if (!r.ok) throw new Error("no se pudo descargar el ejemplo");
        const p = PAV.parseTexto(await r.text());
        fijarSerie(p.filas, p.avisos.concat(["Extracto real de la estación Lampa (SENAMHI), 2011-2013."]), "Lampa 2011-2013", false);
      } catch (e) { $("msg-datos").innerHTML = `<div class="err">No se pudo cargar el ejemplo (¿abrió el archivo sin servidor?): ${esc(e.message)}. Descárguelo con el enlace y cárguelo con el botón de archivo.</div>`; }
    });
    $("btn-eval").addEventListener("click", evaluar);
    [["c-base-u", "row-base"], ["c-sub-u", "row-sub"], ["c-mej-u", "row-mej"]].forEach(([c, r]) => {
      const f = () => $(r).classList.toggle("off", !$(c).checked); $(c).addEventListener("change", f); f();
    });
    ["r-vent", "r-ini", "r-fin"].forEach((id) => $(id).addEventListener("change", renderPeriodo));
    $("r-det").addEventListener("change", renderDetalle);
    $("umb-aplicar").addEventListener("click", aplicarUmbrales);
    $("umb-reset").addEventListener("click", () => { E.cfg = JSON.parse(JSON.stringify(PAV.CONFIG_DEFECTO)); try { localStorage.removeItem("pav_cfg_v2"); } catch (e) { /* nada */ } llenarSelects(); renderUmbrales(); banner(); });
    $("f-obs").addEventListener("change", onObs);
    $("exp-csv").addEventListener("click", exportarCSV);
    $("exp-cfg").addEventListener("click", () => descargar("umbrales.json", JSON.stringify(E.cfg, null, 1), "application/json"));
    $("exp-print").addEventListener("click", () => window.print());
  }
  document.addEventListener("DOMContentLoaded", init);
  window.PAV_E = E; // útil para depuración y pruebas
})();

