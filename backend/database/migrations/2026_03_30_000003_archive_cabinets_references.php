<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('archive_cabinets', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tag_id')->comment('Paperless office tag id');
            $table->string('name', 128);
            $table->string('code', 16)->comment('Shown as C{code} in archive reference');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['tag_id', 'code']);
            $table->index('tag_id');
        });

        Schema::table('archive_drawers', function (Blueprint $table) {
            $table->foreignId('cabinet_id')->nullable()->after('tag_id')->constrained('archive_cabinets')->restrictOnDelete();
            $table->string('drawer_code', 16)->nullable()->after('name')->comment('Shown as D{code} in archive reference');
        });

        $tagIds = DB::table('archive_drawers')->distinct()->pluck('tag_id')->filter();
        foreach ($tagIds as $tid) {
            $cid = DB::table('archive_cabinets')->insertGetId([
                'tag_id' => $tid,
                'name' => 'Cabinet 1',
                'code' => '1',
                'sort_order' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('archive_drawers')->where('tag_id', $tid)->update(['cabinet_id' => $cid]);
        }

        $cabinetIds = DB::table('archive_drawers')->distinct()->pluck('cabinet_id')->filter();
        foreach ($cabinetIds as $cabinetId) {
            $rows = DB::table('archive_drawers')
                ->where('cabinet_id', $cabinetId)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get();
            $n = 0;
            foreach ($rows as $r) {
                $n++;
                DB::table('archive_drawers')->where('id', $r->id)->update(['drawer_code' => (string) $n]);
            }
        }

        Schema::table('document_archive_drawers', function (Blueprint $table) {
            $table->unsignedInteger('archive_sequence')->nullable()->after('drawer_id');
            $table->string('archive_reference', 48)->nullable()->after('archive_sequence');
        });

        $drawerMeta = DB::table('archive_drawers')
            ->join('archive_cabinets', 'archive_cabinets.id', '=', 'archive_drawers.cabinet_id')
            ->select('archive_drawers.id', 'archive_drawers.drawer_code', 'archive_cabinets.code as cabinet_code')
            ->get()
            ->keyBy('id');

        $placements = DB::table('document_archive_drawers')->orderBy('drawer_id')->orderBy('id')->get();
        $byDrawer = [];
        foreach ($placements as $p) {
            $byDrawer[$p->drawer_id][] = $p->id;
        }
        foreach ($byDrawer as $drawerId => $ids) {
            $d = $drawerMeta[$drawerId] ?? null;
            if (! $d) {
                continue;
            }
            $seq = 0;
            foreach ($ids as $placementId) {
                $seq++;
                $ref = sprintf(
                    'C%s.D%s.%s',
                    $d->cabinet_code,
                    $d->drawer_code,
                    str_pad((string) $seq, 3, '0', STR_PAD_LEFT)
                );
                DB::table('document_archive_drawers')->where('id', $placementId)->update([
                    'archive_sequence' => $seq,
                    'archive_reference' => $ref,
                ]);
            }
        }

        Schema::table('archive_drawers', function (Blueprint $table) {
            $table->unique(['cabinet_id', 'drawer_code']);
        });
    }

    public function down(): void
    {
        Schema::table('archive_drawers', function (Blueprint $table) {
            $table->dropUnique(['cabinet_id', 'drawer_code']);
        });

        Schema::table('document_archive_drawers', function (Blueprint $table) {
            $table->dropColumn(['archive_sequence', 'archive_reference']);
        });

        Schema::table('archive_drawers', function (Blueprint $table) {
            $table->dropForeign(['cabinet_id']);
            $table->dropColumn(['cabinet_id', 'drawer_code']);
        });

        Schema::dropIfExists('archive_cabinets');
    }
};
