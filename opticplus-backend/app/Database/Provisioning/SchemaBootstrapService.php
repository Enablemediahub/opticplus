<?php

namespace App\Database\Provisioning;

use Illuminate\Contracts\Foundation\Application;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * Ensures Opticplus legacy + app-specific tables exist (import-friendly).
 * Driven by database/schema/generated_schema_manifest.php (+ opticplus_full_schema.mysql.sql dump).
 */
final class SchemaBootstrapService
{
    public function __construct(private Application $app) {}

    /**
     * @param  bool  $fromConsole When true, runs even under Artisan (e.g. opticplus:ensure-schema).
     */
    public function ensure(bool $fromConsole = false): void
    {
        if ($this->app->environment('testing')) {
            return;
        }

        if ($this->app->runningInConsole() && ! $fromConsole) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

        $manifestPath = database_path('schema/generated_schema_manifest.php');
        if (! is_file($manifestPath)) {
            Log::warning('Opticplus schema manifest missing; skipped auto-provision.', ['path' => $manifestPath]);

            return;
        }

        /** @var array{tables: list<array{name:string, create:string, post:list<string>}>, foreign_keys: list<string>, extra_tables: list<array{name:string, create:string, post:list<string>}>} $manifest */
        $manifest = require $manifestPath;

        try {
            Schema::getConnection()->statement('SET FOREIGN_KEY_CHECKS=0');
            foreach ($manifest['tables'] as $entry) {
                $this->ensureTable($entry['name'], $entry['create'], $entry['post']);
            }
            foreach ($manifest['extra_tables'] as $entry) {
                $this->ensureTable($entry['name'], $entry['create'], $entry['post']);
            }
            foreach ($manifest['foreign_keys'] as $sql) {
                $this->runStatement($sql, 'foreign key');
            }
        } catch (\Throwable $exception) {
            Log::warning('Opticplus schema bootstrap failed.', [
                'message' => $exception->getMessage(),
            ]);
        } finally {
            try {
                Schema::getConnection()->statement('SET FOREIGN_KEY_CHECKS=1');
            } catch (\Throwable) {
                // ignore
            }
        }
    }

    /**
     * @param  list<string>  $postStatements
     */
    private function ensureTable(string $name, string $createSql, array $postStatements): void
    {
        if (Schema::hasTable($name)) {
            return;
        }

        $this->runStatement($createSql, "create {$name}");

        foreach ($postStatements as $sql) {
            $this->runStatement($sql, "alter {$name}");
        }
    }

    private function runStatement(string $sql, string $context): void
    {
        $sql = trim($sql);
        if ($sql === '') {
            return;
        }

        try {
            DB::unprepared($sql);
        } catch (\Throwable $exception) {
            Log::notice('Opticplus schema bootstrap step skipped.', [
                'context' => $context,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
