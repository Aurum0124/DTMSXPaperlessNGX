<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::dropIfExists('archive_cabinets');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::create('archive_cabinets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tag_id');
            $table->string('name', 128);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index('tag_id');
        });
    }
};
