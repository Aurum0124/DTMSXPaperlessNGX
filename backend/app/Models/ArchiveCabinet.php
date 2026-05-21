<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ArchiveCabinet extends Model
{
    protected $fillable = [
        'tag_id',
        'name',
        'code',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'tag_id' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function drawers(): HasMany
    {
        return $this->hasMany(ArchiveDrawer::class, 'cabinet_id')->orderBy('sort_order')->orderBy('id');
    }
}
