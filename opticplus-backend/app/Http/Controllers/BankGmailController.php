<?php

namespace App\Http\Controllers;

use App\Services\GtBankGmailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

class BankGmailController extends Controller
{
    public function status(Request $request, GtBankGmailService $gmail): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        return response()->json(['gmail' => $gmail->status()]);
    }

    public function authorize(Request $request): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        $clientId = config('services.google.client_id');
        $redirectUri = config('services.google.redirect');
        if (! $clientId || ! $redirectUri) {
            return response()->json([
                'message' => 'Configure GOOGLE_CLIENT_ID and GOOGLE_OAUTH_REDIRECT_URI in the server environment first.',
            ], 503);
        }

        $state = Str::random(64);
        DB::table('bank_gmail_connections')->updateOrInsert(
            ['id' => 1],
            ['oauth_state' => $state, 'updated_at' => now(), 'created_at' => now()]
        );

        $query = http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/gmail.readonly',
            'access_type' => 'offline',
            'prompt' => 'consent',
            'state' => $state,
            'include_granted_scopes' => 'false',
        ]);

        return response()->json([
            'authorization_url' => 'https://accounts.google.com/o/oauth2/v2/auth?'.$query,
        ]);
    }

    public function callback(Request $request)
    {
        $connection = DB::table('bank_gmail_connections')->where('id', 1)->first();
        $state = (string) $request->query('state', '');
        $frontendUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/');

        if (! $connection || ! hash_equals((string) $connection->oauth_state, $state)) {
            return redirect($frontendUrl.'/#/bank-deposits');
        }

        $error = (string) $request->query('error', '');
        $code = (string) $request->query('code', '');
        if ($error || $code === '') {
            DB::table('bank_gmail_connections')->where('id', 1)->update([
                'oauth_state' => null,
                'last_error' => $error ?: 'Google did not return an authorization code.',
                'updated_at' => now(),
            ]);
            return redirect($frontendUrl.'/#/bank-deposits');
        }

        $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
            'redirect_uri' => config('services.google.redirect'),
            'grant_type' => 'authorization_code',
        ]);
        if (! $response->successful()) {
            DB::table('bank_gmail_connections')->where('id', 1)->update([
                'oauth_state' => null,
                'last_error' => 'Gmail OAuth exchange failed: '.$response->json('error_description', $response->body()),
                'updated_at' => now(),
            ]);
            return redirect($frontendUrl.'/#/bank-deposits');
        }

        $accessToken = (string) $response->json('access_token');
        $refreshToken = (string) ($response->json('refresh_token') ?: $connection->refresh_token);
        $email = null;
        if ($accessToken) {
            $profile = Http::withToken($accessToken)->acceptJson()
                ->get('https://www.googleapis.com/oauth2/v2/userinfo');
            if ($profile->successful()) {
                $email = (string) $profile->json('email');
            }
        }

        if (! $refreshToken) {
            DB::table('bank_gmail_connections')->where('id', 1)->update([
                'oauth_state' => null,
                'last_error' => 'Google did not return a refresh token. Reconnect with consent.',
                'updated_at' => now(),
            ]);
            return redirect($frontendUrl.'/#/bank-deposits');
        }

        DB::table('bank_gmail_connections')->where('id', 1)->update([
            'email' => $email,
            'access_token' => Crypt::encryptString($accessToken),
            'refresh_token' => Crypt::encryptString($refreshToken),
            'token_expires_at' => now()->addSeconds((int) $response->json('expires_in', 3600)),
            'oauth_state' => null,
            'last_error' => null,
            'updated_at' => now(),
        ]);

        return redirect($frontendUrl.'/#/bank-deposits');
    }

    public function sync(Request $request, GtBankGmailService $gmail): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        try {
            $result = $gmail->sync();
            return response()->json($result);
        } catch (\Throwable $exception) {
            DB::table('bank_gmail_connections')->where('id', 1)->update([
                'last_error' => $exception->getMessage(),
                'updated_at' => now(),
            ]);
            return response()->json(['message' => $exception->getMessage()], 422);
        }
    }

    public function disconnect(Request $request): JsonResponse
    {
        if ($response = $this->ensureManager($request)) {
            return $response;
        }

        DB::table('bank_gmail_connections')->where('id', 1)->update([
            'email' => null,
            'access_token' => null,
            'refresh_token' => null,
            'token_expires_at' => null,
            'oauth_state' => null,
            'last_error' => null,
            'updated_at' => now(),
        ]);

        return response()->json(['message' => 'Gmail account disconnected. GTBank SMS alerts remain ignored.']);
    }

    private function ensureManager(Request $request): ?JsonResponse
    {
        if ($request->user()?->normalized_role !== 'manager') {
            return response()->json(['message' => 'Only managers can configure GTBank Gmail alerts.'], 403);
        }
        return null;
    }
}
