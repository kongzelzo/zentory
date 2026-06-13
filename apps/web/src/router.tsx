import { createBrowserRouter, Navigate } from "react-router-dom";
import { AdvancedOperationPage, ApiKeysPage, DataBackupPage, NotificationSettingsPage, PaymentMethodsPage, ProfitLossPage, TaxInvoicesPage } from "./pages/AdvancedOperationsPages";
import { AdminCenterPage } from "./pages/AdminCenterPages";
import { AdminAnnouncementComposerPage, AdminCustomerDetailPage, AdminImpersonationPage, AdminPaymentApprovalPage, AdminPlanEditorPage, AdminTicketDetailPage, AdminUserDetailPage } from "./pages/AdminWorkflowPages";
import { AppShell } from "./components/AppShell";
import { AdminShell } from "./components/AdminShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicLayout } from "./components/PublicLayout";
import { AdminPage } from "./pages/AdminPage";
import { AlertsPage } from "./pages/AlertsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InventoryAdjustmentPage, InventoryReceiptPage } from "./pages/InventoryPages";
import { InventoryMovementPage } from "./pages/InventoryMovementPage";
import { LandingPage } from "./pages/LandingPage";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "./pages/AuthPages";
import { BarcodePage, BillingPage, ImportExportPage, OperationPage, SupportPage } from "./pages/OperationsPages";
import { BranchDetailPage, BranchesPage } from "./pages/BranchesPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PosPage } from "./pages/PosPage";
import { PricingPage } from "./pages/PricingPage";
import { ProductDetailPage, ProductEditPage } from "./pages/ProductDetailPages";
import { ProductFormPage, ProductsPage } from "./pages/ProductsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SalesReportPage, StockReportPage } from "./pages/ReportsPage";
import { SaleDetailPage, SalesPage } from "./pages/SalesPages";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupStorePage } from "./pages/SetupStorePage";
import { StaffPage } from "./pages/StaffPage";

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/pricing", element: <PricingPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/reset-password", element: <ResetPasswordPage /> },
      { path: "/register", element: <RegisterPage /> }
    ]
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/setup-store", element: <SetupStorePage /> },
      { path: "/onboarding", element: <Navigate to="/app/onboarding" replace /> },
      {
        path: "/app",
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/app/dashboard" replace /> },
          { path: "dashboard", element: <DashboardPage /> },
          { path: "onboarding", element: <OnboardingPage /> },
          { path: "pos", element: <PosPage /> },
          { path: "sales", element: <SalesPage /> },
          { path: "sales/:id", element: <SaleDetailPage /> },
          { path: "products", element: <ProductsPage /> },
          { path: "products/new", element: <ProductFormPage /> },
          { path: "products/:id", element: <ProductDetailPage /> },
          { path: "products/:id/edit", element: <ProductEditPage /> },
          { path: "inventory/receipts", element: <InventoryReceiptPage /> },
          { path: "inventory/adjustments", element: <InventoryAdjustmentPage /> },
          { path: "inventory/movements", element: <InventoryMovementPage /> },
          { path: "reports/stock", element: <StockReportPage /> },
          { path: "reports/sales", element: <SalesReportPage /> },
          { path: "alerts", element: <AlertsPage /> },
          { path: "suppliers", element: <OperationPage kind="suppliers" /> },
          { path: "purchase-orders", element: <OperationPage kind="purchase-orders" /> },
          { path: "customers", element: <OperationPage kind="customers" /> },
          { path: "barcode", element: <BarcodePage /> },
          { path: "import-export", element: <ImportExportPage /> },
          { path: "audit-log", element: <OperationPage kind="audit-log" /> },
          { path: "transfers", element: <OperationPage kind="transfers" /> },
          { path: "branches", element: <BranchesPage /> },
          { path: "branches/:id", element: <BranchDetailPage /> },
          { path: "billing", element: <BillingPage /> },
          { path: "returns", element: <AdvancedOperationPage kind="returns" /> },
          { path: "stock-counts", element: <AdvancedOperationPage kind="stock-counts" /> },
          { path: "expenses", element: <AdvancedOperationPage kind="expenses" /> },
          { path: "profit-loss", element: <ProfitLossPage /> },
          { path: "receipts", element: <AdvancedOperationPage kind="receipts" /> },
          { path: "discounts", element: <AdvancedOperationPage kind="discounts" /> },
          { path: "payment-methods", element: <PaymentMethodsPage /> },
          { path: "notifications/settings", element: <NotificationSettingsPage /> },
          { path: "tax-invoices", element: <TaxInvoicesPage /> },
          { path: "activity-approvals", element: <AdvancedOperationPage kind="activity-approvals" /> },
          { path: "data-backup", element: <DataBackupPage /> },
          { path: "api-keys", element: <ApiKeysPage /> },
          { path: "support", element: <SupportPage /> },
          { path: "staff", element: <StaffPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "profile", element: <ProfilePage /> }
        ]
      },
      {
        path: "/admin",
        element: <AdminShell />,
        children: [
          { index: true, element: <AdminPage /> },
          { path: "customers", element: <AdminCenterPage kind="customers" /> },
          { path: "customers/:id", element: <AdminCustomerDetailPage /> },
          { path: "users", element: <AdminCenterPage kind="users" /> },
          { path: "users/:id", element: <AdminUserDetailPage /> },
          { path: "plans", element: <AdminCenterPage kind="plans" /> },
          { path: "plans/:id/edit", element: <AdminPlanEditorPage /> },
          { path: "payments", element: <AdminCenterPage kind="payments" /> },
          { path: "payments/:id", element: <AdminPaymentApprovalPage /> },
          { path: "support-tickets", element: <AdminCenterPage kind="support-tickets" /> },
          { path: "support-tickets/:id", element: <AdminTicketDetailPage /> },
          { path: "announcements", element: <AdminCenterPage kind="announcements" /> },
          { path: "announcements/new", element: <AdminAnnouncementComposerPage /> },
          { path: "impersonation", element: <AdminImpersonationPage /> },
          { path: "system-logs", element: <AdminCenterPage kind="system-logs" /> },
          { path: "feature-flags", element: <AdminCenterPage kind="feature-flags" /> },
          { path: "backups", element: <AdminCenterPage kind="backups" /> },
          { path: "audit-log", element: <AdminCenterPage kind="audit-log" /> },
          { path: "error-monitoring", element: <AdminCenterPage kind="error-monitoring" /> },
          { path: "email-templates", element: <AdminCenterPage kind="email-templates" /> }
        ]
      }
    ]
  }
]);
