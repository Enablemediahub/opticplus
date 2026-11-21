<?php

namespace Tests\Unit;

use App\Services\CustomerFollowupSchedule;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

class CustomerFollowupScheduleTest extends TestCase
{
    public function test_it_schedules_one_week_six_month_and_two_year_checkups_without_month_overflow(): void
    {
        $milestones = (new CustomerFollowupSchedule())->milestones(Carbon::parse('2026-01-31 13:15:00'));

        $this->assertSame([
            ['milestone' => 'week_1', 'due_at' => '2026-02-07'],
            ['milestone' => 'six_months', 'due_at' => '2026-07-31'],
            ['milestone' => 'two_years', 'due_at' => '2028-01-31'],
        ], $milestones);
    }

    public function test_it_moves_a_leap_day_two_year_checkup_to_the_last_day_of_february(): void
    {
        $milestones = (new CustomerFollowupSchedule())->milestones(Carbon::parse('2024-02-29 10:00:00'));

        $this->assertSame('2026-02-28', $milestones[2]['due_at']);
    }
}
