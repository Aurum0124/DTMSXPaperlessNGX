<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Composite index for document_id + created_at to speed up
     * "latest transfer per document" queries (AdminStatsController, NeedsActionBadge, etc.).
     */
    public function up(): void
    {
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->index(['document_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->dropIndex(['document_id', 'created_at']);
        });
    }
};
