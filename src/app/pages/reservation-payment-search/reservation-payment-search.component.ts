import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  PaymentStatus,
  PaymentType,
  Player,
  ReservationCashPaymentRequest,
  ReservationPaymentLinkRequest,
  ReservationPaymentSearchResult,
} from '../../models';
import { ApiService } from '../../services/api.service';

type CashPaymentMode = Extract<PaymentType, 'total' | 'partial' | 'player'>;
type ReservationListMode = 'today' | 'search';

@Component({
  selector: 'app-reservation-payment-search',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './reservation-payment-search.component.html',
  styleUrls: ['./reservation-payment-search.component.css'],
})
export class ReservationPaymentSearchComponent implements OnInit {
  searchForm: FormGroup;
  cashPaymentForm: FormGroup;

  reservations: ReservationPaymentSearchResult[] = [];
  isLoading = false;
  creatingPaymentLinkKey: string | null = null;
  isConfirmingCashPayment = false;
  cashPaymentReservation: ReservationPaymentSearchResult | null = null;
  cashPaymentPlayer: Player | null = null;
  cashPaymentMode: CashPaymentMode = 'total';
  listMode: ReservationListMode = 'today';
  expandedIndividualPaymentIds = new Set<number>();
  submittedQuery = '';
  errorMessage = '';
  successMessage = '';

