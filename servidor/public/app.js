'use strict';

// Fichaje Nexa Hub. Cada fichaje se guarda primero en el móvil y luego se envía al servidor.
// Si no hay cobertura, queda en cola y se envía al volver la conexión.

const API = '/api';
const CLAVES = { token: 'fx.token', datos: 'fx.datos', cola: 'fx.cola', desfase: 'fx.desfase', obra: 'fx.obra' };

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

// Almacenamiento local protegido: algunos navegadores lo bloquean.
const guardado = {
  leer(clave, defecto) {
    try {
      const v = localStorage.getItem(clave);
      return v === null ? defecto : JSON.parse(v);
    } catch {
      return defecto;
    }
  },
  escribir(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
      return true;
    } catch {
      return false;
    }
  },
  borrar(clave) {
    try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
  },
};

const app = {
  token: guardado.leer(CLAVES.token, null),
  datos: guardado.leer(CLAVES.datos, null),
  cola: guardado.leer(CLAVES.cola, []),
  desfase: guardado.leer(CLAVES.desfase, 0), // ms que hay que sumar al reloj del móvil
  enviando: false,
  fichando: false,
  conectado: navigator.onLine,
};

const t = (clave, parametros) => idioma.t(clave, parametros);
const nombreTipo = tipo => t(`tipo_${tipo}`);
const delServidor = mensaje => idioma.servidor(mensaje);
const SIGUIENTE = { entrada: 'trabajando', pausa: 'pausa', reanudar: 'trabajando', cambio_obra: 'trabajando', salida: 'fuera' };
const PERMITIDO = { entrada: ['fuera'], pausa: ['trabajando'], reanudar: ['pausa'], cambio_obra: ['trabajando'], salida: ['trabajando', 'pausa'] };

