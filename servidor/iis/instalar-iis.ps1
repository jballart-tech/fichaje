<#
  Crea el sitio de IIS para el subdominio fitxatge de Nexa Hub.

  Uso (PowerShell como administrador, en el SRV01):
    cd C:\NexaHub\fichaje\iis
    .\instalar-iis.ps1 -Dominio fitxatge.tudominio.com
    .\instalar-iis.ps1 -Dominio fitxatge.tudominio.com -Huella <huella del certificado comodín>

  Antes hace falta:
    - IIS con los módulos URL Rewrite y Application Request Routing (ARR) instalados.
    - La API de fichaje funcionando en http://127.0.0.1:3100 (servicio FichajeNexaHub).
    - El registro DNS "fitxatge" apuntando a la IP pública del servidor.
#>
#Requires -RunAsAdministrator
param(
  [Parameter(Mandatory = $true)][string]$Dominio,
  [string]$Carpeta = 'C:\inetpub\fitxatge',
  [string]$Huella,
  [string]$Nombre = 'Fitxatge'
)

$ErrorActionPreference = 'Stop'
Import-Module WebAdministration

# 1. Comprobar módulos.
if (-not (Get-WebGlobalModule -Name 'RewriteModule' -ErrorAction SilentlyContinue)) {
  throw 'Falta URL Rewrite. Instálalo desde https://www.iis.net/downloads/microsoft/url-rewrite'
}
if (-not (Get-WebGlobalModule -Name 'ApplicationRequestRouting' -ErrorAction SilentlyContinue)) {
  throw 'Falta Application Request Routing (ARR). Instálalo desde https://www.iis.net/downloads/microsoft/application-request-routing'
}

# 2. Activar el proxy de ARR (necesario para reenviar a Node).
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'
Write-Host 'Proxy de ARR activado.'

# 3. Carpeta del sitio con el web.config.
New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'web.config') (Join-Path $Carpeta 'web.config')
Write-Host "web.config copiado a $Carpeta."

# 4. Grupo de aplicaciones sin .NET (solo hace de proxy).
if (-not (Test-Path "IIS:\AppPools\$Nombre")) {
  New-WebAppPool -Name $Nombre | Out-Null
}
Set-ItemProperty "IIS:\AppPools\$Nombre" -Name managedRuntimeVersion -Value ''

# 5. Sitio con enlace HTTP (redirige a HTTPS) y HTTPS con SNI.
if (Get-Website -Name $Nombre) {
  Write-Host "El sitio $Nombre ya existe. Se actualiza la carpeta."
  Set-ItemProperty "IIS:\Sites\$Nombre" -Name physicalPath -Value $Carpeta
} else {
  New-Website -Name $Nombre -PhysicalPath $Carpeta -HostHeader $Dominio -Port 80 -ApplicationPool $Nombre | Out-Null
  Write-Host "Sitio $Nombre creado para $Dominio."
}
if (-not (Get-WebBinding -Name $Nombre -Protocol https -HostHeader $Dominio)) {
  New-WebBinding -Name $Nombre -Protocol https -Port 443 -HostHeader $Dominio -SslFlags 1
}

# 6. Certificado.
if ($Huella) {
  $Huella = $Huella -replace '\s', ''
  if (-not (Test-Path "Cert:\LocalMachine\My\$Huella")) { throw "No encuentro el certificado $Huella en Equipo local > Personal." }
  (Get-WebBinding -Name $Nombre -Protocol https -HostHeader $Dominio).AddSslCertificate($Huella, 'My')
  Write-Host 'Certificado asignado.'
} else {
  Write-Host ''
  Write-Host 'Falta el certificado HTTPS. Dos opciones:'
  Write-Host "  a) Certificado comodín de Nexa Hub: vuelve a ejecutar con -Huella <huella>."
  Write-Host "  b) Certificado gratuito: descarga win-acme (https://www.win-acme.com), ejecuta wacs.exe y elige el sitio $Nombre."
}

Start-Website -Name $Nombre
Write-Host ''
Write-Host "Listo. Prueba desde el móvil con datos móviles: https://$Dominio"
