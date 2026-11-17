/* Lectura de datos SENAMHI, calidad e indicadores (equivalente a carga.py / calidad.py / indicadores.py). */
(function (root) {
  const PAV = (root.PAV = root.PAV || {});
  const DIA = 86400000;
  const ok = (x) => x !== null && x !== undefined && !Number.isNaN(x);

  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ALIAS = { fecha: "fecha", date: "fecha", ano: "anio", anio: "anio", year: "anio", a: "anio", mes: "mes", month: "mes",
    dia: "dia", day: "dia", pp: "pp", precipitacion: "pp", precipitacionacumulada: "pp", prec: "pp", lluvia: "pp",
    tmax: "tmax", temperaturamaxima: "tmax", tempmax: "tmax", tmin: "tmin", temperaturaminima: "tmin", tempmin: "tmin",
    caudal: "caudal", q: "caudal", caudalm3s: "caudal" };
  const esNum = (t) => t !== "" && !Number.isNaN(Number(String(t).replace(",", ".")));
  const num = (t) => { const v = Number(String(t).replace(",", ".")); return t === "" || t === null || t === undefined || Number.isNaN(v) ? NaN : v; };

  function parseFecha(s) {
    s = String(s).trim();
    let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
    return NaN;
  }

  /* Convierte cabecera + filas (texto) en filas normalizadas {t, pp, tmax, tmin, caudal}. */
  function construir(cabecera, filas, avisos, esExcel) {
    const col = {};
    cabecera.forEach((h, i) => { const a = ALIAS[norm(h)]; if (a && !(a in col)) col[a] = i; });
    const tieneFecha = "fecha" in col, tieneAMD = "anio" in col && "mes" in col && "dia" in col;
    if (!tieneFecha && !tieneAMD) throw new Error("No se encontraron columnas de fecha (fecha o año/mes/día).");
    const cod = { pp: 0, tmax: 0, tmin: 0, caudal: 0 };
    let malas = 0;
    const out = [];
    for (const f of filas) {
      const t = tieneFecha ? parseFecha(f[col.fecha]) : Date.UTC(+f[col.anio], +f[col.mes] - 1, +f[col.dia]);
      if (Number.isNaN(t)) { malas++; continue; }
      const r = { t, pp: NaN, tmax: NaN, tmin: NaN, caudal: NaN };
      for (const v of ["pp", "tmax", "tmin", "caudal"]) {
        if (v in col) { let x = num(f[col[v]]); if (ok(x) && x <= -99) { cod[v]++; x = NaN; } r[v] = x; }
      }
      out.push(r);
    }
    for (const v in cod) if (cod[v]) avisos.push(`${v}: ${cod[v]} códigos de faltante (≤ -99) convertidos a vacío.`);
    if (malas) avisos.push(`${malas} filas con fecha inválida descartadas.`);
    out.sort((a, b) => a.t - b.t);
    const unicas = [];
    let dup = 0;
    for (const r of out) { if (unicas.length && unicas[unicas.length - 1].t === r.t) { unicas[unicas.length - 1] = r; dup++; } else unicas.push(r); }
    if (dup) avisos.push(`${dup} fechas duplicadas: se conserva la última.`);
    if (esExcel) {
      let z = 0;
      for (const r of unicas) if (r.tmax === 0 && r.tmin === 0) { r.tmax = NaN; r.tmin = NaN; z++; }
      if (z) avisos.push(`Excel: ${z} filas con Tmax=Tmin=0 exactos tratadas como FALTANTES (el Excel convierte los faltantes del TXT a 0).`);
      avisos.push("Excel: una precipitación 0 no se distingue de un faltante convertido a 0. Se recomienda usar el TXT original del SENAMHI.");
    }
    return unicas;
  }

  PAV.parseTexto = function (texto) {
    const avisos = [];
    const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
    if (!lineas.length) throw new Error("El archivo está vacío.");
    const sep = [";", "\t", ","].find((s) => lineas[0].includes(s));
    const partir = (l) => (sep ? l.split(sep).map((t) => t.trim()) : l.trim().split(/\s+/));
    const filas = lineas.map(partir);
    const conEnc = !filas[0].filter((t) => t !== "").every(esNum);
    let cab, cuerpo;
    if (conEnc) { cab = filas[0]; cuerpo = filas.slice(1); }
    else {
      const base = ["anio", "mes", "dia", "pp", "tmax", "tmin", "caudal"];
      const n = Math.max(...filas.map((f) => f.length));
      cab = base.slice(0, n); cuerpo = filas;
      avisos.push("Archivo sin encabezado: se asumió el orden año mes día pp tmax tmin [caudal].");
    }
    return { filas: construir(cab, cuerpo, avisos, false), avisos };
  };

  PAV.parseXlsx = function (buffer) {
    if (typeof XLSX === "undefined") throw new Error("La librería para leer Excel no se cargó (¿sin internet?). Use el TXT original.");
    const wb = XLSX.read(buffer, { type: "array" });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });
    const cab = matriz[0].slice(0, 7);
    const avisos = [];
    const cuerpo = matriz.slice(1).map((f) => f.slice(0, 7));
    return { filas: construir(cab, cuerpo, avisos, true), avisos };
  };

  PAV.leerArchivo = async function (file) {
    if (/\.xlsx?$/i.test(file.name)) return PAV.parseXlsx(await file.arrayBuffer());
    const buf = await file.arrayBuffer();
    let texto;
    try { texto = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch (e) { texto = new TextDecoder("windows-1252").decode(buf); }
    return PAV.parseTexto(texto);
  };

  /* Serie diaria continua (arrays paralelos). Los días sin registro quedan NaN. */
  PAV.serieDiaria = function (filas) {
    const t0 = filas[0].t, t1 = filas[filas.length - 1].t;
    const N = Math.round((t1 - t0) / DIA) + 1;
    const S = { N, t: new Array(N), pp: new Array(N).fill(NaN), tmax: new Array(N).fill(NaN), tmin: new Array(N).fill(NaN), caudal: new Array(N).fill(NaN), conFila: 0 };
    for (let i = 0; i < N; i++) S.t[i] = t0 + i * DIA;
    for (const r of filas) { const i = Math.round((r.t - t0) / DIA); S.pp[i] = r.pp; S.tmax[i] = r.tmax; S.tmin[i] = r.tmin; S.caudal[i] = r.caudal; S.conFila++; }
    return S;
  };

  /* ---------------- Calidad ---------------- */
  PAV.calidad = function (S) {
    const vars = ["pp", "tmax", "tmin", "caudal"];
    const porAnio = {};
    const global = {};
    for (const v of vars) global[v] = 0;
    for (let i = 0; i < S.N; i++) {
      const y = new Date(S.t[i]).getUTCFullYear();
      const a = (porAnio[y] = porAnio[y] || { dias: 0, pp: 0, tmax: 0, tmin: 0, caudal: 0 });
      a.dias++;
      for (const v of vars) if (!ok(S[v][i])) { a[v]++; global[v]++; }
    }
    const tabla = Object.keys(porAnio).map((y) => ({ anio: +y, dias: porAnio[y].dias,
      pp: (100 * porAnio[y].pp) / porAnio[y].dias, tmax: (100 * porAnio[y].tmax) / porAnio[y].dias,
      tmin: (100 * porAnio[y].tmin) / porAnio[y].dias, caudal: (100 * porAnio[y].caudal) / porAnio[y].dias }));
    const primer = {};
    for (const v of vars) { const i = S[v].findIndex(ok); primer[v] = i < 0 ? null : new Date(S.t[i]).toISOString().slice(0, 10); }
    let tmaxMenor = 0, ppNeg = 0, ppExt = 0;
    for (let i = 0; i < S.N; i++) { if (S.tmax[i] < S.tmin[i]) tmaxMenor++; if (S.pp[i] < 0) ppNeg++; if (S.pp[i] > 150) ppExt++; }
    return { tabla, faltantePct: Object.fromEntries(vars.map((v) => [v, (100 * global[v]) / S.N])), primer,
      inicio: new Date(S.t[0]).toISOString().slice(0, 10), fin: new Date(S.t[S.N - 1]).toISOString().slice(0, 10),
      dias: S.N, diasConFila: S.conFila, anomalias: { "Tmax < Tmin": tmaxMenor, "Precipitación negativa": ppNeg, "Precipitación > 150 mm/día": ppExt } };
  };

  /* ---------------- Indicadores ---------------- */
  function rollSum(x, n, minp) {
    const out = new Array(x.length); let s = 0, c = 0;
    for (let i = 0; i < x.length; i++) {
      if (ok(x[i])) { s += x[i]; c++; }
      if (i >= n && ok(x[i - n])) { s -= x[i - n]; c--; }
      out[i] = c >= minp ? Math.round(s * 1e9) / 1e9 : NaN;
    }
    return out;
  }

  PAV.baseDiaria = function (S, cfg) {
    const p = cfg.indicadores, N = S.N;
    const b = { N, t: S.t, pp: S.pp, tmin: S.tmin, tmax: S.tmax, caudal: S.caudal, lluvia: new Array(N), racha: new Array(N),
      helada: new Array(N), ciclo: new Array(N), qsobre: new Array(N), acum: {} };
    let r = 0;
    for (let i = 0; i < N; i++) {
      const ll = S.pp[i] >= p.dia_lluvia_mm;
      b.lluvia[i] = ok(S.pp[i]) ? (ll ? 1 : 0) : NaN;
      r = ll ? r + 1 : 0; b.racha[i] = r;
      b.helada[i] = ok(S.tmin[i]) ? (S.tmin[i] <= p.helada_tmin_c ? 1 : 0) : NaN;
      b.ciclo[i] = ok(S.tmin[i]) && ok(S.tmax[i]) ? (S.tmin[i] <= p.helada_tmin_c && S.tmax[i] > p.deshielo_tmax_c ? 1 : 0) : NaN;
      b.qsobre[i] = ok(S.caudal[i]) && ok(p.caudal_umbral_m3s) ? (S.caudal[i] >= p.caudal_umbral_m3s ? 1 : 0) : NaN;
    }
    for (const n of p.ventanas_acumulado_dias) b.acum[n] = rollSum(S.pp, n, Math.ceil(n * p.cobertura_minima - 1e-9));
    return b;
  };

  const clavMes = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  PAV.claveMes = clavMes;
  PAV.claveTemporada = function (ms, ini, fin) {
    const d = new Date(ms), m = d.getUTCMonth() + 1, y = d.getUTCFullYear();
    if (ini <= fin) return m >= ini && m <= fin ? `${y}` : null;
    if (m >= ini) return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
    if (m <= fin) return `${y - 1}-${String(y % 100).padStart(2, "0")}`;
    return null;
  };

  /* Agrega por clave (mes/temporada/año); anula indicadores con cobertura insuficiente. */
  PAV.agrupar = function (b, claves, cfg) {
    const p = cfg.indicadores, cob = p.cobertura_minima;
    const grupos = new Map();
    for (let i = 0; i < b.N; i++) {
      const k = claves[i]; if (k === null) continue;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(i);
    }
    const sumaMin1 = (idx, arr) => { let s = 0, c = 0; for (const i of idx) if (ok(arr[i])) { s += arr[i]; c++; } return c ? s : NaN; };
    const maxi = (idx, arr) => { let m = -Infinity, c = 0; for (const i of idx) if (ok(arr[i])) { if (arr[i] > m) m = arr[i]; c++; } return c ? m : NaN; };
    const mini = (idx, arr) => { let m = Infinity, c = 0; for (const i of idx) if (ok(arr[i])) { if (arr[i] < m) m = arr[i]; c++; } return c ? m : NaN; };
    const cnt = (idx, arr) => idx.reduce((a, i) => a + (ok(arr[i]) ? 1 : 0), 0);
    const res = {};
    for (const [k, idx] of grupos) {
      const n = idx.length, cpp = cnt(idx, b.pp) / n, ctn = cnt(idx, b.tmin) / n, ctx = cnt(idx, b.tmax) / n, cq = cnt(idx, b.caudal) / n;
      const okpp = cpp >= cob, oktn = ctn >= cob, oktx = ctx >= cob, okq = cq >= cob;
      const r = { dias: n, cobertura_pp: cpp, cobertura_tmin: ctn, cobertura_tmax: ctx, cobertura_caudal: cq };
      r.pp_total = okpp ? sumaMin1(idx, b.pp) : NaN;
      r.pp_max_24h = okpp ? maxi(idx, b.pp) : NaN;
      for (const nn of p.ventanas_acumulado_dias) r[`acum_${nn}d`] = okpp ? maxi(idx, b.acum[nn]) : NaN;
      r.racha_lluvia = okpp ? maxi(idx, b.racha) : NaN;
      r.dias_lluvia = okpp ? sumaMin1(idx, b.lluvia) : NaN;
      r.dias_helada = oktn ? sumaMin1(idx, b.helada) : NaN;
      r.ciclos_hd = oktn && oktx ? sumaMin1(idx, b.ciclo) : NaN;
      r.tmin_min = oktn ? mini(idx, b.tmin) : NaN;
      r.tmax_max = oktx ? maxi(idx, b.tmax) : NaN;
      r.caudal_pico = okq ? maxi(idx, b.caudal) : NaN;
      r.dias_caudal_umbral = okq ? sumaMin1(idx, b.qsobre) : NaN;
      res[k] = r;
    }
    return res;
  };

  PAV.indicadoresMensuales = (b, cfg) => PAV.agrupar(b, b.t.map(clavMes), cfg);
  PAV.indicadoresTemporada = (b, cfg) => {
    const t = cfg.ventanas.temporada_lluvias;
    return PAV.agrupar(b, b.t.map((ms) => PAV.claveTemporada(ms, t.mes_inicio, t.mes_fin)), cfg);
  };
  PAV.indicadoresAnuales = function (b, cfg) {
    const a = PAV.agrupar(b, b.t.map((ms) => String(new Date(ms).getUTCFullYear())), cfg);
    const cl = cfg.clasificacion_climatica;
    for (const k in a) a[k].clima = !ok(a[k].pp_total) ? "s/d" : a[k].pp_total > cl.pp_anual_humedo_mm ? "húmedo" : "seco";
    return a;
  };

  PAV.ETIQUETAS = {
    pp_total: ["Precipitación total", "mm"], pp_max_24h: ["Precipitación máxima en 24 h", "mm"],
    acum_3d: ["Acumulada máx. 3 días", "mm"], acum_7d: ["Acumulada máx. 7 días", "mm"], acum_15d: ["Acumulada máx. 15 días", "mm"],
    acum_30d: ["Acumulada máx. 30 días", "mm"], racha_lluvia: ["Días consecutivos con lluvia (máx.)", "días"],
    dias_lluvia: ["Días con lluvia", "días"], dias_helada: ["Días con helada (Tmin ≤ 0 °C)", "días"],
    ciclos_hd: ["Ciclos hielo-deshielo", "ciclos"], tmin_min: ["Temperatura mínima absoluta", "°C"],
    tmax_max: ["Temperatura máxima absoluta", "°C"], caudal_pico: ["Caudal pico", "m³/s"],
    dias_caudal_umbral: ["Días con caudal sobre el umbral", "días"]
  };
  PAV.ok = ok;
})(typeof window !== "undefined" ? window : globalThis);
