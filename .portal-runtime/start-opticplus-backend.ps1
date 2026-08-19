$ErrorActionPreference = 'Stop'
Set-Location 'C:\xampp\htdocs\opticplus\opticplus-backend'
$host.UI.RawUI.WindowTitle = 'OPTICPLUS Backend'
php artisan serve --host=127.0.0.1 --port=8000
