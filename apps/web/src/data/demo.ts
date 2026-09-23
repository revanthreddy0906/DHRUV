export type Status = 'AT RISK' | 'STABLE' | 'CRITICAL'

export const decisions = [
  { id: 'DEC-0481', station: 'MAITRI', resource: 'FUEL', consequence: 'Reserve crosses safe margin before next resupply window.', act: '18 NOV · 18:00', ponr: '19 NOV · 06:00', freshness: 'AGING · 14h', status: 'AT RISK' as Status },
  { id: 'DEC-0479', station: 'BHARATI', resource: 'CARGO', consequence: 'Delayed cargo compresses the medical supply buffer.', act: '19 NOV · 08:00', ponr: '20 NOV · 02:00', freshness: 'FRESH · 2h', status: 'STABLE' as Status },
]

export const events = [
  ['08:40', 'STOCK_COUNTED', 'MAITRI', 'Fuel inventory updated'],
  ['07:55', 'CARGO_DELAY', 'GOA HQ', 'Resupply cargo delayed'],
  ['06:30', 'PERSON_MOVED', 'MAITRI', 'Field team movement recorded'],
  ['05:15', 'WEATHER_UPDATE', 'FT-3', 'Visibility window reduced'],
] as const
