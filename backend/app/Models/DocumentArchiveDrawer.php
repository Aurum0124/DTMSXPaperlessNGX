<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentArchiveDrawer extends Model
{
    protected $table = 'document_archive_drawers';

    protected $fillable = [
        'document_id',
        'drawer_id',
        'folder_id',
        'archive_sequence',
        'archive_reference',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'document_id' => 'integer',
            'drawer_id' => 'integer',
            'folder_id' => 'integer',
            'archive_sequence' => 'integer',
            'user_id' => 'integer',
        ];
    }

    public function drawer(): BelongsTo
    {
        return $this->belongsTo(ArchiveDrawer::class, 'drawer_id');
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(ArchiveFolder::class, 'folder_id');
    }
}
