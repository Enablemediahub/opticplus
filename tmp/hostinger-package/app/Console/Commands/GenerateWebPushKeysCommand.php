<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Minishlink\WebPush\VAPID;

class GenerateWebPushKeysCommand extends Command
{
    protected $signature = 'webpush:generate-vapid';

    protected $description = 'Generate a VAPID key pair for manager phone notifications';

    public function handle(): int
    {
        $keys = VAPID::createVapidKeys();

        $this->warn('The private key is secret. Store it only in the server .env file.');
        $this->line('WEBPUSH_PUBLIC_KEY='.$keys['publicKey']);
        $this->line('WEBPUSH_PRIVATE_KEY='.$keys['privateKey']);

        return self::SUCCESS;
    }
}
