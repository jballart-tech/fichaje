const sql = require('mssql');
const config = require('./config');

let pool;

async function conectar() {
  if (!pool) {
    pool = new sql.ConnectionPool(config.bd);
    pool.on('error', err => console.error('[bd]', err.message));
    await pool.connect();
  }
  return pool;
}

// Ejecuta una consulta con parámetros con nombre: consulta('SELECT ... WHERE id = @id', { id: [sql.Int, 5] }).
async function consulta(texto, parametros = {}, transaccion) {
  const origen = transaccion || await conectar();
  const peticion = origen.request();
  for (const [nombre, [tipo, valor]] of Object.entries(parametros)) {
    peticion.input(nombre, tipo, valor);
  }
  const resultado = await peticion.query(texto);
  return resultado.recordset || [];
}

async function cerrar() {
  if (pool) await pool.close();
  pool = undefined;
}

module.exports = { sql, conectar, consulta, cerrar };
