// The US scan list: the 30 Dow Jones Industrial Average members (as of the Nov 2024 change: NVDA and SHW in, INTC and
// DOW out). Large, liquid names; 30 keeps a scan inside Twelve Data's free 8 calls a minute (~4 minutes). Check the
// members now and then, like LQ45 (NOTES.md).
export const DOW30 = [
  'AAPL', 'AMGN', 'AMZN', 'AXP', 'BA', 'CAT', 'CRM', 'CSCO', 'CVX', 'DIS',
  'GS', 'HD', 'HON', 'IBM', 'JNJ', 'JPM', 'KO', 'MCD', 'MMM', 'MRK',
  'MSFT', 'NKE', 'NVDA', 'PG', 'SHW', 'TRV', 'UNH', 'V', 'VZ', 'WMT',
] as const
