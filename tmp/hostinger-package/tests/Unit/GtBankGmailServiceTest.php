<?php

namespace Tests\Unit;

use App\Services\GtBankGmailService;
use Tests\TestCase;

class GtBankGmailServiceTest extends TestCase
{
    public function test_gtbank_email_uses_current_balance_and_preserves_email_date(): void
    {
        $service = new GtBankGmailService;
        $method = new \ReflectionMethod($service, 'parseMessage');

        $body = base64_encode("Dear Customer,\nAccount: 1234\nCurrent Balance: NGN 125,430.50\nAvailable Balance: NGN 120,000.25");
        $message = [
            'internalDate' => '1763452800000',
            'payload' => [
                'headers' => [
                    ['name' => 'From', 'value' => 'GTBank <gh.gens@gtbank.com>'],
                    ['name' => 'Date', 'value' => 'Tue, 18 Nov 2026 14:32:10 +0000'],
                ],
                'mimeType' => 'text/plain',
                'body' => ['data' => strtr(rtrim($body, '='), '+/', '-_')],
            ],
        ];

        $parsed = $method->invoke($service, $message);

        $this->assertNotNull($parsed);
        $this->assertEquals(125430.50, $parsed['current_balance']);
        $this->assertEquals(120000.25, $parsed['available_balance']);
        $this->assertSame('1234', $parsed['account_suffix']);
        $this->assertSame('2026-11-18 14:32:10', $parsed['email_at']->format('Y-m-d H:i:s'));
    }
}
