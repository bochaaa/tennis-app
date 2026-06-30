import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { StepProgressComponent } from '../../components/step-progress/step-progress.component';
import {
  AvailabilityResponse,
  Court,
  CourtAvailability,
  PaymentStatus,
  Price,
  ReservationPaymentLinkRequest,
  ReservationRequest,
  ReservationResponse,
  Player,
  UnavailableRange,
} from '../../models';
import { ApiService } from '../../services/api.service';

type SlotStatus = 'available' | 'occupied' | 'closed';

interface SlotMeta {
  status: SlotStatus;
  reason: string | null;
  displayName: string | null;
  reservationType: 'CLASS' | 'NORMAL' | null;
  selectable: boolean;
}

@Component({
  selector: 'app-reservations',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, StepProgressComponent],
  templateUrl: './reservations.component.html',
  styleUrls: ['./reservations.component.css'],
})
export class ReservationsComponent implements OnInit {
  [x: string]: any;
  reservationForm!: FormGroup;
  courts: Court[] = [];
  prices: Price[] = [];
  availability: AvailabilityResponse | null = null;
  availabilityCourts: CourtAvailability[] = [];

  isLoading = false;
  isLoadingAvailability = false;
  errorMessage = '';
  successMessage = '';

  currentStep: 'date-court' | 'players' | 'review' | 'payment' = 'date-court';
  readonly totalSteps = 4;
  selectedDate = '';
  minSelectableDate = '';
  selectedCourt: Court | null = null;
  selectedTime = '';
  confirmedReservationId: number | null = null;
  confirmedTotalPrice: number | null = null;
  confirmedReservation: ReservationResponse | null = null;
  isRefreshingPaymentStatus = false;
  creatingPaymentLinkKey: string | null = null;

  timeSlots: string[] = [];
  dayStartLabel = '08:00';
  dayEndLabel = '22:00';
  private readonly slotStepMinutes = 30;
  private readonly minAdvanceMinutes = 180;
  private slotMetaMap = new Map<string, SlotMeta>();
  private currencyFormatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  constructor(
    private formBuilder: FormBuilder,
    private apiService: ApiService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadCourts();
    this.loadPrices();
    this.initializeForm();
    this.updatePlayerFields();
    this.setMinDate();
  }

  initializeForm(): void {
    this.reservationForm = this.formBuilder.group({
      date: ['', [Validators.required]],
      court: ['', [Validators.required]],
      start_time: ['', [Validators.required]],
      game_mode: ['SINGLES', [Validators.required]],
      contact_name: ['', [Validators.required, Validators.minLength(3)]],
      contact_phone: ['', [Validators.required, Validators.pattern(/^\d{10,}$/)]],
      players: this.formBuilder.array([]),
      notes: [''],
    });

    this.reservationForm.get('date')?.valueChanges.subscribe((date) => {
      if (!date) {
        return;
      }

      this.selectedDate = date;
      this.clearSelectedSlot();
      this.loadAvailability(date);
    });
  }

  get playersArray(): FormArray {
    return this.reservationForm.get('players') as FormArray;
  }

  loadCourts(): void {
    this.apiService.getCourts().subscribe({
      next: (courts) => {
        this.courts = courts;
      },
      error: () => {
        this.errorMessage = 'Error al cargar las canchas.';
      },
    });
  }

  loadPrices(): void {
    this.apiService.getPrices().subscribe({
      next: (prices) => {
        this.prices = prices;
      },
      error: () => {
        this.errorMessage = 'Error al cargar los precios.';
      },
    });
  }

  loadAvailability(date: string): void {
    this.isLoadingAvailability = true;
    this.errorMessage = '';

    this.apiService.getAvailability(date).subscribe({
      next: (availability) => {
        try {
          const safeCourts = Array.isArray(availability?.courts) ? availability.courts : [];
          this.availability = {
            ...availability,
            courts: safeCourts,
          };
          this.availabilityCourts = safeCourts;
          this.buildAvailabilityGrid();
        } catch (error) {
          console.error('Error procesando disponibilidad:', error);
          this.availability = null;
          this.availabilityCourts = [];
          this.timeSlots = [];
          this.slotMetaMap.clear();
          this.errorMessage = 'La disponibilidad llego con un formato inesperado.';
        } finally {
          this.isLoadingAvailability = false;
          this.cdr.detectChanges();
        }
      },
      error: () => {
        this.availability = null;
        this.availabilityCourts = [];
        this.timeSlots = [];
        this.slotMetaMap.clear();
        this.isLoadingAvailability = false;
        this.errorMessage = 'Error al cargar disponibilidad.';
        this.cdr.detectChanges();
      },
    });
  }

