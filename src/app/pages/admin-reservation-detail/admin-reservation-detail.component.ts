import { CommonModule, Location } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  PaymentStatus,
  PaymentTransaction,
  Player,
  ReservationResponse,
} from '../../models';
import { ApiService } from '../../services/api.service';

type PlayerPaymentState = 'paid' | 'rejected' | 'pending';

@Component({
  selector: 'app-admin-reservation-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-reservation-detail.component.html',
})
export class AdminReservationDetailComponent implements OnInit {
  reservation: ReservationResponse | null = null;
  isLoading = true;
  errorMessage = '';
  expandedTransactionKeys = new Set<string>();

  private readonly currencyFormatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  constructor(
    private readonly apiService: ApiService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly location: Location,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const rawId = this.route.snapshot.paramMap.get('id');
    if (!rawId || !/^\d+$/.test(rawId)) {
      this.isLoading = false;
      this.errorMessage = 'El identificador de la reserva no es valido.';
      return;
    }

    this.apiService.getReservation(Number(rawId)).subscribe({
      next: (reservation) => {
        this.reservation = reservation;
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudo cargar la reserva.');
        this.cdr.detectChanges();
      },
    });
  }

  goBack(): void {
    this.location.back();
  }

  goToDayReservations(): void {
    if (!this.reservation) {
      return;
    }

    this.router.navigate(['/admin/reservation-payments'], {
      queryParams: {
        date: this.reservation.start_datetime.slice(0, 10),
        reservation_id: this.reservation.id,
      },
    });
  }

  getReservationStatusLabel(): string {
    switch (this.reservation?.status) {
      case 'CONFIRMED':
        return 'Confirmada';
      case 'CANCELLATION_REQUESTED':
        return 'Cancelacion solicitada';
      case 'CANCELLED':
        return 'Cancelada';
      default:
        return 'Sin estado';
    }
  }

  getReservationStatusClasses(): string {
    switch (this.reservation?.status) {
      case 'CONFIRMED':
        return 'border-blue-200 bg-blue-50 text-blue-800';
      case 'CANCELLATION_REQUESTED':
        return 'border-orange-200 bg-orange-50 text-orange-800';
      default:
        return 'border-gray-300 bg-gray-100 text-gray-700';
    }
  }

  getPaymentStatusLabel(status?: PaymentStatus): string {
    switch (status) {
      case 'paid':
        return 'Pagado';
      case 'partial_payment':
        return 'Pago parcial';
      case 'rejected':
        return 'Pago rechazado';
      case 'expired':
        return 'Pago vencido';
      case 'cancelled':
        return 'Pago cancelado';
      default:
        return 'Pago pendiente';
    }
  }

  getPaymentStatusClasses(status?: PaymentStatus): string {
    switch (status) {
      case 'paid':
        return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'rejected':
        return 'border-red-200 bg-red-50 text-red-800';
      case 'cancelled':
      case 'expired':
        return 'border-gray-300 bg-gray-100 text-gray-700';
      default:
        return 'border-amber-200 bg-amber-50 text-amber-800';
    }
  }

  getWhenLabel(): string {
    if (!this.reservation) {
      return '-';
    }

    return this.formatDateTime(this.reservation.start_datetime);
  }

  getGameModeLabel(): string {
    if (this.reservation?.game_mode === 'SINGLES') {
      return 'Singles';
    }
    if (this.reservation?.game_mode === 'DOUBLES') {
      return 'Dobles';
    }
    return this.reservation?.reservation_type === 'CLASS' ? 'Clase' : 'No informado';
  }

