import React from 'react';
import InstructionPanel from '../components/InstructionPanel';

type RuleBlock = {
  title: string;
  basis: string;
  summary: string;
  bullets: string[];
};

const article3Rules: RuleBlock[] = [
  {
    title: '事假、家庭照顧假、身心調適假',
    basis: '第 3 條第 1 項第 1 款',
    summary: '事假每學年 7 日；家庭照顧假每學年 7 日；身心調適假每學年 3 日。家庭照顧假與身心調適假之日數均併入事假計算。',
    bullets: [
      '事假、家庭照顧假、身心調適假合計超過 7 日者，超過部分按日扣除薪給。',
      '超過 7 日而需扣薪時，其所遺課務代理費仍由學校支付。',
      '學年度開始 1 個月後到職、再任或復職者，事假按在職月數比例計算，尾數依規則進位。'
    ]
  },
  {
    title: '病假、生理假、延長病假',
    basis: '第 3 條第 1 項第 2 款；第 5 至第 7 條',
    summary: '病假每學年 28 日；經醫師診斷需安胎休養者亦得請病假。超過病假日數者，以事假抵銷。',
    bullets: [
      '生理假每月 1 日，全學年未逾 3 日者不併入病假，其餘日數併入病假。',
      '患重病非短時間可痊癒，或因安胎經醫師診斷確有需要者，在病假、事假及休假請畢後，經學校核准得請延長病假。',
      '延長病假 2 年內合併計算不得超過 1 年；跨學年度時，應扣除各學年度得請之事假、病假及兼行政職務者之休假。',
      '延長病假或因公傷病之公假已滿仍不能銷假者，應留職停薪、退休或資遣；部分情形得延長留停 1 年。'
    ]
  },
  {
    title: '婚假',
    basis: '第 3 條第 1 項第 3 款',
    summary: '結婚給婚假 14 日。',
    bullets: [
      '應自結婚登記日前 10 日起 3 個月內請畢。',
      '因特殊事由經學校核准者，得於 1 年內請畢。',
      '婚假得以時計。'
    ]
  },
  {
    title: '產前假、娩假、流產假',
    basis: '第 3 條第 1 項第 4 款',
    summary: '產前假 8 日；娩假 42 日；流產假依懷孕週數分為 14、21、42 日。',
    bullets: [
      '產前假得分次申請，不得保留至分娩後。',
      '娩假及流產假應一次請畢，且不得扣除寒暑假日數。',
      '分娩前已請畢產前假者，必要時得先申請部分娩假，以 21 日為限；流產假應扣除先請之娩假日數。',
      '學校不得拒絕娩假、流產假及因安胎申請之相關假別，且不得為不利處分。'
    ]
  },
  {
    title: '陪產檢及陪產假',
    basis: '第 3 條第 1 項第 5 款',
    summary: '陪產檢及陪產假共 7 日，得分次申請。',
    bullets: [
      '陪產檢之請假，應於配偶懷孕期間為之。',
      '陪產之請假，應於配偶分娩或懷孕滿 20 週以上流產當日及其前後合計 15 日內為之。',
      '陪產檢及陪產假得以時計。',
      '學校不得拒絕，且不得為不利處分。'
    ]
  },
  {
    title: '喪假',
    basis: '第 3 條第 1 項第 6 款',
    summary: '父母、配偶死亡給 15 日；繼父母、配偶之父母、子女死亡給 10 日；曾祖父母、祖父母、配偶之祖父母、配偶之繼父母、兄弟姐妹死亡給 5 日。',
    bullets: [
      '喪假得分次申請，並應於死亡之日起百日內請畢。',
      '部分繼親關係有成年前受扶養或死亡前仍共居等限制。',
      '喪假以原因發生時存在之天然血親或擬制血親為限。',
      '喪假得以時計。'
    ]
  },
  {
    title: '骨髓或器官捐贈假',
    basis: '第 3 條第 1 項第 7 款',
    summary: '因捐贈骨髓或器官者，視實際需要給假。',
    bullets: [
      '依實際醫療需求核給。',
      '通常需檢具合法醫療機構證明文件。',
      '屬法定假別。'
    ]
  },
  {
    title: '原住民族歲時祭儀放假',
    basis: '第 3 條第 4 項；第 14 條第 1 項',
    summary: '具原住民族身分之教師，得於原住民族委員會公告之各該族歲時祭儀放假日申請放假。',
    bullets: [
      '應檢具可證明族別之戶籍資料證明文件。',
      '所遺課（職）務由學校派員代理。',
      '私立學校教師於此假別期間，應由學校支應代課鐘點費，且不得扣薪。'
    ]
  }
];