  onGameModeChange(): void {
    this.updatePlayerFields();
  }

  updatePlayerFields(): void {
    const gameMode = this.reservationForm.get('game_mode')?.value;
    const playerCount = gameMode === 'SINGLES' ? 2 : 4;

    const playersArray = this.playersArray;
    playersArray.clear();

    for (let i = 0; i < playerCount; i++) {
      playersArray.push(
        this.formBuilder.group({
          first_name: ['', [Validators.required]],
          last_name: ['', [Validators.required]],
          is_member: [false],
        }),
      );
    }
  }

  setMinDate(): void {
    const today = this.getLocalDateISO();
    this.minSelectableDate = today;
    this.selectedDate = today;

    // Carga inicial automatica sin requerir interaccion del usuario.
    this.reservationForm.patchValue({ date: today }, { emitEvent: false });
    this.clearSelectedSlot();
    this.loadAvailability(today);
  }

  nextStep(): void {
    this.errorMessage = '';

    if (this.currentStep === 'date-court') {
      const dateValid = this.reservationForm.get('date')?.valid;
      const courtValid = this.reservationForm.get('court')?.valid;
      const timeValid = this.reservationForm.get('start_time')?.valid;
      const contactNameValid = this.reservationForm.get('contact_name')?.valid;
      const contactPhoneValid = this.reservationForm.get('contact_phone')?.valid;

      if (dateValid && courtValid && timeValid && contactNameValid && contactPhoneValid) {
        this.currentStep = 'players';
      } else {
        this.reservationForm.get('contact_name')?.markAsTouched();
        this.reservationForm.get('contact_phone')?.markAsTouched();
        this.errorMessage = 'Completa fecha, cancha, horario y datos de contacto para continuar.';
      }
      return;
    }

    if (this.currentStep === 'players') {
      if (this.playersArray.valid) {
        this.currentStep = 'review';
      } else {
        this.errorMessage = 'Completa los datos de los jugadores.';
      }
      return;
    }

    if (this.currentStep === 'review') {
      return;
    }
  }

  previousStep(): void {
    if (this.currentStep === 'players') {
      this.currentStep = 'date-court';
      return;
    }

    if (this.currentStep === 'review') {
      this.currentStep = 'players';
      return;
    }

    if (this.currentStep === 'payment') {
      this.currentStep = 'review';
    }
  }

  onSubmit(): void {
    if (this.reservationForm.invalid) {
      this.errorMessage = 'Completa todos los campos requeridos.';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const reservationData: ReservationRequest = {
      court: this.reservationForm.get('court')?.value,
      date: this.reservationForm.get('date')?.value,
      start_time: this.reservationForm.get('start_time')?.value,
      game_mode: this.reservationForm.get('game_mode')?.value,
      contact_name: this.reservationForm.get('contact_name')?.value,
      contact_phone: this.reservationForm.get('contact_phone')?.value,
      players: this.playersArray.value,
      notes: this.reservationForm.get('notes')?.value,
    };

    this.apiService.createReservation(reservationData).subscribe({
      next: (response) => {
        this.isLoading = false;
        const totalAmount = this.getReservationTotalAmount(response);
        this.confirmedReservationId = response.id;
        this.confirmedReservation = response;
        this.confirmedTotalPrice = totalAmount ?? this.getEstimatedTotalPrice();
        this.successMessage = '';
        this.currentStep = 'payment';
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error?.error?.detail || 'Error al crear la reserva.';
        this.cdr.detectChanges();
      },
    });
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  openDatePicker(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input || input.type !== 'date') {
      return;
    }

    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === 'function') {
      try {
        pickerInput.showPicker();
      } catch {
        // En algunos navegadores puede requerir gesto valido; fallback es input nativo.
      }
    }
  }

