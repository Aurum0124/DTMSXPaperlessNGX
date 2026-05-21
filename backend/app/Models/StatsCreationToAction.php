<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StatsCreationToAction extends Model
{
    protected $table = 'stats_creation_to_action';

    protected $fillable = [
        'document_id',
        'created_at_doc',
        'action_at',
        'days_taken',
    ];

    protected $casts = [
        'created_at_doc' => 'datetime',
        'action_at' => 'datetime',
        'days_taken' => 'float',
    ];
}