  private currencyFormatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly apiService: ApiService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.searchForm = this.formBuilder.group({
      q: ['', [Validators.required, Validators.minLength(3)]],
    });
    this.cashPaymentForm = this.formBuilder.group({
      confirmation_password: ['', [Validators.required]],
      amount: [''],
      notes: [''],
    });
  }

  ngOnInit(): void {
    this.loadPendingToday();
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  loadPendingToday(): void {
    this.isLoading = true;
    this.listMode = 'today';
    this.expandedIndividualPaymentIds.clear();
    this.submittedQuery = '';
    this.errorMessage = '';
    this.successMessage = '';

    this.apiService.getPendingTodayReservationPayments().subscribe({
      next: (response) => {
        this.reservations = Array.isArray(response) ? response : [];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.reservations = [];
        this.isLoading = false;
        this.errorMessage = this.extractErrorMessage(
          error,
          'No se pudieron cargar las reservas pendientes de hoy.',
        );
        this.cdr.detectChanges();
      },
    });
  }

  search(): void {
    if (this.searchForm.invalid) {
      this.searchForm.markAllAsTouched();
      this.errorMessage = 'Ingresa al menos 3 caracteres para buscar.';
      return;
    }

    const query = String(this.searchForm.get('q')?.value || '').trim();
    this.isLoading = true;
    this.listMode = 'search';
    this.expandedIndividualPaymentIds.clear();
    this.errorMessage = '';
    this.successMessage = '';
    this.submittedQuery = query;

    this.apiService.searchReservationPaymentsByPlayer(query).subscribe({
      next: (response) => {
        this.reservations = Array.isArray(response) ? response : [];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.reservations = [];
        this.isLoading = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudo buscar la reserva.');
        this.cdr.detectChanges();
      },
    });
  }

  payPlayerShare(reservation: ReservationPaymentSearchResult, player: Player): void {
    if (!player.id) {
      this.errorMessage = 'No se pudo identificar al jugador para generar el pago.';
      return;
    }

    const amount = this.toNullableNumber(player.price_applied);
    if (!amount || amount <= 0) {
      this.errorMessage = 'No se pudo determinar el monto del jugador.';
      return;
    }

    this.createPaymentLink(reservation.id, `player-${reservation.id}-${player.id}`, {
      amount: amount.toFixed(2),
      payment_type: 'player',
      player_id: player.id,
    });
  }

  payRemainingAmount(reservation: ReservationPaymentSearchResult): void {
    const amount = this.getRemainingAmount(reservation);
    if (!amount || amount <= 0) {
      this.errorMessage = 'No hay saldo pendiente para pagar.';
      return;
    }

    this.createPaymentLink(reservation.id, `total-${reservation.id}`, {
      amount: amount.toFixed(2),
      payment_type: 'total',
    });
  }

  openCashPaymentModal(
    reservation: ReservationPaymentSearchResult,
    mode: CashPaymentMode,
    player?: Player,
  ): void {
    if (reservation.status === 'CANCELLED') {
      this.errorMessage = 'No se puede confirmar efectivo en una reserva cancelada.';
      return;
    }

    if (reservation.is_paid || reservation.payment_status === 'paid') {
      this.errorMessage = 'La reserva ya esta pagada.';
      return;
    }

    if (mode === 'player' && !player?.id) {
      this.errorMessage = 'No se pudo identificar al jugador para confirmar efectivo.';
      return;
    }

    this.cashPaymentReservation = reservation;
    this.cashPaymentPlayer = mode === 'player' ? player || null : null;
    this.cashPaymentMode = mode;
    this.errorMessage = '';
    this.successMessage = '';
    this.cashPaymentForm.reset({
      confirmation_password: '',
      amount: mode === 'partial' ? '' : this.getCashPaymentAmount()?.toFixed(2) || '',
      notes: '',
    });
  }

  closeCashPaymentModal(): void {
    if (this.isConfirmingCashPayment) {
      return;
    }

    this.cashPaymentReservation = null;
    this.cashPaymentPlayer = null;
    this.cashPaymentMode = 'total';
    this.cashPaymentForm.reset({
      confirmation_password: '',
      amount: '',
      notes: '',
    });
  }

  confirmCashPayment(): void {
    if (!this.cashPaymentReservation) {
      return;
    }

    if (this.cashPaymentForm.invalid) {
      this.cashPaymentForm.markAllAsTouched();
      return;
    }

    const confirmationPassword = String(
      this.cashPaymentForm.get('confirmation_password')?.value || '',
    ).trim();
    if (!confirmationPassword) {
      this.cashPaymentForm.get('confirmation_password')?.markAsTouched();
      return;
    }

    const payload: ReservationCashPaymentRequest = {
      confirmation_password: confirmationPassword,
      payment_type: this.cashPaymentMode,
    };

    const notes = String(this.cashPaymentForm.get('notes')?.value || '').trim();
    if (notes) {
      payload.notes = notes;
    }

    if (this.cashPaymentMode === 'player') {
      if (!this.cashPaymentPlayer?.id) {
        this.errorMessage = 'No se pudo identificar al jugador para confirmar efectivo.';
        return;
      }

      payload.player_id = this.cashPaymentPlayer.id;
      const playerAmount = this.getPlayerPrice(this.cashPaymentPlayer);
      if (playerAmount && playerAmount > 0) {
        payload.amount = playerAmount.toFixed(2);
      }
    }

    if (this.cashPaymentMode === 'partial') {
      const amount = this.toNullableNumber(this.cashPaymentForm.get('amount')?.value);
      if (!amount || amount <= 0) {
        this.errorMessage = 'Ingresa un monto valido para el pago parcial.';
        this.cashPaymentForm.get('amount')?.markAsTouched();
        return;
      }

      payload.amount = amount.toFixed(2);
    }

    this.isConfirmingCashPayment = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.apiService
      .confirmReservationCashPayment(this.cashPaymentReservation.id, payload)
      .subscribe({
        next: (response) => {
          this.isConfirmingCashPayment = false;
          this.replaceReservation(response);
          this.successMessage = 'Pago en efectivo confirmado.';
          this.closeCashPaymentModal();
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.isConfirmingCashPayment = false;
          this.errorMessage = this.extractErrorMessage(
            error,
            'No se pudo confirmar el pago en efectivo.',
          );
          this.cdr.detectChanges();
        },
      });
  }

  isCreatingPaymentLink(key: string): boolean {
    return this.creatingPaymentLinkKey === key;
  }

  toggleIndividualPayments(reservation: ReservationPaymentSearchResult): void {
    if (this.expandedIndividualPaymentIds.has(reservation.id)) {
      this.expandedIndividualPaymentIds.delete(reservation.id);
      return;
    }

    this.expandedIndividualPaymentIds.add(reservation.id);
  }

  isIndividualPaymentsExpanded(reservation: ReservationPaymentSearchResult): boolean {
    return this.expandedIndividualPaymentIds.has(reservation.id);
  }

  canConfirmCashPayment(reservation: ReservationPaymentSearchResult): boolean {
    return (
      !reservation.is_paid &&
      reservation.payment_status !== 'paid' &&
      reservation.status !== 'CANCELLED'
    );
  }

  getCourtName(reservation: ReservationPaymentSearchResult): string {
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

  getReservationWhenLabel(reservation: ReservationPaymentSearchResult): string {
    const value = reservation.start_datetime;
    if (!value) {
      return 'Horario sin informar';
    }

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

  getPaymentStatusLabel(status: PaymentStatus | undefined): string {
    switch (status) {
      case 'pending_payment':
        return 'Pago pendiente';
      case 'partial_payment':
        return 'Pago parcial';
      case 'paid':
        return 'Pagado';
      case 'expired':
        return 'Vencido';
      case 'cancelled':
        return 'Cancelado';
      case 'rejected':
        return 'Rechazado';
      default:
        return 'Pago pendiente';
    }
  }

  getTotalAmount(reservation: ReservationPaymentSearchResult): number | null {
    return (
      this.toNullableNumber(reservation.total_amount) ??
      this.toNullableNumber(reservation.total_price)
    );
  }

  getPaidAmount(reservation: ReservationPaymentSearchResult): number {
    return this.toNullableNumber(reservation.paid_amount) ?? 0;
  }

  getRemainingAmount(reservation: ReservationPaymentSearchResult): number | null {
    return this.toNullableNumber(reservation.remaining_amount) ?? this.getTotalAmount(reservation);
  }

  getPlayerFullName(player: Player): string {
    return `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Jugador';
  }

  getPlayerPrice(player: Player): number | null {
    return this.toNullableNumber(player.price_applied);
  }

  getMatchingPlayers(reservation: ReservationPaymentSearchResult): Player[] {
    if (Array.isArray(reservation.matching_players) && reservation.matching_players.length > 0) {
      return reservation.matching_players;
    }

    return Array.isArray(reservation.players) ? reservation.players : [];
  }

  getPlayersSectionTitle(): string {
    return this.listMode === 'search' ? 'Coincidencias' : 'Jugadores';
  }

  getResultsTitle(): string {
    if (this.listMode === 'search') {
      return `Resultados para "${this.submittedQuery}"`;
    }

    return 'Reservas pendientes de hoy';
  }

  getEmptyResultsMessage(): string {
    if (this.listMode === 'search') {
      return `No encontramos reservas futuras con saldo pendiente para "${this.submittedQuery}".`;
    }

    return 'No hay reservas pendientes de pago para hoy.';
  }

  getCashPaymentTitle(): string {
    if (this.cashPaymentMode === 'player') {
      return 'Confirmar efectivo del jugador';
    }

    if (this.cashPaymentMode === 'partial') {
      return 'Confirmar efectivo parcial';
    }

    return 'Confirmar efectivo total';
  }

  getCashPaymentAmount(): number | null {
    if (!this.cashPaymentReservation) {
      return null;
    }

    if (this.cashPaymentMode === 'player' && this.cashPaymentPlayer) {
      return this.getPlayerPrice(this.cashPaymentPlayer);
    }

    if (this.cashPaymentMode === 'partial') {
      return this.toNullableNumber(this.cashPaymentForm.get('amount')?.value);
    }

    return this.getRemainingAmount(this.cashPaymentReservation);
  }

  getCashPaymentAmountLabel(): string {
    return this.formatCurrency(this.getCashPaymentAmount());
  }

  getCashPaymentPlayerName(): string {
    if (!this.cashPaymentPlayer) {
      return '';
    }

    return this.getPlayerFullName(this.cashPaymentPlayer);
  }

  isPlayerPaid(reservation: ReservationPaymentSearchResult, player: Player): boolean {
    if (!player.id || !reservation.payment_transactions) {
      return false;
    }

    return reservation.payment_transactions.some((transaction) => {
      if (transaction.status !== 'approved') {
        return false;
      }

      if (typeof transaction.player === 'number') {
        return transaction.player === player.id;
      }

      if (transaction.player && typeof transaction.player === 'object') {
        return transaction.player.id === player.id;
      }

      return false;
    });
  }

  formatCurrency(value: number | null): string {
    if (value === null) {
      return 'No disponible';
    }

    return this.currencyFormatter.format(value);
  }

  private createPaymentLink(
    reservationId: number,
    key: string,
    payload: ReservationPaymentLinkRequest,
  ): void {
    this.creatingPaymentLinkKey = key;
    this.errorMessage = '';

    this.apiService.createReservationPaymentLink(reservationId, payload).subscribe({
      next: (response) => {
        window.location.href = response.payment_url;
      },
      error: (error) => {
        this.creatingPaymentLinkKey = null;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudo crear el link de pago.');
        this.cdr.detectChanges();
      },
    });
  }

  private replaceReservation(updatedReservation: ReservationPaymentSearchResult): void {
    const reservationIndex = this.reservations.findIndex(
      (reservation) => reservation.id === updatedReservation.id,
    );
    if (reservationIndex < 0) {
      return;
    }

    if (this.listMode === 'today' && !this.hasPendingBalance(updatedReservation)) {
      this.reservations = this.reservations.filter(
        (reservation) => reservation.id !== updatedReservation.id,
      );
      return;
    }

    const previousReservation = this.reservations[reservationIndex];
    this.reservations = this.reservations.map((reservation, index) =>
      index === reservationIndex
        ? {
            ...previousReservation,
            ...updatedReservation,
            matching_players:
              previousReservation.matching_players || updatedReservation.matching_players || [],
          }
        : reservation,
    );
  }

  private hasPendingBalance(reservation: ReservationPaymentSearchResult): boolean {
    if (reservation.is_paid || reservation.payment_status === 'paid') {
      return false;
    }

    const remainingAmount = this.getRemainingAmount(reservation);
    return remainingAmount === null || remainingAmount > 0;
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
