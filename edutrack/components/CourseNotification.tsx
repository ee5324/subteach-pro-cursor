import React from 'react';
import { Student } from '../types';

interface CourseData {
  academicYear: string;
  semester: string;
  courseName: string;
  instructor: string;
  classTime: string;
  location: string;
  students: Student[];
}

interface NotificationProps {
  // Support both single data object and array of data objects
  data: CourseData | CourseData[];
}

// Helper to sort classes intelligently (e.g., 101, 102, ... 201)
const sortClasses = (classes: string[]) => {
    return classes.sort();
};

const CourseNotification: React.FC<NotificationProps> = ({ data }) => {
  const courses = Array.isArray(data) ? data : [data];

  // -------------------------------------------------------------------------
  // 1. Data Transformation: Group by Class Name
  //    Structure: { "101": [ { courseInfo, students: [...] }, ... ], "102": ... }
  // -------------------------------------------------------------------------
  
  interface ClassCourseGroup {
    academicYear: string;
    semester: string;
    courseName: string;
    instructor: string;
    classTime: string;
    location: string;
    students: Student[];
  }

  const classMap: Record<string, ClassCourseGroup[]> = {};

  courses.forEach(course => {
    // Group students of THIS course by their class
    const studentsOfCourseByClass: Record<string, Student[]> = {};
    course.students.forEach(student => {
        const className = student.className || '未分班';
        if (!studentsOfCourseByClass[className]) {
            studentsOfCourseByClass[className] = [];
        }
        studentsOfCourseByClass[className].push(student);
    });

    // Merge into the main class map
    Object.entries(studentsOfCourseByClass).forEach(([className, classStudents]) => {
      if (!classMap[className]) {
        classMap[className] = [];
      }
      
      // Sort students by seat/ID internally for display
      classStudents.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

      classMap[className].push({
        academicYear: course.academicYear,
        semester: course.semester,
        courseName: course.courseName,
        instructor: course.instructor,
        classTime: course.classTime,
        location: course.location,
        students: classStudents
      });
    });
  });

  const sortedClassNames = sortClasses(Object.keys(classMap));

  return (
    <div className="bg-white p-8 w-full max-w-4xl mx-auto print:p-0 print:w-full">
      <div className="no-print mb-6 p-4 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
        <p className="font-bold">💡 列印提示：</p>
        <ul className="list-disc pl-5 mt-1">
          <li>此頁面已自動將同一班級的通知單合併。</li>
          <li>給導師的通知單位於上方，給學生的個人通知小條位於下方。</li>
          <li>列印時請確認瀏覽器設定勾選「背景圖形」。</li>
          <li>建議使用 A4 紙張列印。</li>
        </ul>
      </div>

      {/* ---------------- PART 1: 給導師的通知單 (依班級彙整) ---------------- */}
      {sortedClassNames.map((className) => {
        const classCourses = classMap[className];
        // Use the academic year/semester from the first course found for this class
        const meta = classCourses[0]; 

        return (
          <div key={`class-${className}`} className="page-break-after mb-10 pb-10 border-b-2 border-dashed border-gray-300 print:border-none print:mb-0 print:pb-0 print:h-screen print:flex print:flex-col print:justify-start print:pt-4">
            <div className="border-2 border-gray-800 p-8 rounded-lg mx-auto w-full print:border-none print:p-0">
              <h2 className="text-2xl font-bold text-center mb-6 border-b-2 border-gray-800 pb-4">
                【開課通知】致 {className} 班導師
              </h2>
              
              <div className="mb-6 text-lg leading-relaxed">
                <p>老師您好：</p>
                <p className="mt-2 indent-8">
                  本學期（{meta.academicYear}學年{meta.semester}）貴班學生參加 <strong>本土語/原民語/新住民語/手語課程</strong> 資訊如下，敬請惠予協助提醒學生準時上課。
                </p>
              </div>

              {/* Loop through each course relevant to this class */}
              <div className="space-y-6">
                {classCourses.map((group, idx) => (
                   <div key={`${className}-${group.courseName}`} className="border border-gray-400 rounded p-4 bg-gray-50 print:bg-white print:border-black">
                      <div className="flex flex-wrap gap-x-6 gap-y-2 mb-3 pb-2 border-b border-gray-300 print:border-gray-800 font-bold text-lg bg-gray-100 print:bg-gray-100 p-2 -mx-4 -mt-4 rounded-t">
                          <span className="text-blue-800 print:text-black">課程：{group.courseName}</span>
                          <span>教師：{group.instructor}</span>
                          <span>時間：{group.classTime}</span>
                          <span>地點：{group.location}</span>
                      </div>
                      
                      {/* Student Table for this course */}
                      <table className="w-full border-collapse border border-gray-800 bg-white">
                        <thead>
                          <tr className="bg-gray-200 print:bg-gray-200">
                            <th className="border border-gray-800 p-2 text-left pl-4">姓名</th>
                            <th className="border border-gray-800 p-2 w-1/2">備註</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.students.map(s => (
                            <tr key={s.id}>
                              <td className="border border-gray-800 p-2 pl-4 text-lg font-medium">{s.name}</td>
                              <td className="border border-gray-800 p-2"></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                ))}
              </div>

              <div className="mt-12 text-right font-medium">
                <p>教學組 敬啟</p>
                <p className="text-sm text-gray-500 mt-1">列印日期：{new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        );
      })}

      {/* ---------------- PART 2: 給學生的通知小條 (全部列出) ---------------- */}
      <div className="print:break-before-page mt-12 pt-8 border-t-4 border-gray-800 print:border-none print:mt-0 print:pt-0">
        <h2 className="text-2xl font-bold text-center mb-6 no-print">學生個人通知單 (裁切用)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-0 print:block">
            {courses.flatMap(course => 
                course.students.map(student => ({
                    ...student,
                    _courseName: course.courseName,
                    _classTime: course.classTime,
                    _location: course.location,
                    _instructor: course.instructor
                }))
            ).map((item, idx) => (
                <div key={idx} className="border border-gray-400 p-4 rounded bg-white m-2 relative print:break-inside-avoid print:h-[240px] print:w-[48%] print:float-left print:m-[1%] print:border-2">
                    <div className="text-center border-b border-gray-300 pb-2 mb-2">
                        <h3 className="font-bold text-lg">{item._courseName} 上課通知</h3>
                    </div>
                    <div className="text-sm space-y-1.5">
                        <p><span className="font-bold">班級姓名：</span> {item.className} 班 {item.name}</p>
                        <p><span className="font-bold">上課時間：</span> {item._classTime}</p>
                        <p><span className="font-bold">上課地點：</span> {item._location}</p>
                        <p><span className="font-bold">授課教師：</span> {item._instructor}</p>
                    </div>
                    <div className="mt-3 text-xs text-gray-500 text-center border-t border-gray-200 pt-2">
                        請準時前往上課，勿無故缺席。
                    </div>
                </div>
            ))}
        </div>
      </div>
      
      <style>{`
        @media print {
          .page-break-after {
            page-break-after: always;
            min-height: 100vh;
          }
          .print\\:break-before-page {
            page-break-before: always;
          }
          /* Ensure backgrounds print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};

export default CourseNotification;