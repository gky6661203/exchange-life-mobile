export type Page = 'home' | 'fitness' | 'stocks' | 'subscriptions' | 'documents' | 'checklists' | 'settings' | 'expenses' | 'courses' | 'exchange' | 'places' | 'report';
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
export interface Subscription { id: string; name: string; amount: number; currency: string; nextRenewal: string; billingDay: number; intervalMonths: number; reminderDays: number; active: boolean; category: 'ai' | 'life' | 'fitness'; url: string; note: string }
export interface Workout { id: string; date: string; minutes: number; note: string }
export type StockMarket = 'TW' | 'US' | 'HK' | 'CN';
export interface WatchStock { id: string; market: StockMarket; symbol: string; name: string }
export interface StockQuote { symbol: string; name: string; currency: string; price: number; previousClose: number | null; change: number | null; changePercent: number | null; marketTime: string; fetchedAt: string; stale: boolean; source: string; sourceUrl: string; history: { date: string; close: number }[] }
export interface AppData { profile: Profile; expenses: Expense[]; documents: DocumentItem[]; checklists: ChecklistItem[]; courses: Course[]; exchanges: ExchangeRecord[]; places: Place[]; subscriptions: Subscription[]; workouts: Workout[]; watchlist: WatchStock[]; }
export type Collection = 'expenses' | 'documents' | 'checklists' | 'courses' | 'exchanges' | 'places' | 'subscriptions' | 'workouts' | 'watchlist';
export interface RateResult { base: string; quote: string; rate: number; date: string; stale: boolean; history: { date: string; rate: number }[] }
export interface ModuleProps { data: AppData; refresh: () => Promise<void>; notify: (message: string) => void }
