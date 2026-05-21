<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StatsActivityEvent extends Model
{
    protected $table = 'stats_activity_events';

    protected $fillable = [
        'tag_id',
        'document_id',
        'event_type',
        'occurred_at',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
    ];
}
