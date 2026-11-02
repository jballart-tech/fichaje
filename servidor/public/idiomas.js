'use strict';

// Textos de la app en catalán y castellano.
// El servidor responde en castellano y Nexa Hub guarda las incidencias en castellano.
// Aquí se traducen los mensajes del servidor que ve la persona trabajadora.

const TEXTOS = {
  es: {
    marca: 'Fichaje',
    tabHoy: 'Hoy',
    tabHistorial: 'Historial',
    entrarTitulo: 'Entrar',
    codigoEmpresa: 'Código de empresa',
    usuario: 'Usuario',
    clave: 'Clave',
    entrar: 'Entrar',
    legal: 'Tu empresa guarda la hora de cada fichaje y la ubicación GPS de ese momento para cumplir el registro de jornada. La app no sigue tu posición fuera de los fichajes.',
    instalar: 'Para usarla como app: en el iPhone toca Compartir y luego «Añadir a pantalla de inicio». En Android, menú del navegador y «Instalar app».',
    obra: 'Obra',
    eligeObra: 'Elige una obra',
    sinObra: 'Sin obra',
    cambiarObra: 'Cambiar a la obra elegida',
    hoy: 'Hoy',
    trabajado: 'Trabajado',
    pausas: 'Pausas',
    cerrarSesion: 'Cerrar sesión',
    ultimos31: 'Últimos 31 días',
    cargando: 'Cargando…',
    tipo_entrada: 'Entrada',
    tipo_pausa: 'Pausa',
    tipo_reanudar: 'Reanudar',
    tipo_cambio_obra: 'Cambio de obra',
    tipo_salida: 'Salida',
    estado_fuera: 'Fuera de jornada',
    estado_trabajando: 'Trabajando',
    estado_pausa: 'En pausa',
    pendientes1: '1 fichaje pendiente de enviar',
    pendientesN: '{n} fichajes pendientes de enviar',
    conectado: 'Conectado con Nexa Hub',
    sinConexion: 'Sin conexión',
    pendienteEnviar: 'Pendiente de enviar',
    sinFichajesHoy: 'Sin fichajes hoy.',
    historialSinRed: 'Necesitas conexión para ver el historial.',
    sinFichajesPeriodo: 'Sin fichajes en este periodo.',
    historialError: 'No se pudo cargar el historial.',
    total: 'Total {h} h',
    sinDatos: 'Sin conexión. Conéctate una vez para cargar tus datos.',
    sesionCaducada: 'La sesión ha caducado.',
    pendientesAlEntrar: 'Tus fichajes pendientes se enviarán al volver a entrar.',
    guardadoConAviso: 'Fichaje guardado con aviso: {x}',
    noRegistrado: 'No se ha registrado {tipo}: {x}',
    errorGenerico: 'error',
    eligeObraAntes: 'Elige una obra antes de fichar.',
    confirmarSalida: '¿Registrar la salida y cerrar la jornada?',
    buscandoGps: 'Obteniendo ubicación…',
    sinGps: 'Sin ubicación. El fichaje se guarda con aviso para tu empresa.',
    sinAlmacen: 'El móvil no deja guardar datos. Sal del modo privado del navegador.',
    registrado: 'Fichaje registrado: {tipo}, {hora}.',
    noEntrar: 'No se pudo entrar.',
    pendientesOtro: 'Hay fichajes pendientes de {u}. Entra primero con ese usuario para enviarlos.',
    entrarSinRed: 'Sin conexión. Necesitas internet para entrar la primera vez.',
    pendientesSalir: 'Tienes fichajes sin enviar. Conéctate antes de cerrar sesión.',
    confirmarCerrar: '¿Cerrar sesión en este móvil?',
  },
  ca: {
    marca: 'Fitxatge',
    tabHoy: 'Avui',
    tabHistorial: 'Historial',
    entrarTitulo: 'Entrar',
    codigoEmpresa: "Codi d'empresa",
    usuario: 'Usuari',
    clave: 'Clau',
    entrar: 'Entrar',
    legal: "La teva empresa guarda l'hora de cada fitxatge i la ubicació GPS d'aquell moment per complir el registre de jornada. L'app no segueix la teva posició fora dels fitxatges.",
    instalar: "Per fer-la servir com a app: a l'iPhone toca Compartir i després «Afegeix a la pantalla d'inici». A Android, menú del navegador i «Instal·la l'app».",
    obra: 'Obra',
    eligeObra: 'Tria una obra',
    sinObra: 'Sense obra',
    cambiarObra: "Canvia a l'obra triada",
    hoy: 'Avui',
    trabajado: 'Treballat',
    pausas: 'Pauses',
    cerrarSesion: 'Tanca la sessió',
    ultimos31: 'Últims 31 dies',
    cargando: 'Carregant…',
    tipo_entrada: 'Entrada',
    tipo_pausa: 'Pausa',
    tipo_reanudar: 'Reprendre',
    tipo_cambio_obra: "Canvi d'obra",
    tipo_salida: 'Sortida',
    estado_fuera: 'Fora de jornada',
    estado_trabajando: 'Treballant',
    estado_pausa: 'En pausa',
    pendientes1: '1 fitxatge pendent d\'enviar',
    pendientesN: "{n} fitxatges pendents d'enviar",
    conectado: 'Connectat amb Nexa Hub',
    sinConexion: 'Sense connexió',
    pendienteEnviar: "Pendent d'enviar",
    sinFichajesHoy: 'Cap fitxatge avui.',
    historialSinRed: "Necessites connexió per veure l'historial.",
    sinFichajesPeriodo: 'Cap fitxatge en aquest període.',
    historialError: "No s'ha pogut carregar l'historial.",
    total: 'Total {h} h',
    sinDatos: 'Sense connexió. Connecta\'t un cop per carregar les teves dades.',
    sesionCaducada: 'La sessió ha caducat.',
    pendientesAlEntrar: "Els fitxatges pendents s'enviaran quan tornis a entrar.",
    guardadoConAviso: 'Fitxatge desat amb avís: {x}',
    noRegistrado: "No s'ha registrat {tipo}: {x}",
    errorGenerico: 'error',
    eligeObraAntes: 'Tria una obra abans de fitxar.',
    confirmarSalida: 'Vols registrar la sortida i tancar la jornada?',
    buscandoGps: 'Obtenint la ubicació…',
    sinGps: "Sense ubicació. El fitxatge es desa amb un avís per a l'empresa.",
    sinAlmacen: 'El mòbil no deixa desar dades. Surt del mode privat del navegador.',
    registrado: 'Fitxatge registrat: {tipo}, {hora}.',
    noEntrar: "No s'ha pogut entrar.",
    pendientesOtro: "Hi ha fitxatges pendents de {u}. Entra primer amb aquest usuari per enviar-los.",
    entrarSinRed: 'Sense connexió. Necessites internet per entrar la primera vegada.',
    pendientesSalir: "Tens fitxatges sense enviar. Connecta't abans de tancar la sessió.",
    confirmarCerrar: 'Vols tancar la sessió en aquest mòbil?',
  },
};

