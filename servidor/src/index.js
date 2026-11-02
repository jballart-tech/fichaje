const path = require('path');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');
const { conectar, cerrar } = require('./db');
const { ErrorPeticion } = require('./validar');

const app = express();
app.set('trust proxy', config.proxies);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
    },
  },
  // Permite el GPS en la propia app.
  permissionsPolicy: false,
}));
app.use((req, res, next) => {
  res.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  next();
});

app.use('/api', express.json({ limit: '20kb' }));
app.use('/api/admin', require('./rutas/admin'));
app.use('/api', require('./rutas/trabajador'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// La app del móvil.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, ruta) {
    if (/(index\.html|sw\.js|manifest\.webmanifest)$/.test(ruta)) res.set('Cache-Control', 'no-cache');
  },
}));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof ErrorPeticion) return res.status(err.estado).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Datos mal formados' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Datos demasiado grandes' });
  console.error(new Date().toISOString(), req.method, req.originalUrl, err);
  res.status(500).json({ error: 'Error del servidor. Inténtalo de nuevo' });
});

async function arrancar() {
  await conectar();
  const servidor = app.listen(config.puerto, () => {
    console.log(`Fichaje Nexa Hub escuchando en el puerto ${config.puerto}`);
  });
  const parar = () => servidor.close(() => cerrar().finally(() => process.exit(0)));
  process.on('SIGINT', parar);
  process.on('SIGTERM', parar);
}

if (require.main === module) {
  arrancar().catch(err => {
    console.error('No se pudo arrancar:', err.message);
    process.exit(1);
  });
}

module.exports = app;
