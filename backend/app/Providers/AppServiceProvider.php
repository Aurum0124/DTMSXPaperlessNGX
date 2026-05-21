<?php

namespace App\Providers;

use App\Models\DocumentTransfer;
use App\Observers\DocumentTransferObserver;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        DocumentTransfer::observe(DocumentTransferObserver::class);
    }
}
