const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const { sql, conectar, consulta } = require('../db');
const { firmarSesion, exigirTrabajador } = require('../auth');
const { TIPOS, estadoTras, transicionValida, motivoRechazo } = require('../jornada');
const v = require('../validar');

const rutas = express.Router();

// Hash ficticio para tardar lo mismo aunque el usuario no exista.
const HASH_FALSO = bcrypt.hashSync('clave-inexistente', 10);

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: req => `${rateLimit.ipKeyGenerator(req.ip)}|${String(req.body?.empresa || '').toUpperCase()}|${String(req.body?.usuario || '').toLowerCase()}`,
  message: { error: 'Demasiados intentos. Espera 15 minutos' },
});

rutas.get('/hora', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ ahora: new Date().toISOString() });
});

rutas.post('/login', limiteLogin, async (req, res) => {
  const empresa = v.codigo(req.body?.empresa, 'el código de empresa');
  const usuario = v.usuario(req.body?.usuario);
  const clave = v.texto(req.body?.clave, 'la clave', { max: 72, obligatorio: true });

  const [t] = await consulta(
    `SELECT t.id, t.empresa_id, t.clave_hash, t.version_sesion, t.activo, e.activa AS empresa_activa
     FROM fichaje.trabajadores t JOIN fichaje.empresas e ON e.id = t.empresa_id
     WHERE e.codigo = @empresa AND t.usuario = @usuario`,
    { empresa: [sql.NVarChar(20), empresa], usuario: [sql.NVarChar(50), usuario] },
  );
  const correcta = await bcrypt.compare(clave, t ? t.clave_hash : HASH_FALSO);
  if (!t || !correcta || !t.activo || !t.empresa_activa) {
    return res.status(401).json({ error: 'Empresa, usuario o clave incorrectos' });
  }
  await consulta('UPDATE fichaje.trabajadores SET ultimo_acceso = SYSDATETIMEOFFSET() WHERE id = @id', { id: [sql.Int, t.id] });
  res.json({ token: firmarSesion(t) });
});

rutas.use(exigirTrabajador);

async function fichajesRecientes(trabajadorId, horas) {
  return consulta(
    `SELECT f.uuid, f.tipo, f.hora_fichaje, f.sin_conexion, f.obra_id, o.nombre AS obra, f.incidencia
     FROM fichaje.fichajes f LEFT JOIN fichaje.obras o ON o.id = f.obra_id
     WHERE f.trabajador_id = @t AND f.hora_fichaje >= DATEADD(HOUR, -@horas, SYSDATETIMEOFFSET())
     ORDER BY f.hora_fichaje, f.id`,
    { t: [sql.Int, trabajadorId], horas: [sql.Int, horas] },
  );
}

// Estado del trabajador justo antes de un momento dado (o ahora).
async function estadoAntesDe(trabajadorId, hora, transaccion) {
  const previos = await consulta(
    `SELECT TOP 60 tipo, obra_id, hora_fichaje FROM fichaje.fichajes
     WHERE trabajador_id = @t AND hora_fichaje <= @hora
     ORDER BY hora_fichaje DESC, id DESC`,
    { t: [sql.Int, trabajadorId], hora: [sql.DateTimeOffset, hora] },
    transaccion,
  );
  previos.reverse();
  const ultimaSalida = previos.map(f => f.tipo).lastIndexOf('salida');
  return estadoTras(previos.slice(ultimaSalida + 1));
}

rutas.get('/yo', async (req, res) => {
  const t = req.trabajador;
  const [estado, obras, recientes] = await Promise.all([
    estadoAntesDe(t.id, new Date()),
    consulta(
      `SELECT id, codigo, nombre, cliente, direccion FROM fichaje.obras
       WHERE empresa_id = @e AND activa = 1 ORDER BY nombre`,
      { e: [sql.Int, t.empresa_id] },
    ),
    fichajesRecientes(t.id, 36),
  ]);
  res.set('Cache-Control', 'no-store').json({
    trabajador: { id: t.id, usuario: t.usuario, nombre: t.nombre },
    empresa: {
      codigo: t.empresa_codigo,
      nombre: t.empresa,
      gps_obligatorio: t.gps_obligatorio,
      obra_obligatoria: t.obra_obligatoria,
    },
    estado,
    obras,
    recientes,
    ahora: new Date().toISOString(),
  });
});

rutas.get('/fichajes', async (req, res) => {
  const dias = Math.min(Math.max(Number(req.query.dias) || 31, 1), 366);
  res.set('Cache-Control', 'no-store').json(await fichajesRecientes(req.trabajador.id, dias * 24));
});

