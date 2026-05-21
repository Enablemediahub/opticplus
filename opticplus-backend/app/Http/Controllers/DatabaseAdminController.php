<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class DatabaseAdminController extends Controller
{
    private const PREFERRED_TABLES = [
        'patient_records',
        'billing',
        'users',
        'products',
        'customers',
        'sales',
        'expenses',
    ];

    private const EXCLUDED_TABLES = [
        'cache',
        'cache_locks',
        'failed_jobs',
        'job_batches',
        'jobs',
        'migrations',
        'password_reset_tokens',
        'personal_access_tokens',
        'sessions',
    ];

    private array $tableMetadataCache = [];
    private ?array $tableSummaryCache = null;

    public function meta(Request $request): JsonResponse
    {
        if ($response = $this->ensureGeneralManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);

        return response()->json([
            'database_name' => config('database.connections.mysql.database') ?: DB::getDatabaseName(),
            'branch_id' => $branchId,
            'branch_name' => $branchId === 0 ? 'Merged View' : $this->branchName($branchId),
            'can_write' => true,
            'table_search' => '',
            'search' => '',
            'selected_table' => '',
            'tables' => [],
            'stats' => [
                'table_count' => 0,
                'row_count' => 0,
                'column_count' => 0,
                'writable' => true,
            ],
        ]);
    }

    public function tables(Request $request): JsonResponse
    {
        if ($response = $this->ensureGeneralManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $tableSearch = trim($request->string('table_search')->toString());
        $selectedTable = trim($request->string('table')->toString());
        $tables = $this->listAccessibleTablesLight($tableSearch);
        $selectedTable = $this->resolveSelectedTable($selectedTable, $tables);

        return response()->json([
            'database_name' => config('database.connections.mysql.database') ?: DB::getDatabaseName(),
            'branch_id' => $branchId,
            'branch_name' => $branchId === 0 ? 'Merged View' : $this->branchName($branchId),
            'can_write' => true,
            'table_search' => $tableSearch,
            'selected_table' => $selectedTable,
            'tables' => $tables,
            'stats' => [
                'table_count' => count($tables),
                'row_count' => 0,
                'column_count' => 0,
                'writable' => true,
            ],
        ]);
    }

    public function table(Request $request): JsonResponse
    {
        if ($response = $this->ensureGeneralManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $page = max((int) $request->integer('page', 1), 1);
        $perPage = min(max((int) $request->integer('per_page', 25), 10), 100);
        $search = trim($request->string('search')->toString());
        $tableSearch = trim($request->string('table_search')->toString());
        $selectedTable = trim($request->string('table')->toString());

        $tables = $this->listAccessibleTablesLight($tableSearch);
        $selectedTable = $this->resolveSelectedTable($selectedTable, $tables);

        if ($selectedTable === '') {
            return response()->json([
                'message' => 'No database table is available for the current branch selection.',
            ], 404);
        }

        $tablePayload = $this->buildTablePayload($selectedTable, $branchId, $search, $page, $perPage);

        return response()->json([
            'database_name' => DB::getDatabaseName(),
            'branch_id' => $branchId,
            'branch_name' => $branchId === 0 ? 'Merged View' : $this->branchName($branchId),
            'can_write' => true,
            'table_search' => $tableSearch,
            'search' => $search,
            'selected_table' => $selectedTable,
            'tables' => $tables,
            'stats' => [
                'table_count' => count($tables),
                'row_count' => $tablePayload['pagination']['total'] ?? 0,
                'column_count' => count($tablePayload['schema']['columns'] ?? []),
                'writable' => $tablePayload['schema']['writable'] ?? false,
            ],
            'table' => $tablePayload,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        return $request->boolean('load_table', false)
            ? $this->table($request)
            : $this->meta($request);
    }

    public function duplicates(Request $request, string $table): JsonResponse
    {
        if ($response = $this->ensureGeneralManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $metadata = $this->getValidatedTableMetadata($table);
        if (! $metadata) {
            return response()->json(['message' => 'The selected table is not available in the database workspace.'], 404);
        }

        $candidateColumns = $this->duplicateCandidateColumns($metadata);
        if ($candidateColumns === []) {
            return response()->json([
                'table' => $metadata['name'],
                'label' => $metadata['label'],
                'branch_id' => $branchId,
                'branch_name' => $branchId === 0 ? 'Merged View' : $this->branchName($branchId),
                'selected_column' => null,
                'available_columns' => [],
                'duplicate_groups' => [],
                'summary' => [
                    'group_count' => 0,
                    'row_count' => 0,
                ],
                'message' => 'No likely duplicate-check columns were detected for this table yet.',
            ]);
        }

        $requestedColumn = trim($request->string('column')->toString());
        $selectedColumn = $candidateColumns[0]['name'];

        foreach ($candidateColumns as $candidateColumn) {
            if ($candidateColumn['name'] === $requestedColumn) {
                $selectedColumn = $requestedColumn;
                break;
            }
        }

        $duplicateGroups = $this->duplicateGroups($metadata, $branchId, $selectedColumn);
        $rowsAffected = array_sum(array_map(
            static fn (array $group): int => (int) ($group['count'] ?? 0),
            $duplicateGroups
        ));

        return response()->json([
            'table' => $metadata['name'],
            'label' => $metadata['label'],
            'branch_id' => $branchId,
            'branch_name' => $branchId === 0 ? 'Merged View' : $this->branchName($branchId),
            'selected_column' => $selectedColumn,
            'available_columns' => $candidateColumns,
            'duplicate_groups' => $duplicateGroups,
            'summary' => [
                'group_count' => count($duplicateGroups),
                'row_count' => $rowsAffected,
            ],
        ]);
    }

    public function show(Request $request, string $table, string $recordId): JsonResponse
    {
        if ($response = $this->ensureGeneralManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $metadata = $this->getValidatedTableMetadata($table);
        if (! $metadata) {
            return response()->json(['message' => 'The selected table is not available in the database workspace.'], 404);
        }

        $record = $this->findRecord($metadata, $recordId, $branchId);
        if (! $record) {
            return response()->json(['message' => 'The selected row could not be found in this branch view.'], 404);
        }

        return response()->json([
            'table' => $metadata['name'],
            'schema' => $this->serializeSchema($metadata),
            'record' => $record,
            'linked_counts' => $this->linkedCounts($metadata, $record, $branchId),
            'can_write' => $metadata['writable'],
        ]);
    }

    public function update(Request $request, string $table, string $recordId): JsonResponse
    {
        if ($response = $this->ensureGeneralManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $metadata = $this->getValidatedTableMetadata($table);
        if (! $metadata || ! $metadata['writable']) {
            return response()->json(['message' => 'This table is read-only in the database workspace.'], 422);
        }

        $record = $this->findRecord($metadata, $recordId, $branchId);
        if (! $record) {
            return response()->json(['message' => 'The selected row could not be found in this branch view.'], 404);
        }

        $payload = $this->buildUpdatePayload($request, $metadata, $record);
        if (array_key_exists('_error', $payload)) {
            return response()->json(['message' => $payload['_error']], 422);
        }

        if ($metadata['name'] === 'billing') {
            $payload = $this->applyBillingRecalculation($payload, $record);
        }

        if ($metadata['name'] === 'patient_records') {
            $payload['name'] = trim(implode(' ', array_filter([
                $payload['surname'] ?? $record->surname ?? null,
                $payload['firstname'] ?? $record->firstname ?? null,
                $payload['othernames'] ?? $record->othernames ?? null,
            ])));
        }

        DB::table($metadata['name'])
            ->where($metadata['primary_key'], $record->{$metadata['primary_key']})
            ->when(
                $branchId !== 0 && $metadata['has_branch_id'],
                fn ($query) => $query->where('branch_id', $branchId)
            )
            ->update($payload);

        return response()->json([
            'message' => sprintf('%s row updated successfully.', $metadata['label']),
            'record' => $this->findRecord($metadata, $recordId, $branchId),
        ]);
    }

    public function destroy(Request $request, string $table, string $recordId): JsonResponse
    {
        if ($response = $this->ensureGeneralManager($request)) {
            return $response;
        }

        $branchId = $this->resolveBranchId($request);
        $metadata = $this->getValidatedTableMetadata($table);
        if (! $metadata || ! $metadata['writable']) {
            return response()->json(['message' => 'This table is read-only in the database workspace.'], 422);
        }

        $record = $this->findRecord($metadata, $recordId, $branchId);
        if (! $record) {
            return response()->json(['message' => 'The selected row could not be found in this branch view.'], 404);
        }

        $linkedCounts = $this->linkedCounts($metadata, $record, $branchId);
        $deleteMode = $this->resolveDeleteMode($request);
        $selectedLinkedTables = $this->resolveSelectedLinkedTables($request, $linkedCounts);

        try {
            DB::transaction(function () use ($metadata, $record, $branchId, $deleteMode, $selectedLinkedTables): void {
                if ($deleteMode === 'entry_only') {
                    $this->deleteOnlyEntry($metadata, $record, $branchId);
                    return;
                }

                if ($deleteMode === 'selected_links') {
                    $this->deleteWithSelectedLinks($metadata, $record, $branchId, $selectedLinkedTables);
                    return;
                }

                if ($metadata['name'] === 'billing') {
                    $this->deleteBillingCascade($branchId, (int) $record->id);
                    return;
                }

                if ($metadata['name'] === 'patient_records') {
                    $this->deletePatientCascade($branchId, $record);
                    return;
                }

                $visited = [];
                $this->deleteGenericCascade($metadata, $record, $branchId, $visited);
            });
        } catch (\Throwable $exception) {
            return response()->json([
                'message' => $deleteMode === 'entry_only'
                    ? 'This entry could not be deleted by itself. Remove linked records first or choose linked deletion.'
                    : 'The selected delete option could not be completed. Check linked records and try again.',
                'error' => $exception->getMessage(),
            ], 422);
        }

        return response()->json([
            'message' => $this->deleteSuccessMessage($metadata['label'], $deleteMode),
            'deleted_links' => $linkedCounts,
            'delete_mode' => $deleteMode,
        ]);
    }

    private function buildTablePayload(string $table, int $branchId, string $search, int $page, int $perPage): array
    {
        $metadata = $this->getTableMetadata($table);
        $query = DB::table($table);

        if ($branchId !== 0 && $metadata['has_branch_id']) {
            $query->where('branch_id', $branchId);
        }

        if ($search !== '' && $metadata['searchable_columns'] !== []) {
            $like = '%'.$search.'%';
            $searchableColumns = array_slice($metadata['searchable_columns'], 0, 8);
            $query->where(function ($inner) use ($searchableColumns, $like): void {
                foreach ($searchableColumns as $index => $column) {
                    if ($index === 0) {
                        $inner->where($column, 'like', $like);
                    } else {
                        $inner->orWhere($column, 'like', $like);
                    }
                }
            });
        }

        $total = (clone $query)->count();
        $offset = ($page - 1) * $perPage;
        $sortColumn = $metadata['default_sort'];

        $records = (clone $query)
            ->orderByDesc($sortColumn)
            ->offset($offset)
            ->limit($perPage)
            ->get($metadata['column_names']);

        return [
            'name' => $metadata['name'],
            'label' => $metadata['label'],
            'search_hint' => $metadata['searchable_columns'] !== []
                ? 'Search '.implode(', ', array_slice($metadata['searchable_columns'], 0, 4))
                : 'Search is not available for this table',
            'schema' => $this->serializeSchema($metadata),
            'records' => $records,
            'pagination' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $total,
                'total_pages' => max((int) ceil(max($total, 1) / $perPage), 1),
            ],
            'notices' => $this->tableNotices($metadata, $branchId),
        ];
    }

    private function listAccessibleTables(int $branchId, string $tableSearch): array
    {
        $summaries = $this->tableSummaries();
        $tables = [];

        foreach (DB::select('SHOW TABLE STATUS') as $row) {
            $name = $row->Name ?? null;
            if (! $name || in_array($name, self::EXCLUDED_TABLES, true)) {
                continue;
            }

            if ($tableSearch !== '' && stripos($name, $tableSearch) === false) {
                continue;
            }

            $summary = $summaries[$name] ?? [
                'has_branch_id' => false,
                'primary_key' => null,
                'writable' => false,
            ];
            $estimatedRows = isset($row->Rows) ? (int) $row->Rows : 0;

            $tables[] = [
                'name' => $name,
                'label' => ucwords(str_replace('_', ' ', $name)),
                'row_count' => $estimatedRows,
                'has_branch_id' => $summary['has_branch_id'],
                'writable' => $summary['writable'],
                'primary_key' => $summary['primary_key'],
            ];
        }

        usort($tables, fn ($left, $right) => strcmp($left['name'], $right['name']));

        return $tables;
    }

    private function listAccessibleTablesLight(string $tableSearch): array
    {
        $tables = [];

        foreach (DB::select('SHOW TABLES') as $row) {
            $values = array_values((array) $row);
            $name = isset($values[0]) ? (string) $values[0] : '';

            if ($name === '' || in_array($name, self::EXCLUDED_TABLES, true)) {
                continue;
            }

            if ($tableSearch !== '' && stripos($name, $tableSearch) === false) {
                continue;
            }

            $tables[] = [
                'name' => $name,
                'label' => ucwords(str_replace('_', ' ', $name)),
                'row_count' => '--',
                'has_branch_id' => null,
                'writable' => true,
                'primary_key' => null,
            ];
        }

        usort($tables, fn ($left, $right) => strcmp($left['name'], $right['name']));

        return $tables;
    }

    private function tableSummaries(): array
    {
        if ($this->tableSummaryCache !== null) {
            return $this->tableSummaryCache;
        }

        $databaseName = DB::getDatabaseName();
        $summaries = [];

        foreach (DB::select(
            "SELECT
                TABLE_NAME,
                MAX(CASE WHEN COLUMN_NAME = 'branch_id' THEN 1 ELSE 0 END) AS has_branch_id,
                SUM(CASE WHEN COLUMN_KEY = 'PRI' THEN 1 ELSE 0 END) AS primary_key_count,
                MIN(CASE WHEN COLUMN_KEY = 'PRI' THEN COLUMN_NAME ELSE NULL END) AS primary_key_name
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ?
             GROUP BY TABLE_NAME",
            [$databaseName]
        ) as $row) {
            $tableName = (string) $row->TABLE_NAME;
            $primaryKeyCount = (int) $row->primary_key_count;

            $summaries[$tableName] = [
                'has_branch_id' => (int) $row->has_branch_id === 1,
                'primary_key' => $primaryKeyCount === 1 ? (string) $row->primary_key_name : null,
                'writable' => $primaryKeyCount === 1,
            ];
        }

        $this->tableSummaryCache = $summaries;

        return $summaries;
    }

    private function resolveSelectedTable(string $selectedTable, array $tables): string
    {
        if ($selectedTable !== '') {
            foreach ($tables as $table) {
                if ($table['name'] === $selectedTable) {
                    return $selectedTable;
                }
            }
        }

        foreach (self::PREFERRED_TABLES as $preferredTable) {
            foreach ($tables as $table) {
                if ($table['name'] === $preferredTable) {
                    return $table['name'];
                }
            }
        }

        foreach ($tables as $table) {
            if (($table['row_count'] ?? 0) > 0) {
                return $table['name'];
            }
        }

        return $tables[0]['name'] ?? '';
    }

    private function getValidatedTableMetadata(string $table): ?array
    {
        if ($table === '' || in_array($table, self::EXCLUDED_TABLES, true) || ! $this->tableExists($table)) {
            return null;
        }

        return $this->getTableMetadata($table);
    }

    private function getTableMetadata(string $table): array
    {
        if (isset($this->tableMetadataCache[$table])) {
            return $this->tableMetadataCache[$table];
        }

        $columns = [];
        $primaryKeyColumns = [];
        $searchableColumns = [];

        foreach (DB::select(sprintf('SHOW FULL COLUMNS FROM `%s`', str_replace('`', '``', $table))) as $column) {
            $field = (string) $column->Field;
            $type = (string) $column->Type;
            $inputType = $this->resolveInputType($type);
            $editable = ! str_contains((string) $column->Extra, 'auto_increment');

            $columns[] = [
                'name' => $field,
                'type' => $type,
                'nullable' => strtoupper((string) $column->Null) === 'YES',
                'key' => (string) $column->Key,
                'default' => $column->Default,
                'extra' => (string) $column->Extra,
                'comment' => (string) ($column->Comment ?? ''),
                'input' => $inputType,
                'options' => $inputType === 'select' ? $this->parseEnumOptions($type) : [],
                'editable' => $editable,
            ];

            if ((string) $column->Key === 'PRI') {
                $primaryKeyColumns[] = $field;
            }

            if ($this->isSearchableType($type)) {
                $searchableColumns[] = $field;
            }
        }

        $primaryKey = count($primaryKeyColumns) === 1 ? $primaryKeyColumns[0] : null;
        $columnNames = array_map(fn ($column) => $column['name'], $columns);
        $defaultSort = in_array('updated_at', $columnNames, true)
            ? 'updated_at'
            : (in_array('created_at', $columnNames, true)
                ? 'created_at'
                : ($primaryKey ?? $columnNames[0]));

        $metadata = [
            'name' => $table,
            'label' => ucwords(str_replace('_', ' ', $table)),
            'columns' => $columns,
            'column_names' => $columnNames,
            'primary_key' => $primaryKey,
            'primary_key_columns' => $primaryKeyColumns,
            'has_branch_id' => in_array('branch_id', $columnNames, true),
            'searchable_columns' => $searchableColumns,
            'default_sort' => $defaultSort,
            'writable' => $primaryKey !== null,
        ];

        $this->tableMetadataCache[$table] = $metadata;

        return $metadata;
    }

    private function serializeSchema(array $metadata): array
    {
        return [
            'name' => $metadata['name'],
            'label' => $metadata['label'],
            'primary_key' => $metadata['primary_key'],
            'primary_key_columns' => $metadata['primary_key_columns'],
            'has_branch_id' => $metadata['has_branch_id'],
            'writable' => $metadata['writable'],
            'columns' => $metadata['columns'],
        ];
    }

    private function duplicateCandidateColumns(array $metadata): array
    {
        $candidates = [];

        foreach ($metadata['columns'] as $column) {
            $name = $column['name'];

            if ($name === $metadata['primary_key'] || $name === 'branch_id') {
                continue;
            }

            $score = $this->duplicateCandidateScore($column);
            if ($score <= 0) {
                continue;
            }

            $candidates[] = [
                'name' => $name,
                'label' => ucwords(str_replace('_', ' ', $name)),
                'score' => $score,
            ];
        }

        usort($candidates, static function (array $left, array $right): int {
            if ($left['score'] === $right['score']) {
                return strcmp($left['name'], $right['name']);
            }

            return $right['score'] <=> $left['score'];
        });

        return array_map(static function (array $candidate): array {
            unset($candidate['score']);

            return $candidate;
        }, $candidates);
    }

    private function duplicateCandidateScore(array $column): int
    {
        $name = strtolower((string) ($column['name'] ?? ''));
        $input = strtolower((string) ($column['input'] ?? ''));
        $type = strtolower((string) ($column['type'] ?? ''));

        if ($name === '' || in_array($name, ['created_at', 'updated_at', 'deleted_at'], true)) {
            return 0;
        }

        if (str_contains($name, 'password') || str_contains($name, 'token')) {
            return 0;
        }

        $score = 0;
        $keywordScores = [
            'folder_id' => 120,
            'receipt_number' => 120,
            'receipt_no' => 120,
            'receipt' => 110,
            'name' => 100,
            'reference' => 95,
            'invoice' => 90,
            'code' => 85,
            'phone' => 80,
            'email' => 80,
            'transaction' => 75,
            'claim' => 70,
            'folder' => 70,
            '_id' => 65,
        ];

        foreach ($keywordScores as $keyword => $weight) {
            if (str_contains($name, $keyword)) {
                $score = max($score, $weight);
            }
        }

        if ($score === 0 && in_array($input, ['text', 'select', 'number'], true) && preg_match('/char|varchar|enum|int|decimal/', $type) === 1) {
            $score = 40;
        }

        return $score;
    }

    private function duplicateGroups(array $metadata, int $branchId, string $column): array
    {
        $columnDefinition = collect($metadata['columns'])->firstWhere('name', $column);
        if (! $columnDefinition) {
            return [];
        }

        $quotedColumn = sprintf('`%s`', str_replace('`', '``', $column));
        $isTextual = in_array($columnDefinition['input'], ['text', 'textarea', 'select', 'date', 'datetime'], true);
        $normalizedExpression = $isTextual ? "TRIM($quotedColumn)" : $quotedColumn;

        $groups = DB::table($metadata['name'])
            ->when(
                $branchId !== 0 && $metadata['has_branch_id'],
                fn ($query) => $query->where('branch_id', $branchId)
            )
            ->whereNotNull($column)
            ->when(
                $isTextual,
                fn ($query) => $query->whereRaw("TRIM($quotedColumn) <> ''")
            )
            ->selectRaw("$normalizedExpression as duplicate_value, COUNT(*) as duplicate_count")
            ->groupBy(DB::raw($normalizedExpression))
            ->having('duplicate_count', '>', 1)
            ->orderByDesc('duplicate_count')
            ->limit(100)
            ->get();

        $previewColumns = $this->duplicatePreviewColumns($metadata, $column);
        $result = [];

        foreach ($groups as $group) {
            $value = $group->duplicate_value;
            $previewQuery = DB::table($metadata['name'])
                ->when(
                    $branchId !== 0 && $metadata['has_branch_id'],
                    fn ($query) => $query->where('branch_id', $branchId)
                )
                ->when(
                    $isTextual,
                    fn ($query) => $query->whereRaw("TRIM($quotedColumn) = ?", [$value]),
                    fn ($query) => $query->where($column, $value)
                )
                ->orderByDesc($metadata['default_sort'])
                ->limit(8);

            $previews = $previewQuery->get($previewColumns)->map(static function ($record): array {
                return (array) $record;
            })->values()->all();

            $result[] = [
                'value' => $value,
                'count' => (int) $group->duplicate_count,
                'preview_columns' => $previewColumns,
                'records' => $previews,
            ];
        }

        return $result;
    }

    private function duplicatePreviewColumns(array $metadata, string $activeColumn): array
    {
        $priorityColumns = array_values(array_unique(array_filter([
            $metadata['primary_key'],
            $activeColumn,
            'name',
            'folder_id',
            'receipt_number',
            'receipt_no',
            'reference',
            'code',
            'branch_id',
            'created_at',
        ])));

        $previewColumns = [];

        foreach ($priorityColumns as $column) {
            if (in_array($column, $metadata['column_names'], true)) {
                $previewColumns[] = $column;
            }
        }

        foreach ($metadata['searchable_columns'] as $column) {
            if (count($previewColumns) >= 6) {
                break;
            }

            if (! in_array($column, $previewColumns, true)) {
                $previewColumns[] = $column;
            }
        }

        return $previewColumns === [] ? array_slice($metadata['column_names'], 0, 6) : $previewColumns;
    }

    private function resolveInputType(string $type): string
    {
        $normalized = strtolower($type);

        if (str_starts_with($normalized, 'enum(')) {
            return 'select';
        }

        if (str_contains($normalized, 'text')) {
            return 'textarea';
        }

        if (str_starts_with($normalized, 'tinyint(1)') || str_starts_with($normalized, 'boolean')) {
            return 'boolean';
        }

        if (preg_match('/int|decimal|float|double/', $normalized) === 1) {
            return 'number';
        }

        if (str_starts_with($normalized, 'date') && ! str_starts_with($normalized, 'datetime')) {
            return 'date';
        }

        if (str_starts_with($normalized, 'datetime') || str_starts_with($normalized, 'timestamp')) {
            return 'datetime';
        }

        return 'text';
    }

    private function parseEnumOptions(string $type): array
    {
        if (! preg_match("/^enum\\((.*)\\)$/i", $type, $matches)) {
            return [];
        }

        $options = str_getcsv($matches[1], ',', "'");

        return array_values(array_filter($options, fn ($value) => $value !== null));
    }

    private function isSearchableType(string $type): bool
    {
        $normalized = strtolower($type);

        return preg_match('/char|text|enum|date|timestamp|int|decimal|float|double/', $normalized) === 1;
    }

    private function tableNotices(array $metadata, int $branchId): array
    {
        $notices = [];

        if (! $metadata['writable']) {
            $notices[] = 'This table uses a composite or missing primary key, so it is browse-only in this workspace.';
        }

        if ($metadata['name'] === 'billing') {
            $notices[] = 'Deleting billing rows also clears linked sales, claims, frame, lens, and inventory rows.';
        }

        if ($metadata['name'] === 'patient_records') {
            $notices[] = 'Deleting patient rows also clears linked billing, prescription, form, and document rows.';
        }

        return $notices;
    }

    private function buildUpdatePayload(Request $request, array $metadata, object $record): array
    {
        $payload = [];

        foreach ($metadata['columns'] as $column) {
            if (! $column['editable']) {
                continue;
            }

            $name = $column['name'];
            if (! $request->has($name)) {
                continue;
            }

            $value = $request->input($name);
            if ($value === '') {
                if ($column['nullable']) {
                    $payload[$name] = null;
                    continue;
                }

                if ($name === $metadata['primary_key']) {
                    continue;
                }

                return ['_error' => sprintf('%s cannot be empty.', str_replace('_', ' ', ucfirst($name)))];
            }

            $payload[$name] = $this->normalizeValueForColumn($column, $value);
        }

        unset($payload[$metadata['primary_key']]);
        unset($payload['created_at']);

        if (array_key_exists('updated_at', $payload) && $payload['updated_at'] === null) {
            unset($payload['updated_at']);
        }

        if ($payload === []) {
            return ['_error' => 'No editable values were supplied for this row.'];
        }

        return $payload;
    }

    private function normalizeValueForColumn(array $column, mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }

        return match ($column['input']) {
            'number' => is_numeric($value) ? $value + 0 : $value,
            'boolean' => (int) in_array((string) $value, ['1', 'true', 'yes', 'on'], true),
            'datetime' => str_replace('T', ' ', (string) $value).(strlen((string) $value) === 16 ? ':00' : ''),
            default => $value,
        };
    }

    private function applyBillingRecalculation(array $payload, object $record): array
    {
        $consultation = round((float) ($payload['consultation_price'] ?? $record->consultation_price ?? 0), 2);
        $frame = round((float) ($payload['frame_price'] ?? $record->frame_price ?? 0), 2);
        $lens = round((float) ($payload['lens_price'] ?? $record->lens_price ?? 0), 2);
        $case = round((float) ($payload['case_price'] ?? $record->case_price ?? 0), 2);
        $discount = round((float) ($payload['discount'] ?? $record->discount ?? 0), 2);
        $subtotal = $consultation + $frame + $lens + $case;
        $baseAmount = $subtotal > 0 ? round($subtotal / 1.20, 2) : 0.0;
        $nhil = round($baseAmount * 0.025, 2);
        $getfund = round($baseAmount * 0.025, 2);
        $vat = round($baseAmount * 0.15, 2);
        $tax = round($nhil + $getfund + $vat, 2);
        $totalAmount = round(max($subtotal - $discount, 0), 2);
        $settledAmount = round(max((float) ($record->total_amount ?? 0) - (float) ($record->balance ?? 0), 0), 2);
        $balance = round(max($totalAmount - $settledAmount, 0), 2);

        $payload['amount'] = $baseAmount;
        $payload['discount'] = $discount;
        $payload['tax'] = $tax;
        $payload['nhil_amount'] = $nhil;
        $payload['getfund_amount'] = $getfund;
        $payload['vat_amount'] = $vat;
        $payload['total_amount'] = $totalAmount;
        $payload['balance'] = $balance;

        return $payload;
    }

    private function findRecord(array $metadata, string $recordId, int $branchId): ?object
    {
        if (! $metadata['primary_key']) {
            return null;
        }

        return DB::table($metadata['name'])
            ->where($metadata['primary_key'], $recordId)
            ->when(
                $branchId !== 0 && $metadata['has_branch_id'],
                fn ($query) => $query->where('branch_id', $branchId)
            )
            ->first($metadata['column_names']);
    }

    private function linkedCounts(array $metadata, object $record, int $branchId): array
    {
        if ($metadata['name'] === 'billing') {
            return $this->billingLinkedCounts($branchId, $record);
        }

        if ($metadata['name'] === 'patient_records') {
            return $this->patientLinkedCounts($branchId, $record);
        }

        $counts = [];
        foreach ($this->dependentRelations($metadata['name'], $metadata['primary_key']) as $relation) {
            if (! $this->tableExists($relation['table'])) {
                continue;
            }

            $query = DB::table($relation['table'])->where($relation['column'], $record->{$metadata['primary_key']});
            if ($branchId !== 0 && $this->tableHasBranchId($relation['table'])) {
                $query->where('branch_id', $branchId);
            }

            $counts[$relation['table']] = (int) $query->count();
        }

        return $counts;
    }

    private function resolveDeleteMode(Request $request): string
    {
        $mode = trim($request->string('delete_mode')->toString());

        return in_array($mode, ['entry_only', 'selected_links', 'cascade'], true)
            ? $mode
            : 'cascade';
    }

    private function resolveSelectedLinkedTables(Request $request, array $linkedCounts): array
    {
        $requestedTables = $request->input('linked_tables', []);
        if (! is_array($requestedTables)) {
            return [];
        }

        $allowedTables = array_keys(array_filter(
            $linkedCounts,
            static fn (mixed $count): bool => (int) $count > 0
        ));

        return array_values(array_intersect(
            array_map(static fn ($value): string => (string) $value, $requestedTables),
            $allowedTables
        ));
    }

    private function deleteOnlyEntry(array $metadata, object $record, int $branchId): void
    {
        $primaryKey = $metadata['primary_key'];
        if (! $primaryKey) {
            return;
        }

        DB::table($metadata['name'])
            ->where($primaryKey, $record->{$primaryKey})
            ->when(
                $branchId !== 0 && $metadata['has_branch_id'],
                fn ($query) => $query->where('branch_id', $branchId)
            )
            ->delete();
    }

    private function deleteWithSelectedLinks(array $metadata, object $record, int $branchId, array $selectedLinkedTables): void
    {
        if ($metadata['name'] === 'billing') {
            $this->deleteBillingSelectedLinks($branchId, $record, $selectedLinkedTables);
            return;
        }

        if ($metadata['name'] === 'patient_records') {
            $this->deletePatientSelectedLinks($branchId, $record, $selectedLinkedTables);
            return;
        }

        $primaryKey = $metadata['primary_key'];
        if (! $primaryKey) {
            return;
        }

        foreach ($this->dependentRelations($metadata['name'], $primaryKey) as $relation) {
            if (! in_array($relation['table'], $selectedLinkedTables, true) || ! $this->tableExists($relation['table'])) {
                continue;
            }

            $query = DB::table($relation['table'])->where($relation['column'], $record->{$primaryKey});
            if ($branchId !== 0 && $this->tableHasBranchId($relation['table'])) {
                $query->where('branch_id', $branchId);
            }

            $query->delete();
        }

        $this->deleteOnlyEntry($metadata, $record, $branchId);
    }

    private function deleteBillingSelectedLinks(int $branchId, object $record, array $selectedLinkedTables): void
    {
        $effectiveBranchId = (int) ($record->branch_id ?? $branchId);

        if (in_array('billing_frames', $selectedLinkedTables, true) && $this->tableExists('billing_frames')) {
            $frameRows = DB::table('billing_frames')
                ->where('branch_id', $effectiveBranchId)
                ->where('billing_id', $record->id)
                ->get(['frame_code_id']);

            foreach ($frameRows as $frameRow) {
                if (! empty($frameRow->frame_code_id)) {
                    DB::table('products')
                        ->where('branch_id', $effectiveBranchId)
                        ->where('code', $frameRow->frame_code_id)
                        ->increment('stock');
                }
            }

            DB::table('billing_frames')
                ->where('branch_id', $effectiveBranchId)
                ->where('billing_id', $record->id)
                ->delete();
        }

        if (in_array('inventory_movements', $selectedLinkedTables, true) && $this->tableExists('inventory_movements')) {
            DB::table('inventory_movements')
                ->where('branch_id', $effectiveBranchId)
                ->where('reference_table', 'billing')
                ->where('reference_id', $record->id)
                ->delete();
        }

        foreach (['lens_costs', 'sales', 'insurance_claims'] as $table) {
            if (! in_array($table, $selectedLinkedTables, true) || ! $this->tableExists($table)) {
                continue;
            }

            DB::table($table)
                ->where('branch_id', $effectiveBranchId)
                ->where('billing_id', $record->id)
                ->delete();
        }

        $this->deleteOnlyEntry($this->getTableMetadata('billing'), $record, $branchId);

        if (! empty($record->prescription_id) && ! empty($record->folder_id) && $this->tableExists('glasses_prescriptions')) {
            $stillBilled = DB::table('billing')
                ->where('branch_id', $effectiveBranchId)
                ->where('folder_id', $record->folder_id)
                ->where('prescription_id', $record->prescription_id)
                ->exists();

            if (! $stillBilled) {
                DB::table('glasses_prescriptions')
                    ->where('branch_id', $effectiveBranchId)
                    ->where('folder_id', $record->folder_id)
                    ->where('prescription_id', $record->prescription_id)
                    ->update(['status' => 'pending']);
            }
        }
    }

    private function deletePatientSelectedLinks(int $branchId, object $record, array $selectedLinkedTables): void
    {
        if (in_array('billing', $selectedLinkedTables, true) && $this->tableExists('billing')) {
            $billings = DB::table('billing')
                ->where('branch_id', $branchId)
                ->where(function ($query) use ($record): void {
                    $query->where('patient_id', $record->id)
                        ->orWhere('folder_id', $record->folder_id);
                })
                ->get(['id']);

            foreach ($billings as $billing) {
                $this->deleteBillingCascade($branchId, (int) $billing->id);
            }
        }

        if (in_array('patient_documents', $selectedLinkedTables, true) && $this->tableExists('patient_documents')) {
            $documentRows = DB::table('patient_documents')
                ->where('folder_id', $record->folder_id)
                ->when(
                    $this->patientDocumentsHasBranchId(),
                    fn ($query) => $query->where('branch_id', $branchId)
                )
                ->get(['file_path']);

            foreach ($documentRows as $documentRow) {
                if (! empty($documentRow->file_path)) {
                    $filePath = public_path((string) $documentRow->file_path);
                    if (is_file($filePath)) {
                        @unlink($filePath);
                    }
                }
            }

            DB::table('patient_documents')
                ->where('folder_id', $record->folder_id)
                ->when(
                    $this->patientDocumentsHasBranchId(),
                    fn ($query) => $query->where('branch_id', $branchId)
                )
                ->delete();
        }

        if (in_array('patient_form_data', $selectedLinkedTables, true) && $this->tableExists('patient_form_data')) {
            DB::table('patient_form_data')
                ->where('folder_id', $record->folder_id)
                ->when(
                    $this->tableHasBranchId('patient_form_data'),
                    fn ($query) => $query->where('branch_id', $branchId)
                )
                ->delete();
        }

        if (in_array('glasses_prescriptions', $selectedLinkedTables, true) && $this->tableExists('glasses_prescriptions')) {
            DB::table('glasses_prescriptions')
                ->where('branch_id', $branchId)
                ->where(function ($query) use ($record): void {
                    $query->where('patient_id', $record->id)
                        ->orWhere('folder_id', $record->folder_id);
                })
                ->delete();
        }

        $this->deleteOnlyEntry($this->getTableMetadata('patient_records'), $record, $branchId);
    }

    private function deleteSuccessMessage(string $label, string $deleteMode): string
    {
        return match ($deleteMode) {
            'entry_only' => sprintf('%s row deleted without linked cleanup.', $label),
            'selected_links' => sprintf('%s row deleted with the selected linked cleanup.', $label),
            default => sprintf('%s row deleted successfully.', $label),
        };
    }

    private function dependentRelations(string $table, ?string $primaryKey): array
    {
        if (! $primaryKey) {
            return [];
        }

        $databaseName = DB::getDatabaseName();
        $relations = [];

        foreach (DB::select(
            'SELECT TABLE_NAME, COLUMN_NAME
             FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
             WHERE REFERENCED_TABLE_SCHEMA = ?
               AND REFERENCED_TABLE_NAME = ?
               AND REFERENCED_COLUMN_NAME = ?',
            [$databaseName, $table, $primaryKey]
        ) as $relation) {
            $tableName = (string) $relation->TABLE_NAME;
            if (in_array($tableName, self::EXCLUDED_TABLES, true)) {
                continue;
            }

            $relations[] = [
                'table' => $tableName,
                'column' => (string) $relation->COLUMN_NAME,
            ];
        }

        return $relations;
    }

    private function deleteGenericCascade(array $metadata, object $record, int $branchId, array &$visited): void
    {
        $primaryKey = $metadata['primary_key'];
        if (! $primaryKey) {
            return;
        }

        $visitKey = $metadata['name'].':'.$record->{$primaryKey};
        if (isset($visited[$visitKey])) {
            return;
        }

        $visited[$visitKey] = true;

        foreach ($this->dependentRelations($metadata['name'], $primaryKey) as $relation) {
            if (! $this->tableExists($relation['table'])) {
                continue;
            }

            $dependentMetadata = $this->getTableMetadata($relation['table']);
            $query = DB::table($relation['table'])->where($relation['column'], $record->{$primaryKey});

            if ($branchId !== 0 && $dependentMetadata['has_branch_id']) {
                $query->where('branch_id', $branchId);
            }

            if (! $dependentMetadata['primary_key']) {
                $query->delete();
                continue;
            }

            $dependentRows = $query->get($dependentMetadata['column_names']);
            foreach ($dependentRows as $dependentRow) {
                if ($dependentMetadata['name'] === 'billing' && isset($dependentRow->id)) {
                    $this->deleteBillingCascade($branchId, (int) $dependentRow->id);
                    continue;
                }

                if ($dependentMetadata['name'] === 'patient_records') {
                    $this->deletePatientCascade($branchId, $dependentRow);
                    continue;
                }

                $this->deleteGenericCascade($dependentMetadata, $dependentRow, $branchId, $visited);
            }
        }

        DB::table($metadata['name'])
            ->where($primaryKey, $record->{$primaryKey})
            ->when(
                $branchId !== 0 && $metadata['has_branch_id'],
                fn ($query) => $query->where('branch_id', $branchId)
            )
            ->delete();
    }

    private function deleteBillingCascade(int $branchId, int $billingId): void
    {
        $record = DB::table('billing')
            ->where('id', $billingId)
            ->first();

        if (! $record) {
            return;
        }

        $effectiveBranchId = (int) ($record->branch_id ?? $branchId);

        $frameRows = $this->tableExists('billing_frames')
            ? DB::table('billing_frames')
                ->where('branch_id', $effectiveBranchId)
                ->where('billing_id', $record->id)
                ->get(['frame_code_id'])
            : collect();

        foreach ($frameRows as $frameRow) {
            if (! empty($frameRow->frame_code_id)) {
                DB::table('products')
                    ->where('branch_id', $effectiveBranchId)
                    ->where('code', $frameRow->frame_code_id)
                    ->increment('stock');
            }
        }

        if ($this->tableExists('inventory_movements')) {
            DB::table('inventory_movements')
                ->where('branch_id', $effectiveBranchId)
                ->where('reference_table', 'billing')
                ->where('reference_id', $record->id)
                ->delete();
        }

        if ($this->tableExists('lens_costs')) {
            DB::table('lens_costs')
                ->where('branch_id', $effectiveBranchId)
                ->where('billing_id', $record->id)
                ->delete();
        }

        if ($this->tableExists('billing_frames')) {
            DB::table('billing_frames')
                ->where('branch_id', $effectiveBranchId)
                ->where('billing_id', $record->id)
                ->delete();
        }

        if ($this->tableExists('sales')) {
            DB::table('sales')
                ->where('branch_id', $effectiveBranchId)
                ->where('billing_id', $record->id)
                ->delete();
        }

        if ($this->tableExists('insurance_claims')) {
            DB::table('insurance_claims')
                ->where('branch_id', $effectiveBranchId)
                ->where('billing_id', $record->id)
                ->delete();
        }

        DB::table('billing')
            ->where('id', $record->id)
            ->delete();

        if (! empty($record->prescription_id) && ! empty($record->folder_id) && $this->tableExists('glasses_prescriptions')) {
            $stillBilled = DB::table('billing')
                ->where('branch_id', $effectiveBranchId)
                ->where('folder_id', $record->folder_id)
                ->where('prescription_id', $record->prescription_id)
                ->exists();

            if (! $stillBilled) {
                DB::table('glasses_prescriptions')
                    ->where('branch_id', $effectiveBranchId)
                    ->where('folder_id', $record->folder_id)
                    ->where('prescription_id', $record->prescription_id)
                    ->update(['status' => 'pending']);
            }
        }
    }

    private function deletePatientCascade(int $branchId, object $record): void
    {
        $billings = DB::table('billing')
            ->where('branch_id', $branchId)
            ->where(function ($query) use ($record): void {
                $query->where('patient_id', $record->id)
                    ->orWhere('folder_id', $record->folder_id);
            })
            ->get(['id']);

        foreach ($billings as $billing) {
            $this->deleteBillingCascade($branchId, (int) $billing->id);
        }

        $documentRows = $this->tableExists('patient_documents')
            ? DB::table('patient_documents')
                ->where('folder_id', $record->folder_id)
                ->when(
                    $this->patientDocumentsHasBranchId(),
                    fn ($query) => $query->where('branch_id', $branchId)
                )
                ->get(['file_path'])
            : collect();

        foreach ($documentRows as $documentRow) {
            if (! empty($documentRow->file_path)) {
                $filePath = public_path((string) $documentRow->file_path);
                if (is_file($filePath)) {
                    @unlink($filePath);
                }
            }
        }

        if ($this->tableExists('patient_documents')) {
            DB::table('patient_documents')
                ->where('folder_id', $record->folder_id)
                ->when(
                    $this->patientDocumentsHasBranchId(),
                    fn ($query) => $query->where('branch_id', $branchId)
                )
                ->delete();
        }

        if ($this->tableExists('patient_form_data')) {
            DB::table('patient_form_data')
                ->where('folder_id', $record->folder_id)
                ->when(
                    $this->tableHasBranchId('patient_form_data'),
                    fn ($query) => $query->where('branch_id', $branchId)
                )
                ->delete();
        }

        if ($this->tableExists('glasses_prescriptions')) {
            DB::table('glasses_prescriptions')
                ->where('branch_id', $branchId)
                ->where(function ($query) use ($record): void {
                    $query->where('patient_id', $record->id)
                        ->orWhere('folder_id', $record->folder_id);
                })
                ->delete();
        }

        DB::table('patient_records')
            ->where('id', $record->id)
            ->delete();

        $directory = public_path('uploads/patient_documents/'.$record->folder_id);
        if (is_dir($directory)) {
            File::deleteDirectory($directory);
        }
    }

    private function billingLinkedCounts(int $branchId, object $record): array
    {
        return [
            'sales' => $this->tableExists('sales') ? (int) DB::table('sales')->when($branchId !== 0, fn ($query) => $query->where('branch_id', $branchId))->where('billing_id', $record->id)->count() : 0,
            'insurance_claims' => $this->tableExists('insurance_claims') ? (int) DB::table('insurance_claims')->when($branchId !== 0, fn ($query) => $query->where('branch_id', $branchId))->where('billing_id', $record->id)->count() : 0,
            'billing_frames' => $this->tableExists('billing_frames') ? (int) DB::table('billing_frames')->when($branchId !== 0, fn ($query) => $query->where('branch_id', $branchId))->where('billing_id', $record->id)->count() : 0,
            'lens_costs' => $this->tableExists('lens_costs') ? (int) DB::table('lens_costs')->when($branchId !== 0, fn ($query) => $query->where('branch_id', $branchId))->where('billing_id', $record->id)->count() : 0,
            'inventory_movements' => $this->tableExists('inventory_movements') ? (int) DB::table('inventory_movements')->when($branchId !== 0, fn ($query) => $query->where('branch_id', $branchId))->where('reference_table', 'billing')->where('reference_id', $record->id)->count() : 0,
        ];
    }

    private function patientLinkedCounts(int $branchId, object $record): array
    {
        $documentsQuery = $this->tableExists('patient_documents')
            ? DB::table('patient_documents')->where('folder_id', $record->folder_id)
            : null;
        if ($documentsQuery && $this->patientDocumentsHasBranchId()) {
            $documentsQuery->where('branch_id', $branchId);
        }

        $formsQuery = $this->tableExists('patient_form_data')
            ? DB::table('patient_form_data')->where('folder_id', $record->folder_id)
            : null;
        if ($formsQuery && $this->tableHasBranchId('patient_form_data')) {
            $formsQuery->where('branch_id', $branchId);
        }

        return [
            'billing' => (int) DB::table('billing')->when($branchId !== 0, fn ($query) => $query->where('branch_id', $branchId))->where(function ($query) use ($record): void {
                $query->where('patient_id', $record->id)->orWhere('folder_id', $record->folder_id);
            })->count(),
            'glasses_prescriptions' => $this->tableExists('glasses_prescriptions') ? (int) DB::table('glasses_prescriptions')->when($branchId !== 0, fn ($query) => $query->where('branch_id', $branchId))->where(function ($query) use ($record): void {
                $query->where('patient_id', $record->id)->orWhere('folder_id', $record->folder_id);
            })->count() : 0,
            'patient_documents' => $documentsQuery ? (int) $documentsQuery->count() : 0,
            'patient_form_data' => $formsQuery ? (int) $formsQuery->count() : 0,
        ];
    }

    private function patientDocumentsHasBranchId(): bool
    {
        return $this->tableHasBranchId('patient_documents');
    }

    private function tableHasBranchId(string $table): bool
    {
        try {
            return DB::getSchemaBuilder()->hasColumn($table, 'branch_id');
        } catch (\Throwable) {
            return false;
        }
    }

    private function tableExists(string $table): bool
    {
        try {
            return DB::getSchemaBuilder()->hasTable($table);
        } catch (\Throwable) {
            return false;
        }
    }

    private function ensureGeneralManager(Request $request): ?JsonResponse
    {
        $user = $request->user();
        $role = $user?->normalized_role ?? $user?->role;

        if (! $user || ($role !== 'manager' && ! ($user?->is_admin ?? false))) {
            return response()->json([
                'message' => 'Only the General Manager can access the database workspace.',
            ], 403);
        }

        return null;
    }

    private function resolveBranchId(Request $request): int
    {
        $requestedBranchId = (int) $request->integer('branch_id');

        return in_array($requestedBranchId, [0, 1, 2], true) ? $requestedBranchId : 1;
    }

    private function branchName(int $branchId): string
    {
        return match ($branchId) {
            2 => 'Madina',
            default => 'Labadi',
        };
    }
}
