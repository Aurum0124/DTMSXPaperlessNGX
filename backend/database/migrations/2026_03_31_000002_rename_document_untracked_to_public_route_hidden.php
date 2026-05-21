<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('document_untracked') && ! Schema::hasTable('document_public_route_hidden')) {
            Schema::rename('document_untracked', 'document_public_route_hidden');
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('document_public_route_hidden') && ! Schema::hasTable('document_untracked')) {
            Schema::rename('document_public_route_hidden', 'document_untracked');
        }
    }
};