// Mensajes del servidor (en castellano) traducidos al catalán.
const SERVIDOR_CA = {
  'Inicia sesión': 'Inicia la sessió',
  'La sesión ha caducado. Vuelve a entrar': 'La sessió ha caducat. Torna a entrar',
  'Tu acceso ya no es válido. Habla con tu empresa': "El teu accés ja no és vàlid. Parla amb la teva empresa",
  'Empresa, usuario o clave incorrectos': 'Empresa, usuari o clau incorrectes',
  'Demasiados intentos. Espera 15 minutos': 'Massa intents. Espera 15 minuts',
  'Tipo de fichaje no válido': 'Tipus de fitxatge no vàlid',
  'Identificador de fichaje no válido': 'Identificador de fitxatge no vàlid',
  'La obra no existe o está cerrada': "L'obra no existeix o està tancada",
  'Elige una obra': 'Tria una obra',
  'Fichaje duplicado': 'Fitxatge duplicat',
  'Error del servidor. Inténtalo de nuevo': 'Error del servidor. Torna-ho a provar',
  'Datos mal formados': 'Dades mal formades',
  'Falta el código de empresa': "Falta el codi d'empresa",
  'Falta el usuario': "Falta l'usuari",
  'Falta la clave': 'Falta la clau',
  'El código de empresa solo admite letras sin acentos, números, guion y guion bajo': "El codi d'empresa només admet lletres sense accents, números, guió i guió baix",
  'El usuario solo admite letras sin acentos, números, punto, guion y guion bajo': "L'usuari només admet lletres sense accents, números, punt, guió i guió baix",
  'Sin ubicación': 'Sense ubicació',
  'Hora del móvil adelantada; se usa la del servidor': 'Hora del mòbil avançada; es fa servir la del servidor',
  'Obra no válida': 'Obra no vàlida',
  'Sin obra': 'Sense obra',
};
const ESTADO_SERVIDOR = { 'fuera de jornada': 'fuera', trabajando: 'trabajando', 'en pausa': 'pausa' };

