<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentEndorsement extends Model
{
    protected $fillable = [
        'document_id',
        'tag_id',
        'user_id',
        'remarks',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
