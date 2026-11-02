#!/usr/bin/env node
// Herramienta de consola para instalar la base de datos y dar de alta datos
// mientras las pantallas de administración de Nexa Hub no estén listas.
//
//   node herramientas/admin.js instalar-bd
//   node herramientas/admin.js crear-empresa --codigo ELEC01 --nombre "Instalaciones Ejemplo SL"
//   node herramientas/admin.js crear-trabajador --empresa ELEC01 --usuario jordi --nombre "Jordi Puig" --clave 123456
//   node herramientas/admin.js crear-obra --empresa ELEC01 --codigo OB-001 --nombre "Nave Polígono Sud" --cliente "Cliente SA"
//   node herramientas/admin.js cambiar-clave --empresa ELEC01 --usuario jordi --clave 654321
//   node herramientas/admin.js baja-trabajador --empresa ELEC01 --usuario jordi
//   node herramientas/admin.js listar --empresa ELEC01
//   node herramientas/admin.js generar-secretos

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [, , orden, ...resto] = process.argv;
const args = {};
for (let i = 0; i < resto.length; i += 2) args[resto[i].replace(/^--/, '')] = resto[i + 1];

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

async function main() {
  if (orden === 'generar-secretos') {
    console.log(`JWT_SECRETO=${crypto.randomBytes(48).toString('base64url')}`);
    console.log(`ADMIN_CLAVE=${crypto.randomBytes(32).toString('base64url')}`);
    return;
  }

  const bcrypt = require('bcryptjs');
  const { sql, conectar, consulta, cerrar } = require('../src/db');
  const v = require('../src/validar');

  const empresaId = async () => {
    const codigo = v.codigo(args.empresa, '--empresa');
    const [e] = await consulta('SELECT id FROM fichaje.empresas WHERE codigo = @c', { c: [sql.NVarChar(20), codigo] });
    if (!e) salir(`No existe la empresa ${codigo}`);
    return e.id;
  };
  const trabajadorId = async () => {
    const e = await empresaId();
    const [t] = await consulta(
      'SELECT id FROM fichaje.trabajadores WHERE empresa_id = @e AND usuario = @u',
      { e: [sql.Int, e], u: [sql.NVarChar(50), v.usuario(args.usuario)] },
    );
    if (!t) salir(`No existe el usuario ${args.usuario}`);
    return t.id;
  };

  try {
    switch (orden) {
      case 'instalar-bd': {
        const pool = await conectar();
        const guion = fs.readFileSync(path.join(__dirname, '..', 'sql', '001_esquema.sql'), 'utf8');
        for (const bloque of guion.split(/^\s*GO\s*$/m).map(b => b.trim()).filter(Boolean)) {
          await pool.request().batch(bloque);
        }
        console.log('Base de datos lista (esquema fichaje).');
        break;
      }
      case 'crear-empresa': {
        const [e] = await consulta(
          `INSERT INTO fichaje.empresas (codigo, nombre, cif, gps_obligatorio, obra_obligatoria)
           OUTPUT inserted.id, inserted.codigo VALUES (@c, @n, @cif, @gps, @obra)`,
          {
            c: [sql.NVarChar(20), v.codigo(args.codigo, '--codigo')],
            n: [sql.NVarChar(150), v.texto(args.nombre, '--nombre', { obligatorio: true })],
            cif: [sql.NVarChar(20), v.texto(args.cif, '--cif', { max: 20 })],
            gps: [sql.Bit, v.booleano(args.gps, '--gps') ?? true],
            obra: [sql.Bit, v.booleano(args['obra-obligatoria'], '--obra-obligatoria') ?? false],
          },
        );
        console.log(`Empresa ${e.codigo} creada con id ${e.id}.`);
        break;
      }
      case 'crear-trabajador': {
        const [t] = await consulta(
          `INSERT INTO fichaje.trabajadores (empresa_id, usuario, nombre, dni, clave_hash)
           OUTPUT inserted.id, inserted.usuario VALUES (@e, @u, @n, @dni, @h)`,
          {
            e: [sql.Int, await empresaId()],
            u: [sql.NVarChar(50), v.usuario(args.usuario)],
            n: [sql.NVarChar(150), v.texto(args.nombre, '--nombre', { obligatorio: true })],
            dni: [sql.NVarChar(20), v.texto(args.dni, '--dni', { max: 20 })],
            h: [sql.NVarChar(100), await bcrypt.hash(v.clave(args.clave), 10)],
          },
        );
        console.log(`Usuario ${t.usuario} creado con id ${t.id}.`);
        break;
      }
      case 'crear-obra': {
        const [o] = await consulta(
          `INSERT INTO fichaje.obras (empresa_id, codigo, nombre, cliente, direccion)
           OUTPUT inserted.id, inserted.codigo VALUES (@e, @c, @n, @cl, @d)`,
          {
            e: [sql.Int, await empresaId()],
            c: [sql.NVarChar(30), v.codigo(args.codigo, '--codigo', 30)],
            n: [sql.NVarChar(150), v.texto(args.nombre, '--nombre', { obligatorio: true })],
            cl: [sql.NVarChar(150), v.texto(args.cliente, '--cliente')],
            d: [sql.NVarChar(250), v.texto(args.direccion, '--direccion', { max: 250 })],
          },
        );
        console.log(`Obra ${o.codigo} creada con id ${o.id}.`);
        break;
      }
      case 'cambiar-clave': {
        const id = await trabajadorId();
        await consulta(
          'UPDATE fichaje.trabajadores SET clave_hash = @h, version_sesion = version_sesion + 1 WHERE id = @id',
          { h: [sql.NVarChar(100), await bcrypt.hash(v.clave(args.clave), 10)], id: [sql.Int, id] },
        );
        console.log('Clave cambiada. Las sesiones abiertas se han cerrado.');
        break;
      }
      case 'baja-trabajador': {
        const id = await trabajadorId();
        await consulta(
          'UPDATE fichaje.trabajadores SET activo = 0, version_sesion = version_sesion + 1 WHERE id = @id',
          { id: [sql.Int, id] },
        );
        console.log('Baja hecha. Sus fichajes se conservan.');
        break;
      }
      case 'listar': {
        const e = await empresaId();
        console.log('Personas:');
        console.table(await consulta(
          'SELECT id, usuario, nombre, activo, ultimo_acceso FROM fichaje.trabajadores WHERE empresa_id = @e ORDER BY nombre',
          { e: [sql.Int, e] },
        ));
        console.log('Obras:');
        console.table(await consulta(
          'SELECT id, codigo, nombre, cliente, activa FROM fichaje.obras WHERE empresa_id = @e ORDER BY nombre',
          { e: [sql.Int, e] },
        ));
        break;
      }
      default:
        salir('Órdenes: instalar-bd, crear-empresa, crear-trabajador, crear-obra, cambiar-clave, baja-trabajador, listar, generar-secretos');
    }
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) salir('Ya existe un registro con ese código o usuario.');
    salir(err.message);
  } finally {
    await cerrar();
  }
}

main();
