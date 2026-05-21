<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stats_creation_to_action', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('document_id')->unique();
            $table->timestamp('created_at_doc')->comment('Document added/created in Paperless');
            $table->timestamp('action_at')->comment('When Approved or Rejected');
            $table->decimal('days_taken', 12, 4)->comment('Days from creation to action');
            $table->timestamps(); // Laravel created_at, updated_at
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stats_creation_to_action');
    }
};
