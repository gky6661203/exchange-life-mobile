export const periodTimes = [
  { period: 1, label: '(1)08:10~09:00', time: '08:10~09:00' },
  { period: 2, label: '(2)09:10~10:00', time: '09:10~10:00' },
  { period: 3, label: '(3)10:10~11:00', time: '10:10~11:00' },
  { period: 4, label: '(4)11:10~12:00', time: '11:10~12:00' },
  { period: 5, label: '(5)12:10~13:00', time: '12:10~13:00' },
  { period: 6, label: '(6)13:10~14:00', time: '13:10~14:00' },
  { period: 7, label: '(7)14:10~15:00', time: '14:10~15:00' },
  { period: 8, label: '(8)15:10~16:00', time: '15:10~16:00' },
  { period: 9, label: '(9)16:10~17:00', time: '16:10~17:00' },
  { period: 10, label: '(10)17:10~18:00', time: '17:10~18:00' },
  { period: 11, label: '(11)18:30~19:20', time: '18:30~19:20' },
  { period: 12, label: '(12)19:30~20:20', time: '19:30~20:20' },
  { period: 13, label: '(13)20:30~21:20', time: '20:30~21:20' },
  { period: 14, label: '(14)21:30~22:20', time: '21:30~22:20' },
] as const;

export const periods = periodTimes.map(item => item.period);
export const maxPeriod = periodTimes.length;
export function periodLabel(period: number) { return periodTimes.find(item => item.period === period)?.label || `第 ${period} 节`; }
export function periodTime(period: number) { return periodTimes.find(item => item.period === period)?.time || ''; }
export function periodRangeLabel(start: number, end: number) {
  const startTime = periodTime(start);
  const endTime = periodTime(end);
  if (!startTime || !endTime) return `第 ${start}${end !== start ? `–${end}` : ''} 节`;
  const endClock = endTime.split('~')[1];
  return start === end ? `${periodLabel(start)}` : `(${start}-${end})${startTime.split('~')[0]}~${endClock}`;
}
