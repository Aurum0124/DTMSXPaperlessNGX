<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeController extends Controller
{
    /**
     * List employees (admin only).
     */
    public function index(Request $request): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $employees = Employee::orderBy('name')->get();

        return response()->json([
            'employees' => $employees->map(fn ($e) => [
                'id' => $e->id,
                'employee_number' => $e->employee_number,
                'name' => $e->name,
                'email' => $e->email,
                'position' => $e->position,
                'tag_id' => $e->tag_id,
                'status' => $e->status,
                'created_at' => $e->created_at->toIso8601String(),
            ]),
        ]);
    }

    /**
     * Create employee (admin only).
     */
    public function store(Request $request): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $validated = $request->validate([
            'employee_number' => 'required|string|max:64|unique:employees,employee_number',
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'position' => 'nullable|string|max:128',
            'tag_id' => 'nullable|integer',
            'status' => 'nullable|string|in:active,inactive',
        ]);

        $employee = Employee::create([
            'employee_number' => trim($validated['employee_number']),
            'name' => trim($validated['name']),
            'email' => isset($validated['email']) ? trim($validated['email']) : null,
            'position' => isset($validated['position']) ? trim($validated['position']) : null,
            'tag_id' => $validated['tag_id'] ?? null,
            'status' => $validated['status'] ?? 'active',
        ]);

        return response()->json([
            'id' => $employee->id,
            'employee_number' => $employee->employee_number,
            'name' => $employee->name,
            'email' => $employee->email,
            'position' => $employee->position,
            'tag_id' => $employee->tag_id,
            'status' => $employee->status,
            'created_at' => $employee->created_at->toIso8601String(),
        ], 201);
    }

    /**
     * Update employee (admin only).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $employee = Employee::find($id);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        $validated = $request->validate([
            'employee_number' => 'sometimes|string|max:64|unique:employees,employee_number,' . $id,
            'name' => 'sometimes|string|max:255',
            'email' => 'nullable|email|max:255',
            'position' => 'nullable|string|max:128',
            'tag_id' => 'nullable|integer',
            'status' => 'sometimes|string|in:active,inactive',
        ]);

        if (isset($validated['employee_number'])) {
            $employee->employee_number = trim($validated['employee_number']);
        }
        if (isset($validated['name'])) {
            $employee->name = trim($validated['name']);
        }
        if (array_key_exists('email', $validated)) {
            $employee->email = isset($validated['email']) ? trim($validated['email']) : null;
        }
        if (array_key_exists('position', $validated)) {
            $employee->position = isset($validated['position']) ? trim($validated['position']) : null;
        }
        if (array_key_exists('tag_id', $validated)) {
            $employee->tag_id = $validated['tag_id'] ?: null;
        }
        if (isset($validated['status'])) {
            $employee->status = $validated['status'];
        }
        $employee->save();

        return response()->json([
            'id' => $employee->id,
            'employee_number' => $employee->employee_number,
            'name' => $employee->name,
            'email' => $employee->email,
            'position' => $employee->position,
            'tag_id' => $employee->tag_id,
            'status' => $employee->status,
            'created_at' => $employee->created_at->toIso8601String(),
        ]);
    }

    /**
     * Delete employee (admin only).
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $employee = Employee::find($id);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        $employee->delete();

        return response()->json(['message' => 'Employee deleted']);
    }
}
