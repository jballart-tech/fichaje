const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { sql, consulta } = require('./db');

function firmarSesion(trabajador) {
  return jwt.sign(
    { sub: trabajador.id, emp: trabajador.empresa_id, v: trabajador.version_sesion },
    config.jwtSecreto,
    { expiresIn: `${config.sesionDias}d`, algorithm: 'HS256' },
  );
}

// Comprueba la sesión del trabajador y que siga activo con la misma versión de clave.
async function exigirTrabajador(req, res, next) {
  const cabecera = req.get('authorization') || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Inicia sesión' });

  let datos;
  try {
    datos = jwt.verify(token, config.jwtSecreto, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'La sesión ha caducado. Vuelve a entrar' });
  }

  const [t] = await consulta(
    `SELECT t.id, t.empresa_id, t.usuario, t.nombre, t.version_sesion, t.activo,
            e.codigo AS empresa_codigo, e.nombre AS empresa, e.activa AS empresa_activa,
            e.gps_obligatorio, e.obra_obligatoria
     FROM fichaje.trabajadores t JOIN fichaje.empresas e ON e.id = t.empresa_id
     WHERE t.id = @id`,
    { id: [sql.Int, datos.sub] },
  );
  if (!t || !t.activo || !t.empresa_activa || t.version_sesion !== datos.v) {
    return res.status(401).json({ error: 'Tu acceso ya no es válido. Habla con tu empresa' });
  }
  req.trabajador = t;
  next();
}

// Acceso de Nexa Hub a la administración con una clave compartida.
function exigirAdmin(req, res, next) {
  const clave = req.get('x-admin-clave') || '';
  const a = Buffer.from(clave);
  const b = Buffer.from(config.adminClave);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Clave de administración incorrecta' });
  }
  next();
}

module.exports = { firmarSesion, exigirTrabajador, exigirAdmin };