rutas.post('/fichajes', async (req, res) => {
  const t = req.trabajador;
  const b = req.body || {};
  const id = v.uuid(b.uuid);
  const tipo = String(b.tipo || '');
  if (!TIPOS.includes(tipo)) throw new v.ErrorPeticion(400, 'Tipo de fichaje no válido');
  const horaCliente = v.fecha(b.hora, 'la hora') || new Date();
  const latitud = v.numeroEnRango(b.latitud, 'la latitud', -90, 90);
  const longitud = v.numeroEnRango(b.longitud, 'la longitud', -180, 180);
  const precision = v.numeroEnRango(b.precision, 'la precisión', 0, 100000);
  const nota = v.texto(b.nota, 'la nota', { max: 250 });
  let obraId = v.entero(b.obra_id, 'la obra');

  const incidencias = [];
  const ahora = new Date();
  const retrasoSeg = (ahora - horaCliente) / 1000;
  // Si llega al momento, manda la hora del servidor. Si llega tarde, la del móvil.
  const sinConexion = retrasoSeg > 60 || b.sin_conexion === true;
  let hora = sinConexion ? horaCliente : ahora;
  if (retrasoSeg < -config.margenFuturoSeg) {
    hora = ahora;
    incidencias.push('Hora del móvil adelantada; se usa la del servidor');
  }
  hora = new Date(Math.floor(hora.getTime() / 1000) * 1000); // La base de datos guarda segundos.
  if (retrasoSeg > config.maxAntiguedadHoras * 3600) {
    incidencias.push(`Enviado con ${Math.round(retrasoSeg / 3600)} h de retraso`);
  }
  if (latitud === null || longitud === null) {
    if (t.gps_obligatorio) incidencias.push('Sin ubicación');
  }

  const pool = await conectar();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // Bloquea al trabajador para que dos toques seguidos no crucen fichajes.
    await consulta('SELECT id FROM fichaje.trabajadores WITH (UPDLOCK, HOLDLOCK) WHERE id = @t', { t: [sql.Int, t.id] }, tx);

    const [repetido] = await consulta(
      'SELECT uuid, tipo, hora_fichaje, trabajador_id, incidencia FROM fichaje.fichajes WHERE uuid = @u',
      { u: [sql.UniqueIdentifier, id] },
      tx,
    );
    if (repetido) {
      await tx.commit();
      if (repetido.trabajador_id !== t.id) return res.status(409).json({ error: 'Fichaje duplicado' });
      return res.json({ ...repetido, repetido: true });
    }

    const estado = await estadoAntesDe(t.id, hora, tx);

    if (obraId) {
      const [obra] = await consulta(
        'SELECT id FROM fichaje.obras WHERE id = @o AND empresa_id = @e AND activa = 1',
        { o: [sql.Int, obraId], e: [sql.Int, t.empresa_id] },
        tx,
      );
      if (!obra) {
        if (!sinConexion) throw new v.ErrorPeticion(400, 'La obra no existe o está cerrada');
        incidencias.push('Obra no válida');
        obraId = null;
      }
    }
    if (tipo === 'entrada' || tipo === 'cambio_obra') {
      if (!obraId && (t.obra_obligatoria || tipo === 'cambio_obra')) {
        if (!sinConexion) throw new v.ErrorPeticion(400, 'Elige una obra');
        incidencias.push('Sin obra');
      }
    } else {
      obraId = estado.obra_id; // Pausa, reanudar y salida van a la obra en curso.
    }

    if (!transicionValida(estado.estado, tipo)) {
      if (!sinConexion) throw new v.ErrorPeticion(409, motivoRechazo(estado.estado, tipo));
      incidencias.push(motivoRechazo(estado.estado, tipo));
    }

    const incidencia = incidencias.length ? incidencias.join('. ').slice(0, 250) : null;
    await consulta(
      `INSERT INTO fichaje.fichajes
         (uuid, empresa_id, trabajador_id, obra_id, tipo, hora_fichaje, sin_conexion,
          latitud, longitud, precision_m, nota, incidencia, dispositivo, ip)
       VALUES (@u, @e, @t, @o, @tipo, @hora, @sc, @lat, @lon, @prec, @nota, @inc, @disp, @ip)`,
      {
        u: [sql.UniqueIdentifier, id],
        e: [sql.Int, t.empresa_id],
        t: [sql.Int, t.id],
        o: [sql.Int, obraId],
        tipo: [sql.NVarChar(12), tipo],
        hora: [sql.DateTimeOffset, hora],
        sc: [sql.Bit, sinConexion],
        lat: [sql.Decimal(9, 6), latitud],
        lon: [sql.Decimal(9, 6), longitud],
        prec: [sql.Int, precision === null ? null : Math.round(precision)],
        nota: [sql.NVarChar(250), nota],
        inc: [sql.NVarChar(250), incidencia],
        disp: [sql.NVarChar(250), (req.get('user-agent') || '').slice(0, 250)],
        ip: [sql.NVarChar(45), req.ip],
      },
      tx,
    );
    await tx.commit();
    res.status(201).json({ uuid: id, tipo, hora_fichaje: hora.toISOString(), obra_id: obraId, sin_conexion: sinConexion, incidencia });
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
});

module.exports = rutas;
