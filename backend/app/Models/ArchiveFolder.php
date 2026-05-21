<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ArchiveFolder extends Model
{
    protected $fillable = [
        'drawer_id',
        'folder_number',
        'name',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'drawer_id' => 'integer',
            'folder_number' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function drawer(): BelongsTo
    {
        return $this->belongsTo(ArchiveDrawer::class, 'drawer_id');
    }

    public function placements(): HasMany
    {
        return $this->hasMany(DocumentArchiveDrawer::class, 'folder_id');
    }
}
