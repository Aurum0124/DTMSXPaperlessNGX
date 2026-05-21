<?php

use App\Models\DocumentTransfer;
use App\Models\OfficeProcessingVisit;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $transfers = DocumentTransfer::where('type', 'release')
            ->whereNotNull('from_tag_id')
            ->orderBy('document_id')
            ->orderBy('created_at')
            ->get(['id', 'document_id', 'from_tag_id', 'created_at']);

        $processedReleaseIds = OfficeProcessingVisit::pluck('release_transfer_id')->flip()->all();

        foreach ($transfers as $release) {
            if (isset($processedReleaseIds[$release->id])) {
                continue;
            }

            $tagId = (int) $release->from_tag_id;

            $receive = DocumentTransfer::where('document_id', $release->document_id)
                ->where('type', 'receive')
                ->where('to_tag_id', $tagId)
                ->where('created_at', '<', $release->created_at)
                ->orderByDesc('created_at')
                ->first(['id', 'created_at']);

            if (! $receive) {
                continue;
            }

            $days = ($release->created_at->timestamp - $receive->created_at->timestamp) / 86400;
            if ($days < 0) {
                continue;
            }

            OfficeProcessingVisit::firstOrCreate(
                ['release_transfer_id' => $release->id],
                [
                    'tag_id' => $tagId,
                    'document_id' => $release->document_id,
                    'receive_transfer_id' => $receive->id,
                    'days_taken' => $days,
                ]
            );
        }
    }

    public function down(): void
    {
        OfficeProcessingVisit::truncate();
    }
};
