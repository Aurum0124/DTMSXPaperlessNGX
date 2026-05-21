<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('archive_folders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('drawer_id')->constrained('archive_drawers')->cascadeOnDelete();
            $table->unsignedInteger('folder_number')->comment('Shown as F{number} in archive reference');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['drawer_id', 'folder_number']);
            $table->index('drawer_id');
        });

        Schema::table('document_archive_drawers', function (Blueprint $table) {
            $table->foreignId('folder_id')->nullable()->after('drawer_id')->constrained('archive_folders')->restrictOnDelete();
        });

        Schema::table('document_archive_drawers', function (Blueprint $table) {
            $table->index(['drawer_id', 'folder_id']);
        });
    }

    public function down(): void
    {
        Schema::table('document_archive_drawers', function (Blueprint $table) {
            $table->dropForeign(['folder_id']);
            $table->dropIndex(['drawer_id', 'folder_id']);
            $table->dropColumn('folder_id');
        });

        Schema::dropIfExists('archive_folders');
    }
};
