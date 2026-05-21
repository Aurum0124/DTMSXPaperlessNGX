<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ArchiveDrawer extends Model
{
    protected $fillable = [
        'tag_id',
        'cabinet_id',
        'name',
        'drawer_code',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'tag_id' => 'integer',
            'cabinet_id' => 'integer',
            'sort_order' => 'integer',
        ];
    }

    public function cabinet(): BelongsTo
    {
        return $this->belongsTo(ArchiveCabinet::class, 'cabinet_id');
    }

    public function placements(): HasMany
    {
        return $this->hasMany(DocumentArchiveDrawer::class, 'drawer_id');
    }

    public function folders(): HasMany
    {
        return $this->hasMany(ArchiveFolder::class, 'drawer_id')->orderBy('folder_number')->orderBy('id');
    }

    /** User-facing label: drawer code segment only (e.g. D2). */
    public function labelForDisplay(): string
    {
        return 'D'.(string) ($this->drawer_code ?? '');
    }
}
