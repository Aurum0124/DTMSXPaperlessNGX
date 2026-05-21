<?php

use App\Http\Controllers\ArchiveCabinetController;
use App\Http\Controllers\ArchiveDrawerController;
use App\Http\Controllers\ArchiveFolderController;
use App\Http\Controllers\AdminStatsController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DocumentCommentController;
use App\Http\Controllers\DocumentEndorsementController;
use App\Http\Controllers\DocumentHistoryController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\DocumentStatusController;
use App\Http\Controllers\DocumentTransferController;
use App\Http\Controllers\OfficeAccountController;
use App\Http\Controllers\RouteTemplateController;
use App\Http\Controllers\PreviewProxyController;
use App\Http\Controllers\ThumbProxyController;
use App\Http\Controllers\NeedsActionBadgeController;
use App\Http\Controllers\TrackerController;
use App\Http\Controllers\DocumentSummaryController;
use App\Http\Controllers\DocumentPublicRouteHiddenController;
use Illuminate\Support\Facades\Route;

Route::get('/tracker/document', TrackerController::class);
Route::get('/tracker/document-lookup', [TrackerController::class, 'staffLookup'])->middleware('auth:sanctum');
Route::get('/document-summary/{id}', [DocumentSummaryController::class, 'show'])->middleware('auth:sanctum')->where('id', '[0-9]+');
Route::get('/needs-action-badge', NeedsActionBadgeController::class)->middleware('auth:sanctum');
Route::get('/admin/stats', [AdminStatsController::class, 'index'])->middleware('auth:sanctum');
Route::post('/admin/stats/reset', [AdminStatsController::class, 'resetStats'])->middleware('auth:sanctum');
Route::post('/admin/stats/record-upload', [AdminStatsController::class, 'recordUpload'])->middleware('auth:sanctum');
Route::get('/document-history/{id}', DocumentHistoryController::class)->middleware('auth:sanctum');
Route::get('/document-public-route-hidden', [DocumentPublicRouteHiddenController::class, 'index'])->middleware('auth:sanctum');
Route::post('/document-public-route-hidden', [DocumentPublicRouteHiddenController::class, 'store'])->middleware('auth:sanctum');
Route::post('/document-comments/{id}', [DocumentCommentController::class, 'store'])->middleware('auth:sanctum');
Route::patch('/document-comments/{id}', [DocumentCommentController::class, 'update'])->middleware('auth:sanctum');
Route::patch('/document-status/{id}', [DocumentStatusController::class, 'update'])->middleware('auth:sanctum');
Route::post('/document-archive/{id}', [DocumentStatusController::class, 'archive'])->middleware('auth:sanctum')->where('id', '[0-9]+');
Route::post('/document-archive/{id}/handoff', [DocumentStatusController::class, 'archiveHandoff'])->middleware('auth:sanctum')->where('id', '[0-9]+');
Route::patch('/document-status-changes/{id}', [DocumentStatusController::class, 'updateRemarks'])->middleware('auth:sanctum');
Route::post('/document-endorsements/{id}', [DocumentEndorsementController::class, 'store'])->middleware('auth:sanctum');
Route::patch('/document-endorsements/{id}', [DocumentEndorsementController::class, 'update'])->middleware('auth:sanctum');
Route::get('/transfers', [DocumentTransferController::class, 'index'])->middleware('auth:sanctum');
Route::get('/transfers/at-office-document-ids', [DocumentTransferController::class, 'atOfficeDocumentIds'])->middleware('auth:sanctum');
Route::post('/transfers', [DocumentTransferController::class, 'store'])->middleware('auth:sanctum');
Route::post('/transfers/revert-release', [DocumentTransferController::class, 'revertRelease'])->middleware('auth:sanctum');

Route::get('/route-templates', [RouteTemplateController::class, 'index'])->middleware('auth:sanctum');
Route::post('/route-templates', [RouteTemplateController::class, 'store'])->middleware('auth:sanctum');
Route::patch('/route-templates/{id}', [RouteTemplateController::class, 'update'])->middleware('auth:sanctum');
Route::delete('/route-templates/{id}', [RouteTemplateController::class, 'destroy'])->middleware('auth:sanctum');

Route::get('/archive-cabinets', [ArchiveCabinetController::class, 'index'])->middleware('auth:sanctum');
Route::get('/archive-cabinets/by-tag/{tagId}', [ArchiveCabinetController::class, 'byTag'])->middleware('auth:sanctum')->where('tagId', '[0-9]+');
Route::post('/archive-cabinets', [ArchiveCabinetController::class, 'store'])->middleware('auth:sanctum');
Route::patch('/archive-cabinets/{id}', [ArchiveCabinetController::class, 'update'])->middleware('auth:sanctum')->where('id', '[0-9]+');
Route::delete('/archive-cabinets/{id}', [ArchiveCabinetController::class, 'destroy'])->middleware('auth:sanctum')->where('id', '[0-9]+');
Route::get('/archive-drawers/document/{documentId}', [ArchiveDrawerController::class, 'forDocument'])->middleware('auth:sanctum')->where('documentId', '[0-9]+');
Route::get('/archive-drawers/placements', [ArchiveDrawerController::class, 'placements'])->middleware('auth:sanctum');
Route::get('/archive-drawers/placed-document-ids', [ArchiveDrawerController::class, 'placedDocumentIds'])->middleware('auth:sanctum');
Route::get('/archive-drawers', [ArchiveDrawerController::class, 'index'])->middleware('auth:sanctum');
Route::post('/archive-drawers', [ArchiveDrawerController::class, 'store'])->middleware('auth:sanctum');
Route::patch('/archive-drawers/{id}', [ArchiveDrawerController::class, 'update'])->middleware('auth:sanctum')->where('id', '[0-9]+');
Route::delete('/archive-drawers/{id}', [ArchiveDrawerController::class, 'destroy'])->middleware('auth:sanctum')->where('id', '[0-9]+');
Route::post('/archive-drawers/{drawerId}/folders', [ArchiveFolderController::class, 'store'])->middleware('auth:sanctum')->where('drawerId', '[0-9]+');
Route::delete('/archive-folders/{id}', [ArchiveFolderController::class, 'destroy'])->middleware('auth:sanctum')->where('id', '[0-9]+');

Route::get('/thumb/{id}', ThumbProxyController::class)->where('id', '[0-9]+');
Route::get('/preview/{id}', PreviewProxyController::class)->where('id', '[0-9]+');

Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
Route::get('/auth/user', [AuthController::class, 'user'])->middleware('auth:sanctum');

Route::get('/employees', [EmployeeController::class, 'index'])->middleware('auth:sanctum');
Route::post('/employees', [EmployeeController::class, 'store'])->middleware('auth:sanctum');
Route::patch('/employees/{id}', [EmployeeController::class, 'update'])->middleware('auth:sanctum');
Route::delete('/employees/{id}', [EmployeeController::class, 'destroy'])->middleware('auth:sanctum');

Route::post('/auth/offices', [OfficeAccountController::class, 'store'])->middleware('auth:sanctum');
Route::get('/auth/offices/{name}', [OfficeAccountController::class, 'show'])->middleware('auth:sanctum');
Route::patch('/auth/offices/{name}', [OfficeAccountController::class, 'update'])->middleware('auth:sanctum');
Route::delete('/auth/offices/{name}', [OfficeAccountController::class, 'destroy'])->middleware('auth:sanctum');
