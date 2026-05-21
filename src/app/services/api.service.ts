import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AvailabilityResponse,
  CancellationRequest,
  Court,
  CourtWriteRequest,
  Price,
  PriceWriteRequest,
  RecurringRule,
  RecurringRuleWriteRequest,
  ReservationRequest,
  ReservationResponse,
  Schedule,
  ScheduleWriteRequest,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Courts
  getCourts(): Observable<Court[]> {
    return this.http.get<Court[]>(`${this.apiUrl}/courts/`);
  }

  getCourt(id: number): Observable<Court> {
    return this.http.get<Court>(`${this.apiUrl}/courts/${id}/`);
  }

  createCourt(data: CourtWriteRequest): Observable<Court> {
    return this.http.post<Court>(`${this.apiUrl}/courts/`, data);
  }

  updateCourt(id: number, data: Partial<CourtWriteRequest>): Observable<Court> {
    return this.http.patch<Court>(`${this.apiUrl}/courts/${id}/`, data);
  }

  deleteCourt(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/courts/${id}/`);
  }

  // Availability
  getAvailability(date: string): Observable<AvailabilityResponse> {
    const params = new HttpParams().set('date', date);
    return this.http.get<AvailabilityResponse>(`${this.apiUrl}/availability/`, { params });
  }

  // Reservations
  createReservation(reservation: ReservationRequest): Observable<ReservationResponse> {
    return this.http.post<ReservationResponse>(`${this.apiUrl}/reservations/`, reservation);
  }

  getReservation(id: number): Observable<ReservationResponse> {
    return this.http.get<ReservationResponse>(`${this.apiUrl}/reservations/${id}/`);
  }

  requestCancellation(reservationId: number, data: CancellationRequest): Observable<unknown> {
    return this.http.post(
      `${this.apiUrl}/reservations/${reservationId}/request-cancellation/`,
      data,
    );
  }

  // Prices
  getPrices(): Observable<Price[]> {
    return this.http.get<Price[]>(`${this.apiUrl}/prices/`);
  }

  getPrice(id: number): Observable<Price> {
    return this.http.get<Price>(`${this.apiUrl}/prices/${id}/`);
  }

  createPrice(data: PriceWriteRequest): Observable<Price> {
    return this.http.post<Price>(`${this.apiUrl}/prices/`, data);
  }

  updatePrice(id: number, data: Partial<PriceWriteRequest>): Observable<Price> {
    return this.http.patch<Price>(`${this.apiUrl}/prices/${id}/`, data);
  }

  deletePrice(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/prices/${id}/`);
  }

  // Club schedules
  getSchedules(): Observable<Schedule[]> {
    return this.http.get<Schedule[]>(`${this.apiUrl}/schedules/`);
  }

  createSchedule(data: ScheduleWriteRequest): Observable<Schedule> {
    return this.http.post<Schedule>(`${this.apiUrl}/schedules/`, data);
  }

  updateSchedule(id: number, data: Partial<ScheduleWriteRequest>): Observable<Schedule> {
    return this.http.patch<Schedule>(`${this.apiUrl}/schedules/${id}/`, data);
  }

  deleteSchedule(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/schedules/${id}/`);
  }

  // Recurring class rules
  getRecurringRules(): Observable<RecurringRule[]> {
    return this.http.get<RecurringRule[]>(`${this.apiUrl}/recurring-rules/`);
  }

  createRecurringRule(data: RecurringRuleWriteRequest): Observable<RecurringRule> {
    return this.http.post<RecurringRule>(`${this.apiUrl}/recurring-rules/`, data);
  }

  updateRecurringRule(
    id: number,
    data: Partial<RecurringRuleWriteRequest>,
  ): Observable<RecurringRule> {
    return this.http.patch<RecurringRule>(`${this.apiUrl}/recurring-rules/${id}/`, data);
  }

  deleteRecurringRule(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/recurring-rules/${id}/`);
  }

  deactivateRecurringRule(id: number, cancellationReason?: string): Observable<unknown> {
    const payload = cancellationReason ? { cancellation_reason: cancellationReason } : {};
    return this.http.patch(`${this.apiUrl}/recurring-rules/${id}/deactivate/`, payload);
  }

  generateRecurringRules(daysAhead: number): Observable<unknown> {
    const params = new HttpParams().set('days_ahead', String(daysAhead));
    return this.http.post(`${this.apiUrl}/recurring-rules/generate/`, null, { params });
  }
}