  selectSlot(court: CourtAvailability, time: string): void {
    const meta = this.getSlotMeta(court.id, time);
    if (!meta.selectable) {
      return;
    }

    this.selectedCourt = this.courts.find((item) => item.id === court.id) || {
      id: court.id,
      name: court.name,
      is_active: true,
    };
    this.selectedTime = time;

    this.reservationForm.patchValue({
      court: court.id,
      start_time: time,
    });

    this.errorMessage = '';
  }

  isSlotSelectable(courtId: number, time: string): boolean {
    return this.getSlotMeta(courtId, time).selectable;
  }

  isSlotSelected(courtId: number, time: string): boolean {
    return (
      this.reservationForm.get('court')?.value === courtId &&
      this.reservationForm.get('start_time')?.value === time
    );
  }

  getSlotLabel(courtId: number, time: string): string {
    if (this.isSlotSelected(courtId, time)) {
      return 'Seleccionado';
    }

    const meta = this.getSlotMeta(courtId, time);

    if (meta.status === 'available') {
      if (meta.selectable) {
        return 'Libre';
      }

      if (meta.reason === 'INSUFFICIENT_LEAD_TIME') {
        return 'No disponible';
      }

      return 'Sin 90 min';
    }

    if (meta.status === 'occupied') {
      if (meta.reservationType === 'NORMAL' && meta.displayName) {
        return `Turno - ${meta.displayName}`;
      }
      if (meta.reservationType === 'CLASS' && meta.displayName) {
        return `Clase - ${meta.displayName}`;
      }
      if (meta.reservationType === 'NORMAL') {
        return 'Turno';
      }
      if (meta.reservationType === 'CLASS') {
        return 'Clase';
      }
      return this.getReasonLabel(meta.reason);
    }

    return '-';
  }

  getSlotSubLabel(courtId: number, time: string): string {
    if (this.isSlotSelected(courtId, time)) {
      return '';
    }

    const meta = this.getSlotMeta(courtId, time);
    if (meta.status !== 'occupied') {
      return '';
    }

    return '';
  }

  getSlotClasses(courtId: number, time: string): string {
    if (this.isSlotSelected(courtId, time)) {
      return 'border-red-700 bg-red-700 text-white shadow-sm';
    }

    const meta = this.getSlotMeta(courtId, time);

    if (meta.status === 'available' && meta.selectable) {
      return 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100';
    }

    if (meta.status === 'available' && !meta.selectable) {
      if (meta.reason === 'INSUFFICIENT_LEAD_TIME') {
        return 'border-gray-300 bg-gray-100 text-gray-500';
      }
      return 'border-amber-300 bg-amber-50 text-amber-800';
    }

    if (meta.status === 'occupied') {
      return this.getOccupiedSlotClasses(meta);
    }

    return 'border-gray-200 bg-gray-50 text-gray-400';
  }

  getPlayerEstimatedPrice(player: { is_member?: boolean }): number | null {
    const gameMode = this.reservationForm.get('game_mode')?.value as 'SINGLES' | 'DOUBLES' | null;
    if (!gameMode) {
      return null;
    }

    const playerType = player?.is_member ? 'MEMBER' : 'NON_MEMBER';
    const priceRule = this.prices.find(
      (rule) => rule.game_mode === gameMode && rule.player_type === playerType,
    );

    if (!priceRule) {
      return null;
    }

    const numericPrice = Number(priceRule.price);
    return Number.isFinite(numericPrice) ? numericPrice : null;
  }

  getEstimatedTotalPrice(): number | null {
    const players = this.playersArray.value as Array<{ is_member?: boolean }>;
    if (!players || players.length === 0) {
      return null;
    }

    let total = 0;
    for (const player of players) {
      const playerPrice = this.getPlayerEstimatedPrice(player);
      if (playerPrice === null) {
        return null;
      }
      total += playerPrice;
    }

    return total;
  }

  formatCurrency(value: number | null): string {
    if (value === null) {
      return 'No disponible';
    }
    return this.currencyFormatter.format(value);
  }

