// Prueba de extremo a extremo contra un SQL Server real.
// Necesita .env con una base de datos de PRUEBAS y la variable PRUEBA_BD=1.
// Crea una empresa temporal con código aleatorio.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const activa = process.env.PRUEBA_BD === '1';

test('API de fichaje', { skip: !activa && 'Define PRUEBA_BD=1 para probar contra SQL Server' }, async t => {
  const app = require('../src/index');
  const { cerrar } = require('../src/db');
  const config = require('../src/config');
  const servidor = app.listen(0);
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  t.after(async () => {
    servidor.close();
    await cerrar();
  });

  const pedir = async (ruta, { metodo = 'GET', cuerpo, token, admin } = {}) => {
    const cabeceras = { 'content-type': 'application/json' };
    if (token) cabeceras.authorization = `Bearer ${token}`;
    if (admin) cabeceras['x-admin-clave'] = config.adminClave;
    const r = await fetch(base + ruta, { method: metodo, headers: cabeceras, body: cuerpo && JSON.stringify(cuerpo) });
    return { estado: r.status, datos: await r.json() };
  };
  const codigo = `T${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // Alta desde la administración.
  assert.equal((await pedir('/admin/empresas')).estado, 401);
  const empresa = await pedir('/admin/empresas', { metodo: 'POST', admin: true, cuerpo: { codigo, nombre: 'Empresa de prueba', obra_obligatoria: true } });
  assert.equal(empresa.estado, 201);
  const e = empresa.datos.id;
  const repetida = await pedir('/admin/empresas', { metodo: 'POST', admin: true, cuerpo: { codigo, nombre: 'Otra' } });
  assert.equal(repetida.estado, 409);
  const trab = await pedir(`/admin/empresas/${e}/trabajadores`, { metodo: 'POST', admin: true, cuerpo: { usuario: 'Ana', nombre: 'Ana Prueba', clave: 'clave1' } });
  assert.equal(trab.estado, 201);
  assert.equal(trab.datos.usuario, 'ana');
  assert.equal(trab.datos.clave_hash, undefined);
  const obra1 = (await pedir(`/admin/empresas/${e}/obras`, { metodo: 'POST', admin: true, cuerpo: { codigo: 'o1', nombre: 'Obra 1' } })).datos;
  const obra2 = (await pedir(`/admin/empresas/${e}/obras`, { metodo: 'POST', admin: true, cuerpo: { codigo: 'o2', nombre: 'Obra 2' } })).datos;

  // Inicio de sesión.
  assert.equal((await pedir('/login', { metodo: 'POST', cuerpo: { empresa: codigo, usuario: 'ana', clave: 'mala00' } })).estado, 401);
  const login = await pedir('/login', { metodo: 'POST', cuerpo: { empresa: codigo.toLowerCase(), usuario: 'ANA', clave: 'clave1' } });
  assert.equal(login.estado, 200);
  const token = login.datos.token;

  let yo = await pedir('/yo', { token });
  assert.equal(yo.datos.estado.estado, 'fuera');
  assert.equal(yo.datos.obras.length, 2);

  const fichar = (tipo, extra = {}) => pedir('/fichajes', {
    metodo: 'POST', token,
    cuerpo: { uuid: crypto.randomUUID(), tipo, hora: new Date().toISOString(), latitud: 41.38, longitud: 2.17, precision: 12, ...extra },
  });

  // Reglas en línea.
  assert.equal((await fichar('salida')).estado, 409);
  assert.equal((await fichar('entrada')).estado, 400); // La empresa exige obra.
  const uuidEntrada = crypto.randomUUID();
  const entrada = await fichar('entrada', { uuid: uuidEntrada, obra_id: obra1.id });
  assert.equal(entrada.estado, 201);
  assert.equal(entrada.datos.sin_conexion, false);
  // Reenvío del mismo fichaje: no duplica.
  const reenvio = await fichar('entrada', { uuid: uuidEntrada, obra_id: obra1.id });
  assert.equal(reenvio.estado, 200);
  assert.equal(reenvio.datos.repetido, true);
  assert.equal((await fichar('entrada', { obra_id: obra1.id })).estado, 409);
  assert.equal((await fichar('pausa')).estado, 201);
  assert.equal((await fichar('cambio_obra', { obra_id: obra2.id })).estado, 409);
  assert.equal((await fichar('reanudar')).estado, 201);
  const cambio = await fichar('cambio_obra', { obra_id: obra2.id });
  assert.equal(cambio.estado, 201);
  const sinGps = await fichar('salida', { latitud: null, longitud: null });
  assert.equal(sinGps.estado, 201);
  assert.equal(sinGps.datos.obra_id, obra2.id);
  assert.match(sinGps.datos.incidencia, /Sin ubicación/);

  // Fichaje sin conexión que llega tarde: se acepta con la hora del móvil.
  const hace2h = new Date(Date.now() - 2 * 3600000).toISOString();
  const tarde = await fichar('salida', { hora: hace2h, sin_conexion: true });
  assert.equal(tarde.estado, 201);
  assert.equal(tarde.datos.sin_conexion, true);
  assert.equal(new Date(tarde.datos.hora_fichaje).toISOString(), hace2h.replace(/\.\d+Z$/, '.000Z'));
  assert.match(tarde.datos.incidencia, /No se puede fichar "salida"/);

  yo = await pedir('/yo', { token });
  assert.equal(yo.datos.estado.estado, 'fuera');
  assert.equal(yo.datos.recientes.length, 6);

  // Consultas de Nexa Hub.
  const desde = new Date(Date.now() - 86400000).toISOString();
  const hasta = new Date(Date.now() + 3600000).toISOString();
  const lista = await pedir(`/admin/fichajes?empresa_id=${e}&desde=${desde}&hasta=${hasta}`, { admin: true });
  assert.equal(lista.datos.length, 6);
  const incid = await pedir(`/admin/fichajes?empresa_id=${e}&desde=${desde}&hasta=${hasta}&solo_incidencias=1`, { admin: true });
  assert.equal(incid.datos.length, 2);
  const horas = await pedir(`/admin/horas?empresa_id=${e}&desde=${desde}&hasta=${hasta}`, { admin: true });
  assert.equal(horas.estado, 200);
  assert.ok(horas.datos.length >= 1);

  // El registro no se puede tocar ni desde SQL.
  const { consulta } = require('../src/db');
  await assert.rejects(consulta(`DELETE FROM fichaje.fichajes WHERE empresa_id = ${e}`), /no se pueden modificar/);

  // Cambio de clave: la sesión del móvil deja de valer.
  const cambioClave = await pedir(`/admin/trabajadores/${trab.datos.id}`, { metodo: 'PATCH', admin: true, cuerpo: { clave: 'nueva22' } });
  assert.equal(cambioClave.estado, 200);
  assert.equal((await pedir('/yo', { token })).estado, 401);
});
