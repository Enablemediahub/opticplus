<?php

namespace Tests\Feature;

use App\Http\Controllers\StaffPortalController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class StaffPortalPasswordTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('staff_portal_accounts');
        Schema::create('staff_portal_accounts', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id');
            $table->string('staff_id', 20);
            $table->string('password');
            $table->boolean('must_change_password')->default(true);
            $table->unsignedInteger('session_version')->default(1);
            $table->timestamps();
        });
        DB::table('staff_portal_accounts')->insert([
            'id' => 12,
            'employee_id' => 5,
            'staff_id' => 'BOCSTAFF005',
            'password' => Hash::make('temporary123'),
            'must_change_password' => true,
            'session_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('staff_portal_accounts');

        parent::tearDown();
    }

    public function test_staff_can_use_six_character_numeric_alphabetic_or_alphanumeric_passwords(): void
    {
        $controller = new StaffPortalController;
        $currentPassword = 'temporary123';
        foreach (['123456', 'abcdef', 'abc123'] as $newPassword) {
            $response = $controller->changePassword($this->passwordRequest($currentPassword, $newPassword));

            $this->assertSame(200, $response->getStatusCode());
            $this->assertTrue(Hash::check($newPassword, DB::table('staff_portal_accounts')->where('id', 12)->value('password')));
            $currentPassword = $newPassword;
        }

        $this->assertSame(4, (int) DB::table('staff_portal_accounts')->where('id', 12)->value('session_version'));
        $this->assertFalse((bool) DB::table('staff_portal_accounts')->where('id', 12)->value('must_change_password'));
        $this->assertSame(4, Cache::get('opticplus_staff_portal_token:staff-password-test-token')['session_version']);
    }

    public function test_staff_cannot_set_a_password_shorter_than_six_characters(): void
    {
        $this->expectException(ValidationException::class);

        (new StaffPortalController)->changePassword($this->passwordRequest('temporary123', 'abc12'));
    }

    private function passwordRequest(string $currentPassword, string $newPassword): Request
    {
        $request = Request::create('/api/v1/staff/password', 'PUT', [
            'current_password' => $currentPassword,
            'password' => $newPassword,
            'password_confirmation' => $newPassword,
        ]);
        $request->attributes->set('staff_portal_account', (object) ['account_id' => 12]);
        $request->attributes->set('staff_portal_token', 'staff-password-test-token');

        return $request;
    }
}
