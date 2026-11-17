# Ejemplos de documentos para cargar en la web

| Archivo | Para qué sirve | ¿Datos reales? | Dónde se carga en la web |
|---|---|---|---|
| `1_senamhi_diario_EXTRACTO_REAL_Lampa_2011-2013.txt` | Formato de los datos diarios (`año mes día pp tmax tmin`, faltante `-99.9`) | **Sí**: extracto de su archivo `ESTACION LAMPA.txt` (2011-2013, 1 096 días, con 92 faltantes de Tmax) | Pestaña 1, «Archivo de datos diarios» |
| `2_caudal_DEMO_formato.csv` | Formato de la serie de caudal (`fecha,caudal` en m³/s) | **No**: sintético (DEMO), con una crecida inventada en febrero de 2013 | Pestaña 1, «Serie de caudal» |
| `3_fallas_observadas_DEMO_formato.csv` | Formato de las fallas observadas (`periodo` + una columna 0/1 por falla) | **No**: aleatorio (DEMO), no tiene significado | Pestaña 5, «Validación» |
| `4_ficha_via_EJEMPLO.txt` | Lista de datos de la vía y dónde conseguirlos | **No**: valores de ejemplo inventados | Se escribe en la pestaña 2 |

**Mínimo para empezar:** el archivo 1 (con sus propios datos del SENAMHI) y, en la ficha, la sección A.

Los archivos 2 y 3 son opcionales. No los use como resultados: solo muestran el formato.
