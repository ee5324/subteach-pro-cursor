
import React, { ReactNode } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './Layout';
import EntryForm from './pages/EntryForm';
import TeacherManagement from './pages/TeacherManagement';
import Records from './pages/Records';
import PendingItems from './pages/PendingItems';
import Overtime from './pages/Overtime'; 
import SpecialActivities from './pages/SpecialActivities'; 
import Settings from './pages/Settings'; 
import IncomingRequests from './pages/IncomingRequests';
import FixedOvertimePage from './pages/FixedOvertimePage'; 
import SubPool from './pages/SubPool';
import SubstituteOverview from './pages/SubstituteOverview';
import SubstituteBusyBlocksPage from './pages/SubstituteBusyBlocks';
import ExtraVoucher from './pages/ExtraVoucher';
import LanguageTeachers from './pages/LanguageTeachers';
import LanguageSalary from './pages/LanguageSalary';
import LeaveRules from './pages/LeaveRules';
import Login from './pages/Login';
import ApplySubstitute from './pages/ApplySubstitute';
import SubstituteApplications from './pages/SubstituteApplications';
import PublicBoard from './pages/PublicBoard';
import PublicBoardApplicationsPage from './pages/PublicBoardApplicationsPage';
import TeacherLeaveRequest from './pages/TeacherLeaveRequest';
import SubstituteContactExchange from './pages/SubstituteContactExchange';
import SubstituteWeeklyLookup from './pages/SubstituteWeeklyLookup';
import SubstituteLookupViewStats from './pages/SubstituteLookupViewStats';
import MobileQueryHub from './pages/MobileQueryHub';
import TeacherLeavePortal from './pages/TeacherLeavePortal';
import EduTrackPage from './pages/EduTrackPage';
import SystemDashboard from './pages/SystemDashboard';
import ExamSubmitPublicPage from './edutrack/components/ExamSubmitPublicPage';
import { useAppStore } from './store/useAppStore';
import { signOut } from 'firebase/auth';
import { auth } from './src/lib/firebase';

function PageErrorFallback({ error, resetErrorBoundary, title }: FallbackProps & { title: string }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="p-8 max-w-xl mx-auto">
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-rose-800 mb-2">{title}</h2>
        <p className="text-sm text-rose-700 mb-4 font-mono">{msg}</p>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700"
        >
          重試
        </button>
      </div>
    </div>
  );
}

function PageErrorBoundary({ children, fallbackTitle }: { children: ReactNode; fallbackTitle: string }) {
  return (
    <ErrorBoundary
      fallbackRender={(props) => <PageErrorFallback {...props} title={fallbackTitle} />}
      onError={(err, info) => console.error('PageErrorBoundary:', err, info)}
    >
      {children}
    </ErrorBoundary>
  );
}

const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
  const { currentUser, loading, notAllowed } = useAppStore();
  
  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400">載入中...</div>;
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (notAllowed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-6">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-800 mb-3">無法使用本系統</h1>
          <p className="text-slate-600 mb-6">您沒有權限使用本系統，請聯絡管理員將您的帳號加入白名單。</p>
          <p className="text-sm text-slate-500 mb-4">若為首次使用或管理員，請確認以 <strong>Google 登入</strong>（非匿名），重新整理頁面後再試。</p>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
          >
            登出
          </button>
        </div>
      </div>
    );
  }

  return children;
};

const App: React.FC = () => {
  const { loading, currentUser } = useAppStore();

  if (loading) {
      return (
          <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400">
              載入中...
          </div>
      );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
    <HashRouter>
      <Routes>
        <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/apply" element={<ApplySubstitute />} />
        <Route path="/public" element={<PublicBoard />} />
        <Route path="/teacher-request" element={<TeacherLeaveRequest />} />
        <Route path="/sub-weekly" element={<SubstituteWeeklyLookup />} />
        <Route path="/exam-submit" element={<ExamSubmitPublicPage />} />

        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<SubstituteOverview />} />
          <Route path="dashboard" element={<SystemDashboard />} />
          <Route path="overview" element={<SubstituteOverview />} />
          <Route path="substitute-busy" element={<SubstituteBusyBlocksPage />} />
          <Route path="pending" element={<PendingItems />} />
          <Route path="requests" element={<IncomingRequests />} />
          <Route path="public-applications" element={<PublicBoardApplicationsPage />} />
          <Route path="contact-exchange" element={<SubstituteContactExchange />} />
          <Route
            path="mobile-query"
            element={
              <PageErrorBoundary fallbackTitle="手機查詢中心載入錯誤">
                <MobileQueryHub />
              </PageErrorBoundary>
            }
          />
          <Route
            path="teacher-portal"
            element={
              <PageErrorBoundary fallbackTitle="教師請假／代課查詢載入錯誤">
                <TeacherLeavePortal />
              </PageErrorBoundary>
            }
          />
          <Route
            path="edutrack"
            element={
              <PageErrorBoundary fallbackTitle="教學組事務載入錯誤">
                <EduTrackPage />
              </PageErrorBoundary>
            }
          />
          <Route path="sub-pool" element={<SubPool />} />
          <Route path="substitute-applications" element={<SubstituteApplications />} />
          <Route path="entry" element={<EntryForm />} />
          <Route path="entry/:id" element={<EntryForm />} />
          <Route path="special" element={<SpecialActivities />} />
          <Route path="teachers" element={<TeacherManagement />} />
          <Route path="language-teachers" element={<LanguageTeachers />} />
          <Route path="records" element={<Records />} />
          <Route path="leave-rules" element={<LeaveRules />} />
          <Route path="extra-voucher" element={<ExtraVoucher />} />
          <Route path="overtime" element={<PageErrorBoundary fallbackTitle="超鐘點頁面錯誤"><Overtime /></PageErrorBoundary>} />
          <Route path="overtime-indigenous" element={<PageErrorBoundary fallbackTitle="族語專職超鐘點頁面錯誤"><Overtime variant="indigenousFullTime" /></PageErrorBoundary>} />
          <Route path="fixed-overtime" element={<FixedOvertimePage />} />
          <Route path="hakka-salary" element={<LanguageSalary />} />
          <Route path="settings" element={<Settings />} />
          <Route
            path="substitute-lookup-stats"
            element={
              <PageErrorBoundary fallbackTitle="連結查閱統計載入錯誤">
                <SubstituteLookupViewStats />
              </PageErrorBoundary>
            }
          />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
    </div>
  );
};

export default App;
