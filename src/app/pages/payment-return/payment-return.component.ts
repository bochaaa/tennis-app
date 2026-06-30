import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PaymentStatus, ReservationResponse } from '../../models';
import { ApiService } from '../../services/api.service';

type PaymentReturnState = 'success' | 'failure' | 'pending';

@Component({
  selector: 'app-payment-return',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './payment-return.component.html',
  styleUrls: ['./payment-return.component.css'],
})
export class PaymentReturnComponent implements OnInit, OnDestroy {
  state: PaymentReturnState = 'pending';
  reservationId: number | null = null;
  reservation: ReservationResponse | null = null;
  isLoading = false;
  errorMessage = '';
  pollAttempts = 0;

  private pollHandle: number | null = null;
  private readonly maxPollAttempts = 8;
  private currencyFormatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly apiService: ApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const routeState = this.route.snapshot.data['state'];
    if (routeState === 'success' || routeState === 'failure' || routeState === 'pending') {
      this.state = routeState;
    }

    this.reservationId = this.extractReservationId();
    if (this.reservationId) {
      this.refreshPaymentStatus(true);
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  goToPaymentSearch(): void {
    this.router.navigate(['/reservations/payments']);
  }

  refreshPaymentStatus(shouldStartPolling = false): void {
    if (!this.reservationId || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.apiService.getReservationPaymentStatus(this.reservationId).subscribe({
      next: (response) => {
        this.reservation = response;
        this.isLoading = false;
        this.cdr.detectChanges();

        if (shouldStartPolling && this.shouldKeepPolling()) {
          this.startPolling();
        } else if (!this.shouldKeepPolling()) {
          this.stopPolling();
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudo consultar el pago.');
        this.cdr.detectChanges();
      },
    });
  }

  getTitle(): string {
    if (this.state === 'failure') {
      return 'No pudimos confirmar el pago';
    }

    if (this.state === 'success') {
      return 'Estamos confirmando el pago';
    }

    return 'Pago en proceso';
  }

  getBody(): string {
    if (this.state === 'failure') {
      return 'El regreso desde Mercado Pago no confirma el estado final. Consulta la reserva o intenta pagar nuevamente si sigue pendiente.';
    }

    return 'El backend confirma el pago cuando recibe la notificacion de Mercado Pago. Esto puede tardar unos instantes.';
  }

  getPaymentStatusLabel(status: PaymentStatus | undefined = this.reservation?.payment_status): string {
    switch (status) {
      case 'pending_payment':
        return 'Pago pendiente';
      case 'partial_payment':
        return 'Pago parcial';
      case 'paid':
        return 'Reserva pagada';
      case 'expired':
        return 'Reserva vencida';
      case 'cancelled':
        return 'Reserva cancelada';
      case 'rejected':
        return 'Pago rechazado';
      default:
        return 'Sin estado confirmado';
    }
  }

  getStatusClasses(): string {
    switch (this.reservation?.payment_status) {
      case 'paid':
        return 'border-emerald-300 bg-emerald-50 text-emerald-900';
      case 'partial_payment':
        return 'border-amber-300 bg-amber-50 text-amber-900';
      case 'expired':
      case 'cancelled':
      case 'rejected':
        return 'border-red-300 bg-red-50 text-red-800';
      default:
        return 'border-sky-300 bg-sky-50 text-sky-900';
    }
  }

  getTotalAmount(): string {
    return this.formatCurrency(
      this.toNullableNumber(this.reservation?.total_amount) ??
        this.toNullableNumber(this.reservation?.total_price),
    );
  }

  getPaidAmount(): string {
    return this.formatCurrency(this.toNullableNumber(this.reservation?.paid_amount) ?? 0);
  }

  getRemainingAmount(): string {
    return this.formatCurrency(this.toNullableNumber(this.reservation?.remaining_amount));
  }

  private startPolling(): void {
    if (this.pollHandle !== null) {
      return;
    }

    this.pollHandle = window.setInterval(() => {
      this.pollAttempts += 1;
      if (this.pollAttempts >= this.maxPollAttempts || !this.shouldKeepPolling()) {
        this.stopPolling();
        return;
      }

      this.refreshPaymentStatus(false);
    }, 4000);
  }

  private stopPolling(): void {
    if (this.pollHandle === null) {
      return;
    }

    window.clearInterval(this.pollHandle);
    this.pollHandle = null;
  }

  private shouldKeepPolling(): boolean {
    const status = this.reservation?.payment_status;
    return status === 'pending_payment' || !status;
  }

  private extractReservationId(): number | null {
    const params = this.route.snapshot.queryParamMap;
    const candidates = [
      params.get('reservation_id'),
      params.get('reservationId'),
      params.get('reservation'),
      params.get('id'),
      params.get('external_reference'),
    ];

    const rawValue = candidates.find((value) => !!value && value.trim().length > 0);
    if (!rawValue) {
      return null;
    }

    const numericMatch = rawValue.match(/\d+/);
    const numericValue = Number(numericMatch ? numericMatch[0] : rawValue);
    return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
  }

  private formatCurrency(value: number | null): string {
    if (value === null) {
      return 'No disponible';
    }

    return this.currencyFormatter.format(value);
  }

  private toNullableNumber(value: number | string | null | undefined): number | null {
    if (value === null || typeof value === 'undefined') {
      return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
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
    }

    return fallback;
  }
}
