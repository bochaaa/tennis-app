export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface Court {
  id: number;
  name: string;
  is_active?: boolean;
}

export interface CourtWriteRequest {
  name: string;
  is_active?: boolean;
}

export interface Player {
  first_name: string;
  last_name: string;
  is_member: boolean;
  price_applied?: number;
}

export interface ReservationRequest {
  court: number;
  date: string;
  start_time: string;
  game_mode: 'SINGLES' | 'DOUBLES';
  contact_name: string;
  contact_phone: string;
  players: Player[];
  notes?: string;
}

export interface ReservationResponse {
  id: number;
  reservation_type: 'NORMAL' | 'CLASS';
  game_mode: 'SINGLES' | 'DOUBLES';
  start_datetime: string;
  end_datetime: string;
  status: 'CONFIRMED' | 'CANCELLED' | 'CANCELLATION_REQUESTED';
  total_price: number;
  players: Player[];
}

export interface AvailabilityRange {
  start_time: string;
  end_time: string;
  duration_minutes: number;
  can_book_90_min: boolean;
  can_start_until: string;
}

export interface UnavailableRange {
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  reservation_contact_name?: string | null;
  class_title?: string | null;
  block_reason?: string | null;
  reservation_type?: 'CLASS' | 'NORMAL' | null;
  reservation_types?: Array<'CLASS' | 'NORMAL'> | string | null;
  reservation_contact_names?: string[];
  class_titles?: string[];

  // Campos opcionales que pueden venir del backend para identificar al titular.
  contact_name?: string;
  customer_name?: string;
  requester_name?: string;
  full_name?: string;
  name?: string;
  reservation?: {
    contact_name?: string;
    requester_name?: string;
    customer_name?: string;
    full_name?: string;
    name?: string;
  };
}

export interface CourtAvailability {
  id: number;
  name: string;
  available_ranges: AvailabilityRange[];
  unavailable_ranges: UnavailableRange[];
}

export interface AvailabilityResponse {
  date: string;
  reservation_duration_minutes: number;
  courts: CourtAvailability[];
}

export interface CancellationRequest {
  requester_name: string;
  requester_phone: string;
  reason: string;
}

export interface Price {
  id: number;
  game_mode: 'SINGLES' | 'DOUBLES';
  player_type: 'MEMBER' | 'NON_MEMBER';
  price: number;
}
