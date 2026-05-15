import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AvailabilityResponse,
  CancellationRequest,
  Court,
  CourtWriteRequest,
  Price,
  ReservationRequest,
  ReservationResponse,
} from '../models';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = 'http://127.0.0.1:8000/api';

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
}
