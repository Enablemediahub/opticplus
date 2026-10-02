$ErrorActionPreference = 'Stop'
Set-Location 'C:\xampp\htdocs\opticplus\opticplus-frontend'
$host.UI.RawUI.WindowTitle = 'OPTICPLUS Frontend'
npm.cmd run dev -- --host 127.0.0.1 --port 5173
