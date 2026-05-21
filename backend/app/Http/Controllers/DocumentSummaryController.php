<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class DocumentSummaryController extends Controller
{
    private const MAX_TITLE_LENGTH = 80;
    private const MIN_TITLE_LENGTH = 15;
    private const MAX_TITLE_LENGTH_STRICT = 120;
    private const MAX_SUBMITTED_BY_LENGTH = 120;
    private const MAX_LINES_TO_SCAN = 12;

    /**
     * Get suggested titles. Mode: llm_with_ocr_fallback (default) | ocr | llm.
     * LLM uses a concise prompt and short max tokens for brief title suggestions; OCR fallback when LLM fails or mode is ocr.
     */
    public function show(int $id): JsonResponse
    {
        $baseUrl = rtrim(config('services.paperless.url', 'http://localhost:8080'), '/');
        $token = config('services.paperless.token');

        if (!$token) {
            return response()->json(['error' => 'Paperless not configured'], 502);
        }

        $docResponse = Http::withHeaders([
            'Authorization' => 'Token ' . $token,
        ])
            ->timeout(15)
            ->get("{$baseUrl}/api/documents/{$id}/");

        if (!$docResponse->successful()) {
            return response()->json(
                ['error' => 'Document not found or unavailable'],
                $docResponse->status()
            );
        }

        $doc = $docResponse->json();
        $content = $doc['content'] ?? '';
        $fallbackTitle = $doc['title'] ?? $doc['filename'] ?? 'Document';

        $ocrTitles = $this->smartOcrTitles($content, $fallbackTitle);

        if (!is_string($content) || Str::length(Str::trim($content)) < 10) {
            return response()->json([
                'suggested_titles' => $ocrTitles,
                'suggested_document_types' => [],
                'suggested_submitted_by' => null,
                'message' => 'Document has little or no text.',
            ]);
        }

        $mode = config('services.title_suggestion.mode', 'llm_with_ocr_fallback');
        if ($mode === 'ocr') {
            return response()->json([
                'suggested_titles' => $ocrTitles,
                'suggested_document_types' => [],
                'suggested_submitted_by' => null,
            ]);
        }

        $docTypes = $this->fetchPaperlessDocumentTypes($baseUrl, $token);
        $docTypeNames = array_map(fn ($t) => $t['name'], $docTypes);
        $docTypeListStr = count($docTypeNames) > 0
            ? implode(', ', $docTypeNames)
            : '';

        $ollamaUrl = rtrim(config('services.ollama.url', 'http://localhost:11434'), '/');
        $maxChars = min(2500, (int) config('services.ollama.max_content_chars', 4000));
        $contentTrimmed = Str::limit($content, $maxChars, '');
        // Allow enough tokens for models that preamble before TITLE1; 100 was truncating replies.
        $numPredict = min(512, max(128, (int) config('services.ollama.num_predict', 256)));

        $prompt = "Suggest 3 concise document titles (each max 8 words), one document type, and who submitted the letter (person or organization).\n";
        $prompt .= "Reply ONLY with these lines and no other text before them:\nTITLE1: <title>\nTITLE2: <title>\nTITLE3: <title>\n";
        if ($docTypeListStr !== '') {
            $prompt .= "DOCTYPE: <exactly one from this list: {$docTypeListStr}>\n";
        }
        $prompt .= "SUBMITTED_BY: <name of sender or organization>\n";
        $prompt .= "\nDocument text:\n{$contentTrimmed}\n\nBegin with TITLE1:";

        try {
            $ollamaResponse = Http::timeout(60)
                ->post("{$ollamaUrl}/api/generate", [
                    'model' => config('services.ollama.model', 'mistral'),
                    'prompt' => $prompt,
                    'stream' => false,
                    'options' => [
                        'num_predict' => $numPredict,
                    ],
                ]);

            if (!$ollamaResponse->successful()) {
                \Log::warning('Ollama request failed', [
                    'status' => $ollamaResponse->status(),
                    'body' => $ollamaResponse->body(),
                ]);
                return response()->json([
                    'suggested_titles' => $ocrTitles,
                    'suggested_document_types' => [],
                    'suggested_submitted_by' => null,
                    'error' => 'Suggestions temporarily unavailable.',
                ], 200);
            }

            $body = $ollamaResponse->json();
            if (! is_array($body)) {
                \Log::warning('Ollama returned non-JSON or invalid body', ['body' => $ollamaResponse->body()]);
                return response()->json([
                    'suggested_titles' => $ocrTitles,
                    'suggested_document_types' => [],
                    'suggested_submitted_by' => null,
                    'error' => 'Suggestions temporarily unavailable.',
                ], 200);
            }

            // Ollama often returns HTTP 200 with { "error": "..." } (e.g. model not found, load failure).
            if (isset($body['error']) && is_string($body['error']) && $body['error'] !== '') {
                \Log::warning('Ollama error in response body', [
                    'error' => $body['error'],
                    'model' => config('services.ollama.model'),
                ]);
                return response()->json([
                    'suggested_titles' => $ocrTitles,
                    'suggested_document_types' => [],
                    'suggested_submitted_by' => null,
                    'error' => 'Suggestions temporarily unavailable.',
                ], 200);
            }

            $raw = $body['response'] ?? '';
            if (! is_string($raw)) {
                $raw = '';
            }

            [$titlesUnique, $suggestedDocTypes, $suggestedSubmittedBy] = $this->parseLlmSuggestions(
                $raw,
                $fallbackTitle,
                $ocrTitles,
                $docTypes
            );

            if ($suggestedSubmittedBy === null || $suggestedSubmittedBy === '') {
                $suggestedSubmittedBy = $this->guessSubmittedByFromContent($content);
            }

            return response()->json([
                'suggested_titles' => $titlesUnique,
                'suggested_document_types' => $suggestedDocTypes,
                'suggested_submitted_by' => $suggestedSubmittedBy,
            ]);
        } catch (\Exception $e) {
            \Log::warning('Document suggestions failed', ['id' => $id, 'message' => $e->getMessage()]);
            return response()->json([
                'suggested_titles' => $ocrTitles,
                'suggested_document_types' => [],
                'suggested_submitted_by' => null,
                'error' => 'Suggestions temporarily unavailable.',
            ], 200);
        }
    }

    /**
     * Fetch document types from Paperless (id + name) for LLM suggestion. Follows pagination.
     *
     * @return array<int, array{id: int, name: string}>
     */
    private function fetchPaperlessDocumentTypes(string $baseUrl, string $token): array
    {
        $out = [];
        $url = $baseUrl . '/api/document_types/';
        $guard = 0;

        while ($url !== null && $url !== '' && $guard < 20) {
            $guard++;
            $response = Http::withHeaders(['Authorization' => 'Token ' . $token])
                ->timeout(15)
                ->get($url);

            if (! $response->successful()) {
                break;
            }

            $data = $response->json();
            $results = $data['results'] ?? (is_array($data) && isset($data[0]) ? $data : []);
            if (! is_array($results)) {
                $results = [];
            }
            foreach ($results as $t) {
                $id = $t['id'] ?? $t['pk'] ?? null;
                $name = trim((string) ($t['name'] ?? $t['slug'] ?? ''));
                if ($id !== null && $name !== '') {
                    $out[] = ['id' => (int) $id, 'name' => $name];
                }
            }

            $next = $data['next'] ?? null;
            if (! is_string($next) || $next === '') {
                break;
            }
            if (str_starts_with($next, 'http://') || str_starts_with($next, 'https://')) {
                $url = $next;
            } else {
                $url = rtrim($baseUrl, '/') . '/' . ltrim($next, '/');
            }
        }

        return $out;
    }

    /**
     * Parse Ollama response for TITLE1–3, DOCTYPE, and SUBMITTED_BY (case-insensitive; tolerates markdown noise).
     *
     * @param  array<int, array{id: int, name: string}>  $docTypes
     * @return array{0: array<int, string>, 1: array<int, array{id: int, name: string}>, 2: string|null}
     */
    private function parseLlmSuggestions(string $raw, string $fallbackTitle, array $ocrTitles, array $docTypes): array
    {
        $raw = trim($raw);
        $raw = preg_replace('/^```[\w]*\s*\R?/m', '', (string) $raw) ?? '';
        $raw = preg_replace('/\R?```\s*$/m', '', $raw) ?? '';
        $raw = trim($raw);

        $slot = [null, null, null];
        $docTypeRaw = null;
        $submittedByRaw = null;

        foreach (preg_split('/\R/', $raw) as $line) {
            $line = trim($line);
            $line = preg_replace('/^\*+|\*+$/u', '', $line) ?? '';
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            if (preg_match('/^TITLE\s*(\d)\s*:\s*(.+)$/iu', $line, $m)) {
                $idx = (int) $m[1];
                if ($idx >= 1 && $idx <= 3) {
                    $slot[$idx - 1] = Str::limit(trim(preg_replace('/\s+/', ' ', $m[2])), self::MAX_TITLE_LENGTH, '');
                }
            } elseif (preg_match('/^DOCTYPE\s*:\s*(.+)$/iu', $line, $m)) {
                $docTypeRaw = trim(preg_replace('/\s+/', ' ', $m[1]));
            } elseif (preg_match('/^SUBMITTED_BY\s*:\s*(.+)$/iu', $line, $m)) {
                $submittedByRaw = trim(preg_replace('/\s+/', ' ', $m[1]));
            }
        }

        // Second pass: block regex (models sometimes merge lines or use CRLF oddly)
        for ($i = 1; $i <= 3; $i++) {
            if (($slot[$i - 1] ?? '') === '') {
                if (preg_match(
                    '/TITLE\s*' . $i . '\s*:\s*(.+?)(?=\s*TITLE\s*\d|\s*DOCTYPE\s*:|$)/is',
                    $raw,
                    $m
                )) {
                    $slot[$i - 1] = Str::limit(trim(preg_replace('/\s+/', ' ', $m[1])), self::MAX_TITLE_LENGTH, '');
                }
            }
        }

        $titles = [];
        foreach ($slot as $t) {
            $titles[] = ($t !== null && $t !== '') ? $t : $fallbackTitle;
        }

        $titlesUnique = array_values(array_unique(array_filter($titles, fn ($x) => $x !== '')));
        if (count($titlesUnique) < 3) {
            foreach ($ocrTitles as $ocrTitle) {
                if (count($titlesUnique) >= 3) {
                    break;
                }
                if (! in_array($ocrTitle, $titlesUnique, true)) {
                    $titlesUnique[] = $ocrTitle;
                }
            }
        }
        while (count($titlesUnique) < 3) {
            $titlesUnique[] = $fallbackTitle;
        }

        $suggestedDocTypes = $this->matchNamedEntity($docTypeRaw, $docTypes, $raw, 'DOCTYPE');
        $suggestedSubmittedBy = $this->parseSubmittedByValue($submittedByRaw, $raw);

        return [array_slice($titlesUnique, 0, 3), $suggestedDocTypes, $suggestedSubmittedBy];
    }

    private function parseSubmittedByValue(?string $rawValue, string $fullRaw): ?string
    {
        if ($rawValue === null || $rawValue === '') {
            if (preg_match('/SUBMITTED_BY\s*:\s*(.+?)(?=\R|$)/is', $fullRaw, $m)) {
                $rawValue = trim(preg_replace('/\s+/', ' ', $m[1]));
            }
        }

        if ($rawValue === null || $rawValue === '') {
            return null;
        }

        $name = preg_replace('/\s*[\(\[\-].*$/u', '', $rawValue) ?? $rawValue;
        $name = trim($name, " \t\n\r\0\x0B.,;:");

        return $name !== '' ? Str::limit($name, self::MAX_SUBMITTED_BY_LENGTH, '') : null;
    }

    /**
     * @param  array<int, array{id: int, name: string}>  $entities
     * @return array<int, array{id: int, name: string}>
     */
    private function matchNamedEntity(?string $rawValue, array $entities, string $fullRaw, string $label): array
    {
        $suggested = [];
        if ($rawValue === null || $rawValue === '') {
            if (preg_match('/' . preg_quote($label, '/') . '\s*:\s*(.+?)(?=\R|$)/is', $fullRaw, $m)) {
                $rawValue = trim(preg_replace('/\s+/', ' ', $m[1]));
            }
        }

        if ($rawValue === null || $rawValue === '') {
            return $suggested;
        }

        $suggestedName = preg_replace('/\s*[\(\[\-].*$/u', '', $rawValue) ?? $rawValue;
        $suggestedName = trim($suggestedName, " \t\n\r\0\x0B.,;:");
        foreach ($entities as $entity) {
            if (strcasecmp($entity['name'], $suggestedName) === 0) {
                $suggested[] = ['id' => $entity['id'], 'name' => $entity['name']];
                break;
            }
        }
        if (empty($suggested) && $suggestedName !== '') {
            $lower = strtolower($suggestedName);
            foreach ($entities as $entity) {
                $en = strtolower($entity['name']);
                if (str_contains($lower, $en) || str_contains($en, $lower)) {
                    $suggested[] = ['id' => $entity['id'], 'name' => $entity['name']];
                    break;
                }
            }
        }

        return $suggested;
    }

    /** OCR fallback: use a "From:" line as submitted-by when the LLM did not return one. */
    private function guessSubmittedByFromContent(string $content): ?string
    {
        if (! is_string($content)) {
            return null;
        }

        foreach (preg_split('/\r?\n/', $content) as $line) {
            $line = trim($line);
            if (preg_match('/^from\s*:\s*(.+)$/iu', $line, $m)) {
                $fromLine = trim($m[1]);
                if ($fromLine !== '') {
                    return Str::limit($fromLine, self::MAX_SUBMITTED_BY_LENGTH, '');
                }
                break;
            }
        }

        return null;
    }

    /**
     * Smart OCR-based titles: skip noise lines, prefer title-like lines (length, no leading number, etc.).
     */
    private function smartOcrTitles(string $content, string $fallback): array
    {
        if (!is_string($content) || Str::length(Str::trim($content)) < 10) {
            return [$fallback];
        }

        $lines = preg_split('/\r?\n/', $content);
        $candidates = [];
        $seen = [];

        foreach (array_slice($lines, 0, self::MAX_LINES_TO_SCAN) as $line) {
            $line = trim(preg_replace('/\s+/', ' ', $line));
            if ($line === '') {
                continue;
            }
            if (Str::length($line) > self::MAX_TITLE_LENGTH) {
                $line = Str::limit($line, self::MAX_TITLE_LENGTH, '');
            }

            $key = strtolower($line);
            if (isset($seen[$key])) {
                continue;
            }
            if ($this->isNoiseLine($line)) {
                continue;
            }
            if (!$this->looksLikeTitle($line)) {
                if (count($candidates) === 0) {
                    $seen[$key] = true;
                    $candidates[] = $line;
                }
                continue;
            }

            $seen[$key] = true;
            $candidates[] = $line;
            if (count($candidates) >= 3) {
                break;
            }
        }

        if (empty($candidates)) {
            $firstNonNoise = $this->firstNonNoiseLine($lines, $fallback);
            $out = array_values(array_unique([$firstNonNoise, $fallback]));
            while (count($out) < 3) {
                $out[] = $fallback;
            }
            return array_slice($out, 0, 3);
        }

        while (count($candidates) < 3) {
            $candidates[] = $fallback;
        }

        return array_slice($candidates, 0, 3);
    }

    private function isNoiseLine(string $line): bool
    {
        $lower = strtolower($line);
        $len = Str::length($line);

        if ($len < 3) {
            return true;
        }

        $noiseStarts = ['page ', 'p\.', 'confidential', 'date:', 'to:', 're:', 'from:', 'subject:', 'ref:', 'dear ', 'sincerely', '---', '***'];
        foreach ($noiseStarts as $start) {
            if (Str::startsWith($lower, $start)) {
                return true;
            }
        }

        if (preg_match('/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/', trim($line)) ||
            preg_match('/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}$/i', $line)) {
            return true;
        }

        if ($len > self::MAX_TITLE_LENGTH_STRICT) {
            return true;
        }

        return false;
    }

    private function looksLikeTitle(string $line): bool
    {
        $len = Str::length($line);
        if ($len < self::MIN_TITLE_LENGTH || $len > self::MAX_TITLE_LENGTH_STRICT) {
            return false;
        }
        if (preg_match('/^\d+[\.\)]\s/', $line)) {
            return false;
        }
        return true;
    }

    private function firstNonNoiseLine(array $lines, string $fallback): string
    {
        foreach (array_slice($lines, 0, self::MAX_LINES_TO_SCAN) as $line) {
            $line = trim(preg_replace('/\s+/', ' ', $line));
            if ($line !== '' && !$this->isNoiseLine($line)) {
                return Str::limit($line, self::MAX_TITLE_LENGTH, '');
            }
        }
        foreach (array_slice($lines, 0, 5) as $line) {
            $line = trim(preg_replace('/\s+/', ' ', $line));
            if ($line !== '') {
                return Str::limit($line, self::MAX_TITLE_LENGTH, '');
            }
        }
        return $fallback;
    }
}
