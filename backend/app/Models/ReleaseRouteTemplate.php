<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReleaseRouteTemplate extends Model
{
    protected $fillable = [
        'tag_id',
        'name',
        'route_sequence',
        'route_can_take_action',
        'route_need_endorsement',
    ];

    protected $casts = [
        'route_sequence' => 'array',
        'route_can_take_action' => 'array',
        'route_need_endorsement' => 'array',
    ];
}
