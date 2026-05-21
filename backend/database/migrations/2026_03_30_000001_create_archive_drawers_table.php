<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('archive_drawers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tag_id')->comment('Paperless office tag id');
            $table->string('name', 128);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index('tag_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('archive_drawers');
    }
};