  getPlayerName(player: Player): string {
    return `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Jugador';
  }

  getPlayerPaymentState(player: Player): PlayerPaymentState {
    const transactions = this.getPlayerTransactions(player);
    if (transactions.some((transaction) => transaction.status === 'approved')) {
      return 'paid';
    }
    if (transactions.some((transaction) => transaction.status === 'rejected')) {
      return 'rejected';
    }
    return 'pending';
  }

  getPlayerPaymentLabel(player: Player): string {
    switch (this.getPlayerPaymentState(player)) {
      case 'paid':
        return 'Pagado';
      case 'rejected':
        return 'Rechazado';
      default:
        return 'Pendiente';
    }
  }

  getPlayerPaymentClasses(player: Player): string {
    switch (this.getPlayerPaymentState(player)) {
      case 'paid':
        return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'rejected':
        return 'border-red-200 bg-red-50 text-red-800';
      default:
        return 'border-amber-200 bg-amber-50 text-amber-800';
    }
  }

  getTransactions(): PaymentTransaction[] {
    const transactions = this.reservation?.payment_transactions || [];
    return [...transactions].sort(
      (left, right) => this.getTransactionTimestamp(right) - this.getTransactionTimestamp(left),
    );
  }

  toggleTransactionDetails(transaction: PaymentTransaction, index: number): void {
    const key = this.getTransactionKey(transaction, index);
    if (this.expandedTransactionKeys.has(key)) {
      this.expandedTransactionKeys.delete(key);
      return;
    }
    this.expandedTransactionKeys.add(key);
  }

  isTransactionExpanded(transaction: PaymentTransaction, index: number): boolean {
    return this.expandedTransactionKeys.has(this.getTransactionKey(transaction, index));
  }

  getTransactionStatusLabel(transaction: PaymentTransaction): string {
    switch (transaction.status) {
      case 'approved':
        return 'Aprobada';
      case 'rejected':
        return 'Rechazada';
      case 'in_process':
        return 'En proceso';
      case 'cancelled':
        return 'Cancelada';
      case 'refunded':
        return 'Devuelta';
      case 'amount_mismatch':
        return 'Monto inconsistente';
      default:
        return 'Pendiente';
    }
  }

  getTransactionStatusClasses(transaction: PaymentTransaction): string {
    switch (transaction.status) {
      case 'approved':
        return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'rejected':
      case 'amount_mismatch':
        return 'border-red-200 bg-red-50 text-red-800';
      case 'in_process':
      case 'pending':
        return 'border-amber-200 bg-amber-50 text-amber-800';
      default:
        return 'border-gray-300 bg-gray-100 text-gray-700';
    }
  }

  getProviderLabel(provider?: string): string {
    switch (provider) {
      case 'mercadopago':
        return 'Mercado Pago';
      case 'cash':
        return 'Efectivo';
      case 'transfer':
        return 'Transferencia QR';
      default:
        return provider || 'No informado';
    }
  }

  getPaymentTypeLabel(paymentType: string): string {
    switch (paymentType) {
      case 'player':
        return 'Pago individual';
      case 'partial':
        return 'Pago parcial';
      default:
        return 'Pago total';
    }
  }

  formatCurrency(value: number | string | null | undefined): string {
    const amount = Number(value);
    return Number.isFinite(amount) ? this.currencyFormatter.format(amount) : '-';
  }

  formatDateTime(value?: string | null): string {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date);
  }

  private getPlayerTransactions(player: Player): PaymentTransaction[] {
    if (!player.id) {
      return [];
    }
    return this.getTransactions().filter((transaction) => {
      if (typeof transaction.player === 'number') {
        return transaction.player === player.id;
      }
      return !!(
        transaction.player &&
        typeof transaction.player === 'object' &&
        transaction.player.id === player.id
      );
    });
  }

  private getTransactionTimestamp(transaction: PaymentTransaction): number {
    const value = transaction.created_at || transaction.paid_at || '';
    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private getTransactionKey(transaction: PaymentTransaction, index: number): string {
    return transaction.id
      ? `transaction-${transaction.id}`
      : `transaction-${transaction.external_reference || index}`;
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    if (!error || typeof error !== 'object') {
      return fallback;
    }
    const httpError = error as { error?: unknown };
    if (typeof httpError.error === 'string' && httpError.error.trim()) {
      return httpError.error;
    }
    if (httpError.error && typeof httpError.error === 'object') {
      const payload = httpError.error as { detail?: unknown; error?: unknown };
      if (typeof payload.detail === 'string') {
        return payload.detail;
      }
      if (typeof payload.error === 'string') {
        return payload.error;
      }
    }
    return fallback;
  }
}
