import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Court, DayOfWeek, RecurringRule, RecurringRuleWriteRequest } from '../../models';
import { ApiService } from '../../services/api.service';

type RecurringDayFilter = DayOfWeek | 'ALL';

@Component({
  selector: 'app-admin-recurring-classes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-recurring-classes.component.html',
  styleUrls: ['./admin-recurring-classes.component.css'],
})
export class AdminRecurringClassesComponent implements OnInit {
  readonly daysOfWeek: DayOfWeek[] = [
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ];

  courts: Court[] = [];
  recurringRules: RecurringRule[] = [];
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  successMessage = '';

  recurringRuleForm!: FormGroup;
  editingRuleId: number | null = null;
  editingGroupRuleIds: number[] = [];
  readonly dayFilters: RecurringDayFilter[] = ['ALL', ...this.daysOfWeek];
  selectedDayFilter: RecurringDayFilter = 'ALL';
  private readonly dayOrder: Record<DayOfWeek, number> = {
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
    SATURDAY: 6,
    SUNDAY: 7,
  };

  constructor(
    private readonly apiService: ApiService,
    private readonly formBuilder: FormBuilder,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.recurringRuleForm = this.formBuilder.group({
      court: [null, Validators.required],
      title: ['', [Validators.required, Validators.minLength(2)]],
      start_date: [this.getTodayDate(), Validators.required],
      end_date: [''],
      active: [true],
      notes: [''],
      time_slots: this.formBuilder.array([this.createTimeSlotGroup()]),
    });

    this.loadInitialData();
  }

