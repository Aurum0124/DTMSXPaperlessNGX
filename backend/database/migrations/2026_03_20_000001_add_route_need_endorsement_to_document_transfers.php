<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->json('route_need_endorsement')->nullable()->after('route_can_take_action')
                ->comment('Tag IDs of offices that must endorse before document can be acted upon.');
        });
    }

    public function down(): void
    {
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->dropColumn('route_need_endorsement');
        });
    }
};
