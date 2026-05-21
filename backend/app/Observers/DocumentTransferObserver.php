<?php

namespace App\Observers;

use App\Models\DocumentTransfer;
use App\Models\OfficeProcessingVisit;
use App\Models\StatsActivityEvent;

class DocumentTransferObserver
{
    /**
     * Record processing visit and activity events when transfers are created.
     */
    public function created(DocumentTransfer $transfer): void
    {
        if ($transfer->type === 'receive' && $transfer->to_tag_id) {
            $this->recordReceiveActivity($transfer);
        }

        if (in_array($transfer->type, ['release', 'digital_release', 'archive_release'], true) && $transfer->from_tag_id) {
            $this->recordOriginateActivityIfFirst($transfer);
            $this->recordProcessingVisit($transfer);
        }
    }

    private function recordReceiveActivity(DocumentTransfer $transfer): void
    {
        $tagId = (int) $transfer->to_tag_id;
        $exists = StatsActivityEvent::where('tag_id', $tagId)
            ->where('document_id', $transfer->document_id)
            ->where('event_type', 'receive')
            ->where('occurred_at', $transfer->created_at)
            ->exists();
        if ($exists) {
            return;
        }
        StatsActivityEvent::create([
            'tag_id' => $tagId,
            'document_id' => $transfer->document_id,
            'event_type' => 'receive',
            'occurred_at' => $transfer->created_at,
        ]);
    }

    private function recordOriginateActivityIfFirst(DocumentTransfer $transfer): void
    {
        $tagId = (int) $transfer->from_tag_id;
        $hasEarlier = DocumentTransfer::where('document_id', $transfer->document_id)
            ->where('id', '<', $transfer->id)
            ->exists();
        if ($hasEarlier) {
            return;
        }
        $exists = StatsActivityEvent::where('tag_id', $tagId)
            ->where('document_id', $transfer->document_id)
            ->where('event_type', 'originate')
            ->exists();
        if ($exists) {
            return;
        }
        StatsActivityEvent::create([
            'tag_id' => $tagId,
            'document_id' => $transfer->document_id,
            'event_type' => 'originate',
            'occurred_at' => $transfer->created_at,
        ]);
    }

    private function recordProcessingVisit(DocumentTransfer $transfer): void
    {
        $tagId = (int) $transfer->from_tag_id;

        if (OfficeProcessingVisit::where('release_transfer_id', $transfer->id)->exists()) {
            return;
        }

        $receive = DocumentTransfer::where('document_id', $transfer->document_id)
            ->where('type', 'receive')
            ->where('to_tag_id', $tagId)
            ->where('created_at', '<', $transfer->created_at)
            ->orderByDesc('created_at')
            ->first(['id', 'created_at']);

        if (! $receive) {
            return;
        }

        $days = ($transfer->created_at->timestamp - $receive->created_at->timestamp) / 86400;
        if ($days < 0) {
            return;
        }

        OfficeProcessingVisit::create([
            'tag_id' => $tagId,
            'document_id' => $transfer->document_id,
            'receive_transfer_id' => $receive->id,
            'release_transfer_id' => $transfer->id,
            'days_taken' => $days,
        ]);
    }
}
