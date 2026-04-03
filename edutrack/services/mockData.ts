import { Student, Course } from '../types';

// 模擬學生資料庫
export const MOCK_STUDENTS: Student[] = Array.from({ length: 40 }).map((_, i) => ({
  id: `s-${i + 1}`,
  name: `學生${String.fromCharCode(65 + (i % 26))}${i + 1}`, // 產生 學生A1, 學生B2...
  className: i < 20 ? '101' : '102',
  // Fix: Add 'period' property which is required by Student interface
  period: '第一節',
  // Fix: Remove 'seatNumber' as it is not part of the Student interface
}));

// 模擬課程資料庫
export const MOCK_COURSES: Course[] = [
  {
    id: 'c-1',
    name: '基礎數學',
    instructor: '王大明',
    location: '101 教室',
    dayOfWeek: 1, // 週一
    period: 1,
    studentIds: MOCK_STUDENTS.slice(0, 20).map(s => s.id), // 101班
  },
  {
    id: 'c-2',
    name: '進階英文',
    instructor: '李美麗',
    location: '語言實驗室 A',
    dayOfWeek: 1, // 週一
    period: 2,
    studentIds: MOCK_STUDENTS.slice(20, 40).map(s => s.id), // 102班
  },
  {
    id: 'c-3',
    name: '物理實驗',
    instructor: '張志豪',
    location: '物理實驗室',
    dayOfWeek: 2, // 週二
    period: 3,
    studentIds: MOCK_STUDENTS.map(s => s.id), // 全體
  },
  {
    id: 'c-4',
    name: '國文賞析',
    instructor: '林書豪',
    location: '102 教室',
    dayOfWeek: 3, // 週三
    period: 4,
    studentIds: MOCK_STUDENTS.slice(10, 30).map(s => s.id), // 混合
  },
  {
    id: 'c-5',
    name: '資訊科技',
    instructor: '陳電腦',
    location: '電腦教室 C',
    dayOfWeek: 4, // 週四
    period: 1,
    studentIds: MOCK_STUDENTS.slice(0, 20).map(s => s.id),
  },
  {
    id: 'c-6',
    name: '體育',
    instructor: '黃飛鴻',
    location: '體育館',
    dayOfWeek: 5, // 週五
    period: 6,
    studentIds: MOCK_STUDENTS.map(s => s.id),
  },
];

// 模擬 API 延遲
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  // 根據日期獲取當天的課程
  getDailyCourses: async (date: Date): Promise<Course[]> => {
    await delay(500);
    const day = date.getDay(); // 0 (Sun) - 6 (Sat)
    return MOCK_COURSES.filter(c => c.dayOfWeek === day).sort((a, b) => a.period - b.period);
  },

  // 獲取課程詳細學生名單
  getCourseStudents: async (courseId: string): Promise<Student[]> => {
    await delay(300);
    const course = MOCK_COURSES.find(c => c.id === courseId);
    if (!course) return [];
    return MOCK_STUDENTS.filter(s => course.studentIds.includes(s.id))
      .sort((a, b) => {
        // 先排班級，再排座號
        if (a.className !== b.className) return a.className.localeCompare(b.className);
        // Fix: 'seatNumber' does not exist on Student, sort by id (numeric) instead
        return a.id.localeCompare(b.id, undefined, { numeric: true });
      });
  }
};