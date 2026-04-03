import React from 'react';
import EduTrackApp from '../edutrack/App';

/**
 * 教學組事務管理系統（嵌入主站 Layout，共用 Firebase Auth；另需 edutrack_allowed_users 白名單）
 */
const EduTrackPage: React.FC = () => {
  return (
    <div className="h-full min-h-0 flex flex-col overflow-auto bg-slate-50">
      <EduTrackApp embedded />
    </div>
  );
};

export default EduTrackPage;
