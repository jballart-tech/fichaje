const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function obligatoria(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable ${nombre} en el archivo .env`);
  return valor;
}

function booleana(nombre, defecto) {
  const valor = process.env[nombre];
  if (valor === undefined || valor === '') return defecto;
  return ['1', 'true', 'si', 'sí', 'yes'].includes(valor.toLowerCase());
}

const config = {
  puerto: Number(process.env.PUERTO || 3100),
  // Número de proxies delante (IIS, Cloudflare...). Sirve para leer la IP real.
  proxies: Number(process.env.PROXIES || 1),
  jwtSecreto: obligatoria('JWT_SECRETO'),
  sesionDias: Number(process.env.SESION_DIAS || 90),
  adminClave: obligatoria('ADMIN_CLAVE'),
  // Márgenes para aceptar la hora que manda el móvil.
  margenFuturoSeg: Number(process.env.MARGEN_FUTURO_SEG || 120),
  maxAntiguedadHoras: Number(process.env.MAX_ANTIGUEDAD_HORAS || 72),
  bd: {
    server: obligatoria('BD_SERVIDOR'),
    port: process.env.BD_PUERTO ? Number(process.env.BD_PUERTO) : undefined,
    database: obligatoria('BD_NOMBRE'),
    user: obligatoria('BD_USUARIO'),
    password: obligatoria('BD_CLAVE'),
    options: {
      instanceName: process.env.BD_INSTANCIA || undefined,
      encrypt: booleana('BD_CIFRAR', true),
      trustServerCertificate: booleana('BD_CONFIAR_CERTIFICADO', true),
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  },
};

if (config.jwtSecreto.length < 32) throw new Error('JWT_SECRETO debe tener al menos 32 caracteres');
if (config.adminClave.length < 24) throw new Error('ADMIN_CLAVE debe tener al menos 24 caracteres');

module.exports = config;