const publicLeaveItems = [
  '奉派參加政府召集之集會。',
  '奉派考察或參加國際會議。',
  '依法受各種兵役召集。',
  '參加政府依法主辦之各項投票。',
  '依主管機關所定獎勵優秀教師規定給假。',
  '具法定公傷病休養或療治情事，其期間在 2 年內。',
  '參加政府舉辦與職務有關之考試，經學校同意。',
  '參加本校活動，或受邀參加與職務有關之會議或活動，經學校同意。',
  '基於法定義務出席作證、答辯、陳述意見，經學校同意。',
  '從事進修、研究等專業發展者，依相關辦法規定辦理。',
  '寒暑假期間經核准，自費赴國外與職務有關之進修、研究。',
  '因校際教學需要，經同意至支援學校兼課。',
  '因產學合作需要，經同意至合作機構兼職或合作服務。',
  '因法定傳染病須配合檢查、隔離治療或防疫檢疫措施。',
  '依其他法規規定應給公假之情形。'
];

const adminLeaveRules = [
  '兼任行政職務之公立中小學教師，服務滿 1、3、6、9、14 學年後，自次一階段起每學年休假 7、14、21、28、30 日。',
  '初任教師或學年度中兼行政職務者，休假按在職月數比例計算，尾數依規則進位。',
  '當學年度未具休假 3 日資格者，原則上仍給休假 3 日，但部分人員不適用。',
  '休假原則上於寒暑假期間實施，但在不影響教學與校務推展下，得於學期中核給。',
  '符合休假資格者，每學年至少應休畢規定日數；未達應休畢日數資格者，應全部休畢；休假得以時計。',
  '應休假日數以外之休假，如確因公務或業務需要無法休假時，酌予獎勵，不予保留。',
  '未兼行政職務之公立中小學教師，於學生寒暑假期間，除返校服務、專業發展及災害防救所需日外，得不必到校。'
];

const procedureRules = [
  '教師請假應填具假單，經學校核准後始得離開；急病或緊急事故得由同事或親友代辦或補辦。',
  '延長病假或因公傷病公假 7 日以上，應檢具中央衛生主管機關評鑑合格醫院診斷證明書；未達 7 日者或安胎延長病假，應檢具合法醫療機構證明書。',
  '陪產請陪產檢及陪產假、娩假、流產假、2 日以上病假、骨髓或器官捐贈假，應檢具合法醫療機構證明書或其他證明文件。',
  '教師請假，其課（職）務應委託適當人員代理；無法覓得代理人時，學校應協調派員代理。',
  '兼任行政職務教師請假期間，其行政職務應由學校預為排定代理順序。',
  '未依規定請假擅離職守、假滿未銷假，或請假虛偽者，以曠職或曠課論，並扣除相應薪給。',
  '本規則假期原則上扣除例假日；但延長病假與因公傷病公假不扣除例假日；按時計假以規定出勤時間為準。'
];

const scopeRules = [
  '本規則依教師法第 35 條第 2 項訂定。',
  '適用於公立及已立案私立學校編制內、按月支給待遇，並依法取得教師資格之專任教師。',
  '各級公立學校校長、依法聘任之編制內專任人員，以及教育部依法定資格派任之高級中等以上學校護理教師，亦準用本規則。'
];

