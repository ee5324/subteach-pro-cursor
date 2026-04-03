校園平面圖 — 如何置入（程式不繪製、只顯示您提供的檔案）
============================================================

1. 將您的平面圖檔案放入此 public 資料夾。
2. 檔名請擇一（與 CampusMap.tsx 內常數一致即可）：
   - campus-plan.png
   - campus-plan.jpg
   - campus-plan.webp
   - campus-plan.svg

3. 預設使用：campus-plan.png
   若您使用其他檔名，請一併修改 components/CampusMap.tsx 頂端的
   CAMPUS_MAP_FILE 常數。

4. 無需改程式其他部分；替換檔案後重新整理頁面即會顯示新圖。

（舊的 campus-map-rendered.svg 若不再使用可自行刪除。）
