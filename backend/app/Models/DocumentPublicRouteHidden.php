<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * When set, the document is not returned by the unauthenticated public tracker API (same as unknown code).
 * Staff document lookup (authenticated) and the in-app document viewer still show full details.
 */
class DocumentPublicRouteHidden extends Model
{
    protected $table = 'document_public_route_hidden';

    protected $primaryKey = 'document_id';

    public $incrementing = false;

    protected $keyType = 'int';

    protected $fillable = [
        'document_id',
    ];
}