const privateSchoolRules = [
  '私立學校教師之請假，除家庭照顧假、身心調適假、安胎病假、生理假、婚假、娩假、流產假、產前假、陪產檢及陪產假、原住民族歲時祭儀放假，以及部分公假假別與日數外，其他得由各校自行定之。',
  '私立學校教師請婚假、娩假、流產假、產前假、陪產檢及陪產假，及原住民族歲時祭儀放假期間，應由學校支應代課鐘點費，且不得扣薪。'
];

const effectiveDateRules = [
  '第 8 條及第 9 條，自中華民國 114 年 8 月 1 日施行。',
  '其餘條文，自中華民國 114 年 10 月 10 日施行。'
];

const LeaveRules: React.FC = () => {
  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">請假規則</h1>
        <p className="text-slate-500 mt-2 text-sm md:text-base">
          依教師請假規則條文整理適用對象、各類假別、公假、休假、請假手續與私校特別規定。
        </p>
      </div>

      <InstructionPanel title="使用說明：請假規則" isOpenDefault>
        <p>本頁改以條文架構整理，避免僅列假別而忽略適用範圍、私校例外、公假事由與請假手續。</p>
        <p>如遇個案認定、證明文件、留職停薪或薪給爭議，仍應以正式法規、人事單位解釋及主管機關最新函釋為準。</p>
      </InstructionPanel>

      <div className="grid gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">第一至二條：法源與適用對象</h2>
            <p className="text-sm text-slate-500 mt-1">先確認規則依據與適用人員範圍。</p>
          </div>
          <div className="p-6 space-y-3">
            {scopeRules.map(rule => (
              <div key={rule} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                {rule}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">第三條：各類假別與日數</h2>
            <p className="text-sm text-slate-500 mt-1">整理事假、病假、婚喪、生育、陪產、捐贈及歲時祭儀放假。</p>
          </div>
          <div className="divide-y divide-slate-100">
            {article3Rules.map(rule => (
              <div key={rule.title} className="px-6 py-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">{rule.title}</h3>
                    <p className="text-sm text-slate-500 mt-1">{rule.basis}</p>
                  </div>
                  <div className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold w-fit">
                    條文摘要
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-700 leading-6">{rule.summary}</p>
                <div className="mt-4 space-y-2">
                  {rule.bullets.map(bullet => (
                    <div key={bullet} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                      {bullet}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">第四條：公假</h2>
            <p className="text-sm text-slate-500 mt-1">公假期間由學校視實際需要定之，以下為條文列舉的重要事由。</p>
          </div>
          <div className="p-6 grid gap-3 md:grid-cols-2">
            {publicLeaveItems.map(item => (
              <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">第五至十二條：延長病假、復職、休假與寒暑假</h2>
            <p className="text-sm text-slate-500 mt-1">這一段不是單一假別，而是病假後續處理與兼行政職務教師休假制度。</p>
          </div>
          <div className="p-6 space-y-3">
            {adminLeaveRules.map(rule => (
              <div key={rule} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                {rule}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">第十三至十六條：請假手續、代理、曠職與例假日計算</h2>
            <p className="text-sm text-slate-500 mt-1">實務上最常影響核假、派代與扣薪的規定。</p>
          </div>
          <div className="p-6 space-y-3">
            {procedureRules.map(rule => (
              <div key={rule} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                {rule}
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">第十七至十九條：準用對象、私校特別規定與施行日期</h2>
            <p className="text-sm text-slate-500 mt-1">補足原摘要最容易漏掉的適用範圍與私立學校差異。</p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-3">
              {privateSchoolRules.map(rule => (
                <div key={rule} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                  {rule}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 pt-4 space-y-3">
              {effectiveDateRules.map(rule => (
                <div key={rule} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                  {rule}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LeaveRules;
