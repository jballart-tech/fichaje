# Fichaje Nexa Hub

App de fichaje para iPhone y Android con envío a Nexa Hub y registro en SQL Server.

- Multiempresa: cada empresa tiene sus trabajadores y sus obras.
- Entrada, pausa, reanudar, cambio de obra y salida.
- Ubicación GPS en cada fichaje, sin seguimiento continuo.
- Funciona sin cobertura: guarda el fichaje en el móvil con la hora del momento y lo envía al volver la conexión.
- Registro inalterable: un trigger de SQL Server impide modificar o borrar fichajes.
- Avisos para revisar desde Nexa Hub: sin ubicación, secuencia incorrecta, envío con mucho retraso.

## Piezas

| Carpeta | Qué es |
| --- | --- |
| `src/` | API en Node.js (Express) que habla con SQL Server |
| `public/` | La app del móvil (PWA). La sirve la propia API |
| `sql/` | Scripts de base de datos |
| `herramientas/admin.js` | Consola para instalar la base de datos y dar de alta empresas, personas y obras |
| `INTEGRACION_NEXA_HUB.md` | Rutas de administración y tablas para las pantallas de Nexa Hub |

## Instalar en el servidor (SRV01, Windows)

1. Instala Node.js 20 LTS o superior desde nodejs.org.
2. Copia la carpeta `servidor` a `C:\NexaHub\fichaje` y abre una consola ahí:
   ```
   npm install --omit=dev
   copy .env.example .env
   node herramientas\admin.js generar-secretos
   ```
3. Pega los dos secretos en `.env` y rellena los datos de SQL Server.
4. En SSMS, ejecuta `sql\002_usuario_app.sql` (cambia la clave y el nombre de la base de datos).
5. Crea las tablas: `npm run instalar-bd`.
6. Prueba: `npm start` y abre `http://localhost:3100` en el servidor.

### Dejarlo como servicio de Windows

Con NSSM (nssm.cc):

```
nssm install FichajeNexaHub "C:\Program Files\nodejs\node.exe" "C:\NexaHub\fichaje\src\index.js"
nssm set FichajeNexaHub AppDirectory C:\NexaHub\fichaje
nssm set FichajeNexaHub AppStdout C:\NexaHub\fichaje\logs\salida.log
nssm set FichajeNexaHub AppStderr C:\NexaHub\fichaje\logs\errores.log
nssm start FichajeNexaHub
```

### Publicarlo con HTTPS

La app necesita HTTPS para el GPS y para instalarse en el móvil. Dos opciones:

- Subdominio nuevo, por ejemplo `fichaje.tudominio.com`, con IIS + URL Rewrite + ARR como proxy inverso hacia `http://localhost:3100`. Deja `PROXIES=1` en `.env`.
- Ruta dentro del dominio actual de Nexa Hub. La app está pensada para ir en la raíz de un dominio o subdominio, así que es más sencilla la primera opción.

No abras el puerto 3100 al exterior. Solo IIS debe llegar a él.

## Dar de alta datos (mientras no estén las pantallas de Nexa Hub)

```
node herramientas\admin.js crear-empresa --codigo ELEC01 --nombre "Instalaciones Ejemplo SL" --cif B12345678
node herramientas\admin.js crear-trabajador --empresa ELEC01 --usuario jordi --nombre "Jordi Puig" --clave 123456
node herramientas\admin.js crear-obra --empresa ELEC01 --codigo OB-001 --nombre "Nave Polígono Sud" --cliente "Cliente SA"
node herramientas\admin.js listar --empresa ELEC01
node herramientas\admin.js cambiar-clave --empresa ELEC01 --usuario jordi --clave nueva123
node herramientas\admin.js baja-trabajador --empresa ELEC01 --usuario jordi
```

Opciones de empresa: `--gps no` para no avisar de fichajes sin ubicación y `--obra-obligatoria si` para exigir obra en la entrada.

## Instalar la app en el móvil

1. Abre la dirección HTTPS en Safari (iPhone) o Chrome (Android).
2. iPhone: Compartir, «Añadir a pantalla de inicio». Android: menú, «Instalar app».
3. Entra con código de empresa, usuario y clave.

En iPhone, los fichajes sin conexión se envían cuando la persona vuelve a abrir la app con cobertura. Hasta entonces quedan guardados en el móvil.

## Pruebas

```
npm test                       # reglas de jornada
PRUEBA_BD=1 npm test           # además, prueba completa contra el SQL Server del .env (usa una base de datos de pruebas)
```

## Publicar cambios de la app

Sube la constante `VERSION` de `public/sw.js` para que los móviles descarguen la versión nueva.
