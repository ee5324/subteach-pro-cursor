
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';

class PageErrorBoundary extends Component<{ children: ReactNode; fallbackTitle?: string }> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('PageErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="p-8 max-w-xl mx-auto">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-rose-800 mb-2">{this.props.fallbackTitle ?? '頁面載入錯誤'}</h2>
            <p className="text-sm text-rose-700 mb-4 font-mono">{this.state.error.message}</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700"
            >
              重試
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
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
import ExtraVoucher from './pages/ExtraVoucher';
import LanguageTeachers from './pages/LanguageTeachers';
import LanguageSalary from './pages/LanguageSalary';
import Login from './pages/Login';
import { useAppStore } from './store/useAppStore';

const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
  const { currentUser, loading } = useAppStore();
  
  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-100 text-slate-400">載入中...</div>;
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
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
    <HashRouter>
      <Routes>
        <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <Login />} />
        
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<SubstituteOverview />} />
          <Route path="overview" element={<SubstituteOverview />} />
          <Route path="pending" element={<PendingItems />} />
          <Route path="requests" element={<IncomingRequests />} />
          <Route path="sub-pool" element={<SubPool />} />
          <Route path="entry" element={<EntryForm />} />
          <Route path="entry/:id" element={<EntryForm />} />
          <Route path="special" element={<SpecialActivities />} />
          <Route path="teachers" element={<TeacherManagement />} />
          <Route path="language-teachers" element={<LanguageTeachers />} />
          <Route path="records" element={<Records />} />
          <Route path="extra-voucher" element={<ExtraVoucher />} />
          <Route path="overtime" element={<PageErrorBoundary fallbackTitle="超鐘點頁面錯誤"><Overtime /></PageErrorBoundary>} /> 
          <Route path="fixed-overtime" element={<FixedOvertimePage />} />
          <Route path="hakka-salary" element={<LanguageSalary />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
