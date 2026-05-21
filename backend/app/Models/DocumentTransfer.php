<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentTransfer extends Model
{
    protected $fillable = [
        'document_id',
        'tracking_code',
        'from_tag_id',
        'to_tag_id',
        'type',
        'digital_mode',
        'received_at_wrong_office',
        'route_sequence',
        'route_can_take_action',
        'route_need_endorsement',
        'user_id',
    ];

    protected $casts = [
        'route_sequence' => 'array',
        'route_can_take_action' => 'array',
        'route_need_endorsement' => 'array',
        'received_at_wrong_office' => 'boolean',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
