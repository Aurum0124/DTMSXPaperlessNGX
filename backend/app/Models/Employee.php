<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    protected $fillable = [
        'employee_number',
        'name',
        'email',
        'position',
        'tag_id',
        'status',
    ];

    protected function casts(): array
    {
        return [];
    }
}
