import React from 'react';
import { AwardRecord, AwardStudent } from '../types';
import { Trophy } from 'lucide-react';

interface AwardNotificationProps {
  data: AwardRecord;
  gradeFilter: 'all' | 'low' | 'mid' | 'high'; // 新增篩選屬性
}

// Helper to sort classes intelligently (numeric)
const sortClasses = (classes: string[]) => {
  return classes.sort((a, b) => {
    // Try to parse numbers from class strings
    const numA = parseInt(a.replace(/\D/g, ''));
    const numB = parseInt(b.replace(/\D/g, ''));
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
};

// Helper to determine grade from class name
const getGrade = (className: string): number => {
    const cleanName = className.trim();
    
    // 1. 嘗試抓取開頭的阿拉伯數字 (例如: 101, 605)
    const numMatch = cleanName.match(/^(\d)/);
    if (numMatch) return parseInt(numMatch[1]);

    // 2. 嘗試抓取開頭的中文數字 (例如: 一年一班)
    const chineseMap: Record<string, number> = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6
    };
    const zhMatch = cleanName.match(/^([一二三四五六])/);
    if (zhMatch) return chineseMap[zhMatch[1]];

    return 0; // 0 表示無法判斷或幼兒園/特教班，通常顯示在所有類別或特定類別
};

const AwardNotification: React.FC<AwardNotificationProps> = ({ data, gradeFilter }) => {
  const { date, time, title, students } = data;

  // Filter students based on grade
  const filteredStudents = students.filter(s => {
      if (gradeFilter === 'all') return true;
      const grade = getGrade(s.className);
      
      // 如果無法判斷年級 (grade=0)，在 'all' 模式下顯示，其他模式下是否顯示視需求而定
      // 這裡設定：若有篩選，則過濾掉無法判斷的 (除非有特定邏輯)
      if (grade === 0) return true; 

      if (gradeFilter === 'low') return grade === 1 || grade === 2;
      if (gradeFilter === 'mid') return grade === 3 || grade === 4;
      if (gradeFilter === 'high') return grade === 5 || grade === 6;
      return true;
  });

  // Group by Class
  const classMap: Record<string, AwardStudent[]> = {};

  filteredStudents.forEach(s => {
    const className = s.className || '其他';
    if (!classMap[className]) {
      classMap[className] = [];
    }
    classMap[className].push(s);
  });

  const sortedClassNames = sortClasses(Object.keys(classMap));

  const getFilterTitle = () => {
      switch(gradeFilter) {
          case 'low': return ' (低年級)';
          case 'mid': return ' (中年級)';
          case 'high': return ' (高年級)';
          default: return '';
      }
  };

  if (sortedClassNames.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 min-h-[50vh]">
              <Trophy size={48} className="mb-4 opacity-20"/>
              <p className="text-xl font-bold">此年級段無獲獎學生</p>
              <p className="text-sm mt-2">請確認學生班級格式 (例: 101, 6年5班)</p>
          </div>
      );
  }

  return (
    <div className="bg-white p-4 w-full max-w-4xl mx-auto print:p-0 print:w-full">
      <div className="no-print mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800 flex items-start gap-3">
        <Trophy className="shrink-0 text-yellow-600" size={20} />
        <div>
            <p className="font-bold">💡 頒獎通知單列印提示：</p>
            <ul className="list-disc pl-5 mt-1">
            <li>目前預覽：<span className="font-bold text-black">{getFilterTitle() || '全校'}</span></li>
            <li>系統已自動將同一班級的學生合併於同一頁。</li>
            <li>列印時請確認瀏覽器設定勾選「背景圖形」。</li>
            <li>每張 A4 會印出兩份通知單 (半頁 A4)，適合發放給導師。</li>
            </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 print:gap-0 print:block">
        {sortedClassNames.map((className) => {
          const classStudents = classMap[className];
          const isMany = classStudents.length > 5;
          
          return (
            <div key={className} className="print-half-page flex flex-col border-4 border-double border-gray-800 p-6 rounded-lg mx-auto w-full mb-8 print:mb-0 print:border-none print:rounded-none box-border relative bg-white">
              
              {/* Header / Title */}
              <div className="text-center mb-4 shrink-0 mt-2">
                  <div className="inline-block px-4 py-1 border-2 border-gray-800 rounded-full text-sm font-bold mb-2 bg-gray-100 print:bg-gray-100">
                      頒獎通知{getFilterTitle()}
                  </div>
                  <h1 className="text-2xl font-extrabold text-gray-900 tracking-wide mb-1">{title}</h1>
                  <p className="text-base text-gray-600 font-medium">頒獎時間：{date} {time || ''}</p>
              </div>

              {/* Content Body */}
              <div className="mb-2 text-lg font-medium shrink-0">
                  <span className="border-b-2 border-gray-800 pb-1">{className}</span> 班導師 您好：
              </div>
              
              <div className="mb-4 text-base leading-relaxed text-gray-700 shrink-0">
                <p className="indent-8">
                  貴班下列學生表現優異，將於 <span className="font-bold text-black">{date} {time || ''} {title}</span> 進行公開表揚，敬請 惠予協助提醒學生準時出席受獎。
                </p>
              </div>

              {/* Table */}
              <div className="flex-1 min-h-0 overflow-hidden mb-4">
                  <table className="w-full border-collapse border border-gray-800">
                      <thead>
                          <tr className="bg-gray-100 print:bg-gray-200">
                              <th className="border border-gray-800 p-2 text-center w-1/3 text-base">姓名</th>
                              <th className="border border-gray-800 p-2 text-center text-base">獲獎項目 / 榮譽</th>
                          </tr>
                      </thead>
                      <tbody>
                          {classStudents.map((s, idx) => (
                              <tr key={idx} className="print:bg-white">
                                  <td className={`border border-gray-800 text-center font-bold font-serif ${isMany ? 'p-1 text-base' : 'p-2 text-lg'}`}>{s.name}</td>
                                  <td className={`border border-gray-800 text-center ${isMany ? 'p-1 text-sm' : 'p-2 text-base'}`}>{s.awardName}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>

              {/* Footer */}
              <div className="mt-auto text-right shrink-0">
                <p className="text-lg font-bold font-serif">教學組 敬啟</p>
                <p className="text-xs text-gray-500 mt-1">製表日期：{new Date().toLocaleDateString()}</p>
              </div>

            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0; /* Remove default page margins to prevent cutting off */
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print-half-page {
            height: 148mm; /* Exactly half of A4 (297mm) */
            width: 210mm; /* Full A4 width */
            page-break-inside: avoid;
            overflow: hidden;
            margin: 0 !important;
            padding: 15mm !important; /* Internal padding instead of page margin */
            box-sizing: border-box;
            border: none !important; /* Remove outer border for print if it causes issues, or keep it inside padding */
          }
          /* Add a border inside the padding for the visual box */
          .print-half-page::after {
            content: '';
            position: absolute;
            top: 10mm;
            bottom: 10mm;
            left: 10mm;
            right: 10mm;
            border: 4px double #1f2937;
            pointer-events: none;
            z-index: -1;
          }
        }
      `}</style>
    </div>
  );
};

export default AwardNotification;