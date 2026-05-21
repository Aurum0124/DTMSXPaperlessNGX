<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stats_activity_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('tag_id')->index()->comment('Office');
            $table->unsignedBigInteger('document_id')->index();
            $table->string('event_type', 16)->index()->comment('receive or originate');
            $table->timestamp('occurred_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stats_activity_events');
    }
};
