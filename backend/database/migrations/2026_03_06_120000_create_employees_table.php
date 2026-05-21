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
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->string('employee_number', 64)->unique();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('position', 128)->nullable();
            $table->unsignedBigInteger('tag_id')->nullable()->comment('Office/department from Paperless tags');
            $table->string('status', 32)->default('active'); // active | inactive
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