  loadInitialData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.apiService.getCourts().subscribe({
      next: (courts) => {
        this.courts = courts;
        this.loadRecurringRules();
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudieron cargar las canchas.');
        this.cdr.detectChanges();
      },
    });
  }

  loadRecurringRules(): void {
    this.apiService.getRecurringRules().subscribe({
      next: (rules) => {
        this.recurringRules = this.sortRules(rules);
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudieron cargar las clases.');
        this.cdr.detectChanges();
      },
    });
  }

  submitRecurringRuleForm(): void {
    if (this.recurringRuleForm.invalid) {
      this.recurringRuleForm.markAllAsTouched();
      this.errorMessage = 'Completa cancha, titulo y fecha de inicio.';
      return;
    }

    const payloads = this.buildPayloads();
    if (!payloads || payloads.length === 0) {
      this.errorMessage = 'Revisa los horarios de la clase.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    if (this.editingRuleId) {
      if (payloads[0].active === false) {
        const ruleIdsToDeactivate =
          this.editingGroupRuleIds.length > 0
            ? this.editingGroupRuleIds
            : this.editingRuleId !== null
              ? [this.editingRuleId]
              : [];

        if (ruleIdsToDeactivate.length === 0) {
          this.onSaveError(null);
          return;
        }

        const requests = ruleIdsToDeactivate.map((ruleId) =>
          this.apiService.deactivateRecurringRule(ruleId, 'Desactivada desde panel admin'),
        );
        forkJoin(requests).subscribe({
          next: () => {
            this.onSaved(
              'Clase desactivada. Se cancelaron las clases futuras generadas por esta plantilla.',
            );
          },
          error: (error) => this.onSaveError(error),
        });
        return;
      }

      this.saveEditingGroup(payloads);
      return;
    }

    const requests = payloads.map((payload) => this.apiService.createRecurringRule(payload));
    forkJoin(requests).subscribe({
      next: () =>
        this.onSaved(
          `Se crearon ${payloads.length} clases. El backend genero automaticamente las proximas 90 dias.`,
        ),
      error: (error) => this.onSaveError(error),
    });
  }

  editRule(rule: RecurringRule): void {
    const courtId = this.getRuleCourtId(rule);
    if (!courtId) {
      this.errorMessage = 'No se pudo detectar la cancha de esta clase.';
      return;
    }

    const groupRules = this.findRulesInSameGroup(rule);
    const slots = this.buildSlotsFromRules(groupRules);
    const fallbackStartTime = this.toInputTime(rule.start_time) || '09:00';
    const fallbackEndTime = this.toInputTime(rule.end_time) || this.addMinutes(fallbackStartTime, 60);

    this.editingRuleId = rule.id;
    this.editingGroupRuleIds = groupRules.map((item) => item.id);
    this.successMessage = '';
    this.errorMessage = '';
    this.resetTimeSlots();
    for (const slot of slots) {
      this.timeSlots.push(
        this.createTimeSlotGroup({
          day_of_week: slot.day_of_week,
          start_time: slot.start_time,
          end_time: slot.end_time,
        }),
      );
    }
    if (this.timeSlots.length === 0) {
      this.timeSlots.push(
        this.createTimeSlotGroup({
          day_of_week: 'MONDAY',
          start_time: fallbackStartTime,
          end_time: fallbackEndTime,
        }),
      );
    }

    this.recurringRuleForm.patchValue({
      court: courtId,
      title: (rule.title || rule.class_title || '').trim(),
      start_date: rule.start_date || this.getTodayDate(),
      end_date: rule.end_date || '',
      active: rule.active ?? rule.is_active ?? true,
      notes: rule.notes || '',
    });
  }

  cancelEdit(): void {
    this.editingRuleId = null;
    this.editingGroupRuleIds = [];
    this.resetTimeSlots();
    this.timeSlots.push(this.createTimeSlotGroup());
    this.recurringRuleForm.reset({
      court: null,
      title: '',
      start_date: this.getTodayDate(),
      end_date: '',
      active: true,
      notes: '',
    });
  }

  get timeSlots(): FormArray {
    return this.recurringRuleForm.get('time_slots') as FormArray;
  }

  addTimeSlot(): void {
    this.timeSlots.push(this.createTimeSlotGroup());
  }

  removeTimeSlot(index: number): void {
    if (this.timeSlots.length <= 1) {
      return;
    }
    this.timeSlots.removeAt(index);
  }

  onStartTimeChanged(index: number): void {
    const group = this.timeSlots.at(index) as FormGroup;
    const startTime = String(group.value.start_time || '').trim();
    if (!startTime) {
      return;
    }
    group.patchValue({ end_time: this.addMinutes(startTime, 60) }, { emitEvent: false });
  }

  deleteRule(rule: RecurringRule): void {
    const confirmed = confirm(
      `Eliminar clase ${this.getRuleDaysLabel(rule)} ${this.getRuleTimeLabel(rule)}?`,
    );
    if (!confirmed) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.apiService.deleteRecurringRule(rule.id).subscribe({
      next: () => {
        this.successMessage = 'Clase eliminada correctamente.';
        this.loadRecurringRules();
      },
      error: (error) => {
        this.errorMessage = this.extractErrorMessage(error, 'No se pudo eliminar la clase.');
      },
    });
  }

  deactivateRule(rule: RecurringRule): void {
    if (!this.isRuleActive(rule)) {
      return;
    }

    const confirmed = confirm(
      `Desactivar clase "${this.getRuleTitle(rule)}"? Se cancelaran las clases futuras generadas por esta plantilla.`,
    );
    if (!confirmed) {
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.apiService.deactivateRecurringRule(rule.id, 'Desactivada desde panel admin').subscribe({
      next: () => {
        this.successMessage =
          'Clase desactivada. Se cancelaron las clases futuras de esta plantilla.';
        this.loadRecurringRules();
      },
      error: (error) => {
        this.errorMessage = this.extractErrorMessage(error, 'No se pudo desactivar la clase.');
      },
    });
  }

  getDayLabel(day: DayOfWeek): string {
    const labels: Record<DayOfWeek, string> = {
      MONDAY: 'Lunes',
      TUESDAY: 'Martes',
      WEDNESDAY: 'Miercoles',
      THURSDAY: 'Jueves',
      FRIDAY: 'Viernes',
      SATURDAY: 'Sabado',
      SUNDAY: 'Domingo',
    };
    return labels[day];
  }

  getDayFilterLabel(day: RecurringDayFilter): string {
    if (day === 'ALL') {
      return 'Todas';
    }
    return this.getDayLabel(day);
  }

  setDayFilter(day: RecurringDayFilter): void {
    this.selectedDayFilter = day;
  }

  isDayFilterActive(day: RecurringDayFilter): boolean {
    return this.selectedDayFilter === day;
  }

  get filteredRecurringRules(): RecurringRule[] {
    const activeRules = this.recurringRules.filter((rule) => this.isRuleActive(rule));
    const dayFilter = this.selectedDayFilter;

    if (dayFilter === 'ALL') {
      return activeRules;
    }

    return activeRules.filter((rule) => this.normalizeRuleDays(rule).includes(dayFilter));
  }

  getEmptyFilterMessage(): string {
    if (this.selectedDayFilter === 'ALL') {
      return 'No hay clases activas cargadas.';
    }

    return `No hay clases activas para ${this.getDayFilterLabel(this.selectedDayFilter).toLowerCase()}.`;
  }

  getRuleTitle(rule: RecurringRule): string {
    return (rule.title || rule.class_title || 'Clase recurrente').trim();
  }

  getRuleCourtName(rule: RecurringRule): string {
    if (rule.court_name && rule.court_name.trim().length > 0) {
      return rule.court_name.trim();
    }

    if (typeof rule.court === 'object' && rule.court?.name) {
      return rule.court.name;
    }

    const courtId = this.getRuleCourtId(rule);
    if (!courtId) {
      return 'Cancha sin identificar';
    }

    const court = this.courts.find((item) => item.id === courtId);
    return court?.name || `Cancha ${courtId}`;
  }

  getRuleDaysLabel(rule: RecurringRule): string {
    const days = this.normalizeRuleDays(rule);
    if (days.length === 0) {
      return 'Dia sin definir';
    }
    return days.map((day) => this.getDayLabel(day)).join(', ');
  }

  getRuleTimeLabel(rule: RecurringRule): string {
    const start = this.toInputTime(rule.start_time) || '--:--';
    const end = this.toInputTime(rule.end_time) || this.addMinutes(start, 60);
    return `${start} - ${end}`;
  }

  getRuleActiveLabel(rule: RecurringRule): string {
    return rule.active === false || rule.is_active === false ? 'Inactiva' : 'Activa';
  }

  isRuleActive(rule: RecurringRule): boolean {
    return !(rule.active === false || rule.is_active === false);
  }

  goToDashboard(): void {
    this.router.navigate(['/admin/dashboard']);
  }

  private onSaved(message: string): void {
    this.isSaving = false;
    this.successMessage = message;
    this.cancelEdit();
    this.loadRecurringRules();
  }

  private onSaveError(error: unknown): void {
    this.isSaving = false;
    this.errorMessage = this.extractErrorMessage(error, 'No se pudo guardar la clase.');
  }

  private buildPayloads(): RecurringRuleWriteRequest[] | null {
    const court = Number(this.recurringRuleForm.value.court);
    const title = String(this.recurringRuleForm.value.title || '').trim();
    const startDate = String(this.recurringRuleForm.value.start_date || '').trim();
    const endDateRaw = String(this.recurringRuleForm.value.end_date || '').trim();
    const notesRaw = String(this.recurringRuleForm.value.notes || '').trim();
    const active = !!this.recurringRuleForm.value.active;

    if (!court || title.length < 2 || !startDate || this.timeSlots.length === 0) {
      return null;
    }

    const payloads: RecurringRuleWriteRequest[] = [];
    for (const control of this.timeSlots.controls) {
      const group = control as FormGroup;
      const dayOfWeek = group.value.day_of_week as DayOfWeek;
      const startTime = String(group.value.start_time || '').trim();
      if (!dayOfWeek || !startTime) {
        return null;
      }

      if (this.timeToMinutes(startTime) === null) {
        return null;
      }

      payloads.push({
        court,
        title,
        days_of_week: [dayOfWeek],
        start_time: `${startTime}:00`,
        start_date: startDate,
        end_date: endDateRaw.length > 0 ? endDateRaw : null,
        active,
        notes: notesRaw.length > 0 ? notesRaw : null,
      });
    }

    return payloads;
  }

  private saveEditingGroup(payloads: RecurringRuleWriteRequest[]): void {
    if (this.editingRuleId === null) {
      this.onSaveError(null);
      return;
    }

    const orderedPayloads = [...payloads].sort((a, b) => {
      const aDay = this.dayOrder[a.days_of_week[0]] ?? 99;
      const bDay = this.dayOrder[b.days_of_week[0]] ?? 99;
      if (aDay !== bDay) {
        return aDay - bDay;
      }
      const aStart = this.timeToMinutes(a.start_time) ?? 0;
      const bStart = this.timeToMinutes(b.start_time) ?? 0;
      return aStart - bStart;
    });

    const groupIds = this.editingGroupRuleIds.length > 0 ? [...this.editingGroupRuleIds] : [this.editingRuleId];
    const requests: Array<ReturnType<ApiService['updateRecurringRule']> | ReturnType<ApiService['createRecurringRule']> | ReturnType<ApiService['deleteRecurringRule']>> = [];

    const toUpdateCount = Math.min(groupIds.length, orderedPayloads.length);

    for (let index = 0; index < toUpdateCount; index++) {
      requests.push(this.apiService.updateRecurringRule(groupIds[index], orderedPayloads[index]));
    }

    for (let index = toUpdateCount; index < orderedPayloads.length; index++) {
      requests.push(this.apiService.createRecurringRule(orderedPayloads[index]));
    }

    for (let index = toUpdateCount; index < groupIds.length; index++) {
      requests.push(this.apiService.deleteRecurringRule(groupIds[index]));
    }

    if (requests.length === 0) {
      this.onSaveError(null);
      return;
    }

    forkJoin(requests).subscribe({
      next: () =>
        this.onSaved('Clase actualizada. Se sincronizaron todos los dias y horarios de esta clase.'),
      error: (error) => this.onSaveError(error),
    });
  }

  private sortRules(rules: RecurringRule[]): RecurringRule[] {
    return [...rules].sort((a, b) => {
      const aDays = this.normalizeRuleDays(a);
      const bDays = this.normalizeRuleDays(b);
      const aDay = aDays.length > 0 ? this.dayOrder[aDays[0]] : 99;
      const bDay = bDays.length > 0 ? this.dayOrder[bDays[0]] : 99;
      if (aDay !== bDay) {
        return aDay - bDay;
      }
      const aStart = this.timeToMinutes(this.toInputTime(a.start_time) || '00:00') ?? 0;
      const bStart = this.timeToMinutes(this.toInputTime(b.start_time) || '00:00') ?? 0;
      return aStart - bStart;
    });
  }

  private findRulesInSameGroup(rule: RecurringRule): RecurringRule[] {
    const ruleCourtId = this.getRuleCourtId(rule);
    if (!ruleCourtId) {
      return [rule];
    }

    const baseTitle = this.normalizeText(this.getRuleTitle(rule));
    const baseStartDate = String(rule.start_date || '').trim();
    const baseEndDate = String(rule.end_date || '').trim();
    const baseStartTime = this.toInputTime(rule.start_time) || '';

    const matches = this.recurringRules.filter((candidate) => {
      if (!this.isRuleActive(candidate)) {
        return false;
      }

      const candidateCourtId = this.getRuleCourtId(candidate);
      if (!candidateCourtId || candidateCourtId !== ruleCourtId) {
        return false;
      }

      const candidateTitle = this.normalizeText(this.getRuleTitle(candidate));
      if (candidateTitle !== baseTitle) {
        return false;
      }

      const candidateStartDate = String(candidate.start_date || '').trim();
      if (candidateStartDate !== baseStartDate) {
        return false;
      }

      const candidateEndDate = String(candidate.end_date || '').trim();
      if (candidateEndDate !== baseEndDate) {
        return false;
      }

      const candidateStartTime = this.toInputTime(candidate.start_time) || '';
      return candidateStartTime === baseStartTime;
    });

    const withCurrent = matches.some((item) => item.id === rule.id) ? matches : [rule, ...matches];
    const uniqueById = new Map<number, RecurringRule>();
    for (const item of withCurrent) {
      uniqueById.set(item.id, item);
    }

    return this.sortRules(Array.from(uniqueById.values()));
  }

  private buildSlotsFromRules(
    rules: RecurringRule[],
  ): Array<{ day_of_week: DayOfWeek; start_time: string; end_time: string }> {
    const slotMap = new Map<string, { day_of_week: DayOfWeek; start_time: string; end_time: string }>();

    for (const rule of rules) {
      const days = this.normalizeRuleDays(rule);
      const startTime = this.toInputTime(rule.start_time) || '09:00';
      const endTime = this.toInputTime(rule.end_time) || this.addMinutes(startTime, 60);

      for (const day of days) {
        const key = `${day}|${startTime}`;
        if (!slotMap.has(key)) {
          slotMap.set(key, {
            day_of_week: day,
            start_time: startTime,
            end_time: endTime,
          });
        }
      }
    }

    return Array.from(slotMap.values()).sort((a, b) => {
      const aDay = this.dayOrder[a.day_of_week] ?? 99;
      const bDay = this.dayOrder[b.day_of_week] ?? 99;
      if (aDay !== bDay) {
        return aDay - bDay;
      }
      const aStart = this.timeToMinutes(a.start_time) ?? 0;
      const bStart = this.timeToMinutes(b.start_time) ?? 0;
      return aStart - bStart;
    });
  }

  private normalizeText(value: string): string {
    return value.trim().toLowerCase();
  }

  private getRuleCourtId(rule: RecurringRule): number | null {
    if (typeof rule.court === 'number') {
      return rule.court;
    }

    if (typeof rule.court === 'object' && typeof rule.court.id === 'number') {
      return rule.court.id;
    }

    return null;
  }

  private normalizeRuleDays(rule: RecurringRule): DayOfWeek[] {
    const raw = rule.days_of_week ?? rule.day_of_week ?? null;
    if (!raw) {
      return [];
    }

    if (Array.isArray(raw)) {
      return raw.filter((item): item is DayOfWeek => this.isDayOfWeek(String(item)));
    }

    if (typeof raw === 'string') {
      const values = raw.split(',').map((item) => item.trim());
      return values.filter((item): item is DayOfWeek => this.isDayOfWeek(item));
    }

    return [];
  }

  private isDayOfWeek(value: string): value is DayOfWeek {
    return this.daysOfWeek.includes(value as DayOfWeek);
  }

  private timeToMinutes(time: string): number | null {
    const parts = time.split(':');
    if (parts.length < 2) {
      return null;
    }
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    return hours * 60 + minutes;
  }

  private addMinutes(time: string, minutesToAdd: number): string {
    const baseMinutes = this.timeToMinutes(time);
    if (baseMinutes === null) {
      return '10:00';
    }
    const total = baseMinutes + minutesToAdd;
    const hours = Math.floor(total / 60) % 24;
    const minutes = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private toInputTime(timeValue?: string | null): string | null {
    if (!timeValue) {
      return null;
    }

    const parts = timeValue.split(':');
    if (parts.length < 2) {
      return null;
    }

    return `${parts[0]}:${parts[1]}`;
  }

  private resetTimeSlots(): void {
    while (this.timeSlots.length > 0) {
      this.timeSlots.removeAt(0);
    }
  }

  private createTimeSlotGroup(initial?: {
    day_of_week?: DayOfWeek;
    start_time?: string;
    end_time?: string;
  }): FormGroup {
    const startTime = initial?.start_time || '09:00';
    const endTime = initial?.end_time || this.addMinutes(startTime, 60);

    return this.formBuilder.group({
      day_of_week: [initial?.day_of_week || 'MONDAY', Validators.required],
      start_time: [startTime, Validators.required],
      end_time: [{ value: endTime, disabled: true }],
    });
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
