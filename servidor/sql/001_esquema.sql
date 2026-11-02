-- Esquema de fichaje para Nexa Hub (SQL Server 2016 o superior).
-- Se puede ejecutar varias veces: solo crea lo que falta.

IF SCHEMA_ID('fichaje') IS NULL
    EXEC('CREATE SCHEMA fichaje');
GO

IF OBJECT_ID('fichaje.empresas') IS NULL
CREATE TABLE fichaje.empresas (
    id               INT IDENTITY(1,1) PRIMARY KEY,
    codigo           NVARCHAR(20)  NOT NULL CONSTRAINT uq_empresas_codigo UNIQUE,
    nombre           NVARCHAR(150) NOT NULL,
    cif              NVARCHAR(20)  NULL,
    activa           BIT           NOT NULL CONSTRAINT df_empresas_activa DEFAULT 1,
    gps_obligatorio  BIT           NOT NULL CONSTRAINT df_empresas_gps DEFAULT 1,
    obra_obligatoria BIT           NOT NULL CONSTRAINT df_empresas_obra DEFAULT 0,
    creado_en        DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_empresas_creado DEFAULT SYSDATETIMEOFFSET()
);
GO

IF OBJECT_ID('fichaje.trabajadores') IS NULL
CREATE TABLE fichaje.trabajadores (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    empresa_id     INT           NOT NULL CONSTRAINT fk_trabajadores_empresa REFERENCES fichaje.empresas(id),
    usuario        NVARCHAR(50)  NOT NULL,
    nombre         NVARCHAR(150) NOT NULL,
    dni            NVARCHAR(20)  NULL,
    clave_hash     NVARCHAR(100) NOT NULL,
    activo         BIT           NOT NULL CONSTRAINT df_trabajadores_activo DEFAULT 1,
    -- Sube al cambiar la clave o dar de baja: invalida las sesiones abiertas.
    version_sesion INT           NOT NULL CONSTRAINT df_trabajadores_version DEFAULT 1,
    ultimo_acceso  DATETIMEOFFSET(0) NULL,
    creado_en      DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_trabajadores_creado DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT uq_trabajadores_usuario UNIQUE (empresa_id, usuario)
);
GO

IF OBJECT_ID('fichaje.obras') IS NULL
CREATE TABLE fichaje.obras (
    id         INT IDENTITY(1,1) PRIMARY KEY,
    empresa_id INT           NOT NULL CONSTRAINT fk_obras_empresa REFERENCES fichaje.empresas(id),
    codigo     NVARCHAR(30)  NOT NULL,
    nombre     NVARCHAR(150) NOT NULL,
    cliente    NVARCHAR(150) NULL,
    direccion  NVARCHAR(250) NULL,
    activa     BIT           NOT NULL CONSTRAINT df_obras_activa DEFAULT 1,
    creado_en  DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_obras_creado DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT uq_obras_codigo UNIQUE (empresa_id, codigo)
);
GO

IF OBJECT_ID('fichaje.fichajes') IS NULL
CREATE TABLE fichaje.fichajes (
    id              BIGINT IDENTITY(1,1) PRIMARY KEY,
    -- Lo genera el móvil. Evita duplicados si un envío se repite.
    uuid            UNIQUEIDENTIFIER NOT NULL CONSTRAINT uq_fichajes_uuid UNIQUE,
    empresa_id      INT           NOT NULL CONSTRAINT fk_fichajes_empresa REFERENCES fichaje.empresas(id),
    trabajador_id   INT           NOT NULL CONSTRAINT fk_fichajes_trabajador REFERENCES fichaje.trabajadores(id),
    obra_id         INT           NULL     CONSTRAINT fk_fichajes_obra REFERENCES fichaje.obras(id),
    tipo            NVARCHAR(12)  NOT NULL CONSTRAINT ck_fichajes_tipo
                        CHECK (tipo IN ('entrada', 'pausa', 'reanudar', 'cambio_obra', 'salida')),
    -- Momento del fichaje según el móvil (corregido con la hora del servidor).
    hora_fichaje    DATETIMEOFFSET(0) NOT NULL,
    -- Momento en que el servidor lo recibió.
    hora_recepcion  DATETIMEOFFSET(0) NOT NULL CONSTRAINT df_fichajes_recepcion DEFAULT SYSDATETIMEOFFSET(),
    sin_conexion    BIT           NOT NULL CONSTRAINT df_fichajes_sinconexion DEFAULT 0,
    latitud         DECIMAL(9,6)  NULL,
    longitud        DECIMAL(9,6)  NULL,
    precision_m     INT           NULL,
    nota            NVARCHAR(250) NULL,
    -- Avisos para revisar desde Nexa Hub (secuencia rara, sin ubicación, etc.).
    incidencia      NVARCHAR(250) NULL,
    dispositivo     NVARCHAR(250) NULL,
    ip              NVARCHAR(45)  NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_fichajes_trabajador_hora')
    CREATE INDEX ix_fichajes_trabajador_hora ON fichaje.fichajes (trabajador_id, hora_fichaje);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_fichajes_empresa_hora')
    CREATE INDEX ix_fichajes_empresa_hora ON fichaje.fichajes (empresa_id, hora_fichaje);
GO

-- El registro de jornada no se puede modificar ni borrar.
-- Las correcciones irán en una tabla aparte, conservando el original.
CREATE OR ALTER TRIGGER fichaje.tr_fichajes_inalterable
ON fichaje.fichajes
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    THROW 51000, 'Los fichajes no se pueden modificar ni borrar.', 1;
END;
GO

-- Vista de consulta para Nexa Hub: fichajes con nombres de empresa, trabajador y obra.
CREATE OR ALTER VIEW fichaje.v_fichajes AS
SELECT f.id, f.uuid, f.tipo, f.hora_fichaje, f.hora_recepcion, f.sin_conexion,
       f.latitud, f.longitud, f.precision_m, f.nota, f.incidencia,
       e.id AS empresa_id, e.codigo AS empresa_codigo, e.nombre AS empresa,
       t.id AS trabajador_id, t.usuario, t.nombre AS trabajador,
       o.id AS obra_id, o.codigo AS obra_codigo, o.nombre AS obra, o.cliente
FROM fichaje.fichajes f
JOIN fichaje.empresas e ON e.id = f.empresa_id
JOIN fichaje.trabajadores t ON t.id = f.trabajador_id
LEFT JOIN fichaje.obras o ON o.id = f.obra_id;
GO
