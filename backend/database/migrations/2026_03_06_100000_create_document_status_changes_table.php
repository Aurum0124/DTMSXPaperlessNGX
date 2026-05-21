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
        Schema::create('document_status_changes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id')->comment('Paperless-ngx document ID');
            $table->string('from_status', 32)->nullable()->comment('Previous status');
            $table->string('to_status', 32)->comment('New status: Under Review, Approved, Rejected');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
        });

        Schema::table('document_status_changes', function (Blueprint $table) {
            $table->index('document_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('document_status_changes');
    }
};
