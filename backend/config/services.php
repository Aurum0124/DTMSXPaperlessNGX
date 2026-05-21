<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'paperless' => [
        'url' => env('PAPERLESS_URL', 'http://localhost:8080'),
        'token' => env('PAPERLESS_TOKEN'),
    ],

    'ollama' => [
        'url' => env('OLLAMA_URL', 'http://localhost:11434'),
        'model' => env('OLLAMA_MODEL', 'mistral'),
        'max_content_chars' => (int) env('OLLAMA_MAX_CONTENT_CHARS', 4000),
        'num_predict' => (int) env('OLLAMA_NUM_PREDICT', 256),
    ],

    'title_suggestion' => [
        'mode' => env('TITLE_SUGGESTION_MODE', 'llm_with_ocr_fallback'),
    ],

];
