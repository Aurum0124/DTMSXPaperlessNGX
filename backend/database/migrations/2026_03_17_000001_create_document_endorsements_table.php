<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_endorsements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id');
            $table->unsignedBigInteger('tag_id')->comment('Office that endorsed');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamps();

            $table->unique(['document_id', 'tag_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_endorsements');
    }
};
