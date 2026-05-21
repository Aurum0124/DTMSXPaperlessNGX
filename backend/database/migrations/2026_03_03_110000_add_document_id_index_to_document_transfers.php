<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->index('document_id');
        });
    }

    public function down(): void
    {
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->dropIndex(['document_id']);
        });
    }
};
