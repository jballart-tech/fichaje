-- Usuario SQL propio para la API de fichaje, con permisos solo sobre el esquema fichaje.
-- Ejecútalo en SSMS conectado a la base de datos de Nexa Hub. Cambia la clave antes.

USE master;
GO
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'fichaje_app')
    CREATE LOGIN fichaje_app WITH PASSWORD = 'CAMBIA_ESTA_CLAVE_larga_y_segura_2026', CHECK_POLICY = ON;
GO

USE NexaHub;  -- Cambia por el nombre real de la base de datos de Nexa Hub.
GO
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'fichaje_app')
    CREATE USER fichaje_app FOR LOGIN fichaje_app;
GO
GRANT SELECT, INSERT, UPDATE ON SCHEMA::fichaje TO fichaje_app;
GO
-- Para que "npm run instalar-bd" pueda crear las tablas la primera vez.
-- Quita este permiso después de instalar si quieres dejarlo al mínimo.
GRANT CREATE TABLE, CREATE VIEW TO fichaje_app;
GRANT ALTER ON SCHEMA::fichaje TO fichaje_app;
GO
