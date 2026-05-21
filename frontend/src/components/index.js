/**
 * Components Index
 * 
 * This file exports all components from a single location for easier imports.
 * Import components like: import { Header, Sidebar } from '../components';
 */

// Layout components
export * from './layout/index.js';

// UI components
export * from './ui/index.js';

// Modal components
export * from './modals/index.js';

// Document components
export * from './document/index.js';

// Settings components
export * from './settings/index.js';

// Route templates (for fixed routing offices)
export { default as RouteTemplatesView } from './RouteTemplatesView.jsx';

// Staff document lookup opens as StaffDocumentLookupModal from modals (see DepartmentDashboard / Admin)
export { default as CabinetsView } from './CabinetsView.jsx';
export { default as AdminOfficesView } from './AdminOfficesView.jsx';

// Shared inputs
export { default as TrackingCodeInput } from './TrackingCodeInput.jsx'; 