class ErrorPeticion extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

const falla = mensaje => { throw new ErrorPeticion(400, mensaje.charAt(0).toUpperCase() + mensaje.slice(1)); };

function texto(valor, campo, { max = 150, obligatorio = false } = {}) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    if (obligatorio) falla(`Falta ${campo}`);
    return null;
  }
  const limpio = String(valor).trim();
  if (limpio.length > max) falla(`${campo} admite como máximo ${max} caracteres`);
  return limpio;
}

function entero(valor, campo, { obligatorio = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (obligatorio) falla(`Falta ${campo}`);
    return null;
  }
  const n = Number(valor);
  if (!Number.isInteger(n) || n <= 0) falla(`${campo} no es válido`);
  return n;
}

function booleano(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor === 'boolean') return valor;
  if (['1', 'true', 'si', 'sí'].includes(String(valor).toLowerCase())) return true;
  if (['0', 'false', 'no'].includes(String(valor).toLowerCase())) return false;
  return falla(`${campo} debe ser sí o no`);
}

function fecha(valor, campo, { obligatorio = false } = {}) {
  if (!valor) {
    if (obligatorio) falla(`Falta ${campo}`);
    return null;
  }
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) falla(`${campo} no es una fecha válida`);
  return d;
}

function numeroEnRango(valor, campo, min, max) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) falla(`${campo} no es válido`);
  return n;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(valor) {
  if (!UUID.test(String(valor || ''))) falla('Identificador de fichaje no válido');
  return String(valor).toLowerCase();
}

function clave(valor) {
  const c = texto(valor, 'la clave', { max: 72, obligatorio: true });
  if (c.length < 6) falla('La clave debe tener al menos 6 caracteres');
  return c;
}

function usuario(valor) {
  const u = texto(valor, 'el usuario', { max: 50, obligatorio: true }).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(u)) falla('El usuario solo admite letras sin acentos, números, punto, guion y guion bajo');
  return u;
}

function codigo(valor, campo, max = 20) {
  const c = texto(valor, campo, { max, obligatorio: true }).toUpperCase();
  if (!/^[A-Z0-9_-]+$/.test(c)) falla(`${campo} solo admite letras sin acentos, números, guion y guion bajo`);
  return c;
}

module.exports = { ErrorPeticion, texto, entero, booleano, fecha, numeroEnRango, uuid, clave, usuario, codigo };
