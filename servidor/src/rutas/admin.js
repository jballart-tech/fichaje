// Administración para Nexa Hub. Todas las rutas piden la cabecera X-Admin-Clave.
const express = require('express');
const bcrypt = require('bcryptjs');
const { sql, consulta } = require('../db');
const { exigirAdmin } = require('../auth');
const { resumenHoras } = require('../jornada');
const v = require('../validar');

const rutas = express.Router();
rutas.use(exigirAdmin);

const noEncontrado = que => { throw new v.ErrorPeticion(404, `${que} no encontrada`); };

// Construye un UPDATE solo con los campos recibidos.
async function actualizar(tabla, id, campos, devolver) {
  const entradas = Object.entries(campos).filter(([, [, valor]]) => valor !== undefined);
  if (!entradas.length) throw new v.ErrorPeticion(400, 'No hay nada que cambiar');
  const set = entradas.map(([nombre]) => `${nombre} = @${nombre}`).join(', ');
  const filas = await consulta(
    `UPDATE fichaje.${tabla} SET ${set} OUTPUT ${devolver} WHERE id = @id`,
    { ...Object.fromEntries(entradas), id: [sql.Int, id] },
  );
  return filas[0];
}

const siDefinido = (valor, fn) => (valor === undefined ? undefined : fn(valor));
const COLUMNAS_EMPRESA = 'id, codigo, nombre, cif, activa, gps_obligatorio, obra_obligatoria, creado_en';
const COLUMNAS_TRABAJADOR = 'id, empresa_id, usuario, nombre, dni, activo, ultimo_acceso, creado_en';
const COLUMNAS_OBRA = 'id, empresa_id, codigo, nombre, cliente, direccion, activa, creado_en';
const prefijo = (cols, p) => cols.split(', ').map(c => `${p}.${c}`).join(', ');

function enConflicto(err, mensaje) {
  if (err.number === 2627 || err.number === 2601) throw new v.ErrorPeticion(409, mensaje);
  throw err;
}

// Empresas

rutas.get('/empresas', async (req, res) => {
  res.json(await consulta(`SELECT ${COLUMNAS_EMPRESA} FROM fichaje.empresas ORDER BY nombre`));
});

rutas.post('/empresas', async (req, res) => {
  const b = req.body || {};
  const fila = await consulta(
    `INSERT INTO fichaje.empresas (codigo, nombre, cif, gps_obligatorio, obra_obligatoria)
     OUTPUT ${prefijo(COLUMNAS_EMPRESA, 'inserted')}
     VALUES (@codigo, @nombre, @cif, @gps, @obra)`,
    {
      codigo: [sql.NVarChar(20), v.codigo(b.codigo, 'el código de empresa')],
      nombre: [sql.NVarChar(150), v.texto(b.nombre, 'el nombre', { obligatorio: true })],
      cif: [sql.NVarChar(20), v.texto(b.cif, 'el CIF', { max: 20 })],
      gps: [sql.Bit, v.booleano(b.gps_obligatorio, 'gps_obligatorio') ?? true],
      obra: [sql.Bit, v.booleano(b.obra_obligatoria, 'obra_obligatoria') ?? false],
    },
  ).catch(err => enConflicto(err, 'Ya existe una empresa con ese código'));
  res.status(201).json(fila[0]);
});

rutas.patch('/empresas/:id', async (req, res) => {
  const b = req.body || {};
  const fila = await actualizar('empresas', v.entero(req.params.id, 'la empresa', { obligatorio: true }), {
    nombre: [sql.NVarChar(150), siDefinido(b.nombre, x => v.texto(x, 'el nombre', { obligatorio: true }))],
    cif: [sql.NVarChar(20), siDefinido(b.cif, x => v.texto(x, 'el CIF', { max: 20 }))],
    activa: [sql.Bit, siDefinido(b.activa, x => v.booleano(x, 'activa'))],
    gps_obligatorio: [sql.Bit, siDefinido(b.gps_obligatorio, x => v.booleano(x, 'gps_obligatorio'))],
    obra_obligatoria: [sql.Bit, siDefinido(b.obra_obligatoria, x => v.booleano(x, 'obra_obligatoria'))],
  }, prefijo(COLUMNAS_EMPRESA, 'inserted'));
  res.json(fila || noEncontrado('Empresa'));
});

