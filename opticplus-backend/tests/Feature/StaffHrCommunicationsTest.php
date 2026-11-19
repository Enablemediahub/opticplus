<?php

namespace Tests\Feature;

use App\Http\Controllers\StaffHrController;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StaffHrCommunicationsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Schema::dropIfExists('hr_staff_communication_reads');
        Schema::dropIfExists('hr_staff_communications');
        Schema::create('hr_staff_communications', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('employee_id')->nullable()->index();
            $table->string('title', 180);
            $table->text('message')->nullable();
            $table->string('attachment_path')->nullable();
            $table->string('attachment_name')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('published_at')->index();
            $table->timestamps();
        });
        Schema::create('hr_staff_communication_reads', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('communication_id');
            $table->unsignedInteger('employee_id');
            $table->timestamp('read_at');
            $table->timestamps();
            $table->unique(['communication_id', 'employee_id'], 'hr_staff_communication_reads_unique');
        });
    }

    protected function tearDown(): void
    {
        Schema::dropIfExists('hr_staff_communication_reads');
        Schema::dropIfExists('hr_staff_communications');

        parent::tearDown();
    }

    public function test_staff_only_receives_broadcast_and_personal_updates_and_reading_decrements_unread_count(): void
    {
        $broadcastId = $this->createCommunication(null, '2026-11-18 10:00:00');
        $personalId = $this->createCommunication(12, '2026-11-19 10:00:00');
        $otherEmployeeId = $this->createCommunication(24, '2026-11-19 11:00:00');
        $controller = new StaffHrController;
        $request = $this->staffRequest(12);

        $initial = $controller->myCommunications($request)->getData(true);
        $this->assertSame([$personalId, $broadcastId], array_column($initial['communications'], 'id'));
        $this->assertSame(2, $initial['unread_count']);

        $controller->markCommunicationRead($request, $personalId);
        $afterRead = $controller->myCommunications($request)->getData(true);
        $this->assertSame(1, $afterRead['unread_count']);
        $this->assertNotNull($afterRead['communications'][0]['read_at']);

        $otherEmployeeResponse = $controller->markCommunicationRead($request, $otherEmployeeId);
        $this->assertSame(404, $otherEmployeeResponse->getStatusCode());
    }

    public function test_staff_can_view_an_authorized_pdf_inline_but_not_another_employees_pdf(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('staff-communications/guide.pdf', '%PDF-1.4 test document');
        $broadcastId = $this->createCommunication(null, '2026-11-18 10:00:00');
        DB::table('hr_staff_communications')->where('id', $broadcastId)->update([
            'attachment_path' => 'staff-communications/guide.pdf',
            'attachment_name' => 'staff-guide.pdf',
        ]);
        $otherEmployeeId = $this->createCommunication(24, '2026-11-19 10:00:00');
        DB::table('hr_staff_communications')->where('id', $otherEmployeeId)->update([
            'attachment_path' => 'staff-communications/guide.pdf',
            'attachment_name' => 'staff-guide.pdf',
        ]);
        $controller = new StaffHrController;

        $response = $controller->viewMyCommunicationAttachment($this->staffRequest(12), $broadcastId);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertStringStartsWith('inline', $response->headers->get('Content-Disposition'));
        $this->assertSame('application/pdf', $response->headers->get('Content-Type'));
        $this->assertSame('private, no-store, max-age=0', $response->headers->get('Cache-Control'));

        $unauthorized = $controller->viewMyCommunicationAttachment($this->staffRequest(12), $otherEmployeeId);
        $this->assertSame(404, $unauthorized->getStatusCode());
    }

    private function createCommunication(?int $employeeId, string $publishedAt): int
    {
        return (int) DB::table('hr_staff_communications')->insertGetId([
            'employee_id' => $employeeId,
            'title' => 'Staff update',
            'message' => 'Please read this update.',
            'attachment_path' => null,
            'attachment_name' => null,
            'created_by' => 1,
            'published_at' => $publishedAt,
            'created_at' => $publishedAt,
            'updated_at' => $publishedAt,
        ]);
    }

    private function staffRequest(int $employeeId): Request
    {
        $request = Request::create('/api/v1/staff/communications', 'GET');
        $request->attributes->set('staff_portal_account', (object) ['id' => $employeeId]);

        return $request;
    }
}
