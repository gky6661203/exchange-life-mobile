export type Page = 'home' | 'expenses' | 'documents' | 'checklists' | 'courses' | 'exchange' | 'places' | 'settings' | 'report';
export interface Profile {
  name: string; destination: string; school: string; departureDate: string; returnDate: string;
  semesterStart: string; semesterEnd: string; baseCurrency: string; localCurrency: string;
  semesterBudget: number; monthlyBudgets: Record<string, number>; studentId: string; address: string;
  timeZone: string;
}
export interface Expense { id: string; amount: number; currency: string; category: string; note: string; date: string; rate: number; baseAmount: number; baseCurrency: string; rateDate: string }
export interface DocumentItem { id: string; name: string; number: string; expiryDate: string; note: string; imageId?: string }
export type ChecklistGroup = 'learning' | 'travel' | 'daily';
export interface ChecklistItem { id: string; group: ChecklistGroup; title: string; dueDate: string; done: boolean }
export interface Course { id: string; name: string; room: string; teacher: string; weekday: number; startPeriod: number; endPeriod: number }
export interface ExchangeRecord { id: string; date: string; fromCurrency: string; toCurrency: string; fromAmount: number; toAmount: number; note: string }
export interface Place { id: string; name: string; category: string; address: string; note: string; visited: boolean }
export interface AppData { profile: Profile; expenses: Expense[]; documents: DocumentItem[]; checklists: ChecklistItem[]; courses: Course[]; exchanges: ExchangeRecord[]; places: Place[] }
export type Collection = 'expenses' | 'documents' | 'checklists' | 'courses' | 'exchanges' | 'places';
export interface RateResult { base: string; quote: string; rate: number; date: string; stale: boolean; history: { date: string; rate: number }[] }
export interface ModuleProps { data: AppData; refresh: () => Promise<void>; notify: (message: string) => void }




