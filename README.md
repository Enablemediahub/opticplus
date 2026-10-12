# opticplus
A software for Optical Centers

## Local development

On macOS, install PHP 8.2+, Composer, and Node.js, then run these scripts from the project root:

```sh
./start-portal.sh
./stop-portal.sh
```

The startup script installs missing backend/frontend dependencies and creates the Laravel `.env` and application key if needed. Server output is written to `.portal-runtime/backend.log` and `.portal-runtime/frontend.log`.

On Windows, run `start-portal.ps1` and `stop-portal.ps1` from PowerShell.
