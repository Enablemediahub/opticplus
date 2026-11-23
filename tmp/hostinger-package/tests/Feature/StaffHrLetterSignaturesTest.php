<?php

namespace Tests\Feature;

use App\Http\Controllers\StaffHrController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StaffHrLetterSignaturesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('hr_letter_signatures');
        Schema::dropIfExists('hr_letter_manager_signatures');
        Schema::dropIfExists('hr_staff_signatures');
        Schema::dropIfExists('hr_letter_templates');
        Schema::dropIfExists('hr_letters');
        Schema::dropIfExists('employees_comprehensive');

        Schema::create('employees_comprehensive', function (Blueprint $table): void {
            $table->unsignedInteger('id')->primary();
            $table->string('ghana_card_name');
            $table->string('staff_id');
            $table->string('job_title');
            $table->string('department')->nullable();
            $table->string('status')->default('active');
        });
        Schema::create('hr_letters', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id')->nullable();
            $table->string('target_role')->nullable();
            $table->string('title');
            $table->longText('body');
            $table->boolean('requires_signature')->default(false);
            $table->string('status');
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->string('attachment_path')->nullable();
            $table->string('attachment_name')->nullable();
            $table->timestamps();
        });
        Schema::create('hr_letter_templates', function (Blueprint $table): void {
            $table->id();
            $table->boolean('requires_signature')->default(false);
        });
        Schema::create('hr_staff_signatures', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id')->unique();
            $table->string('file_path');
            $table->string('mime_type');
        });
        Schema::create('hr_letter_signatures', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('letter_id');
            $table->unsignedInteger('employee_id');
            $table->string('signature_path');
            $table->string('mime_type');
            $table->timestamp('signed_at');
            $table->timestamps();
            $table->unique(['letter_id', 'employee_id']);
        });

        DB::table('employees_comprehensive')->insert([
            ['id' => 12, 'ghana_card_name' => 'Ama Mensah', 'staff_id' => 'OPT-012', 'job_title' => 'Optometrist', 'department' => 'Clinical'],
            ['id' => 24, 'ghana_card_name' => 'Kojo Asare', 'staff_id' => 'OPT-024', 'job_title' => 'Cashier', 'department' => 'Finance'],
        ]);
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('hr_letter_signatures');
        Schema::dropIfExists('hr_letter_manager_signatures');
        Schema::dropIfExists('hr_staff_signatures');
        Schema::dropIfExists('hr_letter_templates');
        Schema::dropIfExists('hr_letters');
        Schema::dropIfExists('employees_comprehensive');

        parent::tearDown();
    }

    public function test_staff_signature_is_snapshotted_and_shown_on_the_published_letter(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('hr-signatures/ama.png', 'signature image');
        DB::table('hr_staff_signatures')->insert([
            'employee_id' => 12,
            'file_path' => 'hr-signatures/ama.png',
            'mime_type' => 'image/png',
        ]);
        $letterId = $this->createLetter(12, null, true);
        $request = $this->staffRequest(12, 'Optometrist');
        $controller = new StaffHrController;

        $signed = $controller->signLetter($request, $letterId);

        $this->assertSame(200, $signed->getStatusCode());
        $this->assertSame('data:image/png;base64,'.base64_encode('signature image'), $signed->getData(true)['signed_signature']);
        $signing = DB::table('hr_letter_signatures')->where('letter_id', $letterId)->where('employee_id', 12)->first();
        $this->assertNotNull($signing);
        Storage::disk('local')->assertExists($signing->signature_path);
        $managerRequest = Request::create('/api/v1/manager/hr-space/letters/'.$letterId.'/signatures/12', 'GET');
        $managerRequest->setUserResolver(fn () => (object) ['id' => 1, 'normalized_role' => 'manager']);
        $signedLetter = $controller->viewSignedLetter($managerRequest, $letterId, 12);
        $this->assertSame(200, $signedLetter->getStatusCode());
        $this->assertSame('Letter for Ama Mensah', $signedLetter->getData(true)['letter']['body']);
        $this->assertSame('data:image/png;base64,'.base64_encode('signature image'), $signedLetter->getData(true)['signature']);
        $staffRequest = Request::create('/api/v1/manager/hr-space/letters/'.$letterId.'/signatures/12', 'GET');
        $staffRequest->setUserResolver(fn () => (object) ['id' => 12, 'normalized_role' => 'staff']);
        $this->assertSame(403, $controller->viewSignedLetter($staffRequest, $letterId, 12)->getStatusCode());
        Storage::disk('local')->put('hr-signatures/replacement.png', 'replacement signature');
        Storage::disk('local')->delete('hr-signatures/ama.png');

        $letters = $controller->myLetters($request)->getData(true)['letters'];
        $this->assertCount(1, $letters);
        $this->assertNotNull($letters[0]['signed_at']);
        $this->assertSame('data:image/png;base64,'.base64_encode('signature image'), $letters[0]['signed_signature']);
        $this->assertSame('Letter for Ama Mensah', $letters[0]['body']);

        $duplicate = $controller->signLetter($request, $letterId);
        $this->assertSame(409, $duplicate->getStatusCode());
    }

    public function test_staff_can_sign_only_published_required_letters_assigned_to_them(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('hr-signatures/ama.png', 'signature image');
        DB::table('hr_staff_signatures')->insert([
            'employee_id' => 12,
            'file_path' => 'hr-signatures/ama.png',
            'mime_type' => 'image/png',
        ]);
        $otherEmployeeLetter = $this->createLetter(24, null, true);
        $otherRoleLetter = $this->createLetter(null, 'Cashier', true);
        $unsignedLetter = $this->createLetter(12, null, false);
        $draftLetter = $this->createLetter(12, null, true, 'draft');
        Storage::fake('local');
        Storage::disk('local')->put('hr-letters/cashier.pdf', '%PDF-1.4 test document');
        DB::table('hr_letters')->where('id', $otherRoleLetter)->update(['attachment_path' => 'hr-letters/cashier.pdf']);
        $controller = new StaffHrController;
        $request = $this->staffRequest(12, 'Optometrist');

        $this->assertSame(404, $controller->signLetter($request, $otherEmployeeLetter)->getStatusCode());
        $this->assertSame(404, $controller->signLetter($request, $otherRoleLetter)->getStatusCode());
        $this->assertSame(404, $controller->downloadMyLetterAttachment($request, $otherRoleLetter)->getStatusCode());
        $this->assertSame(422, $controller->signLetter($request, $unsignedLetter)->getStatusCode());
        $this->assertSame(404, $controller->signLetter($request, $draftLetter)->getStatusCode());
        $this->assertSame(0, DB::table('hr_letter_signatures')->count());
    }

    public function test_manager_can_save_letters_with_numeric_multipart_signature_flags(): void
    {
        $controller = new StaffHrController;
        foreach ([['0', false], ['1', true]] as [$flag, $expected]) {
            $request = Request::create('/api/v1/manager/hr-space/letters', 'POST', [
                'title' => 'Staff letter',
                'body' => 'Letter body',
                'requires_signature' => $flag,
            ]);
            $request->setUserResolver(fn () => (object) ['id' => 1, 'normalized_role' => 'manager']);

            $response = $controller->saveLetter($request);

            $this->assertSame(201, $response->getStatusCode());
            $this->assertSame($expected, (bool) DB::table('hr_letters')->where('id', $response->getData(true)['id'])->value('requires_signature'));
        }
    }

    public function test_staff_letter_feed_includes_manager_signature_even_without_published_letters(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('hr-letter-manager-signatures/gm.png', 'manager signature image');
        Schema::create('hr_letter_manager_signatures', function (Blueprint $table): void {
            $table->unsignedInteger('id')->primary();
            $table->string('file_path');
            $table->string('mime_type');
            $table->timestamps();
        });
        DB::table('hr_letter_manager_signatures')->insert([
            'id' => 1,
            'file_path' => 'hr-letter-manager-signatures/gm.png',
            'mime_type' => 'image/png',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = (new StaffHrController)->myLetters($this->staffRequest(12, 'Optometrist'))->getData(true);

        $this->assertSame([], $response['letters']);
        $this->assertSame('data:image/png;base64,'.base64_encode('manager signature image'), $response['manager_signature']);
    }

    private function createLetter(?int $employeeId, ?string $targetRole, bool $requiresSignature, string $status = 'published'): int
    {
        return (int) DB::table('hr_letters')->insertGetId([
            'employee_id' => $employeeId,
            'target_role' => $targetRole,
            'title' => 'Staff letter',
            'body' => 'Letter for {employee_name}',
            'requires_signature' => $requiresSignature,
            'status' => $status,
            'published_at' => $status === 'published' ? now() : null,
            'attachment_name' => null,
        ]);
    }

    private function staffRequest(int $employeeId, string $jobTitle): Request
    {
        $request = Request::create('/api/v1/staff/letters', 'GET');
        $request->attributes->set('staff_portal_account', (object) [
            'id' => $employeeId,
            'ghana_card_name' => 'Ama Mensah',
            'staff_id' => 'OPT-012',
            'job_title' => $jobTitle,
            'department' => 'Clinical',
        ]);

        return $request;
    }
}
