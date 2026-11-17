# Riesgo de fallas en pavimento flexible (sitio web)

Sitio estático (HTML + JavaScript, sin servidor) que estima el riesgo de **piel de cocodrilo, fisuras longitudinales y transversales, baches, ahuellamiento y desprendimiento de agregados** a partir de datos diarios del SENAMHI (`año mes día pp tmax tmin`, faltante `-99.9`) y de la estructura del pavimento (espesores y CBR de carpeta, base, subbase, mejoramiento y subrasante). Indica además la **capa crítica** donde se origina cada falla.

Los archivos se procesan en el navegador; no se suben a ningún servidor.

## Uso local
Abra `index.html` en el navegador (los gráficos y la lectura de Excel cargan librerías desde cdnjs; el TXT funciona sin ellas).

## Modelo
1. Indicadores por mes y temporada (precipitación máxima en 24 h, acumulados de 3/7/15/30 días, rachas, heladas, ciclos hielo-deshielo, caudal).
2. Amenazas climáticas por reglas y umbrales (editables en la pestaña *Umbrales*).
3. Capacidad estructural: SN provisto (AASHTO-93) frente a SN requerido con CBR efectivo reducido por la humedad del mes.
4. Mecanismos de falla → capa más vulnerable (por espesor y CBR) → nivel final (Bajo/Medio/Alto), con explicación y recomendación.

5. Tipo de mantenimiento por año (diario, rutinario, periódico, rehabilitación, emergencia), con la mediana de los años del periodo elegido.

## Pruebas
Abra `tests.html` en el navegador: ejecuta 38 pruebas del motor (lectura, indicadores, reglas, SN, capa crítica, mantenimiento, validación).

## Advertencias
- Los umbrales, coeficientes de capa, ESAL por tipo de vía y la pérdida de soporte por saturación son **PROVISIONALES** (sin respaldo directo en la literatura revisada); están marcados como tales.
- Las fórmulas AASHTO-93 y la correlación CBR→Mr son estándares de ingeniería **no verificados contra la literatura de este proyecto**: verifíquelas antes de citarlas.
- Es un modelo de reglas no calibrado con fallas observadas; no sustituye un diseño ni ensayos de campo.