// Trabajadores

rutas.get('/empresas/:id/trabajadores', async (req, res) => {
  res.json(await consulta(
    `SELECT ${COLUMNAS_TRABAJADOR} FROM fichaje.trabajadores WHERE empresa_id = @e ORDER BY nombre`,
    { e: [sql.Int, v.entero(req.params.id, 'la empresa', { obligatorio: true })] },
  ));
});

rutas.post('/empresas/:id/trabajadores', async (req, res) => {
  const b = req.body || {};
  const fila = await consulta(
    `INSERT INTO fichaje.trabajadores (empresa_id, usuario, nombre, dni, clave_hash)
     OUTPUT ${prefijo(COLUMNAS_TRABAJADOR, 'inserted')}
     VALUES (@e, @usuario, @nombre, @dni, @hash)`,
    {
      e: [sql.Int, v.entero(req.params.id, 'la empresa', { obligatorio: true })],
      usuario: [sql.NVarChar(50), v.usuario(b.usuario)],
      nombre: [sql.NVarChar(150), v.texto(b.nombre, 'el nombre', { obligatorio: true })],
      dni: [sql.NVarChar(20), v.texto(b.dni, 'el DNI', { max: 20 })],
      hash: [sql.NVarChar(100), await bcrypt.hash(v.clave(b.clave), 10)],
    },
  ).catch(err => {
    if (err.number === 547) throw new v.ErrorPeticion(404, 'Empresa no encontrada');
    return enConflicto(err, 'Ya existe ese usuario en la empresa');
  });
  res.status(201).json(fila[0]);
});

rutas.patch('/trabajadores/:id', async (req, res) => {
  const b = req.body || {};
  const activo = siDefinido(b.activo, x => v.booleano(x, 'activo'));
  const hash = b.clave === undefined ? undefined : await bcrypt.hash(v.clave(b.clave), 10);
  const campos = {
    nombre: [sql.NVarChar(150), siDefinido(b.nombre, x => v.texto(x, 'el nombre', { obligatorio: true }))],
    dni: [sql.NVarChar(20), siDefinido(b.dni, x => v.texto(x, 'el DNI', { max: 20 }))],
    activo: [sql.Bit, activo],
    clave_hash: [sql.NVarChar(100), hash],
  };
  const id = v.entero(req.params.id, 'el trabajador', { obligatorio: true });
  const fila = await actualizar('trabajadores', id, campos, prefijo(COLUMNAS_TRABAJADOR, 'inserted'));
  if (!fila) return noEncontrado('Persona trabajadora');
  // Cambio de clave o baja: cierra las sesiones abiertas en los móviles.
  if (hash !== undefined || activo === false) {
    await consulta('UPDATE fichaje.trabajadores SET version_sesion = version_sesion + 1 WHERE id = @id', { id: [sql.Int, id] });
  }
  res.json(fila);
});

// Obras

rutas.get('/empresas/:id/obras', async (req, res) => {
  res.json(await consulta(
    `SELECT ${COLUMNAS_OBRA} FROM fichaje.obras WHERE empresa_id = @e ORDER BY activa DESC, nombre`,
    { e: [sql.Int, v.entero(req.params.id, 'la empresa', { obligatorio: true })] },
  ));
});

rutas.post('/empresas/:id/obras', async (req, res) => {
  const b = req.body || {};
  const fila = await consulta(
    `INSERT INTO fichaje.obras (empresa_id, codigo, nombre, cliente, direccion)
     OUTPUT ${prefijo(COLUMNAS_OBRA, 'inserted')}
     VALUES (@e, @codigo, @nombre, @cliente, @direccion)`,
    {
      e: [sql.Int, v.entero(req.params.id, 'la empresa', { obligatorio: true })],
      codigo: [sql.NVarChar(30), v.codigo(b.codigo, 'el código de obra', 30)],
      nombre: [sql.NVarChar(150), v.texto(b.nombre, 'el nombre', { obligatorio: true })],
      cliente: [sql.NVarChar(150), v.texto(b.cliente, 'el cliente')],
      direccion: [sql.NVarChar(250), v.texto(b.direccion, 'la dirección', { max: 250 })],
    },
  ).catch(err => {
    if (err.number === 547) throw new v.ErrorPeticion(404, 'Empresa no encontrada');
    return enConflicto(err, 'Ya existe una obra con ese código en la empresa');
  });
  res.status(201).json(fila[0]);
});

