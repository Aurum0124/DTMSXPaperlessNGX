<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Digital archive policy
    |--------------------------------------------------------------------------
    |
    | Digital-only pending documents are blocked from archive by default.
    | Add office tag IDs or Paperless document type IDs here to allow archiving.
    |
    */
    'allow_digital_archive_office_tag_ids' => array_values(array_filter(array_map('intval', explode(',', (string) env('ALLOW_DIGITAL_ARCHIVE_OFFICE_TAG_IDS', ''))))),
    'allow_digital_archive_document_type_ids' => array_values(array_filter(array_map('intval', explode(',', (string) env('ALLOW_DIGITAL_ARCHIVE_DOCUMENT_TYPE_IDS', ''))))),
];
