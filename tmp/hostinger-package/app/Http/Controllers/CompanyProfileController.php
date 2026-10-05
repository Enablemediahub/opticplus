<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CompanyProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'profile' => $this->serializeProfile($this->readProfile()),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! in_array($user->normalized_role, ['manager', 'ceo'], true)) {
            return response()->json([
                'message' => 'Only management can update company profile settings.',
            ], 403);
        }

        $validated = $request->validate([
            'company_name' => ['required', 'string', 'max:255'],
            'company_email' => ['required', 'email', 'max:255'],
            'company_phone_primary' => ['required', 'string', 'max:50'],
            'company_phone_secondary' => ['nullable', 'string', 'max:50'],
            'labadi_address' => ['required', 'string', 'max:255'],
            'madina_address' => ['required', 'string', 'max:255'],
            'tagline' => ['nullable', 'string', 'max:255'],
            'login_wallpaper' => ['nullable', 'image', 'max:6144'],
            'dashboard_hero_image' => ['nullable', 'image', 'max:6144'],
            'dashboard_hero_position_x' => ['nullable', 'numeric', 'between:0,100'],
            'dashboard_hero_position_y' => ['nullable', 'numeric', 'between:0,100'],
            'labadi_dashboard_hero_image' => ['nullable', 'image', 'max:6144'],
            'labadi_dashboard_hero_position_x' => ['nullable', 'numeric', 'between:0,100'],
            'labadi_dashboard_hero_position_y' => ['nullable', 'numeric', 'between:0,100'],
            'madina_dashboard_hero_image' => ['nullable', 'image', 'max:6144'],
            'madina_dashboard_hero_position_x' => ['nullable', 'numeric', 'between:0,100'],
            'madina_dashboard_hero_position_y' => ['nullable', 'numeric', 'between:0,100'],
        ]);

        $existingProfile = $this->readProfile();

        $profile = [
            'company_name' => $validated['company_name'],
            'company_email' => $validated['company_email'],
            'company_phone_primary' => $validated['company_phone_primary'],
            'company_phone_secondary' => $validated['company_phone_secondary'] ?? '',
            'labadi_address' => $validated['labadi_address'],
            'madina_address' => $validated['madina_address'],
            'tagline' => $validated['tagline'] ?? 'Professional Eye Care and Optical Services',
            'login_wallpaper' => $existingProfile['login_wallpaper'] ?? null,
            'dashboard_hero_image' => $existingProfile['dashboard_hero_image'] ?? null,
            'dashboard_hero_position_x' => (float) ($validated['dashboard_hero_position_x'] ?? $existingProfile['dashboard_hero_position_x'] ?? 50),
            'dashboard_hero_position_y' => (float) ($validated['dashboard_hero_position_y'] ?? $existingProfile['dashboard_hero_position_y'] ?? 50),
            'labadi_dashboard_hero_image' => $existingProfile['labadi_dashboard_hero_image'] ?? null,
            'labadi_dashboard_hero_position_x' => (float) ($validated['labadi_dashboard_hero_position_x'] ?? $existingProfile['labadi_dashboard_hero_position_x'] ?? 50),
            'labadi_dashboard_hero_position_y' => (float) ($validated['labadi_dashboard_hero_position_y'] ?? $existingProfile['labadi_dashboard_hero_position_y'] ?? 50),
            'madina_dashboard_hero_image' => $existingProfile['madina_dashboard_hero_image'] ?? null,
            'madina_dashboard_hero_position_x' => (float) ($validated['madina_dashboard_hero_position_x'] ?? $existingProfile['madina_dashboard_hero_position_x'] ?? 50),
            'madina_dashboard_hero_position_y' => (float) ($validated['madina_dashboard_hero_position_y'] ?? $existingProfile['madina_dashboard_hero_position_y'] ?? 50),
            'updated_at' => now()->toDateTimeString(),
        ];

        if ($request->hasFile('login_wallpaper')) {
            if (! empty($existingProfile['login_wallpaper']) && str_starts_with($existingProfile['login_wallpaper'], 'uploads/company-profile/')) {
                $existing = $this->publicAssetPath($existingProfile['login_wallpaper']);
                if (is_file($existing)) {
                    @unlink($existing);
                }
            }

            $profile['login_wallpaper'] = $this->storeLoginWallpaper($request);
        }

        if ($request->hasFile('dashboard_hero_image')) {
            if (! empty($existingProfile['dashboard_hero_image']) && str_starts_with($existingProfile['dashboard_hero_image'], 'uploads/company-profile/')) {
                $existing = $this->publicAssetPath($existingProfile['dashboard_hero_image']);
                if (is_file($existing)) {
                    @unlink($existing);
                }
            }

            $profile['dashboard_hero_image'] = $this->storeDashboardHeroImage($request);
        }

        foreach (['labadi', 'madina'] as $branch) {
            $field = $branch.'_dashboard_hero_image';
            if (! $request->hasFile($field)) {
                continue;
            }

            if (! empty($existingProfile[$field]) && str_starts_with($existingProfile[$field], 'uploads/company-profile/')) {
                $existing = $this->publicAssetPath($existingProfile[$field]);
                if (is_file($existing)) {
                    @unlink($existing);
                }
            }

            $profile[$field] = $this->storeDashboardHeroImage($request, $field, $branch);
        }

        file_put_contents($this->profilePath(), json_encode($profile, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        return response()->json([
            'message' => 'Company profile updated successfully.',
            'profile' => $this->serializeProfile($profile),
        ]);
    }

    private function readProfile(): array
    {
        $path = $this->profilePath();
        if (is_file($path)) {
            $decoded = json_decode((string) file_get_contents($path), true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return $this->defaultProfile();
    }

    private function profilePath(): string
    {
        $directory = storage_path('app');
        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        return $directory.DIRECTORY_SEPARATOR.'company_profile.json';
    }

    private function defaultProfile(): array
    {
        return [
            'company_name' => 'Bealet Optical Center',
            'company_email' => 'bealetopticalcenter@gmail.com',
            'company_phone_primary' => '+233502484144',
            'company_phone_secondary' => '+233553998962',
            'labadi_address' => 'Labadi Rd, Opp Advent Press',
            'madina_address' => 'FireStone Madina Road, Opp Cal Bank',
            'tagline' => 'Professional Eye Care and Optical Services',
            'login_wallpaper' => null,
            'dashboard_hero_image' => null,
            'dashboard_hero_position_x' => 50,
            'dashboard_hero_position_y' => 50,
            'labadi_dashboard_hero_image' => null,
            'labadi_dashboard_hero_position_x' => 50,
            'labadi_dashboard_hero_position_y' => 50,
            'madina_dashboard_hero_image' => null,
            'madina_dashboard_hero_position_x' => 50,
            'madina_dashboard_hero_position_y' => 50,
            'updated_at' => null,
        ];
    }

    private function serializeProfile(array $profile): array
    {
        $wallpaperPath = $profile['login_wallpaper'] ?? null;
        $dashboardHeroPath = $profile['dashboard_hero_image'] ?? null;
        $labadiDashboardHeroPath = $profile['labadi_dashboard_hero_image'] ?? null;
        $madinaDashboardHeroPath = $profile['madina_dashboard_hero_image'] ?? null;

        if ($wallpaperPath) {
            $this->ensurePublicAssetAvailable($wallpaperPath);
        }
        if ($dashboardHeroPath) {
            $this->ensurePublicAssetAvailable($dashboardHeroPath);
        }
        if ($labadiDashboardHeroPath) {
            $this->ensurePublicAssetAvailable($labadiDashboardHeroPath);
        }
        if ($madinaDashboardHeroPath) {
            $this->ensurePublicAssetAvailable($madinaDashboardHeroPath);
        }

        return [
            ...$profile,
            'login_wallpaper_url' => $this->buildPublicAssetUrl($wallpaperPath),
            'dashboard_hero_image_url' => $this->buildPublicAssetUrl($dashboardHeroPath),
            'labadi_dashboard_hero_image_url' => $this->buildPublicAssetUrl($labadiDashboardHeroPath),
            'madina_dashboard_hero_image_url' => $this->buildPublicAssetUrl($madinaDashboardHeroPath),
        ];
    }

    private function storeLoginWallpaper(Request $request): string
    {
        $file = $request->file('login_wallpaper');
        $directory = $this->publicAssetPath('uploads/company-profile');

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $filename = 'login_wallpaper_'.time().'_'.Str::random(8).'.'.$file->getClientOriginalExtension();
        $file->move($directory, $filename);

        return 'uploads/company-profile/'.$filename;
    }

    private function storeDashboardHeroImage(Request $request, string $field = 'dashboard_hero_image', string $prefix = 'dashboard_hero'): string
    {
        $file = $request->file($field);
        $directory = $this->publicAssetPath('uploads/company-profile');

        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $filename = $prefix.'_dashboard_hero_'.time().'_'.Str::random(8).'.'.$file->getClientOriginalExtension();
        $file->move($directory, $filename);

        return 'uploads/company-profile/'.$filename;
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

    private function publicAssetPath(string $relativePath): string
    {
        $relativePath = ltrim($relativePath, '/\\');
        $productionWebRoot = base_path('public_html');

        $webRoot = is_dir($productionWebRoot)
            ? $productionWebRoot
            : public_path();

        return $webRoot.DIRECTORY_SEPARATOR.str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath);
    }

    private function legacyPublicAssetPath(string $relativePath): string
    {
        return public_path(ltrim($relativePath, '/\\'));
    }

    private function ensurePublicAssetAvailable(string $relativePath): void
    {
        $activePath = $this->publicAssetPath($relativePath);
        if (is_file($activePath)) {
            return;
        }

        $legacyPath = $this->legacyPublicAssetPath($relativePath);
        if (! is_file($legacyPath) || $legacyPath === $activePath) {
            return;
        }

        $targetDirectory = dirname($activePath);
        if (! is_dir($targetDirectory)) {
            mkdir($targetDirectory, 0755, true);
        }

        @copy($legacyPath, $activePath);
    }
}