rutas.patch('/obras/:id', async (req, res) => {
  const b = req.body || {};
  const fila = await actualizar('obras', v.entero(req.params.id, 'la obra', { obligatorio: true }), {
    nombre: [sql.NVarChar(150), siDefinido(b.nombre, x => v.texto(x, 'el nombre', { obligatorio: true }))],
    cliente: [sql.NVarChar(150), siDefinido(b.cliente, x => v.texto(x, 'el cliente'))],
    direccion: [sql.NVarChar(250), siDefinido(b.direccion, x => v.texto(x, 'la dirección', { max: 250 }))],
    activa: [sql.Bit, siDefinido(b.activa, x => v.booleano(x, 'activa'))],
  }, prefijo(COLUMNAS_OBRA, 'inserted'));
  res.json(fila || noEncontrado('Obra'));
});

// Consultas de fichajes

function filtros(query) {
  const empresa = v.entero(query.empresa_id, 'la empresa', { obligatorio: true });
  const desde = v.fecha(query.desde, 'desde', { obligatorio: true });
  const hasta = v.fecha(query.hasta, 'hasta', { obligatorio: true });
  if (hasta <= desde) throw new v.ErrorPeticion(400, '"hasta" debe ser posterior a "desde"');
  if (hasta - desde > 400 * 86400000) throw new v.ErrorPeticion(400, 'El periodo máximo es de 400 días');
  const condiciones = ['empresa_id = @e', 'hora_fichaje >= @desde', 'hora_fichaje < @hasta'];
  const parametros = {
    e: [sql.Int, empresa],
    desde: [sql.DateTimeOffset, desde],
    hasta: [sql.DateTimeOffset, hasta],
  };
  const trabajador = v.entero(query.trabajador_id, 'el trabajador');
  if (trabajador) {
    condiciones.push('trabajador_id = @t');
    parametros.t = [sql.Int, trabajador];
  }
  const obra = v.entero(query.obra_id, 'la obra');
  if (obra) {
    condiciones.push('obra_id = @o');
    parametros.o = [sql.Int, obra];
  }
  if (v.booleano(query.solo_incidencias, 'solo_incidencias')) condiciones.push('incidencia IS NOT NULL');
  return { where: condiciones.join(' AND '), parametros };
}

// Fichajes en bruto, para listados, mapas y exportaciones.
// Fechas en ISO 8601, por ejemplo desde=2026-11-01T00:00:00+01:00.
rutas.get('/fichajes', async (req, res) => {
  const { where, parametros } = filtros(req.query);
  res.json(await consulta(
    `SELECT TOP 20000 * FROM fichaje.v_fichajes WHERE ${where} ORDER BY hora_fichaje, id`,
    parametros,
  ));
});

// Horas trabajadas y de pausa por persona, día y obra.
rutas.get('/horas', async (req, res) => {
  const { where, parametros } = filtros({ ...req.query, solo_incidencias: undefined, obra_id: undefined });
  const fichajes = await consulta(
    `SELECT trabajador_id, trabajador, tipo, hora_fichaje, obra_id, obra
     FROM fichaje.v_fichajes WHERE ${where} ORDER BY trabajador_id, hora_fichaje, id`,
    parametros,
  );
  const zona = req.query.zona || 'Europe/Madrid';
  try {
    new Intl.DateTimeFormat('es', { timeZone: zona });
  } catch {
    throw new v.ErrorPeticion(400, 'Zona horaria no válida');
  }
  let filas = resumenHoras(fichajes, zona);
  const obra = v.entero(req.query.obra_id, 'la obra');
  if (obra) filas = filas.filter(f => f.obra_id === obra);
  res.json(filas);
});

module.exports = rutas;