const ahora = () => new Date(Date.now() + app.desfase);
const dosCifras = n => String(n).padStart(2, '0');
const horaCorta = d => `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
const duracion = min => `${Math.floor(min / 60)}:${dosCifras(Math.floor(min % 60))}`;
const fechaClave = d => `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`;
const escapar = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function nuevoUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function mostrarMensaje(texto, tipo = 'error', segundos = 6) {
  const el = $('#mensaje');
  el.textContent = texto;
  el.className = `aviso ${tipo}`;
  el.hidden = false;
  clearTimeout(mostrarMensaje.t);
  if (segundos) mostrarMensaje.t = setTimeout(() => { el.hidden = true; }, segundos * 1000);
}

async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  const cabeceras = { 'content-type': 'application/json' };
  if (app.token) cabeceras.authorization = `Bearer ${app.token}`;
  const control = new AbortController();
  const limite = setTimeout(() => control.abort(), 15000);
  try {
    const r = await fetch(API + ruta, {
      method: metodo, headers: cabeceras, cache: 'no-store', signal: control.signal,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const datos = await r.json().catch(() => ({}));
    return { estado: r.status, datos };
  } finally {
    clearTimeout(limite);
  }
}

// Estado y fichajes visibles: lo que dijo el servidor más lo que espera en la cola.
function situacion() {
  let estado = app.datos?.estado?.estado || 'fuera';
  let obraId = app.datos?.estado?.obra_id ?? null;
  for (const f of app.cola) {
    if (!PERMITIDO[f.tipo].includes(estado)) continue;
    estado = SIGUIENTE[f.tipo];
    if (f.tipo === 'entrada' || f.tipo === 'cambio_obra') obraId = f.obra_id ?? null;
    if (f.tipo === 'salida') obraId = null;
  }
  return { estado, obraId };
}

function nombreObra(id) {
  const o = (app.datos?.obras || []).find(x => x.id === id);
  return o ? o.nombre : null;
}

function fichajesVisibles() {
  const enviados = (app.datos?.recientes || []).map(f => ({ ...f, pendiente: false }));
  const yaEnviados = new Set(enviados.map(f => String(f.uuid).toLowerCase()));
  const pendientes = app.cola
    .filter(f => !yaEnviados.has(f.uuid))
    .map(f => ({ uuid: f.uuid, tipo: f.tipo, hora_fichaje: f.hora, obra: nombreObra(f.obra_id), pendiente: true }));
  return [...enviados, ...pendientes].sort((a, b) => new Date(a.hora_fichaje) - new Date(b.hora_fichaje));
}

// Minutos trabajados y de pausa por día (el día de la entrada).
function sumarPorDia(fichajes, hasta = ahora()) {
  const dias = new Map();
  let estado = 'fuera';
  let dia = null;
  let inicio = null;
  const sumar = (campo, desde, fin) => {
    if (!dias.has(dia)) dias.set(dia, { trabajo: 0, pausa: 0, fichajes: [] });
    dias.get(dia)[campo] += Math.max(0, (fin - desde) / 60000);
  };
  for (const f of fichajes) {
    const h = new Date(f.hora_fichaje);
    if (f.tipo === 'entrada' && estado === 'fuera') dia = fechaClave(h);
    if (dia && !dias.has(dia)) dias.set(dia, { trabajo: 0, pausa: 0, fichajes: [] });
    if (dia) dias.get(dia).fichajes.push(f);
    if (!PERMITIDO[f.tipo].includes(estado)) continue;
    if (inicio) sumar(estado === 'pausa' ? 'pausa' : 'trabajo', inicio, h);
    estado = SIGUIENTE[f.tipo];
    inicio = estado === 'fuera' ? null : h;
  }
  if (inicio && dia) sumar(estado === 'pausa' ? 'pausa' : 'trabajo', inicio, hasta);
  return dias;
}

function filaFichaje(f) {
  const h = new Date(f.hora_fichaje);
  let marca = '';
  if (f.pendiente) marca = `<span class="marca-estado pend">${t('pendienteEnviar')}</span>`;
  else if (f.incidencia) marca = `<span class="marca-estado inc">${escapar(delServidor(f.incidencia))}</span>`;
  else if (f.sin_conexion) marca = `<span class="marca-estado">${t('sinConexion')}</span>`;
  return `<li class="ficha"><time>${horaCorta(h)}</time>
    <span class="t"><span class="tipo-${f.tipo}">${nombreTipo(f.tipo)}</span>${f.obra ? `<small>${escapar(f.obra)}</small>` : ''}</span>
    ${marca}</li>`;
}

// Pantallas

function mostrarVista(nombre) {
  $('#vistaLogin').hidden = nombre !== 'login';
  $('#vistaHoy').hidden = nombre !== 'hoy';
  $('#vistaHistorial').hidden = nombre !== 'historial';
  $('#tabs').hidden = nombre === 'login';
  $$('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.vista === nombre)));
  if (nombre === 'historial') cargarHistorial();
}

function pintarReloj() {
  const d = ahora();
  $('#reloj').textContent = `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}:${dosCifras(d.getSeconds())}`;
  $('#fecha').textContent = d.toLocaleDateString(idioma.locale(), { weekday: 'long', day: 'numeric', month: 'long' });
}

function pintar() {
  if (!app.datos) return;
  const { estado, obraId } = situacion();
  const empresa = app.datos.empresa;

  $('#cabEmpresa').textContent = empresa.nombre;
  $('#quien').textContent = `${app.datos.trabajador.nombre} · ${empresa.codigo}`;
  $('#piloto').className = `piloto ${estado}`;
  $('#textoEstado').textContent = t(`estado_${estado}`);

  // Selector de obra.
  const obras = app.datos.obras || [];
  const select = $('#obra');
  const elegida = select.value || String(guardado.leer(CLAVES.obra, '') || '');
  select.innerHTML = `<option value="">${t(empresa.obra_obligatoria ? 'eligeObra' : 'sinObra')}</option>`
    + obras.map(o => `<option value="${o.id}">${escapar(o.nombre)}${o.cliente ? ` · ${escapar(o.cliente)}` : ''}</option>`).join('');
  select.value = obras.some(o => String(o.id) === elegida) ? elegida : '';
  $('#campoObra').hidden = obras.length === 0;
  $('#obraActual').textContent = obraId ? nombreObra(obraId) || '' : '';

  // El primer pulsador es Entrada o Reanudar según el estado.
  const primero = $('.pulsador[data-tipo="entrada"], .pulsador[data-tipo="reanudar"]');
  primero.dataset.tipo = estado === 'pausa' ? 'reanudar' : 'entrada';
  primero.querySelector('.lbl').textContent = nombreTipo(primero.dataset.tipo);
  $$('.pulsador').forEach(b => { b.disabled = app.fichando || !PERMITIDO[b.dataset.tipo].includes(estado); });
  const cambio = $('#btnCambioObra');
  cambio.hidden = obras.length === 0 || estado !== 'trabajando';
  cambio.disabled = app.fichando || !select.value || Number(select.value) === obraId;

  // Fichajes de hoy y desde la última entrada.
  const visibles = fichajesVisibles();
  const hoy = fechaClave(ahora());
  const dias = sumarPorDia(visibles);
  const resumen = dias.get(hoy) || { trabajo: 0, pausa: 0, fichajes: [] };
  $('#kTrabajo').textContent = duracion(resumen.trabajo);
  $('#kPausa').textContent = duracion(resumen.pausa);
  const deHoy = visibles.filter(f => fechaClave(new Date(f.hora_fichaje)) === hoy || f.pendiente);
  $('#listaHoy').innerHTML = deHoy.length ? deHoy.map(filaFichaje).join('') : `<li class="vacio">${t('sinFichajesHoy')}</li>`;

  // Estado de envío.
  const sync = $('#sync');
  if (app.cola.length) {
    sync.className = 'sync ko';
    sync.textContent = app.cola.length === 1 ? t('pendientes1') : t('pendientesN', { n: app.cola.length });
  } else {
    sync.className = app.conectado ? 'sync ok' : 'sync ko';
    sync.textContent = t(app.conectado ? 'conectado' : 'sinConexion');
  }
}

async function cargarHistorial() {
  const caja = $('#listaHistorial');
  if (!navigator.onLine) {
    caja.innerHTML = `<p class="vacio">${t('historialSinRed')}</p>`;
    return;
  }
  caja.innerHTML = `<p class="vacio">${t('cargando')}</p>`;
  try {
    const r = await pedir('/fichajes?dias=31');
    if (r.estado === 401) return sesionCaducada(r.datos.error);
    if (r.estado !== 200) throw new Error(r.datos.error);
    const dias = sumarPorDia(r.datos);
    const orden = [...dias.keys()].sort().reverse();
    let total = 0;
    caja.innerHTML = orden.length ? orden.map(d => {
      const info = dias.get(d);
      total += info.trabajo;
      const titulo = new Date(`${d}T12:00:00`).toLocaleDateString(idioma.locale(), { weekday: 'short', day: 'numeric', month: 'short' });
      return `<div class="dia"><div class="dia-cab"><span>${titulo}</span><b>${duracion(info.trabajo)}</b></div>
        <ul class="fichas">${info.fichajes.map(filaFichaje).join('')}</ul></div>`;
    }).join('') : `<p class="vacio">${t('sinFichajesPeriodo')}</p>`;
    $('#totalHistorial').textContent = t('total', { h: duracion(total) });
  } catch {
    caja.innerHTML = `<p class="vacio">${t('historialError')}</p>`;
  }
}

// Datos del servidor

async function cargar() {
  if (!app.token) return mostrarVista('login');
  try {
    const antes = Date.now();
    const r = await pedir('/yo');
    if (r.estado === 401) return sesionCaducada(r.datos.error);
    if (r.estado !== 200) throw new Error(r.datos.error);
    // Ajusta el reloj del móvil con la hora del servidor.
    const viaje = Date.now() - antes;
    app.desfase = new Date(r.datos.ahora).getTime() + viaje / 2 - Date.now();
    guardado.escribir(CLAVES.desfase, app.desfase);
    app.datos = r.datos;
    guardado.escribir(CLAVES.datos, app.datos);
    app.conectado = true;
  } catch {
    app.conectado = false;
  }
  if (!app.datos) {
    mostrarMensaje(t('sinDatos'), 'error', 0);
    return;
  }
  pintar();
}

function sesionCaducada(texto) {
  app.token = null;
  guardado.borrar(CLAVES.token);
  mostrarVista('login');
  mostrarMensaje(`${texto ? delServidor(texto) : t('sesionCaducada')}${app.cola.length ? `. ${t('pendientesAlEntrar')}` : ''}`, 'error', 0);
}

async function enviarCola() {
  if (app.enviando || !app.token || !app.cola.length) return;
  app.enviando = true;
  let enviados = 0;
  try {
    while (app.cola.length) {
      const f = app.cola[0];
      let r;
      try {
        r = await pedir('/fichajes', { metodo: 'POST', cuerpo: f });
      } catch {
        app.conectado = false;
        // Ya no llega al momento: el servidor usará la hora guardada en el móvil.
        app.cola.forEach(x => { x.sin_conexion = true; });
        guardado.escribir(CLAVES.cola, app.cola);
        break;
      }
      app.conectado = true;
      if (r.estado === 401) {
        sesionCaducada(r.datos.error);
        break;
      }
      if (r.estado >= 500 || r.estado === 429) break; // Se reintenta más tarde.
      app.cola.shift();
      guardado.escribir(CLAVES.cola, app.cola);
      if (r.estado === 200 || r.estado === 201) {
        enviados += 1;
        if (r.datos.incidencia) mostrarMensaje(t('guardadoConAviso', { x: delServidor(r.datos.incidencia) }), 'error', 8);
      } else {
        mostrarMensaje(t('noRegistrado', { tipo: nombreTipo(f.tipo).toLowerCase(), x: delServidor(r.datos.error) || t('errorGenerico') }), 'error', 8);
      }
    }
  } finally {
    app.enviando = false;
  }
  if (enviados) await cargar();
  else pintar();
}

// Pide la posición GPS una sola vez para el fichaje.
function ubicacion() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitud: p.coords.latitude, longitud: p.coords.longitude, precision: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

async function fichar(tipo) {
  if (app.fichando) return;
  const { estado } = situacion();
  if (!PERMITIDO[tipo].includes(estado)) return;
  const empresa = app.datos.empresa;
  const obraElegida = Number($('#obra').value) || null;

  if ((tipo === 'entrada' && empresa.obra_obligatoria) || tipo === 'cambio_obra') {
    if (!obraElegida) return mostrarMensaje(t('eligeObraAntes'));
  }
  if (tipo === 'salida' && !confirm(t('confirmarSalida'))) return;

  app.fichando = true;
  // La hora se toma al pulsar, no cuando llega el GPS.
  const hora = ahora().toISOString();
  pintar();
  mostrarMensaje(t('buscandoGps'), 'ok', 0);
  const gps = await ubicacion();
  if (!gps && empresa.gps_obligatorio) {
    mostrarMensaje(t('sinGps'), 'error', 8);
  } else {
    $('#mensaje').hidden = true;
  }

  const f = {
    uuid: nuevoUuid(),
    tipo,
    hora,
    obra_id: tipo === 'entrada' || tipo === 'cambio_obra' ? obraElegida : null,
    sin_conexion: !navigator.onLine,
    ...(gps || {}),
  };
  app.cola.push(f);
  if (!guardado.escribir(CLAVES.cola, app.cola)) {
    mostrarMensaje(t('sinAlmacen'), 'error', 0);
  }
  if (obraElegida) guardado.escribir(CLAVES.obra, obraElegida);
  app.fichando = false;
  if (gps || !empresa.gps_obligatorio) mostrarMensaje(t('registrado', { tipo: nombreTipo(tipo), hora: horaCorta(new Date(hora)) }), 'ok', 4);
  pintar();
  if (navigator.vibrate) navigator.vibrate(60);
  enviarCola();
}

// Eventos

$('#formLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const boton = form.querySelector('button');
  boton.disabled = true;
  try {
    const datos = Object.fromEntries(new FormData(form));
    const r = await pedir('/login', { metodo: 'POST', cuerpo: datos });
    if (r.estado !== 200) return mostrarMensaje(delServidor(r.datos.error) || t('noEntrar'));
    // Si entra otra persona, los pendientes de la anterior no se mezclan.
    const anterior = app.datos?.trabajador?.usuario;
    if (app.cola.length && anterior && anterior !== datos.usuario.trim().toLowerCase()) {
      return mostrarMensaje(t('pendientesOtro', { u: anterior }), 'error', 0);
    }
    app.token = r.datos.token;
    guardado.escribir(CLAVES.token, app.token);
    form.reset();
    $('#mensaje').hidden = true;
    mostrarVista('hoy');
    await cargar();
    enviarCola();
  } catch {
    mostrarMensaje(t('entrarSinRed'));
  } finally {
    boton.disabled = false;
  }
});

$$('.pulsador').forEach(b => b.addEventListener('click', () => fichar(b.dataset.tipo)));
$('#btnCambioObra').addEventListener('click', () => fichar('cambio_obra'));
$$('[data-idioma]').forEach(b => b.addEventListener('click', () => {
  idioma.cambiar(b.dataset.idioma);
  pintarReloj();
  pintar();
  if (!$('#vistaHistorial').hidden) cargarHistorial();
}));
$('#obra').addEventListener('change', pintar);
$$('#tabs button').forEach(b => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));

$('#btnSalirSesion').addEventListener('click', () => {
  if (app.cola.length) return mostrarMensaje(t('pendientesSalir'));
  if (!confirm(t('confirmarCerrar'))) return;
  Object.values(CLAVES).forEach(c => guardado.borrar(c)); // El idioma se conserva.
  location.reload();
});

window.addEventListener('online', () => { app.conectado = true; enviarCola(); cargar(); });
window.addEventListener('offline', () => { app.conectado = false; pintar(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app.token) cargar().then(enviarCola);
});

setInterval(pintarReloj, 1000);
setInterval(() => { if (app.cola.length) enviarCola(); else if (!$('#vistaHoy').hidden) pintar(); }, 30000);

// Arranque

idioma.iniciar();
pintarReloj();
const esApp = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
$('#consejoInstalar').hidden = esApp;
if (app.token) {
  mostrarVista('hoy');
  if (app.datos) pintar();
  cargar().then(enviarCola);
} else {
  mostrarVista('login');
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
