<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class InternalMessageController extends Controller
{
    public function users(Request $request): JsonResponse
    {
        $this->ensureInternalMessagesSchema();

        $currentUser = $request->user();
        if ($response = $this->ensureStaffMessagingAccess($currentUser)) {
            return $response;
        }

        $currentUserId = (int) $currentUser->id;
        $search = trim($request->string('search')->toString());

        $query = DB::table('users')
            ->where('id', '!=', $currentUserId)
            ->where(function ($inner): void {
                $inner->whereNull('employee_status')
                    ->orWhere('employee_status', '')
                    ->orWhere('employee_status', 'active');
            });

        if ($search !== '') {
            $term = '%'.$search.'%';
            $query->where(function ($inner) use ($term): void {
                $inner->where('name', 'like', $term)
                    ->orWhere('username', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('role', 'like', $term)
                    ->orWhere('branch', 'like', $term);
            });
        }

        $records = $query
            ->orderBy('name')
            ->limit(100)
            ->get();

        $users = collect($records)
            ->map(function ($record) {
                $user = User::query()->find((int) $record->id);
                if (! $user) {
                    return null;
                }

                return $this->serializeUserSummary($user);
            })
            ->filter(function ($record) {
                if (! $record) {
                    return false;
                }

                return filled($record['staff_id'] ?? null) || ($record['role'] ?? null) === 'ceo';
            })
            ->filter()
            ->values();

        return response()->json([
            'users' => $users,
        ]);
    }

    public function inbox(Request $request): JsonResponse
    {
        $this->ensureInternalMessagesSchema();

        $currentUser = $request->user();
        if ($response = $this->ensureStaffMessagingAccess($currentUser)) {
            return $response;
        }

        $currentUserId = (int) $currentUser->id;

        $messages = DB::table('internal_messages')
            ->where(function ($query) use ($currentUserId): void {
                $query->where('sender_id', $currentUserId)
                    ->orWhere('recipient_id', $currentUserId);
            })
            ->orderByDesc('created_at')
            ->limit(400)
            ->get();

        $threads = collect($messages)
            ->groupBy(function ($message) use ($currentUserId) {
                return (int) ($message->sender_id === $currentUserId ? $message->recipient_id : $message->sender_id);
            })
            ->map(function ($threadMessages, $peerId) use ($currentUserId) {
                $latest = $threadMessages->first();
                $unreadCount = $threadMessages
                    ->filter(fn ($message) => (int) $message->recipient_id === $currentUserId && ! $message->read_at)
                    ->count();
                $peer = User::query()->find((int) $peerId);

                if (! $peer) {
                    return null;
                }

                $peerSummary = $this->serializeUserSummary($peer);
                if (! $this->canParticipateInMessaging($peer)) {
                    return null;
                }

                return [
                    'peer' => $peerSummary,
                    'latest_message' => $this->serializeMessage($latest, $currentUserId),
                    'unread_count' => $unreadCount,
                    'has_incoming_messages' => $threadMessages
                        ->contains(fn ($message) => (int) $message->recipient_id === $currentUserId),
                ];
            })
            ->filter()
            ->sortByDesc(fn ($thread) => $thread['latest_message']['created_at'])
            ->values();

        return response()->json([
            'threads' => $threads,
            'total_unread' => $threads->sum('unread_count'),
        ]);
    }

    public function thread(Request $request, int $peerId): JsonResponse
    {
        $this->ensureInternalMessagesSchema();

        $currentUser = $request->user();
        if ($response = $this->ensureStaffMessagingAccess($currentUser)) {
            return $response;
        }

        $currentUserId = (int) $currentUser->id;
        $peer = User::query()->find($peerId);

        if (! $peer || $peerId === $currentUserId) {
            return response()->json([
                'message' => 'The selected staff member could not be found.',
            ], 404);
        }

        $peerSummary = $this->serializeUserSummary($peer);
        if (! $this->canParticipateInMessaging($peer)) {
            return response()->json([
                'message' => 'The selected user is not available for internal messaging.',
            ], 403);
        }

        $messages = DB::table('internal_messages')
            ->where(function ($query) use ($currentUserId, $peerId): void {
                $query->where('sender_id', $currentUserId)->where('recipient_id', $peerId);
            })
            ->orWhere(function ($query) use ($currentUserId, $peerId): void {
                $query->where('sender_id', $peerId)->where('recipient_id', $currentUserId);
            })
            ->orderBy('created_at')
            ->limit(250)
            ->get();

        return response()->json([
            'peer' => $peerSummary,
            'messages' => $messages->map(fn ($message) => $this->serializeMessage($message, $currentUserId))->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensureInternalMessagesSchema();

        $currentUser = $request->user();
        if ($response = $this->ensureStaffMessagingAccess($currentUser)) {
            return $response;
        }

        $currentUserId = (int) $currentUser->id;
        $validated = $request->validate([
            'recipient_id' => ['required', 'integer', 'exists:users,id'],
            'message' => ['required', 'string', 'max:5000'],
        ]);

        $recipientId = (int) $validated['recipient_id'];
        if ($recipientId === $currentUserId) {
            return response()->json([
                'message' => 'You cannot send an internal message to yourself.',
            ], 422);
        }

        $recipient = User::query()->find($recipientId);
        if (! $recipient || ! $this->canParticipateInMessaging($recipient)) {
            return response()->json([
                'message' => 'The selected user cannot receive internal messages right now.',
            ], 422);
        }

        $body = trim($validated['message']);
        if ($body === '') {
            return response()->json([
                'message' => 'Enter a message before sending.',
            ], 422);
        }

        $messageId = DB::table('internal_messages')->insertGetId([
            'sender_id' => $currentUserId,
            'recipient_id' => $recipientId,
            'message' => $body,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $message = DB::table('internal_messages')->where('id', $messageId)->first();

        return response()->json([
            'message' => 'Internal message sent successfully.',
            'record' => $this->serializeMessage($message, $currentUserId),
        ], 201);
    }

    public function unread(Request $request): JsonResponse
    {
        $this->ensureInternalMessagesSchema();

        $currentUser = $request->user();
        if ($response = $this->ensureStaffMessagingAccess($currentUser)) {
            return $response;
        }

        $currentUserId = (int) $currentUser->id;

        $messages = DB::table('internal_messages')
            ->where('recipient_id', $currentUserId)
            ->whereNull('read_at')
            ->orderByDesc('created_at')
            ->limit(8)
            ->get();

        return response()->json([
            'total_unread' => DB::table('internal_messages')
                ->where('recipient_id', $currentUserId)
                ->whereNull('read_at')
                ->count(),
            'messages' => $messages->map(fn ($message) => $this->serializeMessage($message, $currentUserId))->values(),
        ]);
    }

    public function markThreadRead(Request $request, int $peerId): JsonResponse
    {
        $this->ensureInternalMessagesSchema();

        $currentUser = $request->user();
        if ($response = $this->ensureStaffMessagingAccess($currentUser)) {
            return $response;
        }

        $currentUserId = (int) $currentUser->id;

        DB::table('internal_messages')
            ->where('recipient_id', $currentUserId)
            ->where('sender_id', $peerId)
            ->whereNull('read_at')
            ->update([
                'read_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'message' => 'Messages marked as read.',
        ]);
    }

    private function ensureInternalMessagesSchema(): void
    {
        if (! Schema::hasTable('internal_messages')) {
            Schema::create('internal_messages', function (Blueprint $table): void {
                $table->id();
                $table->unsignedBigInteger('sender_id');
                $table->unsignedBigInteger('recipient_id');
                $table->text('message');
                $table->timestamp('read_at')->nullable();
                $table->timestamps();
                $table->index(['recipient_id', 'read_at']);
                $table->index(['sender_id', 'recipient_id']);
                $table->index('created_at');
            });
        }

        if (! Schema::hasColumn('internal_messages', 'read_at')) {
            Schema::table('internal_messages', function (Blueprint $table): void {
                $table->timestamp('read_at')->nullable()->after('message');
            });
        }
    }

    private function serializeUserSummary(User $user): array
    {
        $employee = $this->resolveEmployeeRecord($user);
        $profilePath = $user->profile_image ?: ($employee?->photo_path ?? null);

        return [
            'id' => (int) $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'role' => $this->normalizeRole((string) ($user->role ?? '')),
            'branch' => $user->branch ?: $this->branchName((int) ($user->branch_id ?? 0)),
            'branch_id' => (int) ($user->branch_id ?? 0),
            'staff_id' => $employee?->staff_id,
            'profile_image_url' => $this->buildPublicAssetUrl($profilePath),
        ];
    }

    private function serializeMessage(object $message, int $currentUserId): array
    {
        $sender = User::query()->find((int) $message->sender_id);
        $recipient = User::query()->find((int) $message->recipient_id);

        return [
            'id' => (int) $message->id,
            'sender_id' => (int) $message->sender_id,
            'recipient_id' => (int) $message->recipient_id,
            'message' => $message->message,
            'excerpt' => Str::limit((string) $message->message, 120),
            'read_at' => $message->read_at,
            'created_at' => $message->created_at,
            'is_mine' => (int) $message->sender_id === $currentUserId,
            'sender' => $sender ? $this->serializeUserSummary($sender) : null,
            'recipient' => $recipient ? $this->serializeUserSummary($recipient) : null,
        ];
    }

    private function ensureStaffMessagingAccess(?User $user): ?JsonResponse
    {
        if (! $user) {
            return response()->json([
                'message' => 'Authenticated user could not be resolved.',
            ], 401);
        }

        if ($this->canParticipateInMessaging($user)) {
            return null;
        }

        return response()->json([
            'message' => 'This account is not available for internal messaging.',
        ], 403);
    }

    private function canParticipateInMessaging(User $user): bool
    {
        $role = $this->normalizeRole((string) ($user->role ?? ''));

        if (! in_array($role, ['ceo', 'director', 'manager', 'accountant', 'receptionist', 'technician', 'optometrist'], true)) {
            return false;
        }

        $status = mb_strtolower(trim((string) ($user->employee_status ?? '')));

        return $status === '' || $status === 'active';
    }

    private function resolveEmployeeRecord(User $user): ?object
    {
        $candidates = [
            ['email', $user->email ? mb_strtolower(trim($user->email)) : null],
            ['email', $user->username ? mb_strtolower(trim($user->username)) : null],
            ['phone_number', $this->normalizePhone($user->phone)],
        ];

        foreach ([true, false] as $restrictToBranch) {
            foreach ($candidates as [$column, $value]) {
                if (! $value) {
                    continue;
                }

                $match = DB::table('employees_comprehensive')
                    ->when($restrictToBranch && $user->branch_id, fn ($query) => $query->where('branch_id', $user->branch_id))
                    ->when(
                        $column === 'phone_number',
                        fn ($query) => $query->whereRaw("REPLACE(REPLACE(REPLACE(REPLACE(phone_number, ' ', ''), '-', ''), '(', ''), ')', '') = ?", [$value]),
                        fn ($query) => $query->whereRaw("LOWER({$column}) = ?", [$value]),
                    )
                    ->first();

                if ($match) {
                    return $match;
                }
            }
        }

        $normalizedName = $this->normalizePersonName($user->name);

        if ($normalizedName) {
            foreach ([true, false] as $restrictToBranch) {
                $records = DB::table('employees_comprehensive')
                    ->select('*')
                    ->when($restrictToBranch && $user->branch_id, fn ($query) => $query->where('branch_id', $user->branch_id))
                    ->whereNotNull('staff_id')
                    ->get();

                $exact = $records->first(fn ($record) => $this->normalizePersonName($record->ghana_card_name ?? null) === $normalizedName);
                if ($exact) {
                    return $exact;
                }

                $partial = $records->first(function ($record) use ($normalizedName) {
                    $candidate = $this->normalizePersonName($record->ghana_card_name ?? null);
                    return $candidate && (str_contains($candidate, $normalizedName) || str_contains($normalizedName, $candidate));
                });

                if ($partial) {
                    return $partial;
                }
            }
        }

        return null;
    }

    private function normalizePhone(?string $phone): ?string
    {
        if (! $phone) {
            return null;
        }

        return preg_replace('/[^0-9]/', '', $phone) ?: null;
    }

    private function normalizePersonName(?string $name): ?string
    {
        if (! $name) {
            return null;
        }

        $normalized = preg_replace('/[^a-z0-9]+/iu', ' ', mb_strtolower(trim($name)));
        $parts = preg_split('/\s+/', trim((string) $normalized)) ?: [];
        $parts = array_values(array_filter($parts));

        if (! $parts) {
            return null;
        }

        sort($parts);

        return implode(' ', $parts);
    }

    private function normalizeRole(string $role): string
    {
        $key = mb_strtolower(trim($role));

        return match ($key) {
            'general-manager', 'general manager' => 'manager',
            default => $key,
        };
    }

    private function buildPublicAssetUrl(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        if (Str::startsWith($path, ['http://', 'https://'])) {
            return $path;
        }

        return rtrim(config('app.url'), '/').'/'.ltrim($path, '/');
    }

    private function branchName(int $branchId): string
    {
        return match ($branchId) {
            1 => 'Labadi',
            2 => 'Madina',
            default => 'Merged',
        };
    }
}
