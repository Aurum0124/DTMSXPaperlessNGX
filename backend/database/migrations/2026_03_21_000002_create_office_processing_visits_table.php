<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('office_processing_visits', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('tag_id')->index()->comment('Office that received then released');
            $table->unsignedBigInteger('document_id');
            $table->unsignedBigInteger('receive_transfer_id');
            $table->unsignedBigInteger('release_transfer_id')->unique()->comment('One visit per release');
            $table->decimal('days_taken', 12, 4)->comment('Days from receive to release');
            $table->timestamps();
        });

        Schema::table('office_processing_visits', function (Blueprint $table) {
            $table->index(['tag_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('office_processing_visits');
    }
};
