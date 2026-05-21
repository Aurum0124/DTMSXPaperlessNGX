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
        Schema::create('release_route_templates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tag_id')->comment('Office that can use this template');
            $table->string('name', 128);
            $table->json('route_sequence')->comment('Ordered list of tag IDs (office IDs)');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('release_route_templates');
    }
};