const idioma = {
  actual: 'es',

  iniciar() {
    let guardado = null;
    try { guardado = localStorage.getItem('fx.idioma'); } catch { /* sin almacenamiento */ }
    const delMovil = (navigator.languages || [navigator.language || 'es']).some(l => /^ca\b/i.test(l)) ? 'ca' : 'es';
    this.actual = TEXTOS[guardado] ? guardado : delMovil;
    this.aplicar();
  },

  cambiar(nuevo) {
    if (!TEXTOS[nuevo]) return;
    this.actual = nuevo;
    try { localStorage.setItem('fx.idioma', nuevo); } catch { /* sin almacenamiento */ }
    this.aplicar();
  },

  // Texto con parámetros: t('total', { h: '8:00' }).
  t(clave, parametros = {}) {
    const texto = TEXTOS[this.actual][clave] ?? TEXTOS.es[clave] ?? clave;
    return texto.replace(/\{(\w+)\}/g, (_, k) => parametros[k] ?? '');
  },

  locale() {
    return this.actual === 'ca' ? 'ca-ES' : 'es-ES';
  },

  // Traduce un mensaje del servidor. Las incidencias pueden venir unidas por ". ".
  servidor(mensaje) {
    if (!mensaje) return '';
    return String(mensaje).split('. ').map(parte => this.frase(parte.replace(/\.$/, ''))).join('. ');
  },

  frase(texto) {
    const rechazo = texto.match(/^No se puede fichar "(\w+)" estando (.+)$/);
    if (rechazo) {
      const tipo = this.t(`tipo_${rechazo[1]}`).toLowerCase();
      const estado = this.t(`estado_${ESTADO_SERVIDOR[rechazo[2]] || 'fuera'}`).toLowerCase();
      return this.actual === 'ca' ? `No es pot fitxar «${tipo}» estant ${estado}` : `No se puede fichar «${tipo}» estando ${estado}`;
    }
    if (this.actual !== 'ca') return texto;
    const retraso = texto.match(/^Enviado con (\d+) h de retraso$/);
    if (retraso) return `Enviat amb ${retraso[1]} h de retard`;
    return SERVIDOR_CA[texto] || texto;
  },

  // Textos fijos del HTML marcados con data-t.
  aplicar() {
    document.documentElement.lang = this.actual;
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = this.t(el.dataset.t); });
    document.querySelectorAll('[data-idioma]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.idioma === this.actual)));
    document.title = `${this.t('marca')} Nexa Hub`;
  },
};
