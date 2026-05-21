<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('archive_folders', function (Blueprint $table) {
            $table->string('name', 128)->nullable()->after('folder_number');
        });

        Schema::table('archive_drawers', function (Blueprint $table) {
            $table->dropColumn('category');
        });
    }

    public function down(): void
    {
        Schema::table('archive_drawers', function (Blueprint $table) {
            $table->string('category', 128)->nullable()->after('name');
        });

        Schema::table('archive_folders', function (Blueprint $table) {
            $table->dropColumn('name');
        });
    }
};
