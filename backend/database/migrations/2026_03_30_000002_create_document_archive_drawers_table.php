<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_archive_drawers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id')->comment('Paperless document id');
            $table->foreignId('drawer_id')->constrained('archive_drawers')->restrictOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique('document_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_archive_drawers');
    }
};
