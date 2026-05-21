<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected $table = 'users';

    public $timestamps = false;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'username',
        'email',
        'password',
        'role',
        'employee_status',
        'profile_image',
        'phone',
        'branch',
        'branch_id',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'branch_id' => 'integer',
        ];
    }

    public function scopeForLogin(Builder $query, string $login): Builder
    {
        $normalized = mb_strtolower(trim($login));

        return $query->whereRaw('LOWER(username) = ?', [$normalized])
            ->orWhereRaw('LOWER(email) = ?', [$normalized]);
    }

    public function isAdmin(): bool
    {
        return in_array($this->normalized_role, ['ceo', 'manager', 'accountant'], true);
    }

    public function getNormalizedRoleAttribute(): string
    {
        return match ($this->role) {
            'general-manager' => 'manager',
            default => $this->role,
        };
    }
}
