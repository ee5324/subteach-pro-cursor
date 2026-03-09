import React from 'react';
import InstructionPanel from '../components/InstructionPanel';

const generalLeaveRules = [
  {
    name: '事假',
    days: '每學年 7 日',
    dispatch: '與家庭照顧假、身心調適假合計超過 7 日者，超過部分按日扣薪，但課務代理費由學校支付。',
    notes: '屬一般請假類別。'
  },
  {
    name: '家庭照顧假',
    days: '每學年 7 日',
    dispatch: '日數併入事假計算；與事假、身心調適假合計超過 7 日時，超過部分按日扣薪，但課務代理費由學校支付。',
    notes: '學校不得拒絕，且不得為不利處分。'
  },
  {
    name: '身心調適假',
    days: '每學年 3 日',
    dispatch: '日數併入事假計算；與事假、家庭照顧假合計超過 7 日時，超過部分按日扣薪，但課務代理費由學校支付。',
    notes: '學校不得拒絕，且不得為不利處分。'
  },
  {
    name: '病假',
    days: '每學年 28 日',
    dispatch: '超過規定日數者，以事假抵銷。',
    notes: '屬一般病假類別。'
  },
  {
    name: '生理假',
    days: '每月 1 日',
    dispatch: '全學年未逾 3 日者，不併入病假計算；超過 3 日的部分併入病假計算。',
    notes: '學校不得拒絕，且不得為不利處分。'
  },
  {
    name: '延長病假',
    days: '2 年內合併不得超過 1 年',
    dispatch: '患重病或安胎需休養者，於病假、事假及休假均請畢後可申請。',
    notes: '依實際醫療與安胎需求辦理。'
  }
];

const marriageBirthRules = [
  {
    name: '婚假',
    days: '14 日',
    dispatch: '依規定請假；私立學校教師代課鐘點費由學校支應，且不得扣薪。',
    notes: '應自登記日前 10 日起 3 個月內請畢；特殊事由經核准可於 1 年內請畢。'
  },
  {
    name: '產前假',
    days: '8 日',
    dispatch: '私立學校教師代課鐘點費由學校支應，且不得扣薪。',
    notes: '於分娩前得分次申請；學校不得拒絕。'
  },
  {
    name: '娩假',
    days: '42 日',
    dispatch: '私立學校教師代課鐘點費由學校支應，且不得扣薪。',
    notes: '應於分娩後一次請畢；學校不得拒絕。'
  },
  {
    name: '流產假',
    days: '未滿 12 週 14 日；12 週以上未滿 20 週 21 日；20 週以上 42 日',
    dispatch: '私立學校教師代課鐘點費由學校支應，且不得扣薪。',
    notes: '應一次請畢；學校不得拒絕。'
  },
  {
    name: '陪產檢及陪產假',
    days: '7 日',
    dispatch: '私立學校教師代課鐘點費由學校支應，且不得扣薪。',
    notes: '陪產檢於配偶懷孕期間申請；陪產假於配偶分娩或流產當日及前後合計 15 日內申請。'
  },
  {
    name: '喪假',
    days: '父母、配偶 15 日；繼父母、配偶之父母、子女 10 日；曾祖父母、祖父母、配偶之祖父母、配偶之繼父母、兄弟姐妹 5 日',
    dispatch: '依親屬關係適用不同天數。',
    notes: '應於死亡之日起百日內請畢。'
  }
];

const specialRules = [
  {
    name: '骨髓或器官捐贈假',
    days: '視實際需要給假',
    dispatch: '依實際需要核給。',
    notes: '屬特殊法定假別。'
  },
  {
    name: '原住民族歲時祭儀放假',
    days: '依原民會公告之放假日',
    dispatch: '所遺課務由學校派員代理。',
    notes: '私立學校教師代課鐘點費由學校支應，且不得扣薪。'
  },
  {
    name: '公假',
    days: '視實際需要由學校定其期間',
    dispatch: '適用於奉派集會、考察、兵役、投票、作證等法定事由。',
    notes: '依法定或公務需求核給。'
  }
];

const commonRules = [
  '教師請假時，其課（職）務應委託適當人員代理；若教師無法覓得合適代理人時，學校應協調派員代理。',
  '私立學校教師請婚假、娩假、流產假、產前假、陪產檢及陪產假，以及原住民族歲時祭儀放假時，代課鐘點費應由學校支應，且不得扣薪。',
  '教師請假應填具假單，經學校核准後始得離開；如遇急病或緊急事故，得由同事或親友代辦或補辦。',
  '教師申請家庭照顧假、身心調適假、生理假、產前假、娩假、流產假、陪產檢及陪產假，或因安胎申請其他假別時，服務學校不得拒絕，且不得為其他不利之處分。'
];

const LeaveRules: React.FC = () => {
  const renderRuleCards = (
    title: string,
    description: string,
    items: { name: string; days: string; dispatch: string; notes: string }[]
  ) => (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map(item => (
          <div key={item.name} className="px-6 py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">{item.name}</h3>
                <p className="text-sm text-slate-500 mt-1">得請假天數：{item.days}</p>
              </div>
              <div className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold w-fit">
                假別摘要
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-500 mb-1">派代 / 扣薪條件</div>
                <p className="text-sm text-slate-700 leading-6">{item.dispatch}</p>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-500 mb-1">注意事項</div>
                <p className="text-sm text-slate-700 leading-6">{item.notes}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-800">請假規則</h1>
        <p className="text-slate-500 mt-2 text-sm md:text-base">
          彙整常見教師假別、得請假天數、派代條件與實務注意事項，方便查詢與核對。
        </p>
      </div>

      <InstructionPanel title="使用說明：請假規則" isOpenDefault>
        <p>本頁內容依教師請假規則整理，適合作為假別查詢與派代判斷的快速參考。</p>
        <p>若實際適用仍涉及個案認定、證明文件或學校內部行政流程，建議以正式法規、人事單位解釋與主管機關最新函釋為準。</p>
      </InstructionPanel>

      <div className="grid gap-6">
        {renderRuleCards('一、一般假別（事假、病假類）', '涵蓋事假、家庭照顧假、身心調適假、病假、生理假與延長病假。', generalLeaveRules)}
        {renderRuleCards('二、婚喪與生育假別', '涵蓋婚假、產前假、娩假、流產假、陪產檢及陪產假、喪假。', marriageBirthRules)}
        {renderRuleCards('三、其他特殊假別', '涵蓋骨髓或器官捐贈假、原住民族歲時祭儀放假與公假。', specialRules)}

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">四、共通性派代與請假條件</h2>
            <p className="text-sm text-slate-500 mt-1">整理所有假別都常用到的共通規則。</p>
          </div>
          <div className="p-6 space-y-3">
            {commonRules.map(rule => (
              <div key={rule} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                {rule}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default LeaveRules;
