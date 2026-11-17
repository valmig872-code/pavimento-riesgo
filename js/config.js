/* Configuración por defecto del modelo (editable en la pestaña "Umbrales" de la web).
 * Cada condición lleva `estado`: LITERATURA | FUENTE_OFICIAL | PROVISIONAL.
 * PROVISIONAL = valor elegido por el autor, SIN respaldo directo en la literatura revisada.
 * Todo valor de este archivo es PROVISIONAL salvo los marcados en `fuentes`.
 */
(function (root) {
  const PAV = (root.PAV = root.PAV || {});
  const P = "PROVISIONAL";
  const c = (indicador, medio, alto, extra) => Object.assign({ indicador, medio, alto, estado: P, fuente: "" }, extra || {});

  PAV.CONFIG_DEFECTO = {
    meta: { version: "0.2", nota: "Modelo de reglas y umbrales; sin modelación hidrológica-hidráulica." },

    indicadores: {
      dia_lluvia_mm: 1.0, dia_lluvia_estado: "LITERATURA", dia_lluvia_fuente: "han2020",
      helada_tmin_c: 0.0, deshielo_tmax_c: 0.0,
      ventanas_acumulado_dias: [3, 7, 15, 30],
      cobertura_minima: 0.8,
      caudal_umbral_m3s: 175, caudal_umbral_estado: "FUENTE_OFICIAL", caudal_umbral_fuente: "senamhi_caudal"
    },
    ventanas: { temporada_lluvias: { mes_inicio: 12, mes_fin: 3 } },

    clasificacion_climatica: { pp_anual_humedo_mm: 508, indice_congelamiento_c_dia: 83.3, fuente: "dong2021" },

    /* ---- Amenazas climáticas (nivel 0/1/2 por mes). Y lógico dentro de una regla; máximo entre reglas. ---- */
    amenazas: {
      humedad_prolongada: {
        nombre: "Humedad prolongada (saturación de capas)",
        reglas: [
          { id: "H1", descripcion: "Acumulado de 30 días", condiciones: [c("acum_30d", 210, 285)] },
          { id: "H2", descripcion: "Muchos días con lluvia y acumulado alto", condiciones: [c("dias_lluvia", 20, 25), c("acum_30d", 150, 210)] },
          { id: "H3", descripcion: "Racha larga de lluvia con acumulado alto", condiciones: [c("racha_lluvia", 8, 14), c("acum_30d", 210, 285)] }
        ]
      },
      lluvia_intensa: {
        nombre: "Lluvia intensa / infiltración rápida",
        reglas: [
          { id: "L1", descripcion: "Lluvia acumulada en 3 días (ventana de influencia, Han 2020)", condiciones: [c("acum_3d", 50, 72, { fuente: "ventana de 3 días: han2020 (valores: provisionales)" })] },
          { id: "L2", descripcion: "Lluvia máxima en 24 h", condiciones: [c("pp_max_24h", 30, 40)] },
          { id: "L3", descripcion: "Acumulado de 7 días", condiciones: [c("acum_7d", 80, 115)] }
        ]
      },
      hielo_deshielo_humedo: {
        nombre: "Ciclos hielo-deshielo con agua disponible",
        reglas: [
          { id: "G1", descripcion: "Ciclos hielo-deshielo con acumulado de 30 días", condiciones: [c("ciclos_hd", 8, 15, { fuente: "contexto: cao2022 (descriptivo)" }), c("acum_30d", 20, 50)] },
          { id: "G2", descripcion: "Ciclos con humedad previa (15 días)", condiciones: [c("acum_15d", 60, 100), c("ciclos_hd", 8, 15)] },
          { id: "G3", descripcion: "Ciclos con días de lluvia frecuentes", condiciones: [c("ciclos_hd", 8, 15), c("dias_lluvia", 10, 18, { fuente: "cualitativo: peng2025" })] }
        ]
      },
      frio_extremo: {
        nombre: "Frío extremo (contracción térmica)",
        reglas: [{ id: "F1", descripcion: "Temperatura mínima absoluta del periodo", condiciones: [c("tmin_min", -8, -12, { operador: "<=" })] }]
      },
      calor: {
        nombre: "Calor extremo (ablandamiento de la mezcla)",
        reglas: [{ id: "C1", descripcion: "Temperatura máxima absoluta del periodo", condiciones: [c("tmax_max", 26, 32)] }]
      },
      crecida: {
        nombre: "Crecida (días con caudal sobre el umbral rojo)",
        reglas: [{ id: "Q1", descripcion: "Días con caudal sobre el umbral", condiciones: [c("dias_caudal_umbral", 1, 3, { fuente: "umbral de caudal: senamhi_caudal" })] }]
      }
    },

    /* ---- Estructura del pavimento ---- */
    estructura: {
      /* Coeficientes estructurales (AASHTO-93, valores típicos; interpolados por CBR). PROVISIONAL: verificar. */
      coef_carpeta: 0.44,
      coef_base_por_cbr: [[20, 0.10], [40, 0.12], [60, 0.13], [80, 0.14]],
      coef_subbase_por_cbr: [[10, 0.07], [20, 0.09], [30, 0.11], [40, 0.12]],
      coef_base_defecto: 0.14, coef_subbase_defecto: 0.11,
      drenaje_m: { bueno: 1.0, regular: 0.9, deficiente: 0.75 },
      /* Módulo resiliente del suelo: Mr(psi) = coef * CBR^exp  (correlación tipo MEPDG/TRRL) */
      mr: { coef_psi: 2555, exponente: 0.64, cbr_validez: [5, 10] },
      /* Pérdida de soporte (CBR efectivo) por saturación */
      perdida_cbr_saturacion: { max: 0.4, factor_si_cbr_saturado: 0.25, factor_drenaje: { bueno: 0.5, regular: 1.0, deficiente: 1.3 } },
      espesor_mejoramiento_referencia_cm: 60,
      /* Nivel estructural según SN_provisto / SN_requerido (nivel 2 si R < alto; 1 si R < medio) */
      razon_sn: { medio: 1.0, alto: 0.85, estado: P },
      /* Vulnerabilidad de cada capa (nivel por factor; la capa toma el máximo) */
      vulnerabilidad: {
        carpeta:      [{ factor: "espesor_cm", operador: "<=", medio: 7.5, alto: 5,  estado: P }],
        base:         [{ factor: "cbr", operador: "<", medio: 80, alto: 50, estado: P, fuente: "referencia usual en normas peruanas (CBR de base ~80 %); verificar" },
                       { factor: "espesor_cm", operador: "<=", medio: 20, alto: 15, estado: P }],
        subbase:      [{ factor: "cbr", operador: "<", medio: 40, alto: 25, estado: P, fuente: "referencia usual (CBR de subbase ~40 %); verificar" },
                       { factor: "espesor_cm", operador: "<=", medio: 20, alto: 15, estado: P }],
        mejoramiento: [{ factor: "cbr", operador: "<=", medio: 20, alto: 10, estado: P },
                       { factor: "espesor_cm", operador: "<=", medio: 30, alto: 15, estado: P }],
        subrasante:   [{ factor: "cbr", operador: "<=", medio: 10, alto: 5, estado: P }]
      },
      /* Una subrasante poco cubierta por capas granulares es más vulnerable */
      cobertura_granular_cm: { operador: "<=", medio: 30, alto: 15, estado: P },
      /* Susceptibilidad a helada del suelo de subrasante (0 baja, 1 media, 2 alta). PROVISIONAL */
      susceptibilidad_helada: { grava: 0, arena: 0, arena_limosa: 1, arcilla: 1, limo: 2, arcilla_expansiva: 2 }
    },

    /* ---- Tipos de vía: parámetros de diseño por defecto (todos PROVISIONALES) ---- */
    tipos_via: {
      carretera: { nombre: "Carretera nacional / regional", esal: { bajo: 1e6, medio: 5e6, alto: 2e7 }, pt: 2.5, ZR: -1.282, S0: 0.45 },
      arterial:  { nombre: "Avenida / vía urbana arterial", esal: { bajo: 5e5, medio: 3e6, alto: 1e7 }, pt: 2.5, ZR: -1.037, S0: 0.45 },
      local:     { nombre: "Vía local / urbana secundaria", esal: { bajo: 1e5, medio: 5e5, alto: 2e6 }, pt: 2.0, ZR: -0.841, S0: 0.45 },
      rural:     { nombre: "Camino rural / vecinal pavimentado", esal: { bajo: 5e4, medio: 2e5, alto: 1e6 }, pt: 2.0, ZR: -0.674, S0: 0.45 }
    },
    psi_inicial: 4.2,

    /* ---- Modificadores por variables de la vía (PROVISIONALES) ---- */
    modificadores: {
      edad_anios: { descripcion: "Edad de la carpeta (años)", estado: P,
        aplica_a: ["piel_cocodrilo", "fisura_longitudinal", "fisura_transversal", "baches", "ahuellamiento", "desprendimiento"],
        rangos: [{ hasta: 2, delta: -1 }, { hasta: 8, delta: 0 }, { hasta: 200, delta: 1 }] },
      drenaje: { descripcion: "Estado del drenaje superficial", estado: P,
        aplica_a: ["baches", "desprendimiento", "fisura_longitudinal"],
        valores: { bueno: -1, regular: 0, deficiente: 1 } },
      pendiente_pct: { descripcion: "Pendiente longitudinal (%); < 1 % favorece el encharcamiento", estado: P,
        aplica_a: ["baches", "piel_cocodrilo", "ahuellamiento"],
        rangos: [{ hasta: 1, delta: 1 }, { hasta: 100, delta: 0 }] },
      trafico: { descripcion: "Nivel de tráfico pesado (el tráfico ya entra al SN de piel de cocodrilo y ahuellamiento)", estado: P,
        aplica_a: ["baches", "desprendimiento", "fisura_longitudinal"],
        valores: { bajo: -1, medio: 0, alto: 1 } }
    },

    /* ---- Fallas: mecanismos (amenaza -> capas candidatas) y recomendaciones ---- */
    fallas: {
      piel_cocodrilo: {
        nombre: "Piel de cocodrilo (fatiga)",
        mecanismos: [
          { amenaza: "humedad_prolongada", capas: ["subrasante", "mejoramiento", "subbase", "base"],
            texto: "La saturación reduce el soporte de {capa}; la carpeta se flexiona en exceso y se fatiga desde su fondo." },
          { amenaza: "crecida", capas: ["subrasante", "mejoramiento", "subbase", "base"],
            texto: "Inundación/crecida satura {capa}, con pérdida de soporte y fatiga de la carpeta." },
          { amenaza: "estructural", capas: ["carpeta", "base", "subbase", "subrasante"],
            texto: "Capacidad estructural insuficiente para el tráfico (SN provisto < SN requerido); la capa más débil es {capa}." }
        ],
        recomendaciones: {
          Bajo: "Monitoreo visual anual de huellas de rodadura.",
          Medio: "Verificar drenaje de base y bermas; evitar acumulación de agua en bordes; programar deflectometría.",
          Alto: "Evaluar capacidad estructural (deflectometría) tras la temporada; restringir cargas pesadas con base saturada; reparar drenaje; considerar refuerzo."
        }
      },
      ahuellamiento: {
        nombre: "Ahuellamiento",
        mecanismos: [
          { amenaza: "calor", capas: ["carpeta"], texto: "El calor ablanda la mezcla y se deforma la propia carpeta." },
          { amenaza: "humedad_prolongada", capas: ["subrasante", "mejoramiento", "subbase", "base"],
            texto: "Capas no ligadas saturadas (principalmente {capa}) acumulan deformación permanente bajo el tráfico." },
          { amenaza: "estructural", capas: ["subrasante", "mejoramiento", "subbase", "base", "carpeta"],
            texto: "Capacidad estructural insuficiente: deformación permanente en {capa}." }
        ],
        recomendaciones: {
          Bajo: "Medición periódica de profundidad de huella.",
          Medio: "Medir profundidad de huella tras la temporada de lluvias; controlar sobrecarga de vehículos pesados.",
          Alto: "Medición inmediata de ahuellamiento; considerar fresado y reposición localizada, y revisar el soporte de las capas inferiores."
        }
      },
      fisura_longitudinal: {
        nombre: "Fisura longitudinal",
        mecanismos: [
          { amenaza: "hielo_deshielo_humedo", capas: ["subrasante", "mejoramiento", "subbase", "base"],
            texto: "Congelamiento y deshielo con agua en {capa} (levantamiento diferencial/asentamiento) fisuran la carpeta a lo largo de la vía." },
          { amenaza: "humedad_prolongada", capas: ["base", "subbase", "subrasante", "mejoramiento"],
            texto: "Humedad en bordes y {capa} produce asentamiento diferencial y fisuras longitudinales (borde, junta de construcción, huella)." }
        ],
        recomendaciones: {
          Bajo: "Sin acción especial; monitoreo anual.",
          Medio: "Sellar fisuras con material elastomérico; revisar bermas y cunetas.",
          Alto: "Sellado inmediato; investigar soporte lateral y drenaje (calicatas/DCP) y corregir antes de que aparezca piel de cocodrilo."
        }
      },
      fisura_transversal: {
        nombre: "Fisura transversal (térmica)",
        mecanismos: [
          { amenaza: "frio_extremo", capas: ["carpeta"], texto: "La contracción térmica de la carpeta por frío extremo genera fisuras transversales." },
          { amenaza: "hielo_deshielo_humedo", capas: ["carpeta"], texto: "La fatiga térmica por ciclos hielo-deshielo agrieta la carpeta." }
        ],
        recomendaciones: {
          Bajo: "Sin acción especial; monitoreo anual.",
          Medio: "Sellado de fisuras con material elastomérico antes de la temporada de heladas.",
          Alto: "Sellado inmediato de fisuras abiertas; evaluar riego de sello o ligante modificado en la próxima intervención."
        }
      },
      baches: {
        nombre: "Baches",
        mecanismos: [
          { amenaza: "lluvia_intensa", capas: ["carpeta", "base"], texto: "El agua se infiltra por la carpeta, pierde ligante y arrastra finos de {capa}." },
          { amenaza: "hielo_deshielo_humedo", capas: ["carpeta", "base"], texto: "Agua que se congela y deshiela desintegra {capa}." },
          { amenaza: "crecida", capas: ["base", "subbase", "subrasante", "carpeta"], texto: "Inundación del tramo debilita {capa}." }
        ],
        recomendaciones: {
          Bajo: "Inspección rutinaria programada; mantener limpias cunetas y alcantarillas.",
          Medio: "Inspección visual tras cada evento de lluvia; sellado preventivo de fisuras y limpieza de drenaje.",
          Alto: "Inspección inmediata después de lluvias; bacheo preventivo en zonas con fisuras o piel de cocodrilo incipiente; revisar drenaje y cunetas."
        }
      },
      desprendimiento: {
        nombre: "Desprendimiento de agregados",
        mecanismos: [
          { amenaza: "lluvia_intensa", capas: ["carpeta"], texto: "La lluvia intensa arrastra el ligante y suelta agregados de la carpeta." },
          { amenaza: "hielo_deshielo_humedo", capas: ["carpeta"], texto: "Humedad y ciclos hielo-deshielo reducen la adherencia ligante-agregado." }
        ],
        recomendaciones: {
          Bajo: "Inspección visual rutinaria de textura superficial.",
          Medio: "Aplicar riego de sello o tratamiento superficial preventivo en zonas con textura abierta.",
          Alto: "Sello/lechada asfáltica preventiva antes de la próxima temporada de lluvias; barrido de agregado suelto."
        }
      }
    },
    recomendaciones_estado: "PROVISIONAL (criterio técnico general, no proviene de la literatura revisada)",

    /* ---- Tipo de mantenimiento (se decide por año con los niveles de riesgo mensuales) ---- */
    mantenimiento: {
      estado: "PROVISIONAL",
      nota: "Tipos según la práctica habitual en Perú (rutinario, periódico, emergencia) más rehabilitación/refuerzo como intervención mayor. Los criterios de decisión son PROVISIONALES; verifique las definiciones y frecuencias en el manual de mantenimiento vial del MTC.",
      fallas_superficiales: ["fisura_longitudinal", "fisura_transversal", "desprendimiento", "baches"],
      fallas_estructurales: ["piel_cocodrilo", "ahuellamiento"],
      diaria: { amenazas: ["lluvia_intensa", "crecida", "hielo_deshielo_humedo"], nivel_min: 1, estado: "PROVISIONAL", fuente: "han2020 (frecuencia de patrullaje); los criterios de activación son provisionales" },
      emergencia: { amenaza: "crecida", nivel: 2, estado: "PROVISIONAL" },
      rehabilitacion: { meses_alto_estructural_por_anio: 3, usar_razon_sn_alto: true, estado: "PROVISIONAL" },
      periodico: { meses_alto_superficial_por_anio: 2, meses_medio_o_mas_por_anio: 6, estado: "PROVISIONAL" },
      rutinario: { meses_medio_o_mas_por_anio: 1, estado: "PROVISIONAL" },
      tipos: {
        diario: { nombre: "Vigilancia / atención diaria", frecuencia: "Durante los meses con lluvia intensa, crecida o ciclos de hielo-deshielo con agua: patrullaje 2 veces al día durante la lluvia y los 3 días siguientes; cada 3 días el resto del tiempo (Han, 2020, p. 1, estudio de baches en Corea).",
          actividades: "Patrullaje y registro de baches, limpieza de cunetas y alcantarillas, señalización y bacheo de urgencia." },
        rutinario: { nombre: "Mantenimiento rutinario", frecuencia: "Todo el año (actividades continuas, con ciclo anual).",
          actividades: "Limpieza de drenaje y bermas, sellado de fisuras, bacheo superficial, desbroce y señalización." },
        periodico: { nombre: "Mantenimiento periódico", frecuencia: "Cada varios años (típicamente 3 a 6; criterio provisional).",
          actividades: "Riego de sello, lechada/micropavimento, tratamiento superficial o recapeo de la carpeta; reposición de capa superficial." },
        rehabilitacion: { nombre: "Rehabilitación / refuerzo estructural", frecuencia: "Intervención mayor, fuera del ciclo de mantenimiento; programar antes de la próxima temporada de lluvias.",
          actividades: "Ensayos (deflectometría, calicatas, DCP), refuerzo con sobrecarpeta estructural, reposición o estabilización de base/subbase, mejoramiento de subrasante y drenaje subterráneo." },
        emergencia: { nombre: "Mantenimiento de emergencia", frecuencia: "Tras la crecida o el evento (inmediato).",
          actividades: "Restablecer la transitabilidad, reparar el drenaje y tramos erosionados, bacheo de urgencia." }
      }
    },

    intervencion_por_capa: {
      carpeta: "Sellado de fisuras, riego de sello, micropavimento o recapeo según el nivel.",
      base: "Reforzar o estabilizar la base, mejorar el drenaje de la plataforma y verificar la granulometría.",
      subbase: "Reforzar la subbase, controlar la humedad y verificar el CBR de la capa.",
      mejoramiento: "Verificar espesor y compactación del mejoramiento; considerar geosintéticos.",
      subrasante: "Mejorar o estabilizar la subrasante, instalar drenaje subterráneo o subdrenes y controlar la humedad."
    },

    fuentes: {
      han2020: { cita: "Han, D. (2020). Road Patrol Strategy based on Pothole Occurrence Characteristics considering Rainfall Effects. J. Korea Academia-Industrial Cooperation Society, 21(12), 603-611.", paginas: "1, 8",
        respalda: "VERIFICADO en el PDF: la probabilidad de bache se multiplica por 2.4 con lluvia, el efecto dura 3 días tras la lluvia, +0.46 % por mm y sensibilidad a lluvias de ~1 mm; patrullaje óptimo cada 3 días sin influencia de lluvia y ≥ 2 veces al día en la zona de influencia (p. 1; Tabla 8, p. 8). Respalda dia_lluvia_mm=1, la ventana de 3 días y la frecuencia de vigilancia diaria; NO respalda los valores numéricos de acum_3d." },
      dong2021: { cita: "Dong, Q., Chen, X., Dong, S., Zhang, J. (2021). Classification of pavement climatic regions through unsupervised and supervised machine learnings. J. Infrastructure Preservation and Resilience.", paginas: "3",
        respalda: "Umbrales LTPP: húmedo > 508 mm/año; con congelamiento > 83.3 °C-día." },
      cao2022: { cita: "Cao, H., Chen, T., Zhu, H., Ren, H. (2022). Influence of Frequent Freeze-Thaw Cycles on Performance of Asphalt Pavement in High-Cold and High-Altitude Areas. Coatings, 12(6), 752.", paginas: "12",
        respalda: "Contexto: >120 ciclos hielo-deshielo/año en zonas altas y frías. Descriptivo, no umbral de falla." },
      peng2025: { cita: "Peng, L., Gao, L., Hong, F., Sun, J. (2025). Evaluating Pavement Deterioration Rates Due to Flooding Events Using Explainable AI. Buildings, 15(9), 1452.", paginas: "3",
        respalda: "Cualitativo: infiltración de humedad y mal drenaje favorecen el desprendimiento." },
      senamhi_caudal: { cita: "SENAMHI / IDESEP. Tabla 'Caudales del SENAMHI': Río Lampa, estación Puente Lampa, umbral rojo 175 m3/s.", paginas: "1",
        respalda: "Umbral rojo oficial de caudal (pertinencia al tramo por confirmar). Es el valor por defecto; cámbielo si su vía está en otra cuenca." },
      aashto93_pavementinteractive: { cita: "AASHTO (1993). Guide for Design of Pavement Structures. Ecuación de diseño de pavimento flexible tal como la reproduce Pavement Interactive, '1993 AASHTO Flexible Pavement Structural Design' (https://pavementinteractive.org/reference-desk/design/structural-design/1993-aashto-flexible-pavement-structural-design/).", paginas: "-",
        respalda: "VERIFICADO (fuente secundaria, no la Guía original): constantes de la ecuación (9.36, 0.20, 0.40, 1094, 5.19, 2.32, 8.07, ΔPSI/(4.2-1.5)), SN = a1D1 + a2D2m2 + a3D3m3, valores de ZR (75 % = -0.674; 80 % = -0.841; 85 % = -1.037; 90 % = -1.282) y So típico 0.40-0.50. NO verificado: coeficientes de capa (a1 = 0.44, a2, a3), que cada agencia define en su manual." },
      trrl_mr: { cita: "Correlación Mr(psi) = 2555 * CBR^0.64 (TRRL, Lister 1987), según una fuente secundaria consultada.", paginas: "-",
        respalda: "Es válida para CBR saturado entre 5 y 10 %. Fuera de ese rango es una extrapolación (el sitio lo advierte). Verificar contra la fuente primaria." },
      pav_provisional: { cita: "Parámetros propios del modelo.", paginas: "-",
        respalda: "PROVISIONALES: coeficientes de capa, ESAL por tipo de vía, pérdida de CBR por saturación, umbrales de vulnerabilidad por capa y criterios de tipo de mantenimiento." }
    }
  };
})(typeof window !== "undefined" ? window : globalThis);

