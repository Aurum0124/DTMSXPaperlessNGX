<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Change document_transfers.user_id to SET NULL on user delete,
     * so removing an office (deleting its User) does not cascade-delete transfer history.
     */
    public function up(): void
    {
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->change();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });
        Schema::table('document_transfers', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable(false)->change();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
