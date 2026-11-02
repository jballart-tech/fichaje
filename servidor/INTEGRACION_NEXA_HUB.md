# Integración con Nexa Hub

Nexa Hub puede gestionar el fichaje de dos maneras. Se pueden combinar.

1. Llamando a la API de administración (recomendado para altas y cambios: valida datos y cifra claves).
2. Leyendo directamente las tablas del esquema `fichaje` en SQL Server (cómodo para informes).

## 1. API de administración

Todas las rutas empiezan por `/api/admin` y piden la cabecera `X-Admin-Clave` con el valor de `ADMIN_CLAVE` del `.env`. Las respuestas son JSON. Los errores llegan como `{ "error": "texto" }`.

| Método | Ruta | Cuerpo o parámetros | Qué hace |
| --- | --- | --- | --- |
| GET | `/empresas` | | Lista de empresas |
| POST | `/empresas` | `codigo, nombre, cif?, gps_obligatorio?, obra_obligatoria?` | Alta de empresa |
| PATCH | `/empresas/:id` | `nombre?, cif?, activa?, gps_obligatorio?, obra_obligatoria?` | Cambios o baja (`activa: false`) |
| GET | `/empresas/:id/trabajadores` | | Personas de la empresa |
| POST | `/empresas/:id/trabajadores` | `usuario, nombre, clave, dni?` | Alta. La clave tiene 6 caracteres o más |
| PATCH | `/trabajadores/:id` | `nombre?, dni?, activo?, clave?` | Cambio de clave o baja. Cierra las sesiones abiertas en el móvil |
| GET | `/empresas/:id/obras` | | Obras de la empresa |
| POST | `/empresas/:id/obras` | `codigo, nombre, cliente?, direccion?` | Alta de obra |
| PATCH | `/obras/:id` | `nombre?, cliente?, direccion?, activa?` | Cambios o cierre (`activa: false`) |
| GET | `/fichajes` | `empresa_id, desde, hasta, trabajador_id?, obra_id?, solo_incidencias?` | Fichajes con nombres, GPS e incidencias |
| GET | `/horas` | `empresa_id, desde, hasta, trabajador_id?, obra_id?, zona?` | Minutos de trabajo y pausa por persona, día y obra |

Fechas en ISO 8601, por ejemplo `desde=2026-11-01T00:00:00+01:00`. Periodo máximo: 400 días.

Ejemplo:

```
curl -H "X-Admin-Clave: ..." "https://fichaje.tudominio.com/api/admin/horas?empresa_id=1&desde=2026-11-01T00:00:00%2B01:00&hasta=2026-12-01T00:00:00%2B01:00"
```

Respuesta de `/horas`:

```json
[{ "trabajador_id": 1, "trabajador": "Jordi Puig", "fecha": "2026-11-02", "obra_id": 1, "obra": "Nave Sud",
   "minutos_trabajo": 210, "minutos_pausa": 30, "abierta": false }]
```

`abierta: true` indica una jornada sin salida: cuenta hasta el momento de la consulta.

## 2. Tablas en SQL Server

| Tabla o vista | Contenido |
| --- | --- |
| `fichaje.empresas` | Empresas cliente |
| `fichaje.trabajadores` | Personas. `clave_hash` es bcrypt: nunca la muestres |
| `fichaje.obras` | Obras o clientes por empresa |
| `fichaje.fichajes` | Registro de jornada. No admite UPDATE ni DELETE |
| `fichaje.v_fichajes` | Vista con los nombres ya unidos, lista para informes |

Campos de `fichaje.fichajes` útiles para revisar:

- `hora_fichaje`: momento del fichaje. Si llegó al momento, es la hora del servidor. Si llegó tarde por falta de cobertura, es la del móvil corregida con la hora del servidor.
- `hora_recepcion`: cuándo llegó al servidor.
- `sin_conexion`: 1 si se fichó sin cobertura.
- `incidencia`: texto si hay algo que revisar. Ejemplos: «Sin ubicación», «No se puede fichar "salida" estando fuera de jornada», «Enviado con 80 h de retraso».

Ejemplo de informe mensual:

```sql
SELECT trabajador, obra, tipo, hora_fichaje, incidencia
FROM fichaje.v_fichajes
WHERE empresa_codigo = 'ELEC01'
  AND hora_fichaje >= '2026-11-01T00:00:00+01:00'
  AND hora_fichaje <  '2026-12-01T00:00:00+01:00'
ORDER BY trabajador, hora_fichaje;
```

## Pendiente para Nexa Hub

- Pantallas de empresas, personas y obras usando la API.
- Informe mensual por persona y obra, con exportación a Excel o PDF firmado.
- Bandeja de incidencias (`solo_incidencias=1`).
- Correcciones: irán en una tabla nueva `fichaje.correcciones` que guarda el cambio, el motivo y quién lo aprueba, sin tocar el fichaje original.
