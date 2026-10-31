import type { Channel, ContactSource, VisitOutcome } from '../../types';

export const SOURCE_LABEL: Record<ContactSource, string> = {
  warm: 'People you know',
  walk_in: 'Walk-in',
  inbound: 'Messaged you',
  referral: 'Referral',
  map: 'Map listing',
  other: 'Other',
  client: 'Client',
};

export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: 'WhatsApp', call: 'Calls', email: 'Email' };

export const OUTCOME_LABEL: Record<VisitOutcome, string> = {
  not_met: 'Owner not there',
  talked: 'Talked',
  interested: 'Interested',
  not_interested: 'Not interested',
  come_back: 'Come back later',
};

export const CATEGORIES = [
  ['all', 'Every kind of shop'], ['restaurant', 'Restaurants'], ['cafe', 'Cafés'], ['bakery', 'Bakeries'],
  ['salon', 'Salons'], ['clinic', 'Clinics'], ['clothes', 'Clothes and tailors'], ['grocery', 'Grocery'],
  ['school', 'Schools'], ['coaching', 'Coaching'], ['hotel', 'Hotels'], ['electronics', 'Electronics'],
  ['jewellery', 'Jewellery'], ['gym', 'Gyms'], ['pharmacy', 'Pharmacies'], ['florist', 'Florists and gifts'],
] as const;

export function shortDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong';
}
