/* Motor de reglas + análisis estructural por capas.
 * Flujo: indicadores -> amenazas (0/1/2) -> mecanismos de falla -> capa crítica -> nivel final.
 */
(function (root) {
  const PAV = (root.PAV = root.PAV || {});
  const ok = (x) => x !== null && x !== undefined && !Number.isNaN(x);
  const NIV = ["Bajo", "Medio", "Alto"];
  PAV.NIV = NIV;
  PAV.nivelTexto = (n) => (ok(n) ? NIV[n] : "Sin datos");
  const clip = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt = (x) => (ok(x) ? (Math.abs(x) >= 1000 ? x.toExponential(2) : String(Math.round(x * 100) / 100)) : "s/d");

  /* ---------- Reglas ---------- */
  PAV.nivelCond = function (v, c) {
    if (!ok(v)) return null;
    const op = c.operador || ">=";
    if (op === ">=") return v >= c.alto ? 2 : v >= c.medio ? 1 : 0;
    if (op === ">") return v > c.alto ? 2 : v > c.medio ? 1 : 0;
    if (op === "<") return v < c.alto ? 2 : v < c.medio ? 1 : 0;
    return v <= c.alto ? 2 : v <= c.medio ? 1 : 0;
  };

  /* Máximo entre reglas; cada regla = mínimo de sus condiciones (Y lógico). */
  PAV.nivelReglas = function (valores, reglas) {
    let nivel = null; const detalle = [], noEval = [];
    for (const r of reglas) {
      let m = Infinity, falta = false; const conds = [];
      for (const c of r.condiciones) {
        const v = valores[c.indicador], l = PAV.nivelCond(v, c);
        if (l === null) falta = true; else m = Math.min(m, l);
        conds.push({ indicador: c.indicador, valor: v, medio: c.medio, alto: c.alto, operador: c.operador || ">=", estado: c.estado, nivel: l });
      }
      if (falta) { noEval.push(r.id); continue; }
      detalle.push({ id: r.id, descripcion: r.descripcion, nivel: m, conds });
      nivel = nivel === null ? m : Math.max(nivel, m);
    }
    return { nivel, detalle, noEval };
  };

  PAV.evaluarAmenazas = function (ind, cfg) {
    const out = {};
    for (const [k, a] of Object.entries(cfg.amenazas)) out[k] = PAV.nivelReglas(ind, a.reglas);
    return out;
  };

  /* ---------- Estructura ---------- */
  const interp = (tabla, x) => {
    if (x <= tabla[0][0]) return tabla[0][1];
    for (let i = 1; i < tabla.length; i++) if (x <= tabla[i][0]) { const [x0, y0] = tabla[i - 1], [x1, y1] = tabla[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
    return tabla[tabla.length - 1][1];
  };
  PAV.interp = interp;

  const nivelFactor = (v, f) => (ok(v) ? PAV.nivelCond(v, { operador: f.operador, medio: f.medio, alto: f.alto }) : null);

  /* Mr (psi) = coef * CBR^exp */
  PAV.mrPsi = (cbr, cfg) => cfg.estructura.mr.coef_psi * Math.pow(cbr, cfg.estructura.mr.exponente);

  /* Ecuación AASHTO-93: SN requerido por bisección (log10 W18 = ...) */
  PAV.snRequerido = function (esal, mr, tipo, cfg) {
    const t = cfg.tipos_via[tipo], dpsi = cfg.psi_inicial - t.pt, lw = Math.log10(esal);
    const f = (sn) => t.ZR * t.S0 + 9.36 * Math.log10(sn + 1) - 0.2 + Math.log10(dpsi / 2.7) / (0.4 + 1094 / Math.pow(sn + 1, 5.19)) + 2.32 * Math.log10(mr) - 8.07 - lw;
    let lo = 0.1, hi = 20;
    if (f(hi) < 0) return hi;
    if (f(lo) > 0) return lo;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };

  PAV.cbrEquivalente = function (cbrMej, h, cbrSub, ref) {
    if (!ok(cbrMej) || !ok(h) || h <= 0) return cbrSub;
    if (h >= ref) return cbrMej;
    return Math.pow((h * Math.cbrt(cbrMej) + (ref - h) * Math.cbrt(cbrSub)) / ref, 3);
  };

  /* via: {tipo, trafico, esal, drenaje, pendiente_pct, edad_anios, suelo, cbr_saturado, capas:{...}} */
  PAV.analizarEstructura = function (via, cfg) {
    const E = cfg.estructura, W = [];
    const cap = via.capas;
    const presentes = ["carpeta"];
    for (const k of ["base", "subbase", "mejoramiento"]) if (cap[k] && cap[k].usa) presentes.push(k);
    presentes.push("subrasante");
    const m = ok(via.drenaje) || via.drenaje ? E.drenaje_m[via.drenaje] ?? 1 : 1;
    if (!via.drenaje) W.push("Drenaje sin dato: se usó coeficiente de drenaje 1.0 y pérdida de soporte estándar.");
    const pulg = (cm) => cm / 2.54;

    let sn = E.coef_carpeta * pulg(cap.carpeta.espesor);
    const aporte = { carpeta: sn };
    if (presentes.includes("base")) {
      const a = ok(cap.base.cbr) ? interp(E.coef_base_por_cbr, cap.base.cbr) : (W.push("CBR de base sin dato: se usó el coeficiente típico."), E.coef_base_defecto);
      aporte.base = a * pulg(cap.base.espesor) * m; sn += aporte.base;
    }
    if (presentes.includes("subbase")) {
      const a = ok(cap.subbase.cbr) ? interp(E.coef_subbase_por_cbr, cap.subbase.cbr) : (W.push("CBR de subbase sin dato: se usó el coeficiente típico."), E.coef_subbase_defecto);
      aporte.subbase = a * pulg(cap.subbase.espesor) * m; sn += aporte.subbase;
    }
    const tipo = cfg.tipos_via[via.tipo] ? via.tipo : "carretera";
    const esal = ok(via.esal) && via.esal > 0 ? via.esal : cfg.tipos_via[tipo].esal[via.trafico || "medio"];
    if (!(ok(via.esal) && via.esal > 0)) W.push(`ESAL de diseño no indicado: se usó el valor típico PROVISIONAL (${esal.toExponential(1)}) para tráfico ${via.trafico || "medio"} en ${cfg.tipos_via[tipo].nombre}.`);

    const hMej = presentes.includes("mejoramiento") ? cap.mejoramiento.espesor : 0;
    const cbrMej = presentes.includes("mejoramiento") ? cap.mejoramiento.cbr : NaN;
    const cbrEq = PAV.cbrEquivalente(cbrMej, hMej, cap.subrasante.cbr, E.espesor_mejoramiento_referencia_cm);
    const snReqSeco = PAV.snRequerido(esal, PAV.mrPsi(cbrEq, cfg), tipo, cfg);
    const [cv0, cv1] = E.mr.cbr_validez || [0, 1e9];
    if (cbrEq < cv0 || cbrEq > cv1) W.push(`El CBR de la plataforma (${fmt(cbrEq)} %) está fuera del rango de validez de la correlación CBR→Mr (${cv0}–${cv1} % saturado): el SN requerido es una extrapolación.`);

    /* Vulnerabilidad por capa */
    const vuln = {};
    for (const capa of presentes) {
      let nivel = 0, score = -Infinity; const razones = [];
      for (const f of E.vulnerabilidad[capa] || []) {
        const v = f.factor === "cbr" ? cap[capa].cbr : f.factor === "espesor_cm" ? cap[capa].espesor : NaN;
        const l = nivelFactor(v, f);
        if (l === null) { if (f.factor === "cbr" && capa !== "carpeta") W.push(`CBR de ${capa} sin dato: no se evaluó esa vulnerabilidad.`); continue; }
        /* déficit relativo respecto al umbral medio (desempata entre capas del mismo nivel) */
        score = Math.max(score, f.operador === ">=" ? (v - f.medio) / f.medio : (f.medio - v) / f.medio);
        if (l > 0) razones.push(`${f.factor === "cbr" ? "CBR" : "espesor"} de ${capa} = ${fmt(v)}${f.factor === "cbr" ? " %" : " cm"} (${f.operador} ${l === 2 ? f.alto : f.medio} → ${NIV[l]})`);
        nivel = Math.max(nivel, l);
      }
      vuln[capa] = { nivel, razones, score };
    }
    const cobCm = ["base", "subbase", "mejoramiento"].reduce((a, k) => a + (presentes.includes(k) ? cap[k].espesor || 0 : 0), 0);
    const lc = nivelFactor(cobCm, E.cobertura_granular_cm);
    if (lc !== null) vuln.subrasante.score = Math.max(vuln.subrasante.score, (E.cobertura_granular_cm.medio - cobCm) / E.cobertura_granular_cm.medio);
    if (lc > 0) { vuln.subrasante.nivel = Math.max(vuln.subrasante.nivel, lc); vuln.subrasante.razones.push(`cobertura de capas granulares = ${fmt(cobCm)} cm (≤ ${lc === 2 ? E.cobertura_granular_cm.alto : E.cobertura_granular_cm.medio} → ${NIV[lc]})`); }
    const susc = E.susceptibilidad_helada[via.suelo] ?? 0;

    return { tipo, esal, sn_prov: sn, aporte, m, snReqSeco, razonSeco: sn / snReqSeco, cbrEq, cbrSub: cap.subrasante.cbr, cbrMej, hMej,
      presentes, vuln, susc, cobCm, avisos: W, via };
  };

  /* SN requerido y razón R en un mes según el nivel de humedad (0..1) */
  PAV.estructuralMes = function (ctx, nivelHumedad, cfg) {
    const E = cfg.estructura, P = E.perdida_cbr_saturacion;
    const w = ok(nivelHumedad) ? nivelHumedad / 2 : 0;
    const fd = P.factor_drenaje[ctx.via.drenaje] ?? 1;
    const perd = clip(P.max * w * fd * (ctx.via.cbr_saturado ? P.factor_si_cbr_saturado : 1), 0, 0.9);
    const cbrSub = ctx.cbrSub * (1 - perd), cbrMej = ok(ctx.cbrMej) ? ctx.cbrMej * (1 - perd) : NaN;
    const cbrEq = PAV.cbrEquivalente(cbrMej, ctx.hMej, cbrSub, E.espesor_mejoramiento_referencia_cm);
    const snReq = PAV.snRequerido(ctx.esal, PAV.mrPsi(cbrEq, cfg), ctx.tipo, cfg);
    const R = ctx.sn_prov / snReq;
    const nivel = R < E.razon_sn.alto ? 2 : R < E.razon_sn.medio ? 1 : 0;
    return { R, snReq, cbrEq, perdida: perd, nivel };
  };

  /* ---------- Modificadores de la vía ---------- */
  PAV.deltaModificadores = function (via, cfg, fid) {
    let total = 0; const det = [];
    for (const [nombre, mod] of Object.entries(cfg.modificadores)) {
      if (!mod.aplica_a.includes(fid)) continue;
      const v = via[nombre];
      if (v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v))) continue;
      let d = 0;
      if (mod.valores) d = mod.valores[String(v).toLowerCase()] ?? 0;
      else if (mod.rangos) for (const r of mod.rangos) if (Number(v) <= r.hasta) { d = r.delta; break; }
      if (d !== 0) det.push(`${nombre}=${v} (${d > 0 ? "+" : ""}${d}) [${mod.estado}]`);
      total += d;
    }
    return { delta: clip(total, -1, 1), det };
  };

  /* ---------- Evaluación de un periodo ---------- */
  function elegirCapa(mec, ctx, nivelHumedadAmenaza) {
    let mejor = null, mv = -1, ms = -Infinity;
    for (const c of mec.capas) {
      if (!ctx.presentes.includes(c)) continue;
      let v = ctx.vuln[c].nivel, extra = "", s = ctx.vuln[c].score;
      if (mec.amenaza === "hielo_deshielo_humedo" && c === "subrasante" && ctx.susc > v) { v = ctx.susc; extra = `suelo susceptible a helada (nivel ${NIV[ctx.susc]})`; s = Math.max(s, ctx.susc); }
      if (v > mv || (v === mv && s > ms)) { mv = v; ms = s; mejor = { capa: c, v, extra }; }
    }
    if (!mejor) { const c = ctx.presentes.includes("subrasante") ? "subrasante" : "carpeta"; mejor = { capa: c, v: ctx.vuln[c].nivel, extra: "" }; }
    return mejor;
  }

  PAV.evaluarMes = function (ind, ctx, cfg) {
    const amen = PAV.evaluarAmenazas(ind, cfg);
    const est = PAV.estructuralMes(ctx, amen.humedad_prolongada.nivel, cfg);
    const niveles = {};
    for (const k in amen) niveles[k] = amen[k].nivel;
    niveles.estructural = est.nivel;
    const fallas = {};
    for (const [fid, f] of Object.entries(cfg.fallas)) {
      let base = null, mec = null;
      for (const m of f.mecanismos) { const n = niveles[m.amenaza]; if (n !== null && n !== undefined && (base === null || n > base)) { base = n; mec = m; } }
      const r = { fid, nombre: f.nombre, nivelBase: base, nivel: base, capa: null, explicacion: "", recomendacion: "", intervencion: "" };
      if (base === null) {
        r.explicacion = "No hay datos suficientes para evaluar ningún mecanismo."; r.recomendacion = "Completar datos para poder recomendar.";
        fallas[fid] = r; continue;
      }
      const ch = elegirCapa(mec, ctx);
      const tm = PAV.deltaModificadores(ctx.via, cfg, fid);
      const dEst = mec.amenaza === "estructural" ? 0 : ch.v === 2 ? 1 : ch.v === 0 ? -1 : 0;
      const delta = clip(dEst + tm.delta, -1, 1);
      r.nivel = base >= 1 ? clip(base + delta, 0, 2) : base;
      r.capa = ch.capa; r.mecanismo = mec.amenaza; r.vulnCapa = ch.v;
      const partes = [];
      if (base === 0) {
        partes.push("Ninguna amenaza alcanzó el umbral Medio: riesgo Bajo.");
      } else {
        const nom = mec.amenaza === "estructural" ? "Capacidad estructural" : cfg.amenazas[mec.amenaza].nombre;
        partes.push(`Mecanismo dominante: ${nom} (nivel ${NIV[base]}). ${mec.texto.replace("{capa}", ch.capa)}`);
        if (mec.amenaza === "estructural") partes.push(`SN provisto = ${fmt(ctx.sn_prov)}; SN requerido en el mes = ${fmt(est.snReq)}; razón R = ${fmt(est.R)} (CBR efectivo de subrasante ${fmt(ctx.cbrSub * (1 - est.perdida))} %, pérdida por saturación ${fmt(est.perdida * 100)} %) [PROVISIONAL].`);
        else for (const d of amen[mec.amenaza].detalle.filter((d) => d.nivel >= 1)) partes.push(`Regla ${d.id} → ${NIV[d.nivel]}: ${d.descripcion}. ` + d.conds.map((c) => `${(PAV.ETIQUETAS[c.indicador] || [c.indicador])[0]} = ${fmt(c.valor)} (medio ${c.operador} ${c.medio}, alto ${c.operador} ${c.alto}) [${c.estado}]`).join(" Y "));
        const razones = ctx.vuln[ch.capa] ? ctx.vuln[ch.capa].razones : [];
        partes.push(`Capa crítica: ${ch.capa} (vulnerabilidad ${NIV[ch.v]}${razones.length ? ": " + razones.join("; ") : ""}${ch.extra ? "; " + ch.extra : ""}).`);
        if (dEst !== 0 || tm.delta !== 0) partes.push(`Ajuste por estructura (${dEst > 0 ? "+" : ""}${dEst}) y vía (${tm.delta > 0 ? "+" : ""}${tm.delta}${tm.det.length ? ": " + tm.det.join("; ") : ""}) → ${delta > 0 ? "+" : ""}${delta}.`);
      }
      if (amen && mec.amenaza !== "estructural" && amen[mec.amenaza] && amen[mec.amenaza].noEval.length) partes.push(`Reglas no evaluables por falta de datos: ${amen[mec.amenaza].noEval.join(", ")}.`);
      r.explicacion = partes.join(" | ");
      const txt = PAV.nivelTexto(r.nivel);
      r.recomendacion = f.recomendaciones[txt] || "";
      r.intervencion = r.nivel >= 1 ? cfg.intervencion_por_capa[ch.capa] || "" : "";
      fallas[fid] = r;
    }
    return { amenazas: niveles, estructura: est, fallas };
  };

  /* Evalúa todos los periodos de un diccionario de indicadores */
  PAV.evaluarTodo = function (indicadores, ctx, cfg) {
    const out = {};
    for (const k of Object.keys(indicadores).sort()) out[k] = PAV.evaluarMes(indicadores[k], ctx, cfg);
    return out;
  };

  /* Riesgo de temporada = peor mes de la temporada */
  PAV.riesgoTemporada = function (resMensual, cfg) {
    const t = cfg.ventanas.temporada_lluvias, out = {};
    for (const [mes, r] of Object.entries(resMensual)) {
      const [y, m] = mes.split("-").map(Number);
      const key = PAV.claveTemporada(Date.UTC(y, m - 1, 1), t.mes_inicio, t.mes_fin);
      if (key === null) continue;
      const o = (out[key] = out[key] || { fallas: {}, meses: [] });
      o.meses.push(mes);
      for (const [fid, f] of Object.entries(r.fallas)) {
        const prev = o.fallas[fid];
        if (!prev || (f.nivel !== null && (prev.nivel === null || f.nivel > prev.nivel))) o.fallas[fid] = Object.assign({ mes }, f);
      }
    }
    return out;
  };

  /* ---------- Tipo de mantenimiento ----------
   * Por año calendario, con los niveles mensuales:
   *  rehabilitación > periódico > rutinario > solo monitoreo; "diario" y "emergencia" son indicadores adicionales. */
  const RANGO = { ninguno: 0, rutinario: 1, periodico: 2, rehabilitacion: 3 };
  PAV.RANGO_MANT = RANGO;

  PAV.mantenimiento = function (resMensual, ctx, cfg, ini, fin) {
    const M = cfg.mantenimiento;
    const meses = Object.keys(resMensual).sort().filter((k) => (!ini || k >= ini) && (!fin || k <= fin));
    const porAnio = {};
    for (const k of meses) (porAnio[k.slice(0, 4)] = porAnio[k.slice(0, 4)] || []).push(k);
    const razonNominal = ctx.razonSeco, defEstruct = M.rehabilitacion.usar_razon_sn_alto && razonNominal < cfg.estructura.razon_sn.alto;
    const filas = [], contMes = Array(12).fill(0);
    for (const [anio, ms] of Object.entries(porAnio)) {
      let medioMas = 0, altoSup = 0, altoEst = 0, emerg = 0; const diarios = [];
      for (const k of ms) {
        const r = resMensual[k];
        const fl = Object.values(r.fallas).filter((f) => f.nivel !== null);
        if (fl.some((f) => f.nivel >= 1)) medioMas++;
        if (fl.some((f) => M.fallas_superficiales.includes(f.fid) && f.nivel === 2)) altoSup++;
        if (fl.some((f) => M.fallas_estructurales.includes(f.fid) && f.nivel === 2 && f.capa !== "carpeta")) altoEst++;
        if ((r.amenazas[M.emergencia.amenaza] ?? 0) >= M.emergencia.nivel) emerg++;
        if (M.diaria.amenazas.some((a) => (r.amenazas[a] ?? 0) >= M.diaria.nivel_min)) { diarios.push(k); contMes[Number(k.slice(5)) - 1]++; }
      }
      let clase = "ninguno", motivo = "Ninguna falla alcanza el nivel Medio: solo monitoreo.";
      if (altoEst >= M.rehabilitacion.meses_alto_estructural_por_anio || defEstruct) {
        clase = "rehabilitacion";
        motivo = defEstruct && altoEst < M.rehabilitacion.meses_alto_estructural_por_anio
          ? `La capacidad estructural nominal es insuficiente (R = ${fmt(razonNominal)} < ${cfg.estructura.razon_sn.alto}).`
          : `${altoEst} meses con riesgo Alto de falla estructural en capas inferiores (umbral: ${M.rehabilitacion.meses_alto_estructural_por_anio}).`;
      } else if (altoSup >= M.periodico.meses_alto_superficial_por_anio || medioMas >= M.periodico.meses_medio_o_mas_por_anio) {
        clase = "periodico";
        motivo = altoSup >= M.periodico.meses_alto_superficial_por_anio ? `${altoSup} meses con riesgo Alto de falla superficial.` : `${medioMas} meses con riesgo Medio o Alto.`;
      } else if (medioMas >= M.rutinario.meses_medio_o_mas_por_anio) {
        clase = "rutinario"; motivo = `${medioMas} mes(es) con riesgo Medio o Alto.`;
      }
      filas.push({ anio, meses: ms.length, medioMas, altoSup, altoEst, emergencia: emerg, diarioMeses: diarios, clase, motivo });
    }
    /* Clase típica = mediana de los rangos anuales */
    const rangos = filas.map((f) => RANGO[f.clase]).sort((a, b) => a - b);
    const med = rangos.length ? rangos[Math.floor(rangos.length / 2)] : 0;   /* mediana superior (conservadora) */
    const tipica = Object.keys(RANGO).find((k) => RANGO[k] === med) || "ninguno";
    const n = filas.length || 1;
    const aniosDiaria = filas.filter((f) => f.diarioMeses.length).length, aniosEmerg = filas.filter((f) => f.emergencia).length;
    const mesesFrecuentes = contMes.map((c, i) => [i, c / n]).filter(([, p]) => p >= 0.3).map(([i]) => i + 1);
    return { filas, tipica, peor: Object.keys(RANGO).find((k) => RANGO[k] === Math.max(0, ...rangos)) || "ninguno",
      diaria: aniosDiaria / n >= 0.5, aniosDiaria, aniosEmerg, emergencia: aniosEmerg > 0, mesesFrecuentes, nAnios: filas.length, defEstruct, razonNominal };
  };

  /* Fallas más probables: frecuencia de meses Alto (y Medio) por falla y capa crítica */
  PAV.fallasFrecuentes = function (resMensual, ini, fin) {
    const cont = {};
    for (const k of Object.keys(resMensual).filter((k) => (!ini || k >= ini) && (!fin || k <= fin))) {
      for (const f of Object.values(resMensual[k].fallas)) {
        if (f.nivel === null || f.nivel < 1) continue;
        const key = f.fid + "|" + f.capa, o = (cont[key] = cont[key] || { fid: f.fid, nombre: f.nombre, capa: f.capa, alto: 0, medio: 0 });
        if (f.nivel === 2) o.alto++; else o.medio++;
      }
    }
    return Object.values(cont).sort((a, b) => b.alto - a.alto || b.medio - a.medio);
  };

  /* Falla dominante: nivel más alto (ante empate, el orden de cfg.fallas) */
  PAV.fallaDominante = function (r) {
    let best = null;
    for (const f of Object.values(r.fallas)) if (f.nivel !== null && (best === null || f.nivel > best.nivel)) best = f;
    return best;
  };

  /* ---------- Validación ---------- */
  PAV.parseObservadas = function (texto) {
    const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
    const sep = [";", "\t", ","].find((s) => lineas[0].includes(s)) || ",";
    const cab = lineas[0].split(sep).map((s) => s.trim().toLowerCase());
    const out = [];
    const iP = cab.indexOf("periodo");
    if (iP < 0) throw new Error("Falta la columna 'periodo' (AAAA-MM).");
    const iF = cab.indexOf("tipo_falla"), iO = cab.indexOf("observada");
    for (const l of lineas.slice(1)) {
      const c = l.split(sep).map((s) => s.trim());
      const periodo = (c[iP] || "").slice(0, 7);
      if (iF >= 0 && iO >= 0) out.push({ periodo, falla: c[iF].toLowerCase(), obs: Number(c[iO]) > 0 ? 1 : 0 });
      else cab.forEach((h, i) => { if (i !== iP && c[i] !== undefined && c[i] !== "") out.push({ periodo, falla: h, obs: Number(c[i]) > 0 ? 1 : 0 }); });
    }
    return out;
  };

  PAV.validar = function (resMensual, obs, corte) {
    const por = {}; const G = { VP: 0, FP: 0, FN: 0, VN: 0 };
    for (const o of obs) {
      const r = resMensual[o.periodo]; if (!r || !r.fallas[o.falla] || r.fallas[o.falla].nivel === null) continue;
      const pred = r.fallas[o.falla].nivel >= corte ? 1 : 0;
      const k = pred && o.obs ? "VP" : pred && !o.obs ? "FP" : !pred && o.obs ? "FN" : "VN";
      (por[o.falla] = por[o.falla] || { VP: 0, FP: 0, FN: 0, VN: 0 })[k]++; G[k]++;
    }
    por.GLOBAL = G;
    for (const k in por) { const m = por[k], n = m.VP + m.FP + m.FN + m.VN, d = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : null);
      m.n = n; m.exactitud = d(m.VP + m.VN, n); m.precision = d(m.VP, m.VP + m.FP); m.sensibilidad = d(m.VP, m.VP + m.FN); m.especificidad = d(m.VN, m.VN + m.FP); }
    return por;
  };
  PAV.fmt = fmt;
})(typeof window !== "undefined" ? window : globalThis);
