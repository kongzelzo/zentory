import { createBrowserRouter, Navigate } from "react-router-dom";
import { AdvancedOperationPage, ApiKeysPage, DataBackupPage, NotificationSettingsPage, PaymentMethodsPage, ProfitLossPage, TaxInvoicesPage } from "./pages/AdvancedOperationsPages";
import { AdminCenterPage } from "./pages/AdminCenterPages";
import { AdminAnnouncementComposerPage, AdminCustomerDetailPage, AdminImpersonationPage, AdminPaymentApprovalPage, AdminPlanEditorPage, AdminTicketDetailPage, AdminUserDetailPage } from "./pages/AdminWorkflowPages";
import { AppShell } from "./components/AppShell";
import { AdminShell } from "./components/AdminShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicLayout } from "./components/PublicLayout";
import { AdminPage } from "./pages/AdminPage";
import { AdjustmentApprovalsPage } from "./pages/AdjustmentApprovalsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { CashierDashboardPage, DashboardRedirectPage, OwnerDashboardPage, StockDashboardPage, ViewerDashboardPage } from "./pages/DashboardPage";
import { InventoryAdjustmentPage, InventoryReceiptPage } from "./pages/InventoryPages";
import { InventoryMovementPage } from "./pages/InventoryMovementPage";
import { LandingPage } from "./pages/LandingPage";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from "./pages/AuthPages";
import { AccountSetupPage, JoinOrCreatePage, JoinRequestPendingPage, JoinRequestRejectedPage, JoinStorePage } from "./pages/JoinStorePages";
import { BarcodePage, BillingPage, ImportExportPage, OperationPage, PlanLimitedPage, SupportPage } from "./pages/OperationsPages";
import { BranchSettingsPage } from "./pages/BranchSettingsPage";
import { BranchEditPage, BranchesPage, WarehouseDetailPage, WarehousesPage } from "./pages/BranchesPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { CheckoutSuccessPage } from "./pages/CheckoutSuccessPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { PosPage } from "./pages/PosPage";
import { PosPaymentPage } from "./pages/PosPaymentPage";
import { PricingPage } from "./pages/PricingPage";
import { ProductDetailPage, ProductEditPage } from "./pages/ProductDetailPages";
import { ProductFormPage, ProductsPage } from "./pages/ProductsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SalesReportPage, StockReportPage } from "./pages/ReportsPage";
import { SaleDetailPage, SalesPage } from "./pages/SalesPages";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupStorePage } from "./pages/SetupStorePage";
import { StoreStaffPage } from "./pages/StoreStaffPage";
import { StockCountsPage } from "./pages/StockCountsPage";
import { StockSearchPage } from "./pages/StockSearchPage";
import { TransferRequestsPage } from "./pages/TransferRequestsPage";
import { TransfersPage } from "./pages/TransfersPage";

export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: "/", element: <LandingPage /> },
      { path: "/pricing", element: <PricingPage /> },
      { path: "/checkout", element: <CheckoutPage /> },
      { path: "/checkout/success", element: <CheckoutSuccessPage /> },
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
      { path: "/account-setup", element: <AccountSetupPage /> },
      { path: "/join-or-create", element: <JoinOrCreatePage /> },
      { path: "/join-store", element: <JoinStorePage /> },
      { path: "/join-request/pending", element: <JoinRequestPendingPage /> },
      { path: "/join-request/rejected", element: <JoinRequestRejectedPage /> },
      { path: "/onboarding", element: <Navigate to="/app/onboarding" replace /> },
      { path: "/app/pos/payment", element: <PosPaymentPage /> },
      {
        path: "/app",
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="/app/dashboard" replace /> },
          { path: "dashboard", element: <DashboardRedirectPage /> },
          { path: "dashboard/owner", element: <OwnerDashboardPage /> },
          { path: "dashboard/cashier", element: <CashierDashboardPage /> },
          { path: "dashboard/stock", element: <StockDashboardPage /> },
          { path: "dashboard/viewer", element: <ViewerDashboardPage /> },
          { path: "onboarding", element: <OnboardingPage /> },
          { path: "plan-limited", element: <PlanLimitedPage /> },
          { path: "pos", element: <PosPage /> },
          { path: "sales", element: <SalesPage /> },
          { path: "sales/:id", element: <SaleDetailPage /> },
          { path: "products", element: <ProductsPage /> },
          { path: "categories", element: <CategoriesPage /> },
          { path: "products/new", element: <ProductFormPage /> },
          { path: "products/:id", element: <ProductDetailPage /> },
          { path: "products/:id/edit", element: <ProductEditPage /> },
          { path: "inventory/receipts", element: <InventoryReceiptPage /> },
          { path: "inventory/adjustments", element: <InventoryAdjustmentPage /> },
          { path: "inventory/movements", element: <InventoryMovementPage /> },
          { path: "stock-search", element: <StockSearchPage /> },
          { path: "reports/stock", element: <StockReportPage /> },
          { path: "reports/sales", element: <SalesReportPage /> },
          { path: "alerts", element: <Navigate to="/app/reports/stock" replace /> },
          { path: "suppliers", element: <OperationPage kind="suppliers" /> },
          { path: "purchase-orders", element: <OperationPage kind="purchase-orders" /> },
          { path: "customers", element: <OperationPage kind="customers" /> },
          { path: "barcode", element: <BarcodePage /> },
          { path: "import-export", element: <ImportExportPage /> },
          { path: "audit-log", element: <AuditLogPage /> },
          { path: "transfers", element: <TransfersPage /> },
          { path: "transfers/requests", element: <TransferRequestsPage /> },
          { path: "branches", element: <BranchesPage /> },
          { path: "branches/:id/edit", element: <BranchEditPage /> },
          { path: "branch-settings", element: <BranchSettingsPage /> },
          { path: "warehouses", element: <WarehousesPage /> },
          { path: "warehouses/:id", element: <WarehouseDetailPage /> },
          { path: "billing", element: <Navigate to="/app/profile/billing" replace /> },
          { path: "returns", element: <AdvancedOperationPage kind="returns" /> },
          { path: "stock-counts", element: <StockCountsPage /> },
          { path: "expenses", element: <AdvancedOperationPage kind="expenses" /> },
          { path: "profit-loss", element: <ProfitLossPage /> },
          { path: "receipts", element: <AdvancedOperationPage kind="receipts" /> },
          { path: "discounts", element: <AdvancedOperationPage kind="discounts" /> },
          { path: "payment-methods", element: <PaymentMethodsPage /> },
          { path: "notifications/settings", element: <NotificationSettingsPage /> },
          { path: "notifications", element: <NotificationsPage /> },
          { path: "tax-invoices", element: <TaxInvoicesPage /> },
          { path: "activity-approvals", element: <AdjustmentApprovalsPage /> },
          { path: "data-backup", element: <DataBackupPage /> },
          { path: "api-keys", element: <ApiKeysPage /> },
          { path: "support", element: <SupportPage /> },
          { path: "staff", element: <Navigate to="/app/branch-settings?section=staff" replace /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "settings/staff", element: <StoreStaffPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "profile/billing", element: <BillingPage /> }
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
          { path: "audit-log", element: <AuditLogPage /> },
          { path: "error-monitoring", element: <AdminCenterPage kind="error-monitoring" /> },
          { path: "email-templates", element: <AdminCenterPage kind="email-templates" /> }
        ]
      }
    ]
  }
]);
