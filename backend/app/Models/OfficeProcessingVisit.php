<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OfficeProcessingVisit extends Model
{
    protected $fillable = [
        'tag_id',
        'document_id',
        'receive_transfer_id',
        'release_transfer_id',
        'days_taken',
    ];

    protected $casts = [
        'days_taken' => 'float',
    ];
}
