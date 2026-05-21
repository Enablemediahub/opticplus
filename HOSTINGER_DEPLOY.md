# Hostinger Premium Deployment

This project can be deployed to `opticplus.bealet.com` on Hostinger Premium without breaking local development.

## Local Development

Local development still works after these changes.

- `opticplus-frontend/.env.development` keeps the frontend talking to `http://127.0.0.1:8000/api/v1`
- `opticplus-frontend/.env.production` switches production builds to `/api/v1`
- `start-portal.ps1` still runs the same local frontend and backend pair

## Production Shape

Use one subdomain:

- frontend: `https://opticplus.bealet.com/`
- api: `https://opticplus.bealet.com/api/v1`

The subdomain should point to the Laravel public folder, not to the React `dist` folder by itself.

## Build Package

Run this from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-hostinger-package.ps1
```

That script:

- builds the React frontend
- creates `tmp/hostinger-package`
- copies the Laravel app there
- places the built frontend files into `tmp/hostinger-package/public`
- removes the local backend `.env` from the package
- writes a production starter file to `tmp/hostinger-package/.env.hostinger.example`

## Hostinger Upload Layout

After running the build script, upload the package so the subdomain uses:

- application root: the uploaded package folder contents
- document root: `public`

Important:

- `public/index.php` and `public/.htaccess` must stay in place for Laravel
- the built React files should live in the same `public` folder
- do not upload only the React `dist` folder, because the API and database-backed features still require Laravel

## Hostinger Environment

Create the uploaded Laravel `.env` from `.env.hostinger.example`, then set the real values for production:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://opticplus.bealet.com
SESSION_DOMAIN=opticplus.bealet.com
```

Also set your real Hostinger MySQL values:

```env
DB_HOST=...
DB_PORT=3306
DB_DATABASE=...
DB_USERNAME=...
DB_PASSWORD=...
```

## After Upload

Run these in the uploaded Laravel app if your Hostinger plan allows terminal access:

```powershell
php artisan config:clear
php artisan cache:clear
php artisan migrate --force
```

If terminal access is limited, make sure the database is imported first and that the `.env` file is correct before opening the site.

## Notes

- The frontend now uses a relative production API path, so it will call the same domain automatically.
- Local editing remains safe because Vite uses `.env.development` while production builds use `.env.production`.
- Never upload the local XAMPP `.env` to Hostinger. It points to `127.0.0.1`, local MySQL credentials, and local debug settings, which will break the hosted API.
