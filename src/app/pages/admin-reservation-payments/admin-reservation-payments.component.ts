import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ReservationAdminItem } from '../../models';
import { ApiService } from '../../services/api.service';

type PaymentFilter = 'ALL' | 'PAID' | 'UNPAID';
type PendingPaymentAction = 'mark_paid' | 'mark_unpaid';

@Component({
  selector: 'app-admin-reservation-payments',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-reservation-payments.component.html',
  styleUrls: ['./admin-reservation-payments.component.css'],
})
export class AdminReservationPaymentsComponent implements OnInit {
  reservations: ReservationAdminItem[] = [];
  isLoading = false;
  updatingReservationId: number | null = null;
  pendingPaymentReservation: ReservationAdminItem | null = null;
  pendingPaymentAction: PendingPaymentAction | null = null;
  errorMessage = '';
  successMessage = '';

  selectedDate = this.getTodayDate();
  paymentFilter: PaymentFilter = 'ALL';
  readonly paymentFilters: PaymentFilter[] = ['UNPAID', 'PAID', 'ALL'];

  constructor(
    private readonly apiService: ApiService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadReservations();
  }

  goToDashboard(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  onDateChanged(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.selectedDate = String(input?.value || '').trim();
    this.loadReservations();
  }

  setPaymentFilter(filter: PaymentFilter): void {
    if (this.paymentFilter === filter) {
      return;
    }
    this.paymentFilter = filter;
    this.loadReservations();
  }

  isPaymentFilterActive(filter: PaymentFilter): boolean {
    return this.paymentFilter === filter;
  }

  loadReservations(): void {
    this.isLoading = true;
    this.errorMessage = '';

    const filters: { date?: string; is_paid?: boolean; unpaid?: boolean } = {};

    if (this.paymentFilter === 'UNPAID') {
      // Trae todos los turnos impagos sin limitar por fecha.
      filters.unpaid = true;
    } else if (this.paymentFilter === 'PAID') {
      filters.is_paid = true;
      if (this.selectedDate) {
        filters.date = this.selectedDate;
      }
    }

    this.apiService.getReservationsAdmin(filters).subscribe({
      next: (response) => {
        try {
          const reservations = this.normalizeReservationsResponse(response);
          const regularReservations = reservations.filter((reservation) =>
            this.isRegularReservation(reservation),
          );
          this.reservations = this.sortReservations(regularReservations);
          this.cdr.detectChanges();
        } catch (error) {
          console.error('Error procesando turnos para cobro:', error);
          this.reservations = [];
          this.errorMessage = 'No se pudieron procesar los turnos.';
          this.cdr.detectChanges();
        } finally {
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.reservations = [];
        this.errorMessage = this.extractErrorMessage(error, 'No se pudieron cargar los turnos.');
        this.cdr.detectChanges();
      },
    });
  }

  confirmPayment(reservation: ReservationAdminItem): void {
    if (!this.canConfirmPayment(reservation)) {
      return;
    }

    this.pendingPaymentReservation = reservation;
    this.pendingPaymentAction = 'mark_paid';
  }

  undoPayment(reservation: ReservationAdminItem): void {
    if (!reservation.is_paid) {
      return;
    }

    this.pendingPaymentReservation = reservation;
    this.pendingPaymentAction = 'mark_unpaid';
  }

  canConfirmPayment(reservation: ReservationAdminItem): boolean {
    return !reservation.is_paid && reservation.status !== 'CANCELLED';
  }

  getPaymentFilterLabel(filter: PaymentFilter): string {
    if (filter === 'ALL') {
      return 'Todos';
    }
    if (filter === 'PAID') {
      return 'Pagados';
    }
    return 'No cobrados';
  }

  getReservationTitle(reservation: ReservationAdminItem): string {
    return `Turno #${reservation.id}`;
  }

  getCourtName(reservation: ReservationAdminItem): string {
    if (reservation.court_name && reservation.court_name.trim().length > 0) {
      return reservation.court_name.trim();
    }

    if (typeof reservation.court === 'object' && reservation.court?.name) {
      return reservation.court.name;
    }

    if (typeof reservation.court === 'number') {
      return `Cancha ${reservation.court}`;
    }

    return 'Cancha sin identificar';
  }

  getReservationWhenLabel(reservation: ReservationAdminItem): string {
    if (reservation.start_datetime) {
      return this.formatDateTime(reservation.start_datetime);
    }

    const date = reservation.date || '';
    const start = reservation.start_time ? reservation.start_time.slice(0, 5) : '--:--';
    if (date) {
      return `${date} ${start}`;
    }

    return start;
  }

  getPaymentStatusLabel(reservation: ReservationAdminItem): string {
    return reservation.is_paid ? 'Pagado' : 'No cobrado';
  }

  getPaymentStatusClasses(reservation: ReservationAdminItem): string {
    return reservation.is_paid
      ? 'border border-emerald-300/60 bg-emerald-900/40 text-emerald-100'
      : 'border border-amber-300/60 bg-amber-900/40 text-amber-100';
  }

  getReservationStatusLabel(reservation: ReservationAdminItem): string {
    if (reservation.status === 'CONFIRMED') {
      return 'Confirmada';
    }
    if (reservation.status === 'CANCELLATION_REQUESTED') {
      return 'Cancelacion solicitada';
    }
    if (reservation.status === 'CANCELLED') {
      return 'Cancelada';
    }
    return reservation.status;
  }

  getReservationStatusClasses(reservation: ReservationAdminItem): string {
    if (reservation.status === 'CONFIRMED') {
      return 'border border-blue-300/50 bg-blue-900/30 text-blue-100';
    }
    if (reservation.status === 'CANCELLATION_REQUESTED') {
      return 'border border-orange-300/50 bg-orange-900/30 text-orange-100';
    }
    return 'border border-slate-300/50 bg-slate-900/30 text-slate-100';
  }

  getPaidAtLabel(reservation: ReservationAdminItem): string {
    if (!reservation.paid_at) {
      return 'Sin fecha';
    }

    return this.formatDateTime(reservation.paid_at);
  }

  getPaidConfirmedByLabel(reservation: ReservationAdminItem): string {
    const source = reservation.paid_confirmed_by;
    if (!source) {
      return 'No informado';
    }

    if (typeof source === 'string') {
      return source;
    }

    const fullName = String(source.full_name || '').trim();
    if (fullName) {
      return fullName;
    }

    const firstName = String(source.first_name || '').trim();
    const lastName = String(source.last_name || '').trim();
    const composed = `${firstName} ${lastName}`.trim();
    if (composed) {
      return composed;
    }

    const username = String(source.username || '').trim();
    if (username) {
      return username;
    }

    if (typeof source.id === 'number') {
      return `Admin #${source.id}`;
    }

    return 'No informado';
  }

  isUpdating(reservation: ReservationAdminItem): boolean {
    return this.updatingReservationId === reservation.id;
  }

  closePaymentConfirmModal(): void {
    this.pendingPaymentReservation = null;
    this.pendingPaymentAction = null;
  }

  approvePaymentConfirmation(): void {
    if (!this.pendingPaymentReservation || !this.pendingPaymentAction) {
      return;
    }

    const reservation = this.pendingPaymentReservation;
    const isPaid = this.pendingPaymentAction === 'mark_paid';
    this.pendingPaymentReservation = null;
    this.pendingPaymentAction = null;
    this.updatePaymentStatus(reservation, isPaid);
  }

  getPendingPaymentAmountLabel(): string {
    if (!this.pendingPaymentReservation) {
      return '$0';
    }

    return this.formatAmount(this.pendingPaymentReservation.total_price);
  }

  getPaymentModalTitle(): string {
    if (this.pendingPaymentAction === 'mark_unpaid') {
      return 'Estas por marcar un turno como no cobrado';
    }

    return 'Estas por marcar un turno como pagado';
  }

  getPaymentModalBodyLabel(): string {
    if (this.pendingPaymentAction === 'mark_unpaid') {
      return 'Vas a deshacer la confirmacion de pago de este turno.';
    }

    return 'Confirma solo si ya recibiste el pago de este turno.';
  }

  getPaymentModalConfirmLabel(): string {
    if (this.pendingPaymentAction === 'mark_unpaid') {
      return 'Si, marcar no cobrado';
    }

    return 'Si, confirmar pago';
  }

  getPaymentModalConfirmClasses(): string {
    if (this.pendingPaymentAction === 'mark_unpaid') {
      return 'rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700';
    }

    return 'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700';
  }

  private updatePaymentStatus(reservation: ReservationAdminItem, isPaid: boolean): void {
    if (reservation.status === 'CANCELLED' && isPaid) {
      this.errorMessage = 'No se puede confirmar pago en una reserva cancelada.';
      return;
    }

    this.updatingReservationId = reservation.id;
    this.errorMessage = '';
    this.successMessage = '';

    this.apiService.updateReservationPaymentStatus(reservation.id, { is_paid: isPaid }).subscribe({
      next: () => {
        this.updatingReservationId = null;
        this.successMessage = isPaid
          ? `Pago confirmado para el turno #${reservation.id}.`
          : `Se marco como no cobrado el turno #${reservation.id}.`;
        this.loadReservations();
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.updatingReservationId = null;
        this.errorMessage = this.extractErrorMessage(
          error,
          'No se pudo actualizar el estado de pago.',
        );
        this.cdr.detectChanges();
      },
    });
  }

  private sortReservations(reservations: ReservationAdminItem[]): ReservationAdminItem[] {
    return [...reservations].sort((a, b) => {
      const aTime = this.getSortTimestamp(a);
      const bTime = this.getSortTimestamp(b);
      return aTime - bTime;
    });
  }

  private isRegularReservation(reservation: ReservationAdminItem): boolean {
    const reservationType = String(reservation.reservation_type || '')
      .trim()
      .toUpperCase();

    if (!reservationType) {
      // Si backend no informa el tipo, no ocultamos el turno por seguridad.
      return true;
    }

    // Solo excluimos clases recurrentes.
    return reservationType !== 'CLASS';
  }

  private normalizeReservationsResponse(response: unknown): ReservationAdminItem[] {
    if (Array.isArray(response)) {
      return response as ReservationAdminItem[];
    }

    if (response && typeof response === 'object') {
      const bag = response as Record<string, unknown>;
      const candidates = ['results', 'data', 'items', 'reservations'];

      for (const key of candidates) {
        const value = bag[key];
        if (Array.isArray(value)) {
          return value as ReservationAdminItem[];
        }
      }
    }

    return [];
  }

  private getSortTimestamp(reservation: ReservationAdminItem): number {
    if (reservation.start_datetime) {
      const parsed = Date.parse(reservation.start_datetime);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    const date = String(reservation.date || '').trim();
    const time = String(reservation.start_time || '').trim();
    if (!date) {
      return Number.MAX_SAFE_INTEGER;
    }

    const safeTime = time.length >= 5 ? time.slice(0, 5) : '00:00';
    const parsedFallback = Date.parse(`${date}T${safeTime}:00`);
    if (!Number.isNaN(parsedFallback)) {
      return parsedFallback;
    }

    return Number.MAX_SAFE_INTEGER;
  }

  private formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private formatAmount(value: number | null | undefined): string {
    const numericValue = Number(value ?? 0);
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(numericValue) ? numericValue : 0);
  }

  private getTodayDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const errorValue = error as { error?: unknown };
    const payload = errorValue?.error;
    if (!payload) {
      return fallback;
    }

    if (typeof payload === 'string') {
      return payload;
    }

    if (typeof payload === 'object') {
      const objectPayload = payload as Record<string, unknown>;
      const detail = objectPayload['detail'];
      if (typeof detail === 'string' && detail.trim().length > 0) {
        return detail;
      }

      const firstKey = Object.keys(objectPayload)[0];
      if (!firstKey) {
        return fallback;
      }

      const firstValue = objectPayload[firstKey];
      if (Array.isArray(firstValue) && firstValue.length > 0) {
        return `${firstKey}: ${String(firstValue[0])}`;
      }

      return `${firstKey}: ${String(firstValue)}`;
    }

    return fallback;
  }
}
