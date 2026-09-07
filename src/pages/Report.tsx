import { Printer, ArrowLeft, MapPin, Wallet, CalendarCheck, CircleCheck } from 'lucide-react';
import type { AppData, Page } from '../lib/types';
import { money, shortDate } from '../lib/format';
import { PageHeading } from '../components/ui';
export default function Report({ data, navigate }: { data: AppData; navigate: (p: Page) => void }) {
  const p = data.profile;
  const expenses = data.expenses.filter(e => (!p.semesterStart || e.date >= p.semesterStart) && (!p.semesterEnd || e.date <= p.semesterEnd));
  const total = expenses.reduce((sum, e) => sum + e.baseAmount, 0);
  const days = new Set(expenses.map(e => e.date)).size;
  const places = data.places.filter(p => p.visited);
  const allGroups = Object.entries(expenses.reduce<Record<string, number>>((a, e) => { a[e.category] = (a[e.category] || 0) + e.baseAmount; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const groups: [string, number][] = allGroups.length > 7 ? [...allGroups.slice(0, 6), ['其余分类', allGroups.slice(6).reduce((sum, entry) => sum + entry[1], 0)]] : allGroups;
  return <div className="page-stack report-page"><div className="spread no-print"><button className="text-button" onClick={() => navigate('settings')}><ArrowLeft size={16} />返回设置</button><button className="button" onClick={() => window.print()}><Printer size={17} />打印 / 保存 PDF</button></div><article className="report-sheet"><div className="report-brand">Exchange life.<span>我的交换总结</span></div><PageHeading title={p.destination ? `在${p.destination}的日子` : '交换总结'} description={[p.name, p.school].filter(Boolean).join(' · ') || undefined} /><p className="muted report-dates">{shortDate(p.departureDate)} — {shortDate(p.returnDate)}</p><div className="report-total"><Wallet size={24} /><span>学期总支出</span><strong>{money(total, p.baseCurrency)}</strong></div><div className="report-stats"><div><CalendarCheck size={22} /><strong>{days}<small>天</small></strong><span>记录天数</span></div><div><MapPin size={22} /><strong>{places.length}<small>个</small></strong><span>去过地点</span></div><div><CircleCheck size={22} /><strong>{data.checklists.filter(t => t.done).length}<small>件</small></strong><span>已完成</span></div></div><section className="report-categories"><h2>分类支出</h2>{groups.length ? groups.map(([category, value]) => <div className="report-category" key={category}><div className="spread"><span>{category}</span><span>{money(value, p.baseCurrency)} <small className="muted">{Math.round(total ? value / total * 100 : 0)}%</small></span></div><div className="progress-track"><div style={{ width: `${total ? value / total * 100 : 0}%` }} /></div></div>) : <p className="muted">暂无支出记录。</p>}</section><section className="report-places"><h2>去过的地方</h2><p className="muted">{places.length ? places.slice(0, 8).map(p => p.name.length > 25 ? p.name.slice(0, 25) + '…' : p.name).join('、') + (places.length > 8 ? `，还有 ${places.length - 8} 个地方` : '') : '暂无地点。'}</p></section><footer className="report-footer"><span>Exchange life.</span></footer></article></div>;
}




