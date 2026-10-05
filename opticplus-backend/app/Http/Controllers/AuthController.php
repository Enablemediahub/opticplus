<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'login' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::query()
            ->forLogin($credentials['login'])
            ->first();

        if (! $user || ! Hash::check($credentials['password'], $user->password)) {
            return response()->json([
                'message' => 'The provided credentials are incorrect.',
            ], 422);
        }

        $token = Str::random(80);
        Cache::put($this->cacheKey($token), $user->id, now()->addHours(8));

        return response()->json([
            'token' => $token,
            'user' => $this->serializeUser($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $this->serializeUser($request->user()),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:255', Rule::unique('users', 'username')->ignore($user->id)],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:50'],
            'profile_image' => ['nullable', 'image', 'max:4096'],
        ]);

        $user->fill([
            'name' => $validated['name'],
            'username' => $validated['username'],
            'email' => $validated['email'],
            'phone' => $validated['phone'] ?? null,
        ]);

        if ($request->hasFile('profile_image')) {
            $path = $this->storeProfileImage($request);

            if ($user->profile_image && str_starts_with($user->profile_image, 'uploads/profile-images/')) {
                $existing = $this->publicAssetPath($user->profile_image);
                if (is_file($existing)) {
                    @unlink($existing);
                }
            }

            $user->profile_image = $path;
        }

        $user->save();
        $user->refresh();

        return response()->json([
            'message' => 'Profile updated successfully.',
            'user' => $this->serializeUser($user),
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if (! Hash::check($validated['current_password'], $user->password)) {
            return response()->json([
                'message' => 'The current password is incorrect.',
            ], 422);
        }

        $user->password = Hash::make($validated['password']);
        $user->save();

        return response()->json([
            'message' => 'Password updated successfully.',
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->attributes->get('current_access_token');

        if ($token) {
            Cache::forget($this->cacheKey($token));
        }

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    private function serializeUser(User $user): array
    {
        $employee = $this->resolveEmployeeRecord($user);
        $profilePath = $user->profile_image ?: $employee?->photo_path;

        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'role' => $user->normalized_role,
            'branch' => $user->branch,
            'branch_id' => $user->branch_id,
            'phone' => $user->phone,
            'profile_image' => $user->profile_image,
            'profile_image_url' => $this->buildPublicAssetUrl($profilePath),
            'staff_id' => $employee?->staff_id,
            'job_title' => $employee?->job_title,
            'department' => $employee?->department,
            'is_admin' => $user->isAdmin(),
        ];
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

    private function storeProfileImage(Request $request): string
    {
        $file = $request->file('profile_image');
        $directory = $this->publicAssetPath('uploads/profile-images');

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $filename = 'profile_'.$request->user()->id.'_'.time().'.'.$file->getClientOriginalExtension();
        $file->move($directory, $filename);

        return 'uploads/profile-images/'.$filename;
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

    private function normalizePhone(?string $phone): ?string
    {
        if (! $phone) {
            return null;
        }

        return preg_replace('/\D+/', '', $phone) ?: null;
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

    private function publicAssetPath(string $relativePath): string
    {
        $relativePath = ltrim($relativePath, '/\\');
        $productionWebRoot = base_path('public_html');

        $webRoot = is_dir($productionWebRoot)
            ? $productionWebRoot
            : public_path();

        return $webRoot.DIRECTORY_SEPARATOR.str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath);
    }

    private function cacheKey(string $token): string
    {
        return 'opticplus_api_token:'.$token;
    }
}
