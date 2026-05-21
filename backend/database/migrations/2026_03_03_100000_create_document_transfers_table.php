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
        Schema::create('document_transfers', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id')->comment('Paperless-ngx document ID');
            $table->string('tracking_code', 64)->index();
            $table->unsignedInteger('from_tag_id')->nullable()->comment('Source department tag ID');
            $table->unsignedInteger('to_tag_id')->nullable()->comment('Destination department tag ID');
            $table->string('type', 16)->comment('release|receive');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('document_transfers');
    }
};
