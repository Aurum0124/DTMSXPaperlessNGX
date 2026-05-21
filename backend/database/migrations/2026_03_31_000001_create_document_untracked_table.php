<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_untracked', function (Blueprint $table) {
            $table->unsignedBigInteger('document_id')->primary()->comment('Paperless document id');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_untracked');
    }
};
