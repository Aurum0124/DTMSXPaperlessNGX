<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('release_route_templates', function (Blueprint $table) {
            $table->json('route_can_take_action')->nullable()->after('route_sequence')
                ->comment('Tag IDs of offices that can take action. Last office auto-included.');
        });
    }

    public function down(): void
    {
        Schema::table('release_route_templates', function (Blueprint $table) {
            $table->dropColumn('route_can_take_action');
        });
    }
};