  getPaymentAmount(): number | null {
    if (this.confirmedReservation) {
      return this.getReservationTotalAmount(this.confirmedReservation);
    }
    if (this.confirmedTotalPrice !== null) {
      return this.confirmedTotalPrice;
    }
    return this.getEstimatedTotalPrice();
  }

  getConfirmedCourtLabel(): string {
    if (this.confirmedReservation?.court_name) {
      return this.confirmedReservation.court_name;
    }

    if (
      typeof this.confirmedReservation?.court === 'object' &&
      this.confirmedReservation.court?.name
    ) {
      return this.confirmedReservation.court.name;
    }

    if (typeof this.confirmedReservation?.court === 'number') {
      return `Cancha ${this.confirmedReservation.court}`;
    }

    return this.selectedCourt?.name || 'Cancha sin identificar';
  }

  getConfirmedWhenLabel(): string {
    const value = this.confirmedReservation?.start_datetime;
    if (value) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date);
      }

      return value;
    }

    const date = this.reservationForm.get('date')?.value || '';
    const time = this.reservationForm.get('start_time')?.value || '';
    return `${date} ${time}`.trim() || 'Horario sin informar';
  }

  getPaidAmount(): number | null {
    if (!this.confirmedReservation) {
      return 0;
    }
    return this.toNullableNumber(this.confirmedReservation.paid_amount) ?? 0;
  }

  getRemainingAmount(): number | null {
    if (!this.confirmedReservation) {
      return this.getPaymentAmount();
    }
    return (
      this.toNullableNumber(this.confirmedReservation.remaining_amount) ?? this.getPaymentAmount()
    );
  }

  getPaymentStatus(): PaymentStatus {
    return this.confirmedReservation?.payment_status || 'pending_payment';
  }

  getPaymentStatusLabel(status: PaymentStatus | undefined = this.getPaymentStatus()): string {
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
        return 'Pago pendiente';
    }
  }

  getPaymentStatusClasses(): string {
    switch (this.getPaymentStatus()) {
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

  requiresAdminReview(): boolean {
    const reservation = this.confirmedReservation as
      | (ReservationResponse & { requires_admin_review?: boolean })
      | null;
    return !!reservation?.requires_admin_review;
  }

  canPayReservation(): boolean {
    const status = this.getPaymentStatus();
    return status === 'pending_payment' || status === 'partial_payment';
  }

  refreshPaymentStatus(): void {
    if (!this.confirmedReservationId || this.isRefreshingPaymentStatus) {
      return;
    }

    this.isRefreshingPaymentStatus = true;
    this.errorMessage = '';

    this.apiService.getReservationPaymentStatus(this.confirmedReservationId).subscribe({
      next: (response) => {
        this.confirmedReservation = response;
        this.confirmedTotalPrice = this.getReservationTotalAmount(response);
        this.isRefreshingPaymentStatus = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isRefreshingPaymentStatus = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudo actualizar el estado de pago.');
        this.cdr.detectChanges();
      },
    });
  }

  payRemainingAmount(): void {
    const amount = this.getRemainingAmount();
    if (!amount || amount <= 0) {
      this.errorMessage = 'No hay saldo pendiente para pagar.';
      return;
    }

    this.createPaymentLink('total', {
      amount: this.toBackendAmount(amount),
      payment_type: 'total',
    });
  }

  payPlayerShare(player: Player): void {
    if (!player.id) {
      this.errorMessage = 'No se pudo identificar al jugador para generar el pago.';
      return;
    }

    const amount = this.toNullableNumber(player.price_applied);
    if (!amount || amount <= 0) {
      this.errorMessage = 'No se pudo determinar el monto del jugador.';
      return;
    }

    this.createPaymentLink(`player-${player.id}`, {
      amount: this.toBackendAmount(amount),
      payment_type: 'player',
      player_id: player.id,
    });
  }

  isCreatingPaymentLink(key: string): boolean {
    return this.creatingPaymentLinkKey === key;
  }

  isPlayerPaid(player: Player): boolean {
    if (!player.id || !this.confirmedReservation?.payment_transactions) {
      return false;
    }

    return this.confirmedReservation.payment_transactions.some((transaction) => {
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

  getPlayerFullName(player: Player): string {
    return `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Jugador';
  }

  getPlayerPrice(player: Player): number | null {
    return this.toNullableNumber(player.price_applied);
  }

  getPaymentExpiresAtLabel(): string {
    const value = this.confirmedReservation?.payment_expires_at;
    if (!value) {
      return 'No informado';
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

  getCurrentStepNumber(): number {
    switch (this.currentStep) {
      case 'date-court':
        return 1;
      case 'players':
        return 2;
      case 'review':
        return 3;
      case 'payment':
        return 4;
      default:
        return 1;
    }
  }

  getCurrentStepLabel(): string {
    switch (this.currentStep) {
      case 'date-court':
        return 'Fecha';
      case 'players':
        return 'Jugadores';
      case 'review':
        return 'Confirmar';
      case 'payment':
        return 'Pago';
      default:
        return '';
    }
  }

  private buildAvailabilityGrid(): void {
    this.slotMetaMap.clear();

    if (!this.availability) {
      this.timeSlots = [];
      return;
    }

    const bounds: number[] = [];

    for (const court of this.availability.courts) {
      for (const range of court.available_ranges) {
        const startMin = this.timeToMinutes(range.start_time);
        const endMin = this.timeToMinutes(range.end_time);
        if (startMin !== null) {
          bounds.push(startMin);
        }
        if (endMin !== null) {
          bounds.push(endMin);
        }
      }
      for (const range of court.unavailable_ranges) {
        const startMin = this.timeToMinutes(range.start_time);
        const endMin = this.timeToMinutes(range.end_time);
        if (startMin !== null) {
          bounds.push(startMin);
        }
        if (endMin !== null) {
          bounds.push(endMin);
        }
      }
    }

    let startMin = 8 * 60;
    let endMin = 22 * 60;

    if (bounds.length > 0) {
      const minBound = Math.min(...bounds);
      const maxBound = Math.max(...bounds);

      startMin = Math.floor(minBound / this.slotStepMinutes) * this.slotStepMinutes;
      endMin = Math.ceil(maxBound / this.slotStepMinutes) * this.slotStepMinutes;
    }

    if (endMin <= startMin) {
      endMin = startMin + this.slotStepMinutes;
    }

    this.dayStartLabel = this.minutesToHour(startMin);
    this.dayEndLabel = this.minutesToHour(endMin);

    const slots: string[] = [];
    for (let minute = startMin; minute < endMin; minute += this.slotStepMinutes) {
      slots.push(this.minutesToHour(minute));
    }
    this.timeSlots = slots;

    for (const court of this.availability.courts) {
      for (const slot of this.timeSlots) {
        const meta = this.computeSlotMeta(court, slot);
        this.slotMetaMap.set(this.slotKey(court.id, slot), meta);
      }
    }
  }

  private computeSlotMeta(court: CourtAvailability, slot: string): SlotMeta {
    const slotMin = this.timeToMinutes(slot);
    if (slotMin === null) {
      return {
        status: 'closed',
        reason: null,
        displayName: null,
        reservationType: null,
        selectable: false,
      };
    }

    const blockedRange = court.unavailable_ranges.find((range) =>
      this.isTimeWithinRange(slotMin, range.start_time, range.end_time),
    );

    if (blockedRange) {
      const reservationType = this.extractReservationType(blockedRange);
      return {
        status: 'occupied',
        reason: blockedRange.reason,
        displayName: this.extractOccupiedName(blockedRange, reservationType),
        reservationType,
        selectable: false,
      };
    }

    const availableRange = court.available_ranges.find((range) =>
      this.isTimeWithinRange(slotMin, range.start_time, range.end_time),
    );

    if (!availableRange) {
      return {
        status: 'closed',
        reason: null,
        displayName: null,
        reservationType: null,
        selectable: false,
      };
    }

    const canStartUntilMin = this.timeToMinutes(availableRange.can_start_until);
    let selectable = false;
    let reason: string | null = null;

    if (canStartUntilMin !== null) {
      selectable = availableRange.can_book_90_min && slotMin <= canStartUntilMin;
      if (!selectable) {
        reason = 'INSUFFICIENT_DURATION';
      }
    } else {
      const duration = this.availability?.reservation_duration_minutes || 90;
      const rangeEndMin = this.timeToMinutes(availableRange.end_time);
      selectable =
        availableRange.can_book_90_min && rangeEndMin !== null && slotMin + duration <= rangeEndMin;
      if (!selectable) {
        reason = 'INSUFFICIENT_DURATION';
      }
    }

    if (selectable && this.isSelectedDateToday()) {
      const minAllowedSlot = this.getCurrentMinutes() + this.minAdvanceMinutes;
      if (slotMin < minAllowedSlot) {
        selectable = false;
        reason = 'INSUFFICIENT_LEAD_TIME';
      }
    }

    return {
      status: 'available',
      reason,
      displayName: null,
      reservationType: null,
      selectable,
    };
  }

  private getSlotMeta(courtId: number, time: string): SlotMeta {
    return (
      this.slotMetaMap.get(this.slotKey(courtId, time)) || {
        status: 'closed',
        reason: null,
        displayName: null,
        reservationType: null,
        selectable: false,
      }
    );
  }

  private clearSelectedSlot(): void {
    this.selectedCourt = null;
    this.selectedTime = '';
    this.reservationForm.patchValue({
      court: '',
      start_time: '',
    });
  }

  private getReasonLabel(reason: string | null): string {
    if (!reason) {
      return 'Ocupado';
    }

    const normalized = reason.toUpperCase();

    if (normalized.includes('RESERVATION')) {
      return 'Turno';
    }

    if (normalized.includes('CLASS')) {
      return 'Clase';
    }

    if (normalized.includes('TOURNAMENT')) {
      return 'Torneo';
    }

    if (normalized.includes('MAINTENANCE')) {
      return 'Mantenimiento';
    }

    if (normalized.includes('BLOCK')) {
      return 'Bloqueado';
    }

    return 'Ocupado';
  }

  private isReservationReason(reason: string | null): boolean {
    return !!reason && reason.toUpperCase().includes('RESERVATION');
  }

  private isClassReason(reason: string | null): boolean {
    return !!reason && reason.toUpperCase().includes('CLASS');
  }

  private extractOccupiedName(
    range: UnavailableRange,
    reservationType: 'CLASS' | 'NORMAL' | null,
  ): string | null {
    if (reservationType === 'NORMAL') {
      const namesFromAvailability = (range.reservation_contact_names || [])
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0);
      if (namesFromAvailability.length > 0) {
        return namesFromAvailability[0];
      }

      if (range.reservation_contact_name && range.reservation_contact_name.trim().length > 0) {
        return range.reservation_contact_name.trim();
      }
    }

    if (reservationType === 'CLASS') {
      if (range.class_title && range.class_title.trim().length > 0) {
        return range.class_title.trim();
      }

      const classTitles = (range.class_titles || [])
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0);
      if (classTitles.length > 0) {
        return classTitles[0];
      }
    }

    const reason = range.reason;
    if (!this.isReservationReason(reason) && !this.isClassReason(reason)) {
      return null;
    }

    const reservation = range.reservation;
    const explicitCandidates = [
      range.reservation_contact_name,
      range.contact_name,
      range.customer_name,
      range.requester_name,
      range.full_name,
      range.name,
      reservation?.contact_name,
      reservation?.customer_name,
      reservation?.requester_name,
      reservation?.full_name,
      reservation?.name,
    ];

    const explicit = explicitCandidates.find((value) => !!value && value.trim().length > 0);
    if (explicit) {
      return explicit.trim();
    }

    if (!reason) {
      return null;
    }

    const match = reason.match(/(?:reservation|class)\s*[:\-|]\s*(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }

    return null;
  }

  private extractReservationType(range: UnavailableRange): 'CLASS' | 'NORMAL' | null {
    if (range.class_title && range.class_title.trim().length > 0) {
      return 'CLASS';
    }

    if (this.hasReservationType(range.reservation_types, 'CLASS')) {
      return 'CLASS';
    }

    if (range.reservation_type === 'CLASS') {
      return 'CLASS';
    }

    if (this.hasReservationType(range.reservation_types, 'NORMAL')) {
      return 'NORMAL';
    }

    if (range.reservation_type === 'NORMAL') {
      return 'NORMAL';
    }

    if (range.reservation_contact_name && range.reservation_contact_name.trim().length > 0) {
      return 'NORMAL';
    }

    if ((range.reservation_contact_names || []).length > 0) {
      return 'NORMAL';
    }

    if (this.isClassReason(range.reason)) {
      return 'CLASS';
    }

    if (this.isReservationReason(range.reason)) {
      return 'NORMAL';
    }

    return null;
  }

  private hasReservationType(
    source: Array<'CLASS' | 'NORMAL'> | string | null | undefined,
    expected: 'CLASS' | 'NORMAL',
  ): boolean {
    if (!source) {
      return false;
    }

    if (Array.isArray(source)) {
      return source.includes(expected);
    }

    return source.toUpperCase().includes(expected);
  }

  private getOccupiedSlotClasses(meta: SlotMeta): string {
    if (meta.reservationType === 'NORMAL') {
      return 'border-orange-300 bg-orange-100 text-amber-900';
    }

    if (meta.reservationType === 'CLASS') {
      return 'border-blue-200 bg-blue-50 text-blue-800';
    }

    const reason = meta.reason;
    if (!reason) {
      return 'border-slate-300 bg-slate-100 text-slate-700';
    }

    const normalized = reason.toUpperCase();

    if (normalized.includes('RESERVATION')) {
      return 'border-orange-300 bg-orange-100 text-amber-900';
    }

    if (normalized.includes('CLASS')) {
      return 'border-blue-200 bg-blue-50 text-blue-800';
    }

    if (normalized.includes('TOURNAMENT')) {
      return 'border-emerald-300 bg-emerald-100 text-emerald-900';
    }

    if (normalized.includes('MAINTENANCE') || normalized.includes('BLOCK')) {
      return 'border-slate-300 bg-slate-100 text-slate-700';
    }

    return 'border-slate-300 bg-slate-100 text-slate-700';
  }

  private slotKey(courtId: number, time: string): string {
    return `${courtId}|${time}`;
  }

  private isTimeWithinRange(
    slotMin: number,
    startTime: string | null,
    endTime: string | null,
  ): boolean {
    const startMin = this.timeToMinutes(startTime);
    const endMin = this.timeToMinutes(endTime);
    if (startMin === null || endMin === null) {
      return false;
    }
    return slotMin >= startMin && slotMin < endMin;
  }

  private timeToMinutes(time: string | null | undefined): number | null {
    if (!time || typeof time !== 'string') {
      return null;
    }

    const parts = time.split(':');
    if (parts.length < 2) {
      return null;
    }

    const hour = Number(parts[0]);
    const minute = Number(parts[1]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) {
      return null;
    }

    return hour * 60 + minute;
  }

  private minutesToHour(totalMinutes: number): string {
    const hours = Math.floor(totalMinutes / 60)
      .toString()
      .padStart(2, '0');
    const minutes = (totalMinutes % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private getLocalDateISO(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getCurrentMinutes(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }

  private isSelectedDateToday(): boolean {
    if (!this.selectedDate) {
      return false;
    }
    return this.selectedDate === this.getLocalDateISO();
  }

  private createPaymentLink(key: string, payload: ReservationPaymentLinkRequest): void {
    if (!this.confirmedReservationId || !this.canPayReservation()) {
      return;
    }

    this.creatingPaymentLinkKey = key;
    this.errorMessage = '';

    this.apiService.createReservationPaymentLink(this.confirmedReservationId, payload).subscribe({
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

  private getReservationTotalAmount(reservation: ReservationResponse): number | null {
    return (
      this.toNullableNumber(reservation.total_amount) ??
      this.toNullableNumber(reservation.total_price)
    );
  }

  private toNullableNumber(value: number | string | null | undefined): number | null {
    if (value === null || typeof value === 'undefined') {
      return null;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  private toBackendAmount(value: number): string {
    return value.toFixed(2);
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
