// Reglas de la jornada. Sin dependencias para poder probarlas solas.

const TIPOS = ['entrada', 'pausa', 'reanudar', 'cambio_obra', 'salida'];

// Estado desde el que se permite cada tipo de fichaje.
const PERMITIDO = {
  entrada: ['fuera'],
  pausa: ['trabajando'],
  reanudar: ['pausa'],
  cambio_obra: ['trabajando'],
  salida: ['trabajando', 'pausa'],
};

const SIGUIENTE = {
  entrada: 'trabajando',
  pausa: 'pausa',
  reanudar: 'trabajando',
  cambio_obra: 'trabajando',
  salida: 'fuera',
};

// Recorre los fichajes en orden y devuelve el estado final.
function estadoTras(fichajes) {
  let estado = 'fuera';
  let obraId = null;
  let desde = null;
  for (const f of fichajes) {
    estado = SIGUIENTE[f.tipo] || estado;
    if (f.tipo === 'entrada' || f.tipo === 'cambio_obra') obraId = f.obra_id ?? null;
    if (f.tipo === 'salida') obraId = null;
    desde = f.hora_fichaje;
  }
  return { estado, obra_id: obraId, desde };
}

function transicionValida(estado, tipo) {
  return (PERMITIDO[tipo] || []).includes(estado);
}

const NOMBRE_ESTADO = { fuera: 'fuera de jornada', trabajando: 'trabajando', pausa: 'en pausa' };

function motivoRechazo(estado, tipo) {
  return `No se puede fichar "${tipo}" estando ${NOMBRE_ESTADO[estado] || estado}`;
}

// Fecha local (AAAA-MM-DD) en la zona horaria indicada.
function fechaLocal(fecha, zona) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(fecha));
}

// Suma minutos trabajados y de pausa por trabajador, día (el de la entrada) y obra.
// Recibe fichajes de varios trabajadores ordenados por trabajador y hora.
function resumenHoras(fichajes, zona = 'Europe/Madrid', ahora = new Date()) {
  const filas = new Map();
  const sumar = (clave, base, campo, ms) => {
    if (!filas.has(clave)) filas.set(clave, { ...base, minutos_trabajo: 0, minutos_pausa: 0, abierta: false });
    if (ms > 0) filas.get(clave)[campo] += ms / 60000;
  };

  const porTrabajador = new Map();
  for (const f of fichajes) {
    if (!porTrabajador.has(f.trabajador_id)) porTrabajador.set(f.trabajador_id, []);
    porTrabajador.get(f.trabajador_id).push(f);
  }

  for (const [trabajadorId, lista] of porTrabajador) {
    lista.sort((a, b) => new Date(a.hora_fichaje) - new Date(b.hora_fichaje));
    let estado = 'fuera';
    let obra = null;
    let dia = null;
    let inicioTramo = null;
    const base = () => ({
      trabajador_id: trabajadorId,
      trabajador: lista[0].trabajador,
      fecha: dia,
      obra_id: obra?.id ?? null,
      obra: obra?.nombre ?? null,
    });
    const clave = () => `${trabajadorId}|${dia}|${obra?.id ?? ''}`;
    const cerrarTramo = hasta => {
      if (inicioTramo === null) return;
      const ms = new Date(hasta) - new Date(inicioTramo);
      sumar(clave(), base(), estado === 'pausa' ? 'minutos_pausa' : 'minutos_trabajo', ms);
    };

    for (const f of lista) {
      if (!transicionValida(estado, f.tipo)) continue; // Las incidencias no suman horas.
      if (f.tipo === 'entrada') dia = fechaLocal(f.hora_fichaje, zona);
      else cerrarTramo(f.hora_fichaje);
      if (f.tipo === 'entrada' || f.tipo === 'cambio_obra') obra = f.obra_id ? { id: f.obra_id, nombre: f.obra } : null;
      estado = SIGUIENTE[f.tipo];
      inicioTramo = estado === 'fuera' ? null : f.hora_fichaje;
    }
    // Jornada sin salida: cuenta hasta ahora y se marca como abierta.
    if (estado !== 'fuera') {
      cerrarTramo(ahora);
      const fila = filas.get(clave());
      if (fila) fila.abierta = true;
    }
  }

  return [...filas.values()].map(f => ({
    ...f,
    minutos_trabajo: Math.round(f.minutos_trabajo),
    minutos_pausa: Math.round(f.minutos_pausa),
  }));
}

module.exports = { TIPOS, estadoTras, transicionValida, motivoRechazo, resumenHoras, fechaLocal };
