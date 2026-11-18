<p align="center"><a href="https://laravel.com" target="_blank"><img src="https://raw.githubusercontent.com/laravel/art/master/logo-lockup/5%20SVG/2%20CMYK/1%20Full%20Color/laravel-logolockup-cmyk-red.svg" width="400" alt="Laravel Logo"></a></p>

<p align="center">
<a href="https://github.com/laravel/framework/actions"><img src="https://github.com/laravel/framework/workflows/tests/badge.svg" alt="Build Status"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/dt/laravel/framework" alt="Total Downloads"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/v/laravel/framework" alt="Latest Stable Version"></a>
<a href="https://packagist.org/packages/laravel/framework"><img src="https://img.shields.io/packagist/l/laravel/framework" alt="License"></a>
</p>

## About Laravel

Laravel is a web application framework with expressive, elegant syntax. We believe development must be an enjoyable and creative experience to be truly fulfilling. Laravel takes the pain out of development by easing common tasks used in many web projects, such as:

- [Simple, fast routing engine](https://laravel.com/docs/routing).
- [Powerful dependency injection container](https://laravel.com/docs/container).
- Multiple back-ends for [session](https://laravel.com/docs/session) and [cache](https://laravel.com/docs/cache) storage.
- Expressive, intuitive [database ORM](https://laravel.com/docs/eloquent).
- Database agnostic [schema migrations](https://laravel.com/docs/migrations).
- [Robust background job processing](https://laravel.com/docs/queues).
- [Real-time event broadcasting](https://laravel.com/docs/broadcasting).

Laravel is accessible, powerful, and provides tools required for large, robust applications.

## Learning Laravel

Laravel has the most extensive and thorough [documentation](https://laravel.com/docs) and video tutorial library of all modern web application frameworks, making it a breeze to get started with the framework. You can also check out [Laravel Learn](https://laravel.com/learn), where you will be guided through building a modern Laravel application.

If you don't feel like reading, [Laracasts](https://laracasts.com) can help. Laracasts contains thousands of video tutorials on a range of topics including Laravel, modern PHP, unit testing, and JavaScript. Boost your skills by digging into our comprehensive video library.

## Laravel Sponsors

We would like to extend our thanks to the following sponsors for funding Laravel development. If you are interested in becoming a sponsor, please visit the [Laravel Partners program](https://partners.laravel.com).

### Premium Partners

- **[Vehikl](https://vehikl.com)**
- **[Tighten Co.](https://tighten.co)**
- **[Kirschbaum Development Group](https://kirschbaumdevelopment.com)**
- **[64 Robots](https://64robots.com)**
- **[Curotec](https://www.curotec.com/services/technologies/laravel)**
- **[DevSquad](https://devsquad.com/hire-laravel-developers)**
- **[Redberry](https://redberry.international/laravel-development)**
- **[Active Logic](https://activelogic.com)**

## Contributing

Thank you for considering contributing to the Laravel framework! The contribution guide can be found in the [Laravel documentation](https://laravel.com/docs/contributions).

## Code of Conduct

In order to ensure that the Laravel community is welcoming to all, please review and abide by the [Code of Conduct](https://laravel.com/docs/contributions#code-of-conduct).

## Security Vulnerabilities

If you discover a security vulnerability within Laravel, please send an e-mail to Taylor Otwell via [taylor@laravel.com](mailto:taylor@laravel.com). All security vulnerabilities will be promptly addressed.

## Manager phone notifications

Phone push notifications require HTTPS, the `push_subscriptions` database table, and VAPID credentials. Generate a key pair once with `php artisan webpush:generate-vapid`; the command prints a private key, so run it in a trusted terminal and never commit or share its output. Set both generated values and a valid `WEBPUSH_SUBJECT` (a `mailto:` address or the portal URL) in the server `.env`, then run `php artisan config:clear`. In environments with Artisan access, create the table with `php artisan migrate --force`. For Hostinger installs without migration access, run `tmp/hostinger-package/database/manual_sql/create_push_subscriptions.sql` against the application database in phpMyAdmin instead. Keep the same key pair when deploying updates.

General Managers receive approval and SMS-review alerts. CEOs see configured bank and MoMo account balances by branch on the executive dashboard; web and phone alerts are sent only when a newly received bank SMS changes an account's reported balance, not for every SMS. The portal's in-app notifications work without push credentials. Push delivery and app-icon badges depend on browser/OS support; the user must allow notifications and install the portal as an app where required.

## GTBank Gmail balance sync

GTBank reported balances are read only from Gmail notifications sent by `gh.gens@gtbank.com`; GTBank SMS alerts are ignored. Other bank SMS workflows are unchanged. The Gmail sync uses the email's Current Balance and records message IDs to prevent processing a notification twice.

Before deploying, create a Google Cloud OAuth web client with the Gmail API enabled and the `https://www.googleapis.com/auth/gmail.readonly` scope. Register this exact authorized redirect URI:

```text
https://opticplus.bealet.com/api/v1/bank-alerts/gmail/callback
```

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and `FRONTEND_URL` in the live server `.env`. Keep OAuth secrets out of this package and out of source control. The sample values are in `.env.hostinger.example`; do not upload that file over the live `.env`.

For Hostinger deployments without Artisan migration access, run `database/manual_sql/gtbank_gmail_tables.sql` against the OpticPlus database in phpMyAdmin. If Artisan migrations are available, run `php artisan migrate --force` instead. Then run `php artisan config:clear`.

The Bank Deposits page can sync manually. To keep balances updating automatically, configure a Hostinger cron job to run Laravel's `schedule:run` every minute from the application root; the scheduled Gmail poll runs every five minutes. Connect the mailbox from Bank Deposits after the deployment and database setup.

## License

The Laravel framework is open-sourced software licensed under the [MIT license](https://opensource.org/licenses/MIT).
