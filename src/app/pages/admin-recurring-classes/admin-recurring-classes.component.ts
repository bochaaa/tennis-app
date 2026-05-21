import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { Court, DayOfWeek, RecurringRule, RecurringRuleWriteRequest } from '../../models';
import { ApiService } from '../../services/api.service';

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
  isGenerating = false;
  errorMessage = '';
  successMessage = '';

  recurringRuleForm!: FormGroup;
  generateForm!: FormGroup;
  editingRuleId: number | null = null;

  constructor(
    private readonly apiService: ApiService,
    private readonly formBuilder: FormBuilder,
    private readonly router: Router,
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

    this.generateForm = this.formBuilder.group({
      days_ahead: [90, [Validators.required, Validators.min(1), Validators.max(365)]],
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
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudieron cargar las canchas.');
      },
    });
  }

  loadRecurringRules(): void {
    this.apiService.getRecurringRules().subscribe({
      next: (rules) => {
        this.recurringRules = this.sortRules(rules);
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudieron cargar las clases.');
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
        this.apiService
          .deactivateRecurringRule(this.editingRuleId, 'Desactivada desde panel admin')
          .subscribe({
            next: () => {
              this.onSaved(
                'Clase desactivada. Se cancelaron las clases futuras generadas por esta plantilla.',
              );
            },
            error: (error) => this.onSaveError(error),
          });
        return;
      }

      this.apiService.updateRecurringRule(this.editingRuleId, payloads[0]).subscribe({
        next: () =>
          this.onSaved('Clase actualizada. El backend genero automaticamente clases para 90 dias.'),
        error: (error) => this.onSaveError(error),
      });
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

    const ruleDays = this.normalizeRuleDays(rule);
    const firstDay = ruleDays.length > 0 ? ruleDays[0] : 'MONDAY';
    const startTime = this.toInputTime(rule.start_time) || '09:00';
    const endTime = this.toInputTime(rule.end_time) || this.addMinutes(startTime, 60);

    this.editingRuleId = rule.id;
    this.successMessage = '';
    this.errorMessage = '';
    this.resetTimeSlots();
    this.timeSlots.push(
      this.createTimeSlotGroup({
        day_of_week: firstDay,
        start_time: startTime,
        end_time: endTime,
      }),
    );

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

  generateReservations(): void {
    if (this.generateForm.invalid) {
      this.generateForm.markAllAsTouched();
      return;
    }

    const daysAhead = Number(this.generateForm.value.days_ahead);
    if (Number.isNaN(daysAhead) || daysAhead <= 0) {
      return;
    }

    this.isGenerating = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.apiService.generateRecurringRules(daysAhead).subscribe({
      next: () => {
        this.isGenerating = false;
        this.successMessage = `Clases generadas para los proximos ${daysAhead} dias.`;
        this.loadRecurringRules();
      },
      error: (error) => {
        this.isGenerating = false;
        this.errorMessage = this.extractErrorMessage(error, 'No se pudieron generar las clases.');
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
    this.apiService
      .deactivateRecurringRule(rule.id, 'Desactivada desde panel admin')
      .subscribe({
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

  private sortRules(rules: RecurringRule[]): RecurringRule[] {
    const dayOrder: Record<DayOfWeek, number> = {
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 7,
    };

    return [...rules].sort((a, b) => {
      const aDays = this.normalizeRuleDays(a);
      const bDays = this.normalizeRuleDays(b);
      const aDay = aDays.length > 0 ? dayOrder[aDays[0]] : 99;
      const bDay = bDays.length > 0 ? dayOrder[bDays[0]] : 99;
      if (aDay !== bDay) {
        return aDay - bDay;
      }
      const aStart = this.timeToMinutes(this.toInputTime(a.start_time) || '00:00') ?? 0;
      const bStart = this.timeToMinutes(this.toInputTime(b.start_time) || '00:00') ?? 0;
      return aStart - bStart;
    });
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
