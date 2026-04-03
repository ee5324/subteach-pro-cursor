/**
 * 高雄市楠梓區加昌國小 114 學年校園平面圖資料
 * 依平面圖重新整理之建築、樓層與空間標註
 */

export interface RoomItem {
  name: string;
}

export interface FloorPlan {
  floor: string;
  label: string;
  rooms: RoomItem[];
}

export interface BuildingPlan {
  id: string;
  name: string;
  /** SVG 區塊 x (%) */
  x: number;
  /** SVG 區塊 y (%) */
  y: number;
  /** 寬 (%) */
  w: number;
  /** 高 (%) */
  h: number;
  floors: FloorPlan[];
  /** 備註如無障礙電梯、樓梯 */
  note?: string;
}

export interface OutdoorArea {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CAMPUS_TITLE = '高雄市楠梓區加昌國小 114 學年校園平面圖';

/** 建築物（含樓層與室名） */
export const BUILDINGS: BuildingPlan[] = [
  {
    id: 'red-brick',
    name: '紅磚樓',
    x: 4,
    y: 18,
    w: 14,
    h: 58,
    note: '無障礙電梯、樓梯(一)',
    floors: [
      { floor: '5F', label: '五樓', rooms: [{ name: '活動中心' }] },
      { floor: '4F', label: '四樓', rooms: [{ name: '廁所' }, { name: '音樂教室(四)' }, { name: '課後班(六)' }] },
      { floor: '3F', label: '三樓', rooms: [{ name: '美勞教室' }, { name: '美勞教室' }, { name: '電腦教室(一)' }] },
      { floor: '2F', label: '二樓', rooms: [{ name: '幼兒園' }, { name: '綜合二' }, { name: '課後班(七)' }, { name: '課後班(三)' }] },
      { floor: '1F', label: '一樓', rooms: [{ name: '廁所' }, { name: '圖書室' }] },
    ],
  },
  {
    id: 'xingshan',
    name: '行善樓（玄關／行政）',
    x: 20,
    y: 8,
    w: 32,
    h: 72,
    note: '樓梯(三)(四)、玄關貫通',
    floors: [
      {
        floor: '5F',
        label: '五樓',
        rooms: [
          { name: '會議室' }, { name: '多功能' }, { name: '視聽中心' }, { name: '音樂教室(一)' }, { name: '音樂教室(二)' }, { name: '音樂教室(三)' },
          { name: '研討室(一)' }, { name: '輔導遊戲室' }, { name: '學前巡迴' }, { name: '校史室' }, { name: '會計室' }, { name: '家長會辦公室' },
          { name: '健康中心' }, { name: '輔導處' }, { name: '教務處' }, { name: '律動教室' }, { name: '校長室' }, { name: '人事室' }, { name: '總務處' },
        ],
      },
      {
        floor: '4F',
        label: '四樓',
        rooms: [
          { name: '工作室' }, { name: '檔案室' }, { name: '用具室' }, { name: '掃具室' }, { name: '語言教室' }, { name: '研討室(二)' },
          { name: '綜合一' }, { name: '課後班(一)' }, { name: '課後班(二)' },
        ],
      },
      { floor: '3F', label: '三樓', rooms: [{ name: '資源班(一)' }, { name: '資源班(二)' }] },
      { floor: '2F', label: '二樓', rooms: [{ name: '電源室' }, { name: '幼兒園' }, { name: '幼兒園' }, { name: '輔導遊戲室' }] },
      { floor: '1F', label: '一樓', rooms: [{ name: '通往地下室' }] },
      { floor: 'B1', label: '地下室', rooms: [{ name: '禮堂' }] },
    ],
  },
  {
    id: 'jingye',
    name: '敬業樓',
    x: 54,
    y: 12,
    w: 20,
    h: 52,
    note: '1F 連走廊',
    floors: [
      { floor: '3F', label: '三樓', rooms: [{ name: '三.1' }, { name: '三.2' }, { name: '三.3' }, { name: '三.4' }, { name: '研討室(三)' }, { name: '課後班(四)' }, { name: '三.7' }, { name: '三.6' }, { name: '三.5' }] },
      { floor: '2F', label: '二樓', rooms: [{ name: '二.1' }, { name: '二.2' }, { name: '二.3' }, { name: '二.4' }, { name: '二.8' }, { name: '二.7' }, { name: '二.6' }, { name: '二.5' }] },
      { floor: '1F', label: '一樓', rooms: [{ name: '圖書資料室' }, { name: '志工團' }, { name: '藝術儲藏室' }, { name: '儲藏室' }] },
      { floor: 'B1', label: '地下室', rooms: [{ name: '敬業樓地下室-藝術走廊' }] },
    ],
  },
  {
    id: 'chengzheng',
    name: '誠正樓',
    x: 54,
    y: 38,
    w: 20,
    h: 42,
    note: '1F 連接走廊、樓梯(六)',
    floors: [
      { floor: '4F', label: '四樓', rooms: [{ name: '四.1' }, { name: '四.2' }, { name: '四.3' }, { name: '四.4' }] },
      { floor: '3F', label: '三樓', rooms: [{ name: '四.8' }, { name: '四.7' }, { name: '四.6' }, { name: '四.5' }] },
      { floor: '2F', label: '二樓', rooms: [{ name: '一.1' }, { name: '一.2' }, { name: '一.3' }, { name: '一.4' }] },
      { floor: '1F', label: '一樓', rooms: [{ name: '一.8' }, { name: '一.7' }, { name: '一.6' }, { name: '一.5' }] },
      { floor: 'B1', label: '地下室', rooms: [{ name: '誠正樓地下室-能資源館、多功能空間' }] },
    ],
  },
  {
    id: 'zhixin',
    name: '知心樓',
    x: 54,
    y: 62,
    w: 20,
    h: 28,
    note: '樓梯(七)',
    floors: [
      { floor: '5F', label: '五樓', rooms: [{ name: '五.1' }, { name: '五.2' }, { name: '五.3' }, { name: '五.4' }] },
      { floor: '4F', label: '四樓', rooms: [{ name: '五.8' }, { name: '五.7' }, { name: '五.6' }, { name: '五.5' }] },
      { floor: '3F', label: '三樓', rooms: [{ name: '六.1' }, { name: '六.2' }, { name: '六.3' }, { name: '六.4' }] },
      { floor: '2F', label: '二樓', rooms: [{ name: '六.8' }, { name: '六.7' }, { name: '六.6' }, { name: '六.5' }] },
      { floor: 'B1', label: '地下室', rooms: [{ name: '知心樓地下室(遊藝學習區)' }, { name: '玩具夢想館' }, { name: '玩具展示館' }] },
    ],
  },
  {
    id: 'east-wing',
    name: '東側棟（廁所／專科／廚房）',
    x: 76,
    y: 18,
    w: 18,
    h: 68,
    note: '樓梯(五)、廁所 1F–4F',
    floors: [
      { floor: '4F', label: '四樓', rooms: [{ name: '廁所' }, { name: '自然教室(一)' }, { name: '自然教室(二)' }, { name: '自然教室(三)' }] },
      { floor: '3F', label: '三樓', rooms: [{ name: '廁所' }, { name: '自然教室(四)' }, { name: '自然教室(五)' }, { name: '資優班兼辦公室' }, { name: '美勞教室' }] },
      { floor: '2F', label: '二樓', rooms: [{ name: '廁所' }, { name: '電腦教室(一)' }] },
      { floor: '1F', label: '一樓', rooms: [{ name: '廁所' }, { name: '廚房' }, { name: '午餐廚房' }] },
    ],
  },
];

/** 戶外／開放區域 */
export const OUTDOOR_AREAS: OutdoorArea[] = [
  { id: 'road', name: '路', x: 0, y: 0, w: 4, h: 100 },
  { id: 'front-gate', name: '前門', x: 4, y: 78, w: 10, h: 8 },
  { id: 'side-gate', name: '側門', x: 4, y: 86, w: 8, h: 6 },
  { id: 'front-plaza', name: '前庭廣場', x: 14, y: 72, w: 38, h: 22 },
  { id: 'back-gate', name: '後門', x: 92, y: 4, w: 8, h: 6 },
  { id: 'green-shade', name: '綠蔭', x: 6, y: 28, w: 12, h: 18 },
  { id: 'pond', name: '◎蓄水池', x: 6, y: 46, w: 8, h: 8 },
  { id: 'outdoor-reading', name: '(行善樓)◎戶外閱讀區', x: 18, y: 76, w: 14, h: 10 },
  { id: 'central-court-zhixin', name: '中庭(知心樓)', x: 52, y: 88, w: 24, h: 8 },
  { id: 'north-court-play', name: '北庭(遊戲場)', x: 76, y: 8, w: 12, h: 10 },
  { id: 'playground-jingye', name: '◎遊戲場', x: 52, y: 64, w: 20, h: 10 },
  { id: 'kindergarten-garden', name: '◎幼兒園花園區', x: 52, y: 74, w: 12, h: 8 },
  { id: 'compost', name: '◎樹葉堆肥區', x: 64, y: 74, w: 8, h: 6 },
  { id: 'sorting', name: '◎分類場', x: 72, y: 74, w: 6, h: 6 },
  { id: 'recycle', name: '◎資源回收場', x: 78, y: 74, w: 8, h: 6 },
  { id: 'sports-field', name: '操場', x: 4, y: 90, w: 52, h: 10 },
  { id: 'ball-court', name: '綜合球場', x: 56, y: 90, w: 28, h: 10 },
  { id: 'green-trellis', name: '綠色棚架', x: 84, y: 92, w: 8, h: 6 },
  { id: 'sports-equipment', name: '體育器材室', x: 52, y: 92, w: 6, h: 6 },
  { id: 'botanical', name: '植物園（永續校園示範區）', x: 94, y: 12, w: 6, h: 76 },
  { id: 'water-classroom', name: '室外水土保持教室', x: 94, y: 88, w: 6, h: 8 },
  { id: 'ramp', name: '無障礙坡道', x: 90, y: 28, w: 4, h: 20 },
  { id: 'water-main', name: '中庭中水主機區', x: 74, y: 86, w: 10, h: 6 },
];

/** 圖例：傳達室、停車等（前庭廣場內） */
export const LEGEND_ITEMS = [
  '傳達室',
  '汽車停車位',
  '機車停車位',
  '汽車停車場',
];

/** 搜尋班級／教室：回傳符合的建築與樓層 */
export function searchRoom(keyword: string): { buildingId: string; building: BuildingPlan; floorKey: string; floor: FloorPlan }[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return [];
  const out: { buildingId: string; building: BuildingPlan; floorKey: string; floor: FloorPlan }[] = [];
  for (const b of BUILDINGS) {
    for (const f of b.floors) {
      const floorKey = `${b.id}-${f.floor}`;
      for (const r of f.rooms) {
        if (r.name.toLowerCase().includes(q)) {
          out.push({ buildingId: b.id, building: b, floorKey, floor: f });
          break;
        }
      }
    }
  }
  return out;
}
